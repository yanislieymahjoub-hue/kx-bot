import { pathToFileURL } from 'node:url';
import { BOTS } from '../src/bots.js';
import { GUILD_ID } from '../src/config.js';

// Contrôle en lecture seule après l'enregistrement de la commande.
export async function verifyClear(api, botId = BOTS.kx.id) {
  const me = await api('GET', '/users/@me');
  if (me.id !== botId) throw new Error('Identité du bot inattendue');
  const commands = await api('GET', `/applications/${me.id}/guilds/${GUILD_ID}/commands`);
  const command = commands.find(c => c.name === 'clear');
  const count = command?.options?.find(o => o.name === 'nombre');
  if (!command || command.default_member_permissions !== '8192' || count?.type !== 4 || count.min_value !== 1 || count.max_value !== 100) {
    throw new Error('Commande /clear non enregistrée avec les restrictions attendues');
  }
  const roles = await api('GET', `/guilds/${GUILD_ID}/roles`);
  const member = await api('GET', `/guilds/${GUILD_ID}/members/${me.id}`);
  const channels = await api('GET', `/guilds/${GUILD_ID}/channels`);
  const assigned = new Set([GUILD_ID, ...member.roles]);
  const base = roles.filter(r => assigned.has(r.id)).reduce((bits, r) => bits | BigInt(r.permissions), 0n);
  const administrator = (base & 8n) !== 0n;
  const required = 1024n | 65536n | 8192n;
  let channelsReady = 0;
  const restrictedChannels = [];
  for (const c of channels.filter(c => [0, 5, 2, 13].includes(c.type))) {
    let bits = base;
    const overwrites = c.permission_overwrites ?? [];
    const apply = o => { bits = (bits & ~BigInt(o?.deny ?? '0')) | BigInt(o?.allow ?? '0'); };
    apply(overwrites.find(o => o.id === GUILD_ID));
    const roleOverrides = overwrites.filter(o => o.type === 0 && o.id !== GUILD_ID && assigned.has(o.id));
    apply({ deny: roleOverrides.reduce((a, o) => a | BigInt(o.deny), 0n), allow: roleOverrides.reduce((a, o) => a | BigInt(o.allow), 0n) });
    apply(overwrites.find(o => o.type === 1 && o.id === me.id));
    if (administrator || (bits & required) === required) channelsReady++;
    else restrictedChannels.push(c.id);
  }
  if (!channelsReady) throw new Error('KX Bot ne dispose des permissions /clear dans aucun salon');
  return { clearRegistered: true, administrator, channelsReady, restrictedChannels };
}

async function main() {
  const token = process.env.DISCORD_TOKEN_MODERATION || process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN manquant');
  const api = async (method, path) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://discord.com/api/v10${path}`, { method, headers: { Authorization: `Bot ${token}` } });
      if (res.status === 429 && attempt < 3) {
        const delay = Math.min(Number((await res.json()).retry_after ?? 1), 30);
        await new Promise(resolve => setTimeout(resolve, delay * 1000 + 100));
        continue;
      }
      if (!res.ok) throw new Error(`Vérification /clear: Discord HTTP ${res.status}`);
      return res.json();
    }
  };
  console.log('CLEAR_VERIFIED', JSON.stringify(await verifyClear(api, process.env.DISCORD_TOKEN_MODERATION ? BOTS.moderation.id : BOTS.kx.id)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
