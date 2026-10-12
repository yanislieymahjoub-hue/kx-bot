import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activate, preflight } from '../scripts/activate-onboarding.mjs';
import { CHANNELS, GUILD_ID } from '../src/config.js';
import { BOTS } from '../src/bots.js';

function setup() {
  const calls = [];
  const messages = new Map([
    [CHANNELS.bienvenue, [{ id: 'human', author: { id: 'human' }, components: [] }, { id: 'welcome', author: { id: BOTS.kx.id }, components: [{ custom_id: 'esp:fde' }] }]],
    [CHANNELS.parcours, []],
  ]);
  const channels = Object.values(CHANNELS).map(id => ({ id, type: 0, guild_id: GUILD_ID, permission_overwrites: [{ id: GUILD_ID, allow: '0', deny: [CHANNELS.bienvenue, CHANNELS.reglement].includes(id) ? '0' : '1024' }] }));
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (path === '/users/@me') return { id: BOTS.kx.id };
    if (path === `/guilds/${GUILD_ID}/channels`) return channels;
    if (path === `/guilds/${GUILD_ID}/roles`) return [{ id: GUILD_ID, permissions: '1024', position: 0 }, { id: 'b', name: 'Accès B', position: 1 }, { id: 'bot', position: 2 }];
    if (path === `/guilds/${GUILD_ID}/members/${BOTS.kx.id}`) return { roles: ['bot'] };
    const match = path.match(/^\/channels\/([^/]+)\/messages(?:\?limit=100|\/([^/]+))?$/);
    if (!match) throw new Error('Unexpected call ' + path);
    const [, id, message] = match;
    if (method === 'GET') return message ? messages.get(id).find(m => m.id === message) : messages.get(id);
    if (method === 'POST') { const m = { id: 'catalog', author: { id: BOTS.kx.id }, ...body }; messages.get(id).unshift(m); return m; }
    if (method === 'PATCH') { const m = messages.get(id).find(m => m.id === message); Object.assign(m, body); return m; }
    throw new Error('Unexpected mutation ' + method);
  };
  return { calls, api, channels };
}
test('activation edits only the bot welcome and upserts one course catalog across retries', async () => {
  const f = setup();
  await activate(f.api);
  await activate(f.api);
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1);
  assert.ok(f.calls.some(c => c.method === 'PATCH' && c.path.endsWith('/welcome')));
  assert.equal(f.calls.filter(c => c.path.endsWith('/human') || c.method === 'DELETE').length, 0);
});
test('activation refuses a public FDE channel before publishing anything', async () => {
  const f = setup();
  f.channels.find(c => c.id === CHANNELS.discussion).permission_overwrites = [];
  await assert.rejects(() => activate(f.api), /accessibles/);
  assert.equal(f.calls.filter(c => c.method !== 'GET').length, 0);
});
test('preflight reads the live hierarchy and refuses an unmanageable access role', async () => {
  const f = setup();
  const api = async (method, path, body) => path.endsWith('/roles') ? [{ id: GUILD_ID, permissions: '0' }, { id: 'b', name: 'Accès B', position: 9 }, { id: 'bot', position: 2 }] : f.api(method, path, body);
  await assert.rejects(() => preflight(api), /hiérarchie/);
});
