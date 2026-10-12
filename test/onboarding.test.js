import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, sign } from 'node:crypto';
import worker, { KXStore } from '../src/index.js';
import { GUILD_ID, CHANNELS } from '../src/config.js';
import { COURSES, trainingReply } from '../src/training.js';

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const form = (values = ['Sam', 'Développeur web', 'n8n et JavaScript', 'Fiabiliser mes intégrations CRM']) => ({
  custom_id: 'presentation-modal', components: ['nom', 'activite', 'outils', 'objectif'].map((id, k) => ({ type: 1, components: [{ type: 4, custom_id: id, value: values[k] }] })),
});

function fixture(t, statut = null) {
  const db = new DatabaseSync(':memory:');
  const state = { storage: { sql: { exec(q, ...b) { const stmt = db.prepare(q); return { toArray: () => stmt.all(...b) }; } } } };
  // Cloudflare SQL executes immediately, including statements whose cursor is ignored.
  state.storage.sql.exec = (q, ...b) => { const stmt = db.prepare(q); const rows = stmt.all(...b); return { toArray: () => rows }; };
  const memory = new KXStore(state, {});
  memory.setting({ key: 'espaces', value: 'actif' });
  if (statut) memory.statutSet({ user: '42', statut });
  const env = { DISCORD_PUBLIC_KEY: publicKey, DISCORD_BOT_TOKEN: 'test-only', STORE: { idFromName: () => 'kx', get: () => ({ fetch: (url, opts) => memory.fetch(new Request(url, opts)) }) } };
  const calls = [], replies = [];
  let failure = null;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => {
    const path = new URL(url).pathname.replace('/api/v10', '');
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ path, method: opts.method, body });
    if (path.startsWith('/webhooks/')) { replies.push(body); return Response.json({}); }
    if (failure && failure(path, opts)) return Response.json({ message: 'Denied' }, { status: 403 });
    if (path.endsWith('/roles') && opts.method === 'GET') return Response.json([{ id: 'role-b', name: 'Accès B' }, { id: 'admin-role', name: 'ADMIN' }]);
    if (path.endsWith('/channels') && opts.method === 'GET') return Response.json([]);
    if (path === `/channels/${CHANNELS.presente_toi}/messages`) return Response.json({ id: 'intro-1' });
    if (opts.method === 'PUT' || opts.method === 'DELETE') return new Response(null, { status: 204 });
    throw new Error(`Unexpected Discord call ${opts.method} ${path}`);
  };
  t.after(() => { globalThis.fetch = original; db.close(); });
  async function send(type, data, extra = {}) {
    const i = { id: '12345', application_id: 'app', guild_id: GUILD_ID, token: 'interaction-test', type, member: { user: { id: '42', username: 'sam' }, roles: [], permissions: '0' }, data, ...extra };
    const body = JSON.stringify(i), ts = String(Math.floor(Date.now() / 1000));
    const signature = sign(null, Buffer.from(ts + body), keys.privateKey).toString('hex');
    const tasks = [];
    const res = await worker.fetch(new Request('https://test.local/', { method: 'POST', body, headers: { 'x-signature-timestamp': ts, 'x-signature-ed25519': signature } }), env, { waitUntil(p) { tasks.push(p); } });
    await Promise.all(tasks);
    return res.json();
  }
  return { send, memory, calls, replies, fail(fn) { failure = fn; } };
}

test('members with an existing Accès B role retain commands without a stored status', async t => {
  const f = fixture(t);
  const result = await f.send(2, { name: 'formation' }, { member: { user: { id: '42', username: 'sam' }, roles: ['role-b'], permissions: '0' } });
  assert.ok(result.data.embeds?.length);
});
test('existing client appointment buttons still work', async t => {
  const f = fixture(t, 'client');
  assert.equal((await f.send(3, { custom_id: 'rdv:prop:42' })).type, 9);
});
test('simultaneous submissions publish a single introduction and grant once', async t => {
  const f = fixture(t);
  await Promise.all([f.send(5, form()), f.send(5, form())]);
  assert.equal(f.calls.filter(c => c.path === `/channels/${CHANNELS.presente_toi}/messages`).length, 1);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 1);
});
test('already admitted members do not publish another introduction on replay', async t => {
  const f = fixture(t, 'fde');
  await f.send(5, form());
  assert.equal(f.calls.filter(c => c.method === 'POST' || c.method === 'PUT').length, 0);
});
test('old candidature forms cannot grant the apprentice role before admission', async t => {
  const f = fixture(t);
  await f.send(5, { ...form(), custom_id: 'candidature-modal' });
  assert.equal(f.calls.length, 0);
});
test('interactions outside the configured guild never mutate it', async t => {
  const f = fixture(t);
  await f.send(5, form(), { guild_id: 'other-guild' });
  assert.equal(f.calls.length, 0);
});
test('a lost publication response blocks retry until reconciliation instead of duplicating', async t => {
  const f = fixture(t);
  f.fail(path => { if (path.endsWith('/messages')) throw new Error('network disconnected after write'); return false; });
  await f.send(5, form());
  f.fail(null);
  await f.send(5, form());
  assert.equal(f.calls.filter(c => c.path === `/channels/${CHANNELS.presente_toi}/messages`).length, 1);
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
});
test('every training navigation target resolves and fits Discord payload limits', () => {
  const payloads = [trainingReply(), ...COURSES.flatMap(c => c.pages.map((_, n) => trainingReply(c.id, n)))];
  for (const payload of payloads) {
    assert.ok(payload.embeds.every(e => e.title.length <= 256 && e.description.length <= 4096));
    assert.ok(payload.embeds.reduce((n, e) => n + e.title.length + e.description.length + (e.footer?.text.length ?? 0), 0) <= 6000);
    for (const row of payload.components) for (const button of row.components) {
      assert.ok(button.label.length <= 80 && button.custom_id.length <= 100);
      const [, id, page] = button.custom_id.split(':');
      assert.ok(trainingReply(id === 'catalogue' ? undefined : id, Number(page)).embeds?.length);
    }
  }
  assert.match(trainingReply('api', -1).content, /introuvable/);
  assert.match(trainingReply('unknown').content, /introuvable/);
});

test('FDE entry opens a required introduction form without granting a role', async t => {
  const f = fixture(t);
  const result = await f.send(3, { custom_id: 'esp:fde' });
  assert.equal(result.type, 9);
  assert.equal(result.data.custom_id, 'presentation-modal');
  assert.equal(result.data.components.length, 4);
  assert.ok(result.data.components.every(r => r.components[0].required));
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
});
test('a presentation is published before access is granted', async t => {
  const f = fixture(t);
  await f.send(5, form());
  const publish = f.calls.findIndex(c => c.path === `/channels/${CHANNELS.presente_toi}/messages`);
  const grant = f.calls.findIndex(c => c.path.endsWith('/roles/role-b'));
  assert.ok(publish >= 0 && grant > publish);
  assert.deepEqual(f.calls[publish].body.allowed_mentions, { parse: [] });
  assert.equal(f.memory.statutGet({ user: '42' }).statut, 'fde');
});
test('whitespace-only fields never publish or grant access', async t => {
  const f = fixture(t);
  await f.send(5, form(['  ', 'Développeur web', 'n8n et JavaScript', 'Fiabiliser mes intégrations']));
  assert.equal(f.calls.length, 0);
  assert.equal(f.memory.statutGet({ user: '42' }).statut, null);
});
test('failed publication never grants access', async t => {
  const f = fixture(t);
  f.fail(path => path.endsWith('/messages'));
  await f.send(5, form());
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
  assert.notEqual(f.memory.statutGet({ user: '42' }).statut, 'fde');
  assert.match(f.replies.at(-1).content, /réessayer/i);
});
test('retry after a role failure reuses the published introduction', async t => {
  const f = fixture(t);
  f.fail(path => path.endsWith('/roles/role-b'));
  await f.send(5, form());
  assert.notEqual(f.memory.statutGet({ user: '42' }).statut, 'fde');
  f.fail(null);
  await f.send(5, form());
  assert.equal(f.calls.filter(c => c.path === `/channels/${CHANNELS.presente_toi}/messages`).length, 1);
  assert.equal(f.memory.statutGet({ user: '42' }).statut, 'fde');
});
test('a client/FDE conflict stays blocked on repeated clicks and modal submissions', async t => {
  const f = fixture(t, 'conflit');
  await f.send(3, { custom_id: 'esp:fde' });
  await f.send(3, { custom_id: 'esp:fde' });
  await f.send(5, form());
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
  assert.equal(f.memory.statutGet({ user: '42' }).statut, 'conflit');
});
test('an old candidature button cannot bypass admission', async t => {
  const f = fixture(t);
  const result = await f.send(3, { custom_id: 'open:candidature' });
  assert.equal(result.type, 4);
  assert.equal(result.data.flags, 64);
  assert.equal(f.calls.length, 0);
});
test('self-service roles cannot assign an administrative role', async t => {
  const f = fixture(t, 'fde');
  await f.send(3, { custom_id: 'role:ADMIN' });
  assert.equal(f.calls.filter(c => c.method === 'PUT').length, 0);
});
test('only admitted members can read training, including old navigation buttons', async t => {
  const f = fixture(t);
  assert.equal((await f.send(2, { name: 'formation' })).data.flags, 64);
  const denied = await f.send(3, { custom_id: 'formation:api:0' });
  assert.match(denied.data.content, /présent|espace|accès/i);
  f.memory.statutSet({ user: '42', statut: 'fde' });
  const catalog = await f.send(2, { name: 'formation' });
  assert.ok(catalog.data.embeds?.length);
  const lesson = await f.send(3, { custom_id: 'formation:api:0' });
  assert.ok(lesson.data.embeds?.[0].description.length > 300);
});
