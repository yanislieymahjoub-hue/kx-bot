// Tickets: un fil privé par demande, avec l'équipe prévenue, et pour les candidatures un passage en vocal à une heure convenue.
import { store } from "./store.js";
import { V2 } from "./guide.js";

export const SUPPORT_NAME = "🎫・support";
export const VOICE_NAME = "🎙️・entretiens";
export const STAFF_ROLES = ["Fondateur", "Équipe KX", "Mentor", "Modérateur", "Animateur"];
const VOICE = 1024n | 1048576n | 2097152n | 512n | 33554432n; // voir, se connecter, parler, vidéo, détection de voix

// [clé, emoji, libellé, description, appel vocal ?]
export const TICKET_TYPES = [
  ["candidature", "🎓", "Candidature au parcours FDE", "Entrer dans le parcours, entretien en vocal avec l'équipe", true],
  ["certification", "🏅", "Entretien de certification FDE", "Tu penses être prêt, on en parle en vocal", true],
  ["projet", "💼", "Projet ou automatisation d'entreprise", "Faire automatiser ton activité par KX", true],
  ["aide", "❓", "Question ou aide", "Une question privée pour l'équipe", false],
  ["partenariat", "🤝", "Partenariat", "Collaborer avec KX ou la communauté", true],
  ["signalement", "⚠️", "Signalement", "Un souci avec un membre ou un message", false],
];
const TYPE = Object.fromEntries(TICKET_TYPES.map((t) => [t[0], t]));
const who = (u) => u.global_name ?? u.username;
const isStaff = (i) => { const p = BigInt(i.member?.permissions ?? "0"); return (p & 8n) === 8n || (p & 0x2000n) === 0x2000n || (p & 0x10000000n) === 0x10000000n; };

const row = (...c) => ({ type: 1, components: c });
const btn = (label, custom_id, style = 2, emoji) => ({ type: 2, style, label, custom_id, ...(emoji ? { emoji: { name: emoji } } : {}) });
const input = (custom_id, label, style, required, max_length, placeholder) => ({ type: 1, components: [{ type: 4, custom_id, label, style, required, max_length, ...(placeholder ? { placeholder } : {}) }] });

// Menu de choix du type de ticket
export const typeSelect = () => row({
  type: 3, custom_id: "ticket:type", placeholder: "Choisis le type de demande",
  options: TICKET_TYPES.map(([value, emoji, label, description]) => ({ value, label, description, emoji: { name: emoji } })),
});

export function supportPanel(color) {
  return {
    flags: V2,
    components: [{ type: 17, accent_color: color, components: [
      { type: 10, content: [
        "## Ouvrir un ticket",
        "Choisis le type de demande ci-dessous. Un fil privé s'ouvre avec l'équipe KX, prévenue tout de suite.",
        "",
        "-# CANDIDATURE ET CERTIFICATION",
        "Tout se décide en vocal. Dans ton ticket, propose un créneau ou accepte celui de l'équipe, puis rejoins le salon des entretiens à l'heure dite.",
      ].join("\n") },
      typeSelect(),
    ] }],
  };
}

// Formulaire selon le type (la candidature garde son propre formulaire)
export function ticketModal(type) {
  const [, , label, , call] = TYPE[type];
  return {
    type: 9,
    data: {
      custom_id: `ticket-modal:${type}`, title: label.slice(0, 45),
      components: [
        input("sujet", "Sujet en une phrase", 1, true, 120),
        input("details", "Explique ta demande", 2, true, 1500),
        ...(call ? [input("dispos", "Tes disponibilités pour un appel vocal", 1, false, 150, "ex. mardi soir, mercredi 14h-17h")] : []),
      ],
    },
  };
}

export const candidatureModal = () => ({
  type: 9,
  data: {
    custom_id: "candidature-modal", title: "Candidature parcours FDE",
    components: [
      input("niveau", "Ton niveau et tes outils", 1, true, 200, "ex. débutant, n8n et un peu de Python"),
      input("projets", "Un projet dont tu es fier (lien bienvenu)", 2, true, 800),
      input("objectif", "Ce que tu attends du parcours", 2, true, 400),
      input("lien", "Portfolio, GitHub ou LinkedIn (facultatif)", 1, false, 200),
      input("dispos", "Tes disponibilités pour un appel vocal", 1, true, 150, "ex. mardi soir, mercredi 14h-17h"),
    ],
  },
});

async function findChannel(h, env, test) {
  const chans = await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/channels`)).json();
  return { chans, found: chans.find(test) };
}

// Ouvre le fil privé, prévient l'équipe, propose le passage en vocal
export async function openTicket(env, h, user, type, fields) {
  const { chans, found } = await findChannel(h, env, (c) => c.name === SUPPORT_NAME);
  if (!found) return "Le salon support n'existe pas encore, l'équipe doit lancer /kx-setup.";
  const [, emoji, label, , call] = TYPE[type] ?? TYPE.aide;
  const t = await h.discord(env, "POST", `/channels/${found.id}/threads`, { name: `${emoji} ${type}-${who(user)}`.slice(0, 90), type: 12, invitable: false, auto_archive_duration: 10080 });
  if (!t.ok) return "Impossible d'ouvrir le ticket pour l'instant.";
  const thread = await t.json();
  await h.discord(env, "PUT", `/channels/${thread.id}/thread-members/${user.id}`);
  const roles = await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/roles`)).json();
  const equipe = roles.find((r) => r.name === "Équipe KX");
  const voice = chans.find((c) => c.name === VOICE_NAME);

  const body = Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `**${k}**\n${v}`).join("\n\n");
  const components = [{ type: 17, accent_color: h.BOTS.kx.color, components: [
    { type: 10, content: `-# TICKET · ${label.toUpperCase()}\n## ${emoji} ${label}\nDe <@${user.id}>\n\n${body}`.slice(0, 3800) },
    ...(call ? [
      { type: 14, divider: true, spacing: 1 },
      { type: 10, content: `### Passage en vocal\nOn se met d'accord sur une heure. Propose un créneau, l'autre partie l'accepte, puis rendez-vous dans ${voice ? `<#${voice.id}>` : "le salon des entretiens"}. Un rappel arrive avant l'appel.` },
      row(btn("Proposer un créneau", `rdv:prop:${user.id}`, 1, "📅")),
    ] : []),
    { type: 14, divider: true, spacing: 1 },
    ...(type === "candidature" || type === "certification" ? [
      { type: 10, content: "-# DÉCISION DE L'ÉQUIPE, APRÈS L'APPEL" },
      row(
        btn("Passer En formation", `cand:formation:${user.id}`, 1, "🛠️"),
        btn("Certifier FDE", `cand:fde:${user.id}`, 3, "🏅"),
        btn("Refuser", `cand:refus:${user.id}`, 4),
      ),
    ] : []),
    row(btn("Fermer le ticket", `ticket:close:${user.id}`, 2, "🔒")),
  ] }];
  await h.discord(env, "POST", `/channels/${thread.id}/messages`, { flags: V2, components, allowed_mentions: { users: [user.id] } });
  // la mention du rôle ajoute l'équipe au fil et lui envoie une notification
  await h.discord(env, "POST", `/channels/${thread.id}/messages`, {
    content: `${equipe ? `<@&${equipe.id}> ` : ""}nouvelle demande de <@${user.id}>`,
    allowed_mentions: { roles: equipe ? [equipe.id] : [], users: [user.id] },
  });
  await h.discord(env, "POST", `/channels/${h.CHANNELS.staff}/messages`, {
    embeds: [{ color: h.BOTS.kx.color, title: `${emoji} ${label}`, description: `<@${user.id}> a ouvert <#${thread.id}>${fields.Disponibilités ? `\nDisponibilités: ${fields.Disponibilités}` : ""}`, timestamp: new Date().toISOString() }],
  });
  return `Ton ticket est ouvert ici, <#${thread.id}>. L'équipe est prévenue.`;
}

// ------------------------------------------------------------ créneaux
function parseSlot(date, heure, parisToUtc) {
  const dm = date.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/), hm = heure.match(/^(\d{1,2})[h:]?(\d{2})?$/i);
  if (!dm || !hm) return null;
  const y = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : new Date().getFullYear();
  let start = parisToUtc(y, +dm[2], +dm[1], +hm[1], +(hm[2] ?? 0));
  if (!dm[3] && start < new Date()) start = parisToUtc(y + 1, +dm[2], +dm[1], +hm[1], +(hm[2] ?? 0));
  return start;
}

const slotModal = (owner) => ({
  type: 9,
  data: {
    custom_id: `rdv-modal:${owner}`, title: "Proposer un créneau",
    components: [
      input("date", "Date (JJ/MM)", 1, true, 10, "ex. 14/10"),
      input("heure", "Heure de Paris", 1, true, 5, "ex. 18h30"),
      input("note", "Un mot (facultatif)", 1, false, 150),
    ],
  },
});

async function setVoiceAccess(env, h, userId, allow) {
  const { found } = await findChannel(h, env, (c) => c.name === VOICE_NAME);
  if (!found) return null;
  if (allow) await h.discord(env, "PUT", `/channels/${found.id}/permissions/${userId}`, { type: 1, allow: String(VOICE), deny: "0" });
  else await h.discord(env, "DELETE", `/channels/${found.id}/permissions/${userId}`);
  return found;
}

export async function handleTicketComponent(i, env, ctx, h) {
  const id = i.data.custom_id;
  const user = i.member?.user ?? i.user;

  if (id === "ticket:open") return h.reply({ content: "Quel type de demande ?", components: [typeSelect()] }, true);
  if (id === "ticket:type") {
    const type = i.data.values?.[0];
    if (type === "candidature") return h.json(candidatureModal());
    return TYPE[type] ? h.json(ticketModal(type)) : h.reply({ content: "Type inconnu." }, true);
  }

  if (id.startsWith("rdv:prop:")) return h.json(slotModal(id.split(":")[2]));

  if (id.startsWith("rdv:ok:")) {
    const [, , ts, proposer, owner] = id.split(":");
    if (user.id === proposer && !isStaff(i)) return h.reply({ content: "C'est l'autre partie qui accepte ton créneau." }, true);
    if (user.id !== owner && !isStaff(i)) return h.reply({ content: "Seuls le demandeur et l'équipe peuvent accepter." }, true);
    ctx.waitUntil((async () => {
      const voice = await setVoiceAccess(env, h, owner, true);
      await store(env, "rdvSave", { thread: i.channel_id, owner, ts: Number(ts) }).catch(() => {});
      await h.discord(env, "POST", `/channels/${i.channel_id}/messages`, {
        content: [...new Set([owner, proposer])].map((u) => `<@${u}>`).join(" "), allowed_mentions: { users: [...new Set([owner, proposer])] },
        embeds: [{ color: 0x22c55e, title: "✅ Appel confirmé", description: `<t:${ts}:F>, <t:${ts}:R>\nRendez-vous dans ${voice ? `<#${voice.id}>` : "le salon des entretiens"}, l'accès est ouvert. Un rappel arrive avant l'appel.`, footer: { text: `Accepté par ${who(user)}` } }],
      });
    })());
    return h.json({ type: 7, data: { components: [] } });
  }

  if (id.startsWith("ticket:close")) {
    const owner = id.split(":")[2];
    ctx.waitUntil((async () => {
      if (owner) await setVoiceAccess(env, h, owner, false);
      await h.discord(env, "POST", `/channels/${i.channel_id}/messages`, { embeds: [{ color: 0x6b7280, description: `🔒 Ticket fermé par <@${user.id}>.` }] });
      await h.discord(env, "PATCH", `/channels/${i.channel_id}`, { archived: true, locked: true });
    })());
    return h.json({ type: 6 });
  }
  return null;
}

export async function handleTicketModal(i, env, ctx, h, parisToUtc) {
  const cid = i.data.custom_id;
  const f = {};
  for (const r of i.data.components) for (const c of r.components) f[c.custom_id] = c.value;
  const user = i.member?.user ?? i.user;

  if (cid.startsWith("ticket-modal:")) {
    const type = cid.split(":")[1];
    ctx.waitUntil((async () => h.followUp(env, i, { content: await openTicket(env, h, user, type, { Sujet: f.sujet, Détails: f.details, Disponibilités: f.dispos }) }))());
    return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
  }

  if (cid.startsWith("rdv-modal:")) {
    const owner = cid.split(":")[1];
    const start = parseSlot(f.date.trim(), f.heure.trim(), parisToUtc);
    if (!start || isNaN(start)) return h.reply({ content: "Format attendu, date `14/10` et heure `18h30`." }, true);
    if (start < new Date()) return h.reply({ content: "Ce créneau est déjà passé." }, true);
    const ts = Math.floor(start / 1000);
    return h.json({ type: 4, data: {
      allowed_mentions: { users: [owner] },
      content: user.id === owner ? "" : `<@${owner}>`,
      embeds: [{ color: 0xf5b83d, title: "📅 Créneau proposé", description: `<@${user.id}> propose <t:${ts}:F> (<t:${ts}:R>)${f.note ? `\n> ${f.note}` : ""}` }],
      components: [row(btn("Accepter", `rdv:ok:${ts}:${user.id}:${owner}`, 3, "✅"), btn("Proposer un autre créneau", `rdv:prop:${owner}`, 2, "🔁"))],
    } });
  }
  return null;
}

// Rappel envoyé par le cron horaire pour les appels de l'heure qui vient
export async function rdvReminders(env, h) {
  const due = await store(env, "rdvDue", { now: Date.now() / 1000, within: 3600 }).catch(() => []);
  if (!due.length) return;
  const { found: voice } = await findChannel(h, env, (c) => c.name === VOICE_NAME);
  const equipe = (await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/roles`)).json()).find((r) => r.name === "Équipe KX");
  for (const r of due) {
    await h.discord(env, "POST", `/channels/${r.thread}/messages`, {
      content: `⏰ <@${r.owner}>${equipe ? ` <@&${equipe.id}>` : ""} l'appel commence <t:${r.ts}:R>, rendez-vous dans ${voice ? `<#${voice.id}>` : "le salon des entretiens"}.`,
      allowed_mentions: { users: [r.owner], roles: equipe ? [equipe.id] : [] },
    });
  }
}
