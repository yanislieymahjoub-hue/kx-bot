// Parrainage: chaque membre a son lien d'invitation personnel (créé par le bot, donc maîtrisé).
// Chaque personne qui arrive par ce lien rapporte des points de contribution, dans la limite d'un plafond par semaine.
import { store } from "./store.js";

export const INVITE_POINTS = 20;
export const INVITE_WEEKLY_CAP = 5;

// semaine ISO, lundi comme premier jour
export function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-S${String(Math.ceil(((t - y) / 864e5 + 1) / 7)).padStart(2, "0")}`;
}

async function guildInvites(env, h) {
  const res = await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/invites`);
  return res.ok ? res.json() : [];
}

export async function inviteCommand(i, env, ctx, h) {
  const user = i.member?.user ?? i.user;
  ctx.waitUntil((async () => {
    let { code } = await store(env, "inviteGet", { owner: user.id });
    const all = await guildInvites(env, h);
    if (!code || !all.some((x) => x.code === code)) {
      const res = await h.discord(env, "POST", `/channels/${h.CHANNELS.bienvenue}/invites`, { max_age: 0, max_uses: 0, unique: true });
      if (!res.ok) return h.followUp(env, i, { content: "Impossible de créer ton lien pour l'instant, réessaie plus tard." });
      code = (await res.json()).code;
      await store(env, "inviteSet", { owner: user.id, code, uses: 0 });
    }
    const uses = all.find((x) => x.code === code)?.uses ?? 0;
    const { n } = await store(env, "inviteWeek", { owner: user.id, week: weekKey() });
    await h.followUp(env, i, { embeds: [{
      color: h.BOTS.arene.color, title: "🤝 Ton lien d'invitation",
      description: [
        `**https://discord.gg/${code}**`,
        "",
        `Chaque personne qui rejoint le serveur par ce lien te rapporte **${INVITE_POINTS} points de contribution**, jusqu'à ${INVITE_WEEKLY_CAP} personnes par semaine.`,
        "Le lien arrive directement dans le salon de bienvenue et n'expire pas.",
        "",
        `Cette semaine, ${n} / ${INVITE_WEEKLY_CAP} · au total ${uses} arrivée${uses > 1 ? "s" : ""} par ton lien`,
      ].join("\n"),
      footer: { text: "Les points sont comptés chaque heure · l'équipe peut retirer les points d'invitations abusives" },
    }] });
  })());
  return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
}

// Cron horaire: compte les nouvelles arrivées par lien et donne les points
export async function syncInvites(env, h) {
  const all = await guildInvites(env, h);
  if (!all.length) return;
  const counts = Object.fromEntries(all.map((x) => [x.code, x.uses]));
  const awarded = await store(env, "inviteSync", { counts, week: weekKey(), cap: INVITE_WEEKLY_CAP, pts: INVITE_POINTS }).catch(() => []);
  for (const a of awarded) console.log("Parrainage", a.owner, a.n);
}

export const topInviters = (env) => store(env, "inviteTop", { week: weekKey() }).catch(() => []);
