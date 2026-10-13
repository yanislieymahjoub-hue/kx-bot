import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOTS } from '../src/bots.js';
import { GUILD_ID } from '../src/config.js';
import { COMMANDS } from '../scripts/commands.mjs';

// Import dynamique pour que l'absence du vérificateur soit une assertion explicite.
async function fixture({ permissions = '8', overwrites = [], commands = COMMANDS } = {}) {
  const module = await import('../scripts/verify-clear.mjs').catch(() => ({}));
  assert.equal(typeof module.verifyClear, 'function');
  const calls = [];
  const api = async (method, path) => {
    calls.push(method);
    assert.equal(method, 'GET');
    if (path === '/users/@me') return { id: BOTS.kx.id };
    if (path.endsWith('/roles')) return [{ id: GUILD_ID, permissions: '0' }, { id: 'bot-role', permissions }];
    if (path.includes('/members/')) return { roles: ['bot-role'] };
    if (path.endsWith('/channels')) return [{ id: 'chan', type: 0, permission_overwrites: overwrites }];
    if (path.endsWith('/commands')) return commands;
    throw new Error('Unexpected path');
  };
  return { run: () => module.verifyClear(api), calls };
}

test('deployment verifies registration and existing admin permissions without changing rights', async () => {
  const f = await fixture();
  const r = await f.run();
  assert.equal(r.clearRegistered, true);
  assert.equal(r.channelsReady, 1);
  assert.equal(r.administrator, true);
  assert.ok(f.calls.every(method => method === 'GET'));
});
test('deployment detects missing clear registration', async () => {
  const f = await fixture({ commands: [] });
  await assert.rejects(f.run, /enregistrée/);
});
test('deployment honors member overwrites after role denies', async () => {
  const f = await fixture({ permissions: '74752', overwrites: [{ id: 'bot-role', type: 0, deny: '8192', allow: '0' }, { id: BOTS.kx.id, type: 1, allow: '8192', deny: '0' }] });
  assert.equal((await f.run()).channelsReady, 1);
});
test('deployment refuses to report readiness when every channel denies moderation', async () => {
  const f = await fixture({ permissions: '74752', overwrites: [{ id: GUILD_ID, type: 0, deny: '8192', allow: '0' }] });
  await assert.rejects(f.run, /permissions/);
});
