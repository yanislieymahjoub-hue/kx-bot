import { pathToFileURL } from 'node:url';
import { BOTS } from '../src/bots.js';
import { GUILD_ID } from '../src/config.js';
import { MOD_BOT_PERMISSIONS, MOD_PERMISSIONS } from '../src/moderation-policy.js';
import { verifyClear } from './verify-clear.mjs';

export async function setupModeration(api, modApi) {
  const me = await api('GET', '/users/@me');
  if (me.id !== BOTS.kx.id) throw new Error('Le configurateur nécessite KX Bot');
  const G = `/guilds/${GUILD_ID}`;
  let roles = await api('GET', `${G}/roles`);
  const moderator = await api('GET', `${G}/members/${BOTS.moderation.id}`);
  const manager = await api('GET', `${G}/members/${me.id}`);
  const role = roles.find(r => r.tags?.bot_id === BOTS.moderation.id);
  if (!role || !moderator.roles.includes(role.id)) throw new Error('KX Modération doit être invité sur le serveur');
  const topManager = Math.max(...roles.filter(r => manager.roles.includes(r.id)).map(r => r.position));
  if (role.position >= topManager) throw new Error('Le rôle de KX Modération doit rester sous KX Bot');
  if (role.permissions !== String(MOD_BOT_PERMISSIONS)) await api('PATCH', `${G}/roles/${role.id}`, { permissions: String(MOD_BOT_PERMISSIONS) });
  const protectedNames = ['Fondateur', 'Équipe K’X', 'Équipe KX', 'Modérateur', 'Animateur', 'Mentor'];
  const staff = roles.filter(r => protectedNames.includes(r.name) && r.position > 1);
  if (!staff.length) throw new Error('Rôles de l’équipe introuvables, hiérarchie non modifiée');
  const desired = Math.min(topManager, ...staff.map(r => r.position)) - 1;
  if (role.position !== desired) await api('PATCH', `${G}/roles`, [{ id: role.id, position: desired }]);
  // Accès de ce bot seulement: aucune permission des membres n'est modifiée.
  const channels = await api('GET', `${G}/channels`);
  const needed = 1024n | 2048n | 8192n | 16384n | 65536n;
  for (const c of channels.filter(c => [0, 2, 4, 5, 13, 15, 16].includes(c.type))) {
    const old = c.permission_overwrites?.find(o => o.type === 1 && o.id === BOTS.moderation.id);
    const allow = String(BigInt(old?.allow ?? '0') | needed), deny = String(BigInt(old?.deny ?? '0') & ~needed);
    if (old?.allow !== allow || old?.deny !== deny) await api('PUT', `/channels/${c.id}/permissions/${BOTS.moderation.id}`, { type: 1, allow, deny });
  }
  const commands = await modApi('GET', `/applications/${BOTS.moderation.id}/guilds/${GUILD_ID}/commands`);
  for (const [name, permission] of Object.entries(MOD_PERMISSIONS)) {
    if (!commands.some(c => c.name === name && c.default_member_permissions === String(permission))) throw new Error(`Commande de modération absente ou ouverte: ${name}`);
  }
  const formerCommands = await api('GET', `/applications/${BOTS.kx.id}/guilds/${GUILD_ID}/commands`);
  if (formerCommands.some(c => c.name in MOD_PERMISSIONS)) throw new Error('Des commandes de modération restent sur KX Bot');
  roles = await api('GET', `${G}/roles`);
  const saved = roles.find(r => r.id === role.id);
  if (!saved || saved.permissions !== String(MOD_BOT_PERMISSIONS) || saved.position < 1 || saved.position >= topManager) throw new Error('Permissions ou hiérarchie du bot non confirmées');
  return { moderationReady: true, exclusiveCommands: true, commands: commands.length, rolePosition: saved.position, ...await verifyClear(modApi, BOTS.moderation.id) };
}

async function main() {
  if (!process.env.DISCORD_TOKEN_MODERATION) { console.log('Modération non activée: secret absent'); return; }
  const client = token => async (method, path, body) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`https://discord.com/api/v10${path}`, { method, headers: { Authorization: `Bot ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (res.status === 429 && attempt < 4) {
        const delay = Math.min(Number((await res.json()).retry_after ?? 1), 30) * 1000 + 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      if (!res.ok) throw new Error(`Configuration modération ${method} ${path}: HTTP ${res.status}`);
      return res.status === 204 ? null : res.json();
    }
  };
  console.log('MODERATION_VERIFIED', JSON.stringify(await setupModeration(client(process.env.DISCORD_BOT_TOKEN), client(process.env.DISCORD_TOKEN_MODERATION))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
