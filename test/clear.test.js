import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import worker from '../src/index.js';
import { COMMANDS } from '../scripts/commands.mjs';
import { BOTS } from '../src/bots.js';
import { GUILD_ID } from '../src/config.js';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const snowflake = ms => String(BigInt(ms - 1420070400000) << 22n);
const message = (age = 10000, extra = {}) => ({ id: snowflake(Date.now() - age), pinned: false, type: 0, ...extra });

async function run(t, { options, permissions = '8192', appPermissions = '74752', messages = [], extra = {}, status = 204, readStatus = 200, networkError = false } = {}) {
  const i = { id: snowflake(Date.now()), application_id: BOTS.kx.id, guild_id: GUILD_ID, channel_id: '123', token: 'test-only', type: 2,
    app_permissions: appPermissions, member: { user: { id: '42' }, roles: [], permissions }, data: { name: 'clear', options }, ...extra };
  const calls = [], tasks = [], replies = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(url), body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ path: parsed.pathname.replace('/api/v10', ''), query: parsed.searchParams, method: init.method, body });
    if (parsed.pathname.includes('/webhooks/')) { replies.push(body); return Response.json({}); }
    if (networkError) throw new Error('offline');
    if (init.method === 'GET') return Response.json(readStatus === 200 ? messages : {}, { status: readStatus });
    return new Response(null, { status });
  };
  t.after(() => { globalThis.fetch = previous; });
  const body = JSON.stringify(i), ts = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(ts + body), keys.privateKey).toString('hex');
  const response = await worker.fetch(new Request('https://bot.test/', { method: 'POST', body, headers: { 'x-signature-timestamp': ts, 'x-signature-ed25519': signature } }),
    { DISCORD_PUBLIC_KEY: publicKey, DISCORD_BOT_TOKEN: 'test-only', STORE: { idFromName: () => 'kx', get: () => ({ fetch: async () => Response.json({ statut: 'fde' }) }) } }, { waitUntil(p) { tasks.push(p); } });
  const initial = await response.json();
  await Promise.all(tasks);
  return { initial, calls, replies, i };
}
const deletes = r => r.calls.filter(c => ['DELETE', 'POST'].includes(c.method));

test('clear is registered only on KX Modération with moderation permissions and bounded count', () => {
  const c = COMMANDS.find(c => c.name === 'clear');
  assert.ok(c);
  assert.equal(c.default_member_permissions, '8192');
  assert.equal(c.dm_permission, false);
  assert.deepEqual(c.options.map(o => [o.name, o.type, o.min_value, o.max_value]), [['nombre', 4, 1, 100]]);
  assert.deepEqual(Object.keys(BOTS).filter(k => BOTS[k].commands.includes('clear')), ['moderation']);
});

test('clear deletes only recent unpinned messages before invocation, with a private result', async t => {
  const recent = [message(10000), message(20000)];
  const r = await run(t, { options: [{ name: 'nombre', value: 6 }], messages: [...recent, message(30000, { pinned: true }), message(15 * 86400000), message(40000, { type: 21 }), message(-60000)] });
  assert.deepEqual(r.initial, { type: 5, data: { flags: 64 } });
  assert.equal(r.calls[0].query.get('limit'), '6');
  assert.equal(r.calls[0].query.get('before'), r.i.id);
  assert.deepEqual(deletes(r).map(c => [c.method, c.path, c.body]), [['POST', '/channels/123/messages/bulk-delete', { messages: recent.map(m => m.id) }]]);
  assert.match(r.replies[0].content, /2 messages supprimés/);
});

test('clear defaults to 100 and uses individual delete for one message', async t => {
  const m = message();
  const r = await run(t, { permissions: '8', appPermissions: '8', messages: [m] });
  assert.equal(r.calls[0].query.get('limit'), '100');
  assert.equal(deletes(r)[0].path, `/channels/123/messages/${m.id}`);
  assert.equal(deletes(r)[0].method, 'DELETE');
  assert.match(r.replies[0].content, /1 message supprimé/);
});

for (const permissions of ['0', '16', '268435456']) test(`clear rejects member permissions ${permissions} without API calls`, async t => {
  const r = await run(t, { permissions });
  assert.equal(r.initial.type, 4);
  assert.equal(r.initial.data.flags, 64);
  assert.match(r.initial.data.content, /Gérer les messages/);
  assert.equal(r.calls.length, 0);
});
for (const appPermissions of ['0', '8192', '73728', '66560']) test(`clear rejects incomplete bot permissions ${appPermissions}`, async t => {
  const r = await run(t, { appPermissions });
  assert.match(r.initial.data.content, /K’X Bot/);
  assert.equal(r.calls.length, 0);
});
for (const value of [0, -1, 101, 2.5, '5']) test(`clear rejects invalid count ${value}`, async t => {
  const r = await run(t, { options: [{ name: 'nombre', value }] });
  assert.match(r.initial.data.content, /1 et 100/);
  assert.equal(r.calls.length, 0);
});
for (const extra of [{ guild_id: undefined }, { guild_id: 'other' }, { channel_id: undefined }, { application_id: BOTS.ia.id }]) test(`clear rejects wrong context ${JSON.stringify(extra)}`, async t => {
  const r = await run(t, { extra });
  assert.equal(r.initial.type, 4);
  assert.equal(r.calls.length, 0);
});
test('clear preserves pinned, old and boundary messages without deleting anything', async t => {
  const r = await run(t, { messages: [message(10000, { pinned: true }), message(14 * 86400000), message(14 * 86400000 - 15000)] });
  assert.equal(deletes(r).length, 0);
  assert.match(r.replies[0].content, /Aucun message supprimé/);
});
test('clear handles an empty channel', async t => {
  const r = await run(t);
  assert.equal(deletes(r).length, 0);
  assert.match(r.replies[0].content, /Aucun message/);
});
for (const status of [403, 429, 500]) test(`clear reports failed deletion ${status} without claiming success`, async t => {
  const r = await run(t, { status, messages: [message(), message(20000)] });
  assert.equal(deletes(r).length, 1);
  assert.doesNotMatch(r.replies[0].content, /messages? supprimés?/);
  assert.match(r.replies[0].content, /impossible|refusée|limite/i);
});
test('clear handles read denial without any deletion', async t => {
  const r = await run(t, { readStatus: 403 });
  assert.equal(deletes(r).length, 0);
  assert.match(r.replies[0].content, /refusée/i);
});
test('clear handles network failure with private feedback', async t => {
  const r = await run(t, { networkError: true });
  assert.equal(r.initial.data.flags, 64);
  assert.match(r.replies[0].content, /impossible/i);
});
