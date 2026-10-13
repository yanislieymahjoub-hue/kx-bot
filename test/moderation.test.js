import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { KXStore } from '../src/store.js';
import { BOTS } from '../src/bots.js';
import { GUILD_ID } from '../src/config.js';
import { COMMANDS } from '../scripts/commands.mjs';

const actor = '100000000000000001', target = '100000000000000002', owner = '100000000000000003';
const modId = '1559521331530178562';
const all = String(2n | 4n | 16n | 8192n | (1n << 40n) | 1024n | 65536n);
async function fixture(t, overrides = {}) {
  const mod = await import('../src/moderation.js');
  assert.equal(typeof mod.handleModeration, 'function');
  const db = new DatabaseSync(':memory:');
  const state = { storage: { sql: { exec(q, ...b) { const rows = db.prepare(q).all(...b); return { toArray: () => rows }; } } } };
  const memory = new KXStore(state, {});
  const env = { DISCORD_TOKEN_MODERATION: 'mod-test-only', DISCORD_BOT_TOKEN: 'admin-never-use', STORE: { idFromName: () => 'kx', get: () => ({ fetch: (url, opts) => memory.fetch(new Request(url, opts)) }) } };
  const roles = [{ id: GUILD_ID, position: 0, permissions: '0' }, { id: 'mod', position: 5, permissions: all }, { id: 'bot', position: 6, permissions: all }, { id: 'member', position: 1, permissions: '0' }, { id: 'admin', position: 8, permissions: '8' }];
  const calls = [], replies = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname.replace('/api/v10', '');
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method: opts.method, path, body, headers: opts.headers });
    assert.equal(opts.headers.Authorization, 'Bot mod-test-only');
    if (opts.method !== 'GET') {
      if (overrides.networkFailure) throw new Error('offline');
      return overrides.status ? Response.json({}, { status: overrides.status }) : new Response(null, { status: 204 });
    }
    if (path === `/guilds/${GUILD_ID}`) return Response.json({ owner_id: overrides.owner ?? owner });
    if (path.endsWith('/roles')) return Response.json(roles);
    if (path.endsWith(`/members/${actor}`)) return Response.json({ user: { id: actor }, roles: overrides.actorRoles ?? ['mod'] });
    if (path.endsWith(`/members/${target}`)) return Response.json({ user: { id: target, bot: overrides.targetBot ?? false }, roles: overrides.targetRoles ?? ['member'] });
    if (path.endsWith(`/members/${modId}`)) return Response.json({ user: { id: modId }, roles: overrides.botRoles ?? ['bot'] });
    if (path.includes('/bans/')) return Response.json({ user: { id: target } });
    if (path.endsWith('/messages')) return Response.json([{ id: String(BigInt(Date.now() - 1420070400000 - 10000) << 22n), pinned: false, type: 0 }]);
    if (path.startsWith('/channels/')) return Response.json({ id: 'channel', guild_id: GUILD_ID, type: overrides.channelType ?? 0 });
    throw new Error(`Unexpected ${path}`);
  };
  t.after(() => { globalThis.fetch = previous; db.close(); });
  let serial = 0;
  const h = { GUILD_ID, EPHEMERAL: 64, json: d => Response.json(d), reply: (d, e) => Response.json({ type: 4, data: { ...d, flags: e ? 64 : 0 } }), opt: (i, key) => i.data.options?.find(o => o.name === key)?.value,
    followUp: async (_env, _i, data) => { replies.push(data); } };
  const run = async (name, options = {}, extra = {}) => {
    const i = { type: 2, id: `20000000000000000${++serial}`, application_id: modId, guild_id: GUILD_ID, channel_id: 'channel', member: { user: { id: actor }, permissions: all }, app_permissions: all,
      data: { name, options: Object.entries(options).map(([name, value]) => ({ name, value })) }, ...extra };
    const tasks = [];
    const res = mod.handleModeration(i, env, { waitUntil: p => tasks.push(p) }, h);
    const initial = await res.json();
    await Promise.all(tasks);
    return { initial, last: replies.at(-1), i };
  };
  return { run, calls, replies, memory, env, roles };
}
const changes = f => f.calls.filter(c => c.method !== 'GET');
const args = { membre: target, raison: 'Spam répété', confirmer: true };

test('dedicated moderation bot owns restricted commands', () => {
  assert.equal(BOTS.moderation?.id, modId);
  for (const name of ['clear', 'ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn', 'unwarn', 'historique', 'slowmode', 'mod-aide']) {
    assert.ok(BOTS.moderation.commands.includes(name), name);
    const c = COMMANDS.find(c => c.name === name);
    assert.ok(c?.default_member_permissions && c.default_member_permissions !== '0', name);
  }
});
test('ban needs confirmation and a nonempty reason before calling Discord', async t => {
  const f = await fixture(t);
  for (const options of [{ ...args, confirmer: false }, { ...args, raison: '  ' }]) {
    assert.equal((await f.run('ban', options)).initial.type, 4);
    assert.equal(f.calls.length, 0);
  }
});
for (const name of ['clear', 'ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn', 'unwarn', 'historique', 'slowmode', 'mod-aide']) test(`${name} refuses ordinary members`, async t => {
  const f = await fixture(t);
  const r = await f.run(name, args, { member: { user: { id: actor }, permissions: '0' } });
  assert.equal(r.initial.type, 4);
  assert.equal(r.initial.data.flags, 64);
  assert.equal(f.calls.length, 0);
});
test('sanctions cannot use KX Bot or a missing moderation token', async t => {
  const f = await fixture(t);
  assert.equal((await f.run('ban', args, { application_id: BOTS.kx.id })).initial.type, 4);
  delete f.env.DISCORD_TOKEN_MODERATION;
  assert.equal((await f.run('ban', args)).initial.type, 4);
  assert.equal(f.calls.length, 0);
});
test('clear runs with the moderation token and returns a private result', async t => {
  const f = await fixture(t);
  const r = await f.run('clear', { nombre: 1 }, { id: String(BigInt(Date.now() - 1420070400000) << 22n) });
  assert.equal(r.initial.data.flags, 64);
  assert.equal(changes(f).length, 1);
  assert.equal(changes(f)[0].method, 'DELETE');
  assert.match(r.last.content, /1 message supprimé/);
});
test('clear never retries with the administrator token after a Discord refusal', async t => {
  const f = await fixture(t, { status: 403 });
  const r = await f.run('clear', { nombre: 1 }, { id: String(BigInt(Date.now() - 1420070400000) << 22n) });
  assert.equal(changes(f).length, 1);
  assert.match(r.last.content, /refusée/);
});
for (const overrides of [{ targetRoles: ['mod'] }, { targetRoles: ['admin'] }, { botRoles: ['member'] }, { owner: target }, { actorRoles: ['member'] }, { targetBot: true }]) test(`protect hierarchy and bots ${JSON.stringify(overrides)}`, async t => {
  const f = await fixture(t, overrides);
  const r = await f.run('ban', args);
  assert.equal(changes(f).length, 0);
  assert.match(r.last.content, /refus|rôle|permission|protég/i);
});
test('owner can moderate below the bot even with no staff role', async t => {
  const f = await fixture(t, { owner: actor, actorRoles: [] });
  await f.run('ban', args, { member: { user: { id: actor }, permissions: '8' } });
  assert.equal(changes(f).length, 1);
});
test('ban uses the dedicated token, keeps message history and records actor and reason', async t => {
  const f = await fixture(t);
  const r = await f.run('ban', args);
  assert.equal(r.initial.data.flags, 64);
  assert.deepEqual(changes(f).map(c => [c.method, c.path, c.body]), [['PUT', `/guilds/${GUILD_ID}/bans/${target}`, { delete_message_seconds: 0 }]]);
  assert.match(decodeURIComponent(changes(f)[0].headers['X-Audit-Log-Reason']), new RegExp(actor));
  assert.match(r.last.content, /banni/i);
  assert.equal(f.memory.modHistory({ user: target })[0].status, 'done');
});
test('same interaction cannot execute a sanction twice', async t => {
  const f = await fixture(t);
  await f.run('ban', args, { id: 'repeat' });
  await f.run('ban', args, { id: 'repeat' });
  assert.equal(changes(f).length, 1);
});
for (const [name, options, method, path, payload] of [
  ['kick', args, 'DELETE', `/guilds/${GUILD_ID}/members/${target}`, undefined],
  ['unban', { identifiant: target, raison: 'Recours accepté' }, 'DELETE', `/guilds/${GUILD_ID}/bans/${target}`, undefined],
  ['untimeout', args, 'PATCH', `/guilds/${GUILD_ID}/members/${target}`, { communication_disabled_until: null }],
  ['slowmode', { secondes: 10, raison: 'Calmer le salon' }, 'PATCH', '/channels/channel', { rate_limit_per_user: 10 }],
]) test(`${name} affects only the requested target`, async t => {
  const f = await fixture(t);
  await f.run(name, options);
  assert.deepEqual(changes(f).map(c => [c.method, c.path, c.body]), [[method, path, payload]]);
});
test('timeout applies a bounded expiry and rejects administrator targets', async t => {
  const f = await fixture(t);
  for (const minutes of [0, -1, 40321, 1.5]) assert.equal((await f.run('timeout', { ...args, minutes })).initial.type, 4);
  const start = Date.now();
  await f.run('timeout', { ...args, minutes: 60 });
  const expiry = Date.parse(changes(f)[0].body.communication_disabled_until);
  assert.ok(expiry >= start + 3600000 && expiry < Date.now() + 3600000 + 1000);
});
test('warnings and revocations survive reload, history is private', async t => {
  const f = await fixture(t);
  const r = await f.run('warn', args);
  assert.equal(changes(f).length, 0);
  const warning = f.memory.modHistory({ user: target })[0];
  assert.equal(warning.action, 'warn');
  assert.equal(warning.reason, args.raison);
  const history = await f.run('historique', { membre: target });
  assert.equal(history.initial.data.flags, 64);
  assert.ok(JSON.stringify(history.last).includes(args.raison));
  await f.run('unwarn', { membre: target, dossier: r.i.id, raison: 'Avertissement retiré' });
  assert.equal(f.memory.modHistory({ user: target }).find(c => c.id === r.i.id).status, 'revoked');
});
for (const overrides of [{ status: 403 }, { status: 429 }, { networkFailure: true }]) test(`failed mutation reports failure and records uncertainty ${JSON.stringify(overrides)}`, async t => {
  const f = await fixture(t, overrides);
  const r = await f.run('ban', args);
  assert.doesNotMatch(r.last.content, /membre banni/i);
  assert.equal(f.memory.modHistory({ user: target })[0].status, overrides.networkFailure ? 'uncertain' : 'failed');
});
