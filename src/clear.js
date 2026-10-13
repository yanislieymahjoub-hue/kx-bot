import { BOTS } from './bots.js';

const MANAGE_MESSAGES = 8192n;
const REQUIRED_BOT = 1024n | 65536n | MANAGE_MESSAGES;
const TWO_WEEKS = 14 * 86400000;
const NON_DELETABLE = new Set([1, 2, 3, 4, 5, 21]);

const hasPermissions = (value, required) => {
  const bits = BigInt(value ?? '0');
  return (bits & 8n) !== 0n || (bits & required) === required;
};

export function handleClear(i, env, ctx, h) {
  if (i.guild_id !== h.GUILD_ID || !i.channel_id || i.application_id !== BOTS.kx.id) {
    return h.reply({ content: 'Utilise /clear avec K’X Bot dans un salon du serveur K’X.' }, true);
  }
  if (!hasPermissions(i.member?.permissions, MANAGE_MESSAGES)) {
    return h.reply({ content: 'Il te faut la permission « Gérer les messages » dans ce salon.' }, true);
  }
  const count = h.opt(i, 'nombre') ?? 100;
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return h.reply({ content: 'Choisis un nombre entier entre 1 et 100.' }, true);
  }
  if (!hasPermissions(i.app_permissions, REQUIRED_BOT)) {
    return h.reply({ content: 'K’X Bot a besoin de « Voir le salon », « Voir les anciens messages » et « Gérer les messages » dans ce salon.' }, true);
  }
  ctx.waitUntil(clearMessages(i, env, count, h));
  return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
}

async function clearMessages(i, env, count, h) {
  const base = `/channels/${i.channel_id}/messages`;
  const checked = async (method, path, body) => {
    const res = await h.discord(env, method, path, body);
    if (!res.ok) throw Object.assign(new Error('Discord request failed'), { status: res.status });
    return res;
  };
  let content;
  try {
    const messages = await (await checked('GET', `${base}?limit=${count}&before=${i.id}`)).json();
    // La marge protège un lot qui atteindrait 14 jours pendant le trajet réseau.
    const cutoff = Date.now() - TWO_WEEKS + 60000;
    const selected = messages.slice(0, count).filter(m => {
      const created = Number(BigInt(m.id) >> 22n) + 1420070400000;
      return !m.pinned && !NON_DELETABLE.has(m.type) && created > cutoff && BigInt(m.id) < BigInt(i.id);
    });
    const ids = [...new Set(selected.map(m => m.id))];
    if (ids.length === 1) await checked('DELETE', `${base}/${ids[0]}`);
    else if (ids.length > 1) await checked('POST', `${base}/bulk-delete`, { messages: ids });
    content = ids.length ? `${ids.length} message${ids.length > 1 ? 's supprimés' : ' supprimé'} dans ce salon.` : 'Aucun message supprimé.';
    if (messages.length > ids.length) content += ' Les messages épinglés, trop anciens (14 jours, avec une minute de marge) ou non supprimables sont conservés.';
  } catch (error) {
    content = error.status === 403
      ? 'Action refusée par Discord. Vérifie les permissions de K’X Bot dans ce salon.'
      : error.status === 429
        ? 'Discord impose une limite temporaire. Réessaie dans quelques instants.'
        : 'Nettoyage impossible à confirmer. Vérifie le salon avant de réessayer.';
  }
  await h.followUp(env, i, { content });
}
