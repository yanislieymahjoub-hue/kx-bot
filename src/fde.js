// Parcours FDE: candidatures, niveaux, missions, défi hebdo, profil, aide
import { store } from "./store.js";
import { guideV2 } from "./guide.js";
import { BADGES, BADGE_EMOJI } from "./roles.js";

const MANAGE_ROLES = 0x10000000n;

async function guildRoles(h, env) {
  return (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/roles`)).json();
}

async function member(h, env, userId) {
  const res = await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/members/${userId}`);
  return res.ok ? res.json() : null;
}

// message privé envoyé par KX Académie
async function dm(h, env, userId, payload) {
  const ch = await h.discord(env, "POST", "/users/@me/channels", { recipient_id: userId }, "academie");
  if (!ch.ok) return;
  const { id } = await ch.json();
  await h.discord(env, "POST", `/channels/${id}/messages`, payload, "academie");
}

// Place le membre sur un niveau du parcours (retire les autres niveaux)
async function setLevel(h, env, userId, key) {
  const roles = await guildRoles(h, env);
  const byName = (n) => roles.find((r) => r.name === n);
  const m = await member(h, env, userId);
  const target = h.LADDER.find((l) => l.key === key);
  for (const step of h.LADDER) {
    const r = byName(step.role);
    if (!r) continue;
    const has = m?.roles?.includes(r.id);
    if (step.key === key && !has) await h.discord(env, "PUT", `/guilds/${h.GUILD_ID}/members/${userId}/roles/${r.id}`);
    if (step.key !== key && has) await h.discord(env, "DELETE", `/guilds/${h.GUILD_ID}/members/${userId}/roles/${r.id}`);
  }
  return target;
}

async function announceLevel(h, env, userId, step, by) {
  if (step.key === "fde") {
    await h.discord(env, "POST", `/channels/${h.CHANNELS.certifications}/messages`, {
      content: `<@${userId}>`,
      allowed_mentions: { users: [userId] },
      embeds: [{
        color: 0xffd166, title: "🏅 Nouveau FDE Certifié",
        description: `Félicitations <@${userId}> ! Tu rejoins les FDE certifiés KX et tu as maintenant accès à <#${h.CHANNELS.missions}>.`,
        footer: { text: `Validé par ${by}` }, timestamp: new Date().toISOString(),
      }],
    }, "academie");
  }
  const text = {
    apprenti: `Bienvenue dans le parcours FDE KX 🌱 Tu es **Apprenti**. Commence par lire <#${h.CHANNELS.parcours}> et relève le défi de la semaine dans <#${h.CHANNELS.defi}>.`,
    formation: `Tu passes **En formation** 🛠️ Poste tes réalisations dans <#${h.CHANNELS.rendus}>, un mentor va te suivre.`,
    fde: `Tu es maintenant **FDE Certifié** 🏅 Les missions clients t'attendent dans <#${h.CHANNELS.missions}>. Bravo !`,
  }[step.key];
  await dm(h, env, userId, { embeds: [{ color: h.VIOLET, title: "KX Automatisation · Parcours FDE", description: text, footer: h.FOOTER }] });
}

const canManage = (i) => {
  const p = BigInt(i.member?.permissions ?? "0");
  return (p & 0x8n) === 0x8n || (p & MANAGE_ROLES) === MANAGE_ROLES;
};

function modalRow(id, label, style, required = true, max = 400, placeholder) {
  return { type: 1, components: [{ type: 4, custom_id: id, label, style, required, max_length: max, ...(placeholder ? { placeholder } : {}) }] };
}

// ------------------------------------------------------------ commandes
export async function handleFde(name, i, env, ctx, h) {
  const user = i.member?.user ?? i.user;

  if (name === "aide") return h.json({ type: 4, data: guideV2(true) });

  if (name === "candidature") {
    return h.json({
      type: 9,
      data: {
        custom_id: "candidature-modal", title: "Candidature parcours FDE",
        components: [
          modalRow("niveau", "Où en es-tu ? (débutant, junior, confirmé)", 1, true, 60),
          modalRow("outils", "Outils que tu maîtrises", 1, true, 200, "n8n, Make, Python, API, agents IA..."),
          modalRow("projets", "Un projet d'automatisation dont tu es fier", 2, true, 800),
          modalRow("objectif", "Ce que tu attends du parcours", 2, true, 400),
          modalRow("lien", "Portfolio, GitHub ou LinkedIn (facultatif)", 1, false, 200),
        ],
      },
    });
  }

  if (name === "profil") {
    const targetId = h.opt(i, "membre") ?? user.id;
    const m = await member(h, env, targetId);
    if (!m) return h.reply({ content: "Membre introuvable." }, true);
    const roles = await guildRoles(h, env);
    const names = m.roles.map((id) => roles.find((r) => r.id === id)?.name).filter(Boolean);
    const step = [...h.LADDER].reverse().find((l) => names.includes(l.role));
    const isMentor = names.includes(h.MENTOR_ROLE);
    const pts = await store(env, "profile", { user: targetId }).catch(() => null);
    const u = m.user;
    return h.reply({
      embeds: [{
        color: h.LILAS, title: u.global_name ?? u.username,
        thumbnail: u.avatar ? { url: `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=128` } : undefined,
        fields: [
          { name: "Niveau FDE", value: step ? `${step.emoji} ${step.label}` : "Pas encore dans le parcours (`/candidature`)", inline: true },
          { name: "Mentor", value: isMentor ? "Oui 🎓" : "Non", inline: true },
          { name: "Membre depuis", value: `<t:${Math.floor(new Date(m.joined_at).getTime() / 1000)}:D>`, inline: true },
          ...(pts ? [
            { name: "Points", value: `${pts.total}`, inline: true },
            { name: "Classement", value: pts.total ? `#${pts.rank}` : "-", inline: true },
            { name: "Cette semaine", value: `+${pts.week}`, inline: true },
          ] : []),
        ],
        footer: h.FOOTER,
      }],
    }, true);
  }

  if (name === "niveau") {
    if (!canManage(i)) return h.reply({ content: "Commande réservée à l'équipe." }, true);
    const targetId = h.opt(i, "membre");
    const key = h.opt(i, "niveau");
    ctx.waitUntil((async () => {
      if (key === "mentor") {
        const r = (await guildRoles(h, env)).find((x) => x.name === h.MENTOR_ROLE);
        if (r) await h.discord(env, "PUT", `/guilds/${h.GUILD_ID}/members/${targetId}/roles/${r.id}`);
        await dm(h, env, targetId, { embeds: [{ color: h.VIOLET, description: "Tu es maintenant **Mentor** 🎓 sur le serveur KX. Merci d'accompagner les apprentis !", footer: h.FOOTER }] });
        return;
      }
      const step = await setLevel(h, env, targetId, key);
      if (step) await announceLevel(h, env, targetId, step, user.global_name ?? user.username);
    })());
    return h.reply({ content: `C'est fait, <@${targetId}> passe au niveau **${key}**.` }, true);
  }

  if (name === "badge") {
    if (!canManage(i)) return h.reply({ content: "Commande réservée à l'équipe." }, true);
    const targetId = h.opt(i, "membre"), badge = h.opt(i, "badge"), remove = h.opt(i, "retirer") === true;
    if (!BADGES.includes(badge)) return h.reply({ content: "Badge inconnu." }, true);
    const role = (await guildRoles(h, env)).find((r) => r.name === badge);
    if (!role) return h.reply({ content: `Le rôle ${badge} n'existe pas encore, lance /kx-publier.` }, true);
    ctx.waitUntil((async () => {
      const res = await h.discord(env, remove ? "DELETE" : "PUT", `/guilds/${h.GUILD_ID}/members/${targetId}/roles/${role.id}`);
      if (!res.ok || remove) return;
      await h.discord(env, "POST", `/channels/${h.CHANNELS.certifications}/messages`, {
        content: `<@${targetId}>`, allowed_mentions: { users: [targetId] },
        embeds: [{ color: role.color || h.BOTS.academie.color, description: `${BADGE_EMOJI[badge] ?? "🎖️"} <@${targetId}> reçoit le badge **${badge}**`, footer: { text: `Attribué par ${user.global_name ?? user.username}` }, timestamp: new Date().toISOString() }],
      }, "academie");
    })());
    return h.reply({ content: remove ? `Badge **${badge}** retiré à <@${targetId}>.` : `Badge **${badge}** donné à <@${targetId}>, annoncé dans <#${h.CHANNELS.certifications}>.` }, true);
  }

  if (name === "mission") {
    if (!canManage(i)) return h.reply({ content: "Commande réservée à l'équipe." }, true);
    return h.json({
      type: 9,
      data: {
        custom_id: "mission-modal", title: "Publier une mission FDE",
        components: [
          modalRow("titre", "Titre de la mission", 1, true, 100),
          modalRow("client", "Secteur du client (anonymisé)", 1, true, 100, "ex. PME du BTP, 40 salariés"),
          modalRow("besoin", "Besoin et livrables attendus", 2, true, 1500),
          modalRow("budget", "Budget ou rémunération", 1, false, 100),
          modalRow("delai", "Délai et format (remote, sur site...)", 1, false, 150),
        ],
      },
    });
  }

  if (name === "defi") {
    if (!canManage(i)) return h.reply({ content: "Commande réservée à l'équipe." }, true);
    ctx.waitUntil(postDefi(env, h));
    return h.reply({ content: `Défi en cours de génération, il arrive dans <#${h.CHANNELS.defi}>.` }, true);
  }

  return null;
}

// ------------------------------------------------------------ boutons
export async function handleFdeComponent(i, env, ctx, h) {
  const id = i.data.custom_id;
  const user = i.member?.user ?? i.user;

  if (id.startsWith("cand:")) {
    if (!canManage(i)) return h.reply({ content: "Seule l'équipe peut traiter les candidatures." }, true);
    const [, action, targetId] = id.split(":");
    const by = user.global_name ?? user.username;
    ctx.waitUntil((async () => {
      if (action === "refus") {
        await dm(h, env, targetId, { embeds: [{ color: h.LILAS, description: "Merci pour ta candidature au parcours FDE KX. Elle n'est pas retenue pour l'instant: continue à pratiquer avec les défis de la semaine et retente ta chance bientôt 💪", footer: h.FOOTER }] });
      } else {
        const step = await setLevel(h, env, targetId, action);
        if (step) await announceLevel(h, env, targetId, step, by);
      }
    })());
    const label = { formation: "🛠️ Passé En formation", fde: "🏅 Certifié FDE", refus: "❌ Refusé" }[action] ?? action;
    const embed = { ...(i.message.embeds?.[0] ?? {}), footer: { text: `${label} par ${by}` } };
    return h.json({ type: 7, data: { embeds: [embed], components: [] } });
  }

  if (id === "interest") {
    const title = i.message.embeds?.[0]?.title ?? "mission";
    ctx.waitUntil(h.discord(env, "POST", `/channels/${h.CHANNELS.staff}/messages`, {
      embeds: [{ color: h.BOTS.missions.color, title: "✋ Intérêt pour une mission", description: `<@${user.id}> est intéressé par **${title}**\n[Voir la mission](https://discord.com/channels/${h.GUILD_ID}/${i.channel_id}/${i.message.id})`, timestamp: new Date().toISOString() }],
    }, "missions"));
    return h.reply({ content: "C'est noté, l'équipe KX revient vers toi en message privé." }, true);
  }

  return null;
}

// ------------------------------------------------------------ formulaires
export async function handleFdeModal(i, env, ctx, h) {
  const f = {};
  for (const row of i.data.components) for (const c of row.components) f[c.custom_id] = c.value;
  const user = i.member?.user ?? i.user;

  if (i.data.custom_id === "candidature-modal") {
    ctx.waitUntil((async () => {
      await setLevel(h, env, user.id, "apprenti");
      const fields = [
        { name: "Niveau déclaré", value: f.niveau || "-", inline: true },
        { name: "Outils", value: f.outils || "-", inline: true },
        { name: "Projet", value: f.projets || "-" },
        { name: "Objectif", value: f.objectif || "-" },
      ];
      if (f.lien) fields.push({ name: "Lien", value: f.lien });
      await h.discord(env, "POST", `/channels/${h.CHANNELS.staff}/messages`, {
        embeds: [{ color: h.VIOLET, title: `Candidature FDE · ${user.global_name ?? user.username}`, description: `<@${user.id}> (passé Apprenti automatiquement)`, fields, timestamp: new Date().toISOString() }],
        components: [{ type: 1, components: [
          { type: 2, style: 1, label: "Passer En formation", emoji: { name: "🛠️" }, custom_id: `cand:formation:${user.id}` },
          { type: 2, style: 3, label: "Certifier FDE", emoji: { name: "🏅" }, custom_id: `cand:fde:${user.id}` },
          { type: 2, style: 4, label: "Refuser", custom_id: `cand:refus:${user.id}` },
        ] }],
      }, "academie");
      await announceLevel(h, env, user.id, h.LADDER[0], "KX Académie");
    })());
    return h.reply({ content: "Candidature envoyée ✅ Tu es maintenant **Apprenti** 🌱 L'équipe va l'étudier, regarde tes messages privés." }, true);
  }

  if (i.data.custom_id === "mission-modal") {
    const fields = [{ name: "Client", value: f.client || "-", inline: true }];
    if (f.budget) fields.push({ name: "Budget", value: f.budget, inline: true });
    if (f.delai) fields.push({ name: "Délai / format", value: f.delai, inline: true });
    ctx.waitUntil((async () => {
      const roles = await guildRoles(h, env);
      const fde = roles.find((r) => r.name === "FDE Certifié");
      await h.discord(env, "POST", `/channels/${h.CHANNELS.missions}/messages`, {
        content: fde ? `<@&${fde.id}> nouvelle mission` : undefined,
        allowed_mentions: { roles: fde ? [fde.id] : [] },
        embeds: [{ color: h.BOTS.missions.color, title: f.titre, description: f.besoin, fields, footer: h.FOOTER, timestamp: new Date().toISOString() }],
        components: [{ type: 1, components: [{ type: 2, style: 3, label: "Je suis intéressé", emoji: { name: "✋" }, custom_id: "interest" }] }],
      }, "missions");
    })());
    return h.reply({ content: `Mission publiée dans <#${h.CHANNELS.missions}>.` }, true);
  }

  return null;
}

// ------------------------------------------------------------ défi de la semaine
export async function postDefi(env, h) {
  const text = await h.ask(env, [
    { role: "system", content: "Tu écris en français, de façon concrète et précise." },
    { role: "user", content: h.DEFI_PROMPT },
  ], 1500);
  if (!text) { console.log("Défi non publié: réponse IA vide"); return; }
  const week = Math.ceil((((new Date() - new Date(new Date().getFullYear(), 0, 1)) / 864e5) + 1) / 7);
  await h.discord(env, "POST", `/channels/${h.CHANNELS.defi}/messages`, {
    embeds: [{
      color: h.BOTS.academie.color, title: `🏋️ Défi de la semaine ${week}`,
      description: `${text}\n\n➡️ Poste ton rendu dans <#${h.CHANNELS.rendus}> et discute-en dans le fil ci-dessous.`,
      footer: h.FOOTER, timestamp: new Date().toISOString(),
    }],
  }, "academie").then(async (res) => {
    if (!res.ok) return;
    const msg = await res.json();
    await h.discord(env, "POST", `/channels/${h.CHANNELS.defi}/messages/${msg.id}/threads`, { name: `Défi semaine ${week} · questions`, auto_archive_duration: 10080 }, "academie");
  });
}
