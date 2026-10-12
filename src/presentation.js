import { store } from './store.js';

const FIELDS = [
  ['nom', 'Prénom ou pseudo public', 2, 60],
  ['activite', 'Ton activité et ton expérience', 10, 400],
  ['outils', 'Les outils que tu utilises déjà', 3, 300],
  ['objectif', 'Ce que tu veux approfondir ici', 15, 600],
];

export const presentationModal = () => ({ type: 9, data: {
  custom_id: 'presentation-modal', title: 'Ta présentation publiée aux FDE',
  components: FIELDS.map(([id, label, min, max]) => ({ type: 1, components: [{
    type: 4, custom_id: id, label, style: id === 'nom' ? 1 : 2,
    required: true, min_length: min, max_length: max,
    placeholder: id === 'objectif' ? 'Un objectif concret. Ne partage aucun secret ou nom de client.' : undefined,
  }] })),
} });

export async function submitPresentation(i, env, ctx, h) {
  const fields = Object.fromEntries((i.data.components ?? []).flatMap(row => row.components ?? []).map(c => [c.custom_id, String(c.value ?? '').trim()]));
  if (FIELDS.some(([id, , min, max]) => !fields[id] || fields[id].length < min || fields[id].length > max || !/[\p{L}\p{N}]/u.test(fields[id]))) {
    return h.reply({ content: 'Complète les quatre champs avec une vraie présentation, puis réessaie avec `/presentation`.' }, true);
  }
  // Defer before network work: Discord requires an initial response within 3 seconds.
  ctx.waitUntil((async () => {
    const user = i.member.user.id, lock = crypto.randomUUID();
    let claimed = false, uncertain = false;
    try {
      const claim = await store(env, 'introClaim', { user, lock });
      if (!claim.ok) {
        const message = claim.reason === 'busy' ? 'Ta présentation est déjà en cours de traitement. Si cela dure, préviens l’équipe.'
          : claim.reason === 'member' ? 'Tu as déjà accès à la communauté. Tu peux te présenter directement dans le salon.'
          : 'Ton parcours client/FDE doit être arbitré par l’équipe avant d’ouvrir cet accès.';
        return await h.followUp(env, i, { content: message });
      }
      claimed = true;
      const rolesRes = await h.discord(env, 'GET', `/guilds/${h.GUILD_ID}/roles`);
      if (!rolesRes.ok) throw new Error('roles');
      const role = (await rolesRes.json()).find(r => r.name === 'Accès B');
      if (!role) throw new Error('role missing');
      if (!claim.message) {
        uncertain = true;
        const res = await h.discord(env, 'POST', `/channels/${h.CHANNELS.presente_toi}/messages`, {
          content: `Présentation de <@${user}>`, allowed_mentions: { parse: [] },
          nonce: `p:${user}`, enforce_nonce: true,
          embeds: [{ title: 'Bienvenue dans la communauté K’X', color: h.VIOLET,
            fields: FIELDS.map(([id, label]) => ({ name: label, value: fields[id] })),
            footer: { text: 'Présentation envoyée par le membre via le formulaire d’arrivée' } }],
        });
        if (!res.ok) { uncertain = res.status >= 500; throw new Error('publication'); }
        const message = (await res.json()).id;
        if (!message) throw new Error('message missing');
        await store(env, 'introPublished', { user, lock, message });
        uncertain = false;
      }
      // An enterprise request can have placed the member in conflict while publishing.
      if ((await store(env, 'statutGet', { user })).statut !== 'presentation') throw new Error('status changed');
      const grant = await h.discord(env, 'PUT', `/guilds/${h.GUILD_ID}/members/${user}/roles/${role.id}`);
      if (!grant.ok) throw new Error('access');
      const completed = await store(env, 'introComplete', { user, lock });
      if (!completed.ok) {
        const revoke = await h.discord(env, 'DELETE', `/guilds/${h.GUILD_ID}/members/${user}/roles/${role.id}`);
        if (!revoke.ok) console.error('Présentation : arbitrage requis après attribution du rôle');
        throw new Error('status changed');
      }
      await h.followUp(env, i, { content: `Ta présentation est publiée dans <#${h.CHANNELS.presente_toi}>. L’espace FDE est ouvert ! Lance \`/formation\` pour choisir un module.` });
    } catch {
      await h.followUp(env, i, { content: uncertain
        ? 'La publication a été interrompue et son résultat est incertain. Préviens l’équipe pour vérifier ta présentation avant de reprendre. Aucun nouvel essai ne la publiera en double.'
        : 'Je n’ai pas pu terminer ton inscription. Tu peux réessayer avec `/presentation`. Si le problème persiste, préviens l’équipe.' });
    } finally {
      if (claimed && !uncertain) await store(env, 'introRelease', { user, lock });
    }
  })());
  return h.json({ type: 5, data: { flags: 64 } });
}
