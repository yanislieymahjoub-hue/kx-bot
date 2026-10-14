import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupNews } from '../scripts/setup-news.mjs';
import { GUILD_ID } from '../src/config.js';
import { BOTS } from '../src/bots.js';
import { planEspaces } from '../src/espaces.js';
import { NEWS_CHANNEL } from '../src/news.js';

function fixture() {
  const roles = [{ id: GUILD_ID, permissions: '1024', position: 0 }, { id: 'botrole', tags: { bot_id: BOTS.kx.id }, position: 20, permissions: '8' }];
  const channels = [{ id: 'private', name: 'client-private', type: 0, permission_overwrites: [{ id: GUILD_ID, deny: '1024', allow: '0' }] }];
  const messages = [], writes = [];
  const api = async (method, path, body) => {
    if (method !== 'GET') writes.push({ method, path, body });
    if (path === '/users/@me') return { id: BOTS.kx.id };
    if (path.endsWith(`/members/${BOTS.kx.id}`)) return { roles: ['botrole'] };
    if (path === `/guilds/${GUILD_ID}/roles`) { if (method === 'POST') { const r = { id: 'alert', position: 1, managed: false, ...body }; roles.push(r); return r; } return roles; }
    if (path === `/guilds/${GUILD_ID}/channels`) { if (method === 'POST') { const c = { id: 'news', guild_id: GUILD_ID, ...body }; channels.push(c); return c; } return channels; }
    if (path === '/channels/news') { if (method === 'PATCH') Object.assign(channels.at(-1), body); return channels.at(-1); }
    if (path === '/channels/news/messages?limit=100') return messages;
    if (path === '/channels/news/messages' && method === 'POST') { const m = { id: 'panel', author: { id: BOTS.kx.id }, ...body }; messages.push(m); return m; }
    if (path === '/channels/news/messages/panel') { if (method === 'PATCH') Object.assign(messages[0], body); return messages[0]; }
    if (path === '/channels/news/messages/pins?limit=50') return { items: messages.map(message => ({ message })), has_more: false };
    if (path === '/channels/news/messages/pins/panel') return null;
    throw new Error(`Unexpected ${method} ${path}`);
  };
  return { api, roles, channels, writes };
}
test('setup creates one public read-only channel and powerless role, is repeatable and leaves private channels untouched', async () => {
  const f = fixture();
  await setupNews(f.api); await setupNews(f.api);
  assert.equal(f.channels.length, 2);
  assert.equal(f.roles.length, 3);
  assert.equal(f.roles.at(-1).permissions, '0');
  assert.equal(f.roles.at(-1).mentionable, false);
  const c = f.channels.at(-1), everyone = c.permission_overwrites.find(o => o.id === GUILD_ID);
  assert.equal(BigInt(everyone.allow) & 1024n, 1024n);
  for (const bit of [2048n, 64n, 1n << 35n, 1n << 36n, 1n << 38n]) assert.equal(BigInt(everyone.deny) & bit, bit);
  assert.equal(c.parent_id, null);
  assert.equal(f.writes.filter(w => w.path.includes('/private')).length, 0);
  assert.equal(f.writes.filter(w => w.method === 'POST' && w.path.endsWith('/messages')).length, 1);
});
test('setup refuses to repurpose an existing unrelated channel or privileged alert role', async () => {
  const f = fixture();
  f.channels.push({ id: 'other', name: NEWS_CHANNEL, type: 0, topic: 'Discussion historique' });
  await assert.rejects(setupNews(f.api), /existant/);
  assert.equal(f.writes.length, 0);
  f.channels.pop();
  f.roles.push({ id: 'bad', name: 'Alertes IA & Tech', permissions: '8', position: 1 });
  await assert.rejects(setupNews(f.api), /permissions/);
  assert.equal(f.writes.length, 0);
});
test('future workspace isolation preserves the public news channel', async () => {
  const env = { STORE: { idFromName: () => 'kx', get: () => ({ fetch: async () => Response.json({ value: null }) }) } };
  const h = { GUILD_ID, CHANNELS: {}, discord: async () => Response.json([{ id: 'news', name: NEWS_CHANNEL, type: 0, parent_id: null, permission_overwrites: [] }]) };
  const plan = await planEspaces(env, h);
  assert.equal(plan.fde.length, 0);
  assert.equal(plan.intacts[0].id, 'news');
});
