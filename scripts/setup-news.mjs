import { pathToFileURL } from 'node:url';
import { GUILD_ID } from '../src/config.js';
import { BOTS } from '../src/bots.js';
import { NEWS_CHANNEL, NEWS_ROLE, NEWS_TOPIC, newsPanel } from '../src/news.js';

const VIEW = 1024n, HISTORY = 65536n;
const READ_ONLY = 2048n | 64n | (1n << 35n) | (1n << 36n) | (1n << 38n);
const PUBLISH = VIEW | HISTORY | 2048n | 16384n | 131072n;

export async function setupNews(api) {
  const me = await api('GET', '/users/@me');
  if (me.id !== BOTS.kx.id) throw new Error('Identité KX Bot inattendue');
  const channels = await api('GET', `/guilds/${GUILD_ID}/channels`);
  const matches = channels.filter(c => c.name === NEWS_CHANNEL);
  if (matches.length > 1) throw new Error('Plusieurs salons actualité existants');
  let channel = matches[0];
  if (channel && (channel.type !== 0 || channel.topic !== NEWS_TOPIC)) throw new Error('Salon existant non géré par ce module : aucune modification');
  const roles = await api('GET', `/guilds/${GUILD_ID}/roles`);
  const matchingRoles = roles.filter(r => r.name === NEWS_ROLE);
  if (matchingRoles.length > 1) throw new Error('Plusieurs rôles d’alerte existants');
  let role = matchingRoles[0];
  if (role && (role.permissions !== '0' || role.managed)) throw new Error('Rôle d’alerte : permissions inattendues');
  const member = await api('GET', `/guilds/${GUILD_ID}/members/${me.id}`);
  const top = Math.max(...roles.filter(r => member.roles.includes(r.id)).map(r => r.position));
  if (!(top > (role?.position ?? 0))) throw new Error('Hiérarchie insuffisante pour gérer le rôle d’alerte');
  if (!role) role = await api('POST', `/guilds/${GUILD_ID}/roles`, { name: NEWS_ROLE, permissions: '0', color: 0, hoist: false, mentionable: false });
  const overwrites = [
    { id: GUILD_ID, type: 0, allow: String(VIEW | HISTORY), deny: String(READ_ONLY) },
    { id: BOTS.kx.id, type: 1, allow: String(PUBLISH), deny: '0' },
    ...(roles.some(r => r.tags?.bot_id === BOTS.veille.id) ? [{ id: BOTS.veille.id, type: 1, allow: String(PUBLISH), deny: '0' }] : []),
  ];
  const config = { name: NEWS_CHANNEL, type: 0, parent_id: null, topic: NEWS_TOPIC, permission_overwrites: overwrites };
  channel = channel ? await api('PATCH', `/channels/${channel.id}`, config) : await api('POST', `/guilds/${GUILD_ID}/channels`, { ...config, position: 0 });
  const pins = await api('GET', `/channels/${channel.id}/messages/pins?limit=50`);
  const messages = [...pins.items.map(p => p.message), ...await api('GET', `/channels/${channel.id}/messages?limit=100`)];
  const previous = messages.find(m => m.author.id === me.id && m.embeds?.some(e => e.footer?.text === 'K’X · Actualités · Notifications volontaires'));
  const panel = await api(previous ? 'PATCH' : 'POST', `/channels/${channel.id}/messages${previous ? '/' + previous.id : ''}`, { ...newsPanel(), ...(!previous ? { nonce: `news:${channel.id}`, enforce_nonce: true } : {}) });
  await api('PUT', `/channels/${channel.id}/messages/pins/${panel.id}`);
  const saved = await api('GET', `/channels/${channel.id}`);
  const everyone = saved.permission_overwrites.find(o => o.id === GUILD_ID);
  if (saved.parent_id || (BigInt(everyone?.allow ?? 0) & (VIEW | HISTORY)) !== (VIEW | HISTORY) || (BigInt(everyone?.deny ?? 0) & READ_ONLY) !== READ_ONLY) throw new Error('Vérification lecture seule échouée');
  for (const o of saved.permission_overwrites) if (![GUILD_ID, BOTS.kx.id, BOTS.veille.id].includes(o.id)) throw new Error('Dérogation de salon inattendue');
  const storedPanel = await api('GET', `/channels/${channel.id}/messages/${panel.id}`);
  if (!storedPanel.components?.some(row => row.components?.some(b => b.custom_id === 'news:off'))) throw new Error('Boutons absents');
  return { channel: channel.id, role: role.id, panel: panel.id, publicReadOnly: true };
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN manquant');
  const api = async (method, path, body) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://discord.com/api/v10${path}`, { method, headers: { Authorization: `Bot ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 429 && attempt < 3) { const delay = Math.min(Number((await res.json()).retry_after ?? 1), 30); await new Promise(r => setTimeout(r, delay * 1000 + 100)); continue; }
      if (!res.ok) throw new Error(`Discord ${method} ${path.split('?')[0]} : HTTP ${res.status}`);
      return res.status === 204 ? null : res.json();
    }
    throw new Error('Limite Discord persistante');
  };
  console.log('NEWS_VERIFIED', JSON.stringify(await setupNews(api)));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
