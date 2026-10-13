import { BOTS } from './bots.js';
import { MOD_PERMISSIONS, hasPermission } from './moderation-policy.js';
import { handleClear } from './clear.js';
import { store } from './store.js';

const API = 'https://discord.com/api/v10';
const snowflake = value => typeof value === 'string' && /^\d{17,20}$/.test(value);
const reject = message => { throw Object.assign(new Error(message), { safe: true }); };

// Aucune reprise avec le jeton administrateur de KX Bot: chaque action garde
// strictement les droits et l'identité de KX Modération.
function apiFor(i, env, reason) {
  return async (method, path, body) => {
    const res = await fetch(API + path, {
      method, headers: { Authorization: `Bot ${env.DISCORD_TOKEN_MODERATION}`, 'content-type': 'application/json',
        ...(method !== 'GET' ? { 'X-Audit-Log-Reason': encodeURIComponent(`${i.data.name} par ${i.member.user.id}: ${reason}`) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw Object.assign(new Error('Discord request failed'), { status: res.status });
    return res;
  };
}

export function handleModeration(i, env, ctx, h) {
  const name = i.data.name;
  const permission = MOD_PERMISSIONS[name];
  if (!permission || i.guild_id !== h.GUILD_ID || i.application_id !== BOTS.moderation.id || !i.member?.user || !i.channel_id) {
    return h.reply({ content: 'Commande réservée à KX Modération sur le serveur K’X.' }, true);
  }
  if (!hasPermission(i.member.permissions, permission)) return h.reply({ content: 'Tu n’as pas la permission de modération nécessaire pour cette commande.' }, true);
  if (!env.DISCORD_TOKEN_MODERATION) return h.reply({ content: 'KX Modération n’est pas encore configuré.' }, true);
  if (name === 'mod-aide') return h.reply({ content: [
    '**KX Modération · commandes privées**',
    '`/clear nombre:20` supprime les messages récents non épinglés.',
    '`/ban` bannit; `/unban` réautorise; `/kick` expulse. Ban et kick demandent `confirmer:Vrai`.',
    '`/timeout minutes:60` met en pause; `/untimeout` lève la pause.',
    '`/warn` enregistre un avertissement; `/unwarn` le révoque; `/historique` consulte les sanctions.',
    '`/slowmode secondes:10` limite le rythme du salon; `0` désactive le mode lent.',
    'Motif obligatoire. Les rôles égaux ou supérieurs et les bots sont protégés. Les avertissements restent privés et ne déclenchent aucune sanction automatique.',
  ].join('\n') }, true);

  const reason = String(h.opt(i, 'raison') ?? '').trim();
  if (name === 'clear') {
    const api = apiFor(i, env, 'Nettoyage du salon');
    return handleClear(i, env, ctx, { ...h, discord: (_env, method, path, body) => api(method, path, body) });
  }
  if (name !== 'historique' && (!reason || reason.length > 300)) return h.reply({ content: 'Indique un motif de 1 à 300 caractères.' }, true);
  if (['ban', 'kick'].includes(name) && h.opt(i, 'confirmer') !== true) return h.reply({ content: 'Vérifie le membre, puis choisis confirmer:Vrai pour appliquer cette sanction.' }, true);
  const user = name === 'unban' ? h.opt(i, 'identifiant') : h.opt(i, 'membre');
  if (name !== 'slowmode' && !snowflake(user)) return h.reply({ content: 'Choisis un membre ou un identifiant Discord valide.' }, true);
  const minutes = h.opt(i, 'minutes'), seconds = h.opt(i, 'secondes');
  if (name === 'timeout' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320)) return h.reply({ content: 'Choisis entre 1 et 40320 minutes (28 jours).' }, true);
  if (name === 'slowmode' && (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600)) return h.reply({ content: 'Choisis entre 0 et 21600 secondes.' }, true);
  if (name === 'unwarn' && !snowflake(h.opt(i, 'dossier'))) return h.reply({ content: 'Indique l’identifiant de l’avertissement donné par /historique.' }, true);
  if (name !== 'historique' && !hasPermission(i.app_permissions, ['warn', 'unwarn'].includes(name) ? 1024n : permission)) {
    return h.reply({ content: 'KX Modération n’a pas la permission nécessaire dans ce salon.' }, true);
  }
  ctx.waitUntil(execute(i, env, h, { name, permission, reason, user, minutes, seconds }));
  return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
}

async function checkTarget(i, h, api, action) {
  const { name, permission, user } = action;
  const G = `/guilds/${h.GUILD_ID}`;
  const get = async path => (await api('GET', path)).json();
  const guild = await get(G);
  const roles = await get(`${G}/roles`);
  const actor = await get(`${G}/members/${i.member.user.id}`);
  const bits = member => roles.filter(r => r.id === h.GUILD_ID || member.roles.includes(r.id)).reduce((p, r) => p | BigInt(r.permissions), 0n);
  if (i.member.user.id !== guild.owner_id && !hasPermission(bits(actor), permission)) reject('Permission de modération retirée: action refusée.');
  if (name === 'historique') return;
  if (name === 'slowmode') {
    const channel = await get(`/channels/${i.channel_id}`);
    if (channel.guild_id !== h.GUILD_ID || ![0, 5, 10, 11, 12].includes(channel.type)) reject('Le mode lent nécessite un salon texte ou un fil du serveur.');
    return;
  }
  if (user === i.member.user.id || user === guild.owner_id || Object.values(BOTS).some(b => b.id === user)) reject('Ce membre est protégé: action refusée.');
  if (name === 'unban') { await get(`${G}/bans/${user}`); return; }
  const target = await get(`${G}/members/${user}`);
  if (target.user?.bot) reject('Les bots sont protégés de ces sanctions.');
  const bot = await get(`${G}/members/${BOTS.moderation.id}`);
  // À position égale, refus conservateur, même si Discord départage par ID.
  const highest = member => Math.max(0, ...roles.filter(r => member.roles.includes(r.id)).map(r => r.position));
  if (i.member.user.id !== guild.owner_id && highest(actor) <= highest(target)) reject('Le membre a un rôle égal ou supérieur au tien.');
  if (highest(bot) <= highest(target)) reject('Le rôle de KX Modération doit être au-dessus du rôle de ce membre.');
  if (['timeout', 'untimeout'].includes(name) && hasPermission(bits(target), 8n)) reject('Un administrateur est protégé des mises en pause.');
}

async function execute(i, env, h, action) {
  const { name, user, reason, minutes, seconds } = action;
  const api = apiFor(i, env, reason);
  let claimed = false, applied = false, content;
  try {
    await checkTarget(i, h, api, action);
    if (name === 'historique') {
      const records = await store(env, 'modHistory', { user });
      const clean = text => String(text).replace(/[`*_~<>]/g, '').replace(/[\r\n]+/g, ' ').slice(0, 90);
      content = records.length ? `**Historique privé · ${user}**\n` + records.map(r => `\`${r.id}\` · ${r.action} · ${r.status}\n<t:${Math.floor(r.ts / 1000)}:d> · par ${r.actor} · ${clean(r.reason)}`).join('\n') : 'Aucune sanction enregistrée pour ce membre.';
    } else {
      const result = await store(env, 'modClaim', { id: i.id, user: user ?? i.channel_id, actor: i.member.user.id, action: name, reason });
      if (!result.ok) reject('Cette demande a déjà été traitée ou est en cours. Consulte /historique avant de recommencer.');
      claimed = true;
      const G = `/guilds/${h.GUILD_ID}`;
      switch (name) {
        case 'ban': await api('PUT', `${G}/bans/${user}`, { delete_message_seconds: 0 }); content = 'Membre banni.'; break;
        case 'unban': await api('DELETE', `${G}/bans/${user}`); content = 'Bannissement levé.'; break;
        case 'kick': await api('DELETE', `${G}/members/${user}`); content = 'Membre expulsé.'; break;
        case 'timeout': await api('PATCH', `${G}/members/${user}`, { communication_disabled_until: new Date(Date.now() + minutes * 60000).toISOString() }); content = `Membre mis en pause pour ${minutes} minutes.`; break;
        case 'untimeout': await api('PATCH', `${G}/members/${user}`, { communication_disabled_until: null }); content = 'Pause levée.'; break;
        case 'warn': content = 'Avertissement enregistré dans le journal privé.'; break;
        case 'unwarn': {
          const revoked = await store(env, 'modRevokeWarn', { id: h.opt(i, 'dossier'), user });
          if (!revoked.ok) reject('Avertissement actif introuvable pour ce membre.');
          content = 'Avertissement révoqué; sa trace est conservée.'; break;
        }
        case 'slowmode': await api('PATCH', `/channels/${i.channel_id}`, { rate_limit_per_user: seconds }); content = seconds ? `Mode lent réglé sur ${seconds} secondes.` : 'Mode lent désactivé.'; break;
      }
      applied = true;
      await store(env, 'modComplete', { id: i.id, status: 'done' });
      content += ` Dossier \`${i.id}\`.`;
    }
  } catch (error) {
    if (claimed) await store(env, 'modComplete', { id: i.id, status: !applied && (error.safe || (error.status >= 400 && error.status < 500)) ? 'failed' : 'uncertain' }).catch(() => {});
    content = applied ? 'L’action a été appliquée, mais son enregistrement final a échoué. Vérifie le journal Discord avant de recommencer.'
      : error.safe ? error.message
        : error.status === 403 ? 'Discord a refusé l’action. Vérifie les permissions et la hiérarchie de KX Modération.'
          : error.status === 404 ? 'Membre, bannissement ou salon introuvable.'
            : error.status === 429 ? 'Limite temporaire Discord. Réessaie dans quelques instants.'
              : 'Résultat impossible à confirmer. Vérifie le journal Discord et /historique avant de réessayer.';
  }
  await h.followUp(env, i, { content: content.slice(0, 1990) });
}
