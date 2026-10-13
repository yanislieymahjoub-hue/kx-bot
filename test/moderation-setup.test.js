import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOTS } from '../src/bots.js';
import { GUILD_ID } from '../src/config.js';
import { MOD_BOT_PERMISSIONS } from '../src/moderation-policy.js';
import { COMMANDS } from '../scripts/commands.mjs';
import { commandOwner } from '../scripts/command-routing.mjs';

test('sanctions never fall back to KX Bot, clear migrates only when moderation is ready', () => {
  assert.equal(commandOwner('ban', { kx: true }), null);
  assert.equal(commandOwner('clear', { kx: true }), 'kx');
  assert.equal(commandOwner('clear', { kx: true, moderation: true }), 'moderation');
  assert.equal(commandOwner('ban', { moderation: true }), 'moderation');
});
test('moderation setup only grants its own role and channel access, without Administrator', async () => {
  const module = await import('../scripts/setup-moderation.mjs');
  assert.equal(typeof module.setupModeration, 'function');
  const roles = [{ id: GUILD_ID, position: 0, permissions: '0' }, { id: 'staff', name: 'Mentor', position: 8, permissions: '0' }, { id: 'bot-role', position: 1, permissions: '0', tags: { bot_id: BOTS.moderation.id } }, { id: 'admin-role', position: 10, permissions: '8' }];
  const channels = [{ id: 'chan', type: 0, permission_overwrites: [{ id: BOTS.moderation.id, type: 1, allow: '64', deny: '1024' }] }];
  const writes = [];
  const api = async (method, path, body) => {
    if (method !== 'GET') {
      writes.push({ method, path, body });
      if (path.endsWith('/roles/bot-role')) Object.assign(roles[2], body);
      else if (path.endsWith('/roles')) roles[2].position = body[0].position;
      else if (path.endsWith(`/permissions/${BOTS.moderation.id}`)) channels[0].permission_overwrites = [{ id: BOTS.moderation.id, ...body }];
      else throw new Error('Unexpected mutation');
      return {};
    }
    if (path === '/users/@me') return { id: BOTS.kx.id };
    if (path.endsWith('/roles')) return roles;
    if (path.endsWith(`/members/${BOTS.kx.id}`)) return { roles: ['admin-role'] };
    if (path.endsWith(`/members/${BOTS.moderation.id}`)) return { roles: ['bot-role'] };
    if (path.endsWith('/channels')) return channels;
    if (path.endsWith('/commands')) return COMMANDS.filter(c => !BOTS.moderation.commands.includes(c.name));
    throw new Error('Unexpected read');
  };
  const modApi = async (method, path) => {
    assert.equal(method, 'GET');
    if (path === '/users/@me') return { id: BOTS.moderation.id };
    if (path.endsWith('/commands')) return COMMANDS.filter(c => BOTS.moderation.commands.includes(c.name));
    return api(method, path);
  };
  const report = await module.setupModeration(api, modApi);
  assert.equal(report.moderationReady, true);
  assert.equal(roles[2].permissions, String(MOD_BOT_PERMISSIONS));
  assert.equal(BigInt(roles[2].permissions) & 8n, 0n);
  assert.equal(roles[2].position, 7);
  assert.equal(channels[0].permission_overwrites[0].allow, String(64n | 1024n | 2048n | 8192n | 16384n | 65536n));
  assert.equal(channels[0].permission_overwrites[0].deny, '0');
  assert.ok(writes.every(c => !c.path.includes('/members/')));
});
