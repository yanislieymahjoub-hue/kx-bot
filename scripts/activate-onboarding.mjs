import { pathToFileURL } from 'node:url';
import { GUILD_ID, CHANNELS } from '../src/config.js';
import { BOTS } from '../src/bots.js';
import { accueilV2 } from '../src/guide.js';
import { trainingReply } from '../src/training.js';

export async function preflight(api) {
  const me = await api('GET', '/users/@me');
  if (me.id !== BOTS.kx.id) throw new Error('Identité du bot inattendue');
  const roles = await api('GET', `/guilds/${GUILD_ID}/roles`);
  const member = await api('GET', `/guilds/${GUILD_ID}/members/${me.id}`);
  const access = roles.find(r => r.name === 'Accès B');
  const top = Math.max(...roles.filter(r => member.roles.includes(r.id)).map(r => r.position));
  if (!access || access.position >= top) throw new Error('Accès B non gérable dans la hiérarchie');
  const channels = await api('GET', `/guilds/${GUILD_ID}/channels`);
  const everyone = BigInt(roles.find(r => r.id === GUILD_ID)?.permissions ?? '0');
  const exposed = [];
  let checked = 0;
  for (const [key, id] of Object.entries(CHANNELS)) {
    if (['bienvenue', 'reglement'].includes(key)) continue;
    const channel = channels.find(c => c.id === id);
    if (!channel) throw new Error(`Salon configuré introuvable : ${key}`);
    const overwrite = channel.permission_overwrites?.find(o => o.id === GUILD_ID);
    const effective = (everyone & ~BigInt(overwrite?.deny ?? '0')) | BigInt(overwrite?.allow ?? '0');
    if ((effective & 1024n) !== 0n) exposed.push(key);
    checked++;
  }
  if (exposed.length) throw new Error(`Salons FDE accessibles à @everyone : ${exposed.join(', ')}`);
  for (const key of ['bienvenue', 'parcours']) {
    if (![0, 5].includes(channels.find(c => c.id === CHANNELS[key])?.type)) throw new Error(`Salon texte attendu : ${key}`);
  }
  return { bot: me.id, channelsChecked: checked, hierarchy: 'ok', everyoneIsolation: 'ok' };
}

export async function activate(api) {
  const report = await preflight(api);
  const upsert = async (channel, payload, matches) => {
    const messages = await api('GET', `/channels/${channel}/messages?limit=100`);
    const old = messages.find(m => m.author.id === report.bot && matches(m));
    const result = await api(old ? 'PATCH' : 'POST', `/channels/${channel}/messages${old ? '/' + old.id : ''}`, {
      ...payload, allowed_mentions: { parse: [] },
      ...(!old ? { nonce: `panel:${channel}`, enforce_nonce: true } : {}),
    });
    if (!result.id) throw new Error('Publication sans identifiant');
    const saved = await api('GET', `/channels/${channel}/messages/${result.id}`);
    if (saved.author.id !== report.bot || !matches(saved)) throw new Error('Vérification de publication échouée');
    return result.id;
  };
  report.welcomeMessage = await upsert(CHANNELS.bienvenue, accueilV2(), m => JSON.stringify(m.components ?? []).includes('esp:fde'));
  report.catalogMessage = await upsert(CHANNELS.parcours, trainingReply(), m => m.embeds?.some(e => e.title === 'K’X Académie · Approfondir'));
  return report;
}

async function main() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN manquant');
  const api = async (method, path, body) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://discord.com/api/v10${path}`, {
        method, headers: { Authorization: `Bot ${token}`, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 && attempt < 3) {
        const delay = Math.min(Number((await res.json()).retry_after ?? 1), 30);
        await new Promise(resolve => setTimeout(resolve, delay * 1000 + 100));
        continue;
      }
      if (!res.ok) throw new Error(`Discord ${method} ${path.split('?')[0]} : HTTP ${res.status}`);
      return res.status === 204 ? null : res.json();
    }
    throw new Error('Limite Discord persistante');
  };
  console.log(JSON.stringify(await (process.argv.includes('--preflight') ? preflight(api) : activate(api))));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
