// Lot 2: points, quiz, review IA, pitch, ROI, tickets, ateliers, stats, menus clic droit, /kx-setup
import { store } from "./store.js";
import { TOPICS, AI_DAILY_LIMIT } from "./config.js";

const SEND = 2048n, PUB_THREADS = 34359738368n, PRIV_THREADS = 68719476736n;
const MEDALS = ["🥇", "🥈", "🥉"];

const today = () => new Date().toISOString().slice(0, 10);
const who = (u) => u.global_name ?? u.username;
const isAdmin = (i) => (BigInt(i.member?.permissions ?? "0") & 0x8n) === 0x8n;
const canManage = (i) => isAdmin(i) || (BigInt(i.member?.permissions ?? "0") & 0x10000000n) === 0x10000000n;

async function quotaOk(env, i, h) {
  if (h.isStaff(i) || canManage(i)) return true;
  const user = i.member?.user ?? i.user;
  const r = await store(env, "aiQuota", { user: user.id, day: today(), limit: AI_DAILY_LIMIT });
  return r.ok;
}
const quotaMsg = (h) => h.reply({ content: `Tu as atteint ta limite de ${AI_DAILY_LIMIT} demandes IA aujourd'hui. Reviens demain 🙂` }, true);

async function findChannel(h, env, test) {
  const chans = await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/channels`)).json();
  return { chans, found: chans.find(test) };
}

async function roleByName(h, env, name) {
  const roles = await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/roles`)).json();
  return roles.find((r) => r.name === name);
}

function parisToUtc(y, mo, d, hh, mm) {
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess - (asUtc - guess));
}

async function thankFlow(env, h, giver, receiver, reason) {
  if (giver.id === receiver.id) return h.reply({ content: "On ne peut pas se remercier soi-même 😉" }, true);
  if (receiver.bot) return h.reply({ content: "Le bot te remercie aussi, mais il ne prend pas de points 🤖" }, true);
  const r = await store(env, "thank", { giver: giver.id, receiver: receiver.id, day: today() });
  if (!r.ok) return h.reply({ content: `Tu as déjà remercié ${who(receiver)} aujourd'hui.` }, true);
  return h.json({ type: 4, data: {
    allowed_mentions: { users: [receiver.id] },
    embeds: [{ color: h.BOTS.arene.color, description: `🙏 <@${giver.id}> remercie <@${receiver.id}>${reason ? ` pour **${reason}**` : ""}\n**+10 points** · total ${r.total}`, footer: h.FOOTER }],
  } });
}

async function openTicket(env, h, user, sujet) {
  const { found } = await findChannel(h, env, (c) => c.name === "🎫・support");
  if (!found) return "Le salon support n'existe pas encore, l'équipe doit lancer /kx-setup.";
  const t = await h.discord(env, "POST", `/channels/${found.id}/threads`, { name: `ticket-${who(user)}`.slice(0, 90), type: 12, invitable: false, auto_archive_duration: 10080 });
  if (!t.ok) return "Impossible d'ouvrir le ticket pour l'instant.";
  const thread = await t.json();
  await h.discord(env, "PUT", `/channels/${thread.id}/thread-members/${user.id}`);
  const equipe = await roleByName(h, env, "Équipe KX");
  await h.discord(env, "POST", `/channels/${thread.id}/messages`, {
    content: `<@${user.id}>${equipe ? ` <@&${equipe.id}>` : ""}`,
    allowed_mentions: { users: [user.id], roles: equipe ? [equipe.id] : [] },
    embeds: [{ color: h.LILAS, title: "🎫 Ticket ouvert", description: `${sujet ? `**Sujet**: ${sujet}\n\n` : ""}Explique ta demande ici, seuls toi et l'équipe voyez ce fil. Quand c'est réglé, clique sur Fermer.`, footer: h.FOOTER }],
    components: [{ type: 1, components: [{ type: 2, style: 4, label: "Fermer le ticket", emoji: { name: "🔒" }, custom_id: "ticket:close" }] }],
  });
  return `Ton ticket est ouvert ici, <#${thread.id}>`;
}

// ------------------------------------------------------------ commandes
export async function handleFeatures(name, i, env, ctx, h) {
  const user = i.member?.user ?? i.user;
  const target = i.data.target_id;
  const resolvedMsg = target ? i.data.resolved?.messages?.[target] : null;

  // ---------- points
  if (name === "merci") {
    const id = h.opt(i, "membre");
    return thankFlow(env, h, user, i.data.resolved.users[id], h.opt(i, "raison"));
  }
  if (name === "Remercier l'auteur") return thankFlow(env, h, user, resolvedMsg.author, "ce message");

  if (name === "classement") {
    const week = h.opt(i, "periode") !== "total";
    const top = await store(env, "top", { n: 10, days: week ? 7 : undefined });
    const lines = top.map((r, k) => `${MEDALS[k] ?? `**${k + 1}.**`} <@${r.user}> · ${r.total} pts`);
    return h.json({ type: 4, data: { allowed_mentions: { parse: [] }, embeds: [{ color: h.BOTS.arene.color, title: week ? "🏆 Classement de la semaine" : "🏆 Classement général", description: lines.join("\n") || "Personne n'a encore de points. Aide quelqu'un, réponds à un /quiz ou fais-toi remercier avec /merci !", footer: { text: "Points: /merci +10 · bonne réponse /quiz +5 · bonus de l'équipe" } }] } });
  }

  if (name === "points") {
    if (!canManage(i)) return h.reply({ content: "Commande réservée à l'équipe." }, true);
    const id = h.opt(i, "membre"), n = h.opt(i, "nombre"), why = h.opt(i, "raison") ?? "bonus équipe";
    const r = await store(env, "add", { user: id, pts: n, reason: why });
    return h.json({ type: 4, data: { allowed_mentions: { users: [id] }, embeds: [{ color: h.AMBRE, description: `${n >= 0 ? "🎁" : "⚠️"} <@${id}> ${n >= 0 ? "+" : ""}${n} points (${why}) · total ${r.total}` }] } });
  }

  // ---------- quiz IA
  if (name === "quiz") {
    if (!(await quotaOk(env, i, h))) return quotaMsg(h);
    const theme = h.opt(i, "theme") ?? "automatisation, n8n, API, agents IA, bonnes pratiques FDE";
    ctx.waitUntil((async () => {
      let q;
      for (let k = 0; k < 1 && !q; k++) {
        const raw = await h.ask(env, [
          { role: "system", content: "Tu crées des quiz techniques en français. Tu réponds uniquement avec un objet JSON valide." },
          { role: "user", content: `Crée une question à choix multiples de niveau intermédiaire sur: ${theme}. Format strict: {"question":"...","choix":["...","...","...","..."],"reponse":0,"explication":"..."} où reponse est l'index (0 à 3) de la bonne réponse. Choix courts (moins de 70 caractères). Explication en 2 phrases.` },
        ], 900);
        try { q = JSON.parse(raw.match(/\{[\s\S]*\}/)[0]); if (!Array.isArray(q.choix) || q.choix.length !== 4) q = null; } catch { q = null; }
      }
      if (!q) return h.followUp(env, i, { content: "L'IA n'a pas réussi à générer le quiz, relance /quiz." });
      const id = crypto.randomUUID().slice(0, 8);
      await store(env, "quizSave", { id, answer: Number(q.reponse), explanation: String(q.explication).slice(0, 900) });
      const L = ["A", "B", "C", "D"];
      await h.followUp(env, i, {
        embeds: [{ color: h.BOTS.arene.color, title: "🧠 Quiz FDE", description: `**${q.question}**\n\n${q.choix.map((c, k) => `**${L[k]}.** ${c}`).join("\n")}`, footer: { text: "Une seule réponse par personne · bonne réponse = +5 points" } }],
        components: [{ type: 1, components: L.map((l, k) => ({ type: 2, style: 2, label: l, custom_id: `quiz:${id}:${k}` })) }],
      });
    })());
    return h.json({ type: 5 });
  }

  // ---------- IA pour FDE
  if (name === "review") {
    return h.json({ type: 9, data: { custom_id: "review-modal", title: "Review IA de ton automatisation", components: [
      { type: 1, components: [{ type: 4, custom_id: "contexte", label: "Contexte (outil, objectif, client type)", style: 1, required: true, max_length: 200 }] },
      { type: 1, components: [{ type: 4, custom_id: "contenu", label: "Workflow, code ou description détaillée", style: 2, required: true, max_length: 4000, placeholder: "Colle ton JSON n8n, ton script ou décris les étapes" }] },
    ] } });
  }

  if (name === "pitch") {
    if (!(await quotaOk(env, i, h))) return quotaMsg(h);
    const desc = h.opt(i, "automatisation"), cible = h.opt(i, "client") ?? "un dirigeant de PME";
    ctx.waitUntil((async () => {
      const txt = await h.ask(env, [
        { role: "system", content: "Tu aides des FDE à présenter une automatisation à un client. Français, vouvoiement, ton direct, zéro jargon technique, pas de promesse chiffrée inventée." },
        { role: "user", content: `Automatisation: ${desc}\nInterlocuteur: ${cible}\nÉcris: 1) un pitch oral de 4 phrases centré sur le temps gagné et la tranquillité, 2) un message LinkedIn de 3 lignes, 3) les 3 objections probables avec une réponse courte chacune.` },
      ], 700);
      await h.followUp(env, i, { embeds: [{ color: h.BOTS.ia.color, title: "🎤 Ton pitch client", description: txt || "L'IA n'a pas répondu, réessaie.", footer: { text: "Généré par l'IA de KX · à adapter à ton client" } }] });
    })());
    return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
  }

  if (name === "Résumer avec l'IA" || name === "Expliquer avec l'IA") {
    if (!resolvedMsg?.content) return h.reply({ content: "Ce message ne contient pas de texte à analyser." }, true);
    if (!(await quotaOk(env, i, h))) return quotaMsg(h);
    const explain = name.startsWith("Expliquer");
    ctx.waitUntil((async () => {
      const txt = await h.ask(env, [
        { role: "system", content: explain ? "Tu expliques du code, des workflows ou des notions techniques à un apprenti FDE, en français, simplement, avec un exemple si utile. 12 lignes maximum." : "Tu résumes un message Discord en français en 3 à 5 puces courtes, sans inventer." },
        { role: "user", content: resolvedMsg.content.slice(0, 6000) },
      ], 600);
      await h.followUp(env, i, { embeds: [{ color: h.BOTS.ia.color, title: explain ? "💡 Explication" : "📝 Résumé", description: txt || "L'IA n'a pas répondu, réessaie.", footer: { text: `Message de ${who(resolvedMsg.author)}` } }] });
    })());
    return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
  }

  // ---------- calculateur de gain de temps
  if (name === "roi") {
    const minutes = h.opt(i, "minutes"), freq = h.opt(i, "fois_par_semaine"), people = h.opt(i, "personnes") ?? 1, rate = h.opt(i, "cout_horaire") ?? 35;
    const hWeek = (minutes * freq * people) / 60, hYear = hWeek * 47, eur = Math.round(hYear * rate);
    const f = (n) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
    return h.reply({ embeds: [{
      color: h.AMBRE, title: "⏱️ Temps récupérable avec une automatisation",
      description: `Tâche de **${minutes} min**, **${freq}×/semaine**, pour **${people}** personne${people > 1 ? "s" : ""} à **${rate} €/h**`,
      fields: [
        { name: "Par semaine", value: `${f(hWeek)} h`, inline: true },
        { name: "Par mois", value: `${f(hWeek * 4.33)} h`, inline: true },
        { name: "Par an", value: `${f(hYear)} h · **${eur.toLocaleString("fr-FR")} €**`, inline: true },
      ],
      footer: { text: "Base 47 semaines travaillées · simulateur complet sur kxautomatisation.fr" },
    }] });
  }

  // ---------- tickets
  if (name === "ticket") {
    ctx.waitUntil((async () => h.followUp(env, i, { content: await openTicket(env, h, user, h.opt(i, "sujet")) }))());
    return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
  }

  // ---------- ateliers (événements Discord)
  if (name === "atelier") {
    if (!canManage(i)) return h.reply({ content: "Commande réservée à l'équipe." }, true);
    const titre = h.opt(i, "titre"), date = h.opt(i, "date"), heure = h.opt(i, "heure"), desc = h.opt(i, "description") ?? "", duree = h.opt(i, "duree") ?? 60;
    const dm = date.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/), hm = heure.match(/^(\d{1,2})[h:](\d{2})?$/i);
    if (!dm || !hm) return h.reply({ content: "Format attendu: date `JJ/MM` (ou `JJ/MM/AAAA`), heure `18:30` ou `18h`." }, true);
    let year = dm[3] ? Number(dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : new Date().getFullYear();
    let start = parisToUtc(year, +dm[2], +dm[1], +hm[1], +(hm[2] ?? 0));
    if (!dm[3] && start < new Date()) start = parisToUtc(year + 1, +dm[2], +dm[1], +hm[1], +(hm[2] ?? 0));
    ctx.waitUntil((async () => {
      const { found: voice } = await findChannel(h, env, (c) => c.type === 2 && c.name.includes("Atelier live"));
      const ev = await h.discord(env, "POST", `/guilds/${h.GUILD_ID}/scheduled-events`, {
        name: titre.slice(0, 100), description: desc.slice(0, 1000), privacy_level: 2,
        scheduled_start_time: start.toISOString(), scheduled_end_time: new Date(start.getTime() + duree * 60000).toISOString(),
        entity_type: voice ? 2 : 3, channel_id: voice?.id, entity_metadata: voice ? undefined : { location: "Discord KX" },
      });
      const event = ev.ok ? await ev.json() : null;
      const notif = await roleByName(h, env, "Notif lives");
      await h.discord(env, "POST", `/channels/${h.CHANNELS.ateliers}/messages`, {
        content: `${notif ? `<@&${notif.id}> ` : ""}${event ? `https://discord.com/events/${h.GUILD_ID}/${event.id}` : ""}`,
        allowed_mentions: { roles: notif ? [notif.id] : [] },
        embeds: [{ color: h.BOTS.academie.color, title: `🎓 ${titre}`, description: `${desc}\n\n📅 <t:${Math.floor(start / 1000)}:F> (<t:${Math.floor(start / 1000)}:R>)\n🎙️ ${voice ? `<#${voice.id}>` : "sur le serveur"}\n\nClique sur « Intéressé » dans l'événement pour recevoir un rappel.`, footer: h.FOOTER }],
      }, "academie");
      await h.followUp(env, i, { content: event ? "Atelier créé et annoncé ✅" : "Annonce publiée, mais l'événement Discord n'a pas pu être créé." });
    })());
    return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
  }

  // ---------- stats
  if (name === "stats") {
    const [g, s, roles, members] = await Promise.all([
      h.discord(env, "GET", `/guilds/${h.GUILD_ID}?with_counts=true`).then((r) => r.json()),
      store(env, "stats"),
      h.discord(env, "GET", `/guilds/${h.GUILD_ID}/roles`).then((r) => r.json()),
      h.discord(env, "GET", `/guilds/${h.GUILD_ID}/members?limit=1000`).then((r) => (r.ok ? r.json() : null)),
    ]);
    const count = (n) => { const r = roles.find((x) => x.name === n); return members && r ? members.filter((m) => m.roles.includes(r.id)).length : "?"; };
    return h.reply({ embeds: [{
      color: h.BOTS.arene.color, title: "📊 La communauté KX en chiffres", footer: h.FOOTER,
      fields: [
        { name: "Membres", value: `${g.approximate_member_count ?? "?"}`, inline: true },
        { name: "En ligne", value: `${g.approximate_presence_count ?? "?"}`, inline: true },
        { name: "🏅 FDE certifiés", value: `${count("FDE Certifié")}`, inline: true },
        { name: "🛠️ En formation", value: `${count("En formation")}`, inline: true },
        { name: "🌱 Apprentis", value: `${count("Apprenti")}`, inline: true },
        { name: "🎓 Mentors", value: `${count("Mentor")}`, inline: true },
        { name: "Points distribués", value: `${s.points}`, inline: true },
        { name: "Quiz joués", value: `${s.quizzes}`, inline: true },
        { name: "Remerciements", value: `${s.thanks}`, inline: true },
      ],
    }] });
  }

  // ---------- configuration du serveur
  if (name === "kx-setup") {
    if (!isAdmin(i)) return h.reply({ content: "Commande réservée aux administrateurs." }, true);
    ctx.waitUntil((async () => h.followUp(env, i, { content: (await runSetup(env, h)).join("\n").slice(0, 1900) }))());
    return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
  }

  return null;
}

// ------------------------------------------------------------ boutons et formulaires
export async function handleFeaturesComponent(i, env, ctx, h) {
  const id = i.data.custom_id;
  const user = i.member?.user ?? i.user;

  if (id.startsWith("quiz:")) {
    const [, qid, choice] = id.split(":");
    const r = await store(env, "quizTry", { id: qid, user: user.id, choice: Number(choice) });
    const L = ["A", "B", "C", "D"];
    if (r.missing) return h.reply({ content: "Ce quiz a expiré." }, true);
    if (r.already) return h.reply({ content: `Tu as déjà répondu. La bonne réponse était **${L[r.answer]}**.\n${r.explanation}` }, true);
    return h.reply({ content: r.correct ? `✅ Bonne réponse ! **+5 points** (total ${r.total})\n${r.explanation}` : `❌ Raté, c'était **${L[r.answer]}**.\n${r.explanation}` }, true);
  }

  if (id === "ticket:open") {
    ctx.waitUntil((async () => h.followUp(env, i, { content: await openTicket(env, h, user) }))());
    return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
  }

  if (id === "ticket:close") {
    ctx.waitUntil((async () => {
      await h.discord(env, "POST", `/channels/${i.channel_id}/messages`, { embeds: [{ color: h.LILAS, description: `🔒 Ticket fermé par <@${user.id}>.` }] });
      await h.discord(env, "PATCH", `/channels/${i.channel_id}`, { archived: true, locked: true });
    })());
    return h.json({ type: 7, data: { components: [] } });
  }
  return null;
}

export async function handleFeaturesModal(i, env, ctx, h) {
  if (i.data.custom_id !== "review-modal") return null;
  if (!(await quotaOk(env, i, h))) return quotaMsg(h);
  const f = {};
  for (const row of i.data.components) for (const c of row.components) f[c.custom_id] = c.value;
  ctx.waitUntil((async () => {
    const txt = await h.ask(env, [
      { role: "system", content: "Tu es un FDE senior qui fait une revue bienveillante mais exigeante d'automatisations (n8n, Make, Python, agents IA). Français, tutoiement, concret." },
      { role: "user", content: `Contexte: ${f.contexte}\n\nContenu à relire:\n${f.contenu}\n\nRéponds avec ces sections: **Ce qui est bien** (2 puces), **Risques** (erreurs non gérées, sécurité, données personnelles, coûts, limites d'API), **Améliorations concrètes** (3 à 5 puces actionnables), **Prêt pour un client ?** (oui/non + pourquoi, 1 phrase), **Note** /10.` },
    ], 900);
    await h.followUp(env, i, { embeds: [{ color: h.BOTS.ia.color, title: "🔍 Review IA", description: txt || "L'IA n'a pas répondu, réessaie.", footer: { text: "Généré par l'IA de KX · demande aussi l'avis d'un mentor dans le forum des rendus" } }] });
  })());
  return h.json({ type: 5, data: { flags: h.EPHEMERAL } });
}

// ------------------------------------------------------------ crons hebdo
export async function weeklyLeaderboard(env, h) {
  const top = await store(env, "top", { n: 5, days: 7 });
  if (!top.length) return;
  await h.discord(env, "POST", `/channels/${h.CHANNELS.discussion}/messages`, {
    allowed_mentions: { users: top.map((r) => r.user) },
    embeds: [{ color: h.BOTS.arene.color, title: "🏆 Les contributeurs de la semaine", description: top.map((r, k) => `${MEDALS[k] ?? `**${k + 1}.**`} <@${r.user}> · ${r.total} pts`).join("\n") + "\n\nMerci à vous ! Remerciez ceux qui vous aident avec `/merci` ou clic droit sur un message → Applications → Remercier l'auteur.", footer: h.FOOTER }],
  }, "arene");
}

export async function buildInPublic(env, h) {
  const res = await h.discord(env, "POST", `/channels/${h.CHANNELS.vos_creations}/messages`, {
    embeds: [{ color: h.BOTS.academie.color, title: "🚀 Build in public", description: "Qu'est-ce que tu construis cette semaine ? Un workflow, un agent, un script, un client ?\nRaconte-le dans le fil ci-dessous, même en 2 lignes. On s'entraide et on se motive.", footer: h.FOOTER }],
  }, "academie");
  if (!res.ok) return;
  const msg = await res.json();
  const d = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  await h.discord(env, "POST", `/channels/${h.CHANNELS.vos_creations}/messages/${msg.id}/threads`, { name: `Build in public · semaine du ${d}`, auto_archive_duration: 10080 }, "academie");
}

// ------------------------------------------------------------ /kx-setup
async function runSetup(env, h) {
  const out = [];
  const step = async (label, fn) => { try { const r = await fn(); out.push(`${r === false ? "⚠️" : "✅"} ${label}${typeof r === "string" ? ` · ${r}` : ""}`); } catch (e) { out.push(`❌ ${label} · ${e.message}`); } };
  const ok = async (res) => { if (res.ok) return true; throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`); };
  const C = h.CHANNELS;

  await step("Sujets des salons", async () => {
    let n = 0;
    for (const [k, topic] of Object.entries(TOPICS)) if (C[k] && (await h.discord(env, "PATCH", `/channels/${C[k]}`, { topic })).ok) n++;
    return `${n} salons`;
  });

  await step("Forum des questions (tags, réaction)", async () => ok(await h.discord(env, "PATCH", `/channels/${C.questions}`, {
    topic: "Un post par question. Donne l'outil, ce que tu as essayé et le résultat attendu. Ajoute le tag ✅ Résolu quand c'est réglé.",
    default_reaction_emoji: { emoji_name: "👍" },
    available_tags: [
      { name: "n8n", emoji_name: "⚙️" }, { name: "Make / Zapier", emoji_name: "🔗" }, { name: "Python / JS", emoji_name: "🐍" },
      { name: "API", emoji_name: "🔌" }, { name: "Agents IA", emoji_name: "🤖" }, { name: "Excel / VBA", emoji_name: "📊" },
      { name: "Résolu", emoji_name: "✅" },
    ],
  })));

  await step("Forum des rendus (tags, réaction)", async () => ok(await h.discord(env, "PATCH", `/channels/${C.rendus}`, {
    topic: "Poste ici tes rendus de défis et tes projets. Décris le besoin, ta solution, une capture. Les mentors commentent.",
    default_reaction_emoji: { emoji_name: "⭐" },
    available_tags: [
      { name: "Défi de la semaine", emoji_name: "🏋️" }, { name: "Projet perso", emoji_name: "🧪" },
      { name: "Demande de review", emoji_name: "🔍" }, { name: "Validé par un mentor", emoji_name: "✅" },
    ],
  })));

  await step("Salon 🎫・support + panneau de tickets", async () => {
    const { chans, found } = await findChannel(h, env, (c) => c.name === "🎫・support");
    let support = found;
    if (!support) {
      const parent = chans.find((c) => c.type === 4 && c.name === "◆ ENTRAIDE");
      const res = await h.discord(env, "POST", `/guilds/${h.GUILD_ID}/channels`, {
        name: "🎫・support", type: 0, parent_id: parent?.id, topic: "Ouvre un ticket privé avec l'équipe KX.",
        permission_overwrites: [{ id: h.GUILD_ID, type: 0, deny: String(SEND | PUB_THREADS | PRIV_THREADS) }],
      });
      await ok(res);
      support = await res.json();
      await h.discord(env, "POST", `/channels/${support.id}/messages`, {
        embeds: [{ color: h.VIOLET, title: "🎫 Besoin de l'équipe ?", description: "Question privée, souci sur le serveur, candidature, partenariat… Clique sur le bouton, un fil privé s'ouvre avec l'équipe KX.\nTu peux aussi taper `/ticket` n'importe où.", footer: h.FOOTER }],
        components: [{ type: 1, components: [{ type: 2, style: 1, label: "Ouvrir un ticket", emoji: { name: "🎫" }, custom_id: "ticket:open" }] }],
      });
      return "créé";
    }
    return "déjà présent";
  });

  await step("Écran d'accueil", async () => ok(await h.discord(env, "PATCH", `/guilds/${h.GUILD_ID}/welcome-screen`, {
    enabled: true,
    description: "La communauté des FDE, automatisation, agents IA et missions clients.",
    welcome_channels: [
      { channel_id: C.reglement, description: "Lis les règles", emoji_name: "📜" },
      { channel_id: C.parcours, description: "Deviens FDE certifié", emoji_name: "🎓" },
      { channel_id: C.questions, description: "Pose tes questions", emoji_name: "❓" },
      { channel_id: C.defi, description: "Relève le défi de la semaine", emoji_name: "🏋️" },
      { channel_id: C.discussion, description: "Viens discuter", emoji_name: "💬" },
    ],
  })));

  await step("Accueil guidé (questions à l'arrivée)", async () => {
    const roles = await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/roles`)).json();
    const rid = (n) => roles.find((r) => r.name === n)?.id;
    let seq = 0n;
    const sf = () => String((BigInt(Date.now() - 1420070400000) << 22n) | (seq++));
    const opt = (title, description, emoji, channel_ids, role_ids = []) => ({ id: sf(), title, ...(description ? { description } : {}), emoji_name: emoji, channel_ids, role_ids: role_ids.filter(Boolean) });
    const body = {
      enabled: true, mode: 0,
      default_channel_ids: [C.bienvenue, C.reglement, C.annonces, C.presente_toi, C.discussion, C.veille_ia, C.vos_creations, C.detente, C.questions, C.no_code, C.code, C.idees, C.suggestions, C.parcours, C.defi, C.certifications, C.rendus],
      prompts: [
        { id: sf(), type: 0, title: "Qu'est-ce qui t'amène ?", single_select: true, required: true, in_onboarding: true, options: [
          opt("Apprendre l'automatisation", "Je veux devenir FDE", "🌱", [C.parcours, C.defi, C.rendus, C.questions]),
          opt("Je fais déjà de l'automatisation", "Freelance, dev, consultant", "🛠️", [C.parcours, C.vos_creations, C.certifications]),
          opt("Automatiser mon entreprise", "Je veux gagner du temps", "🏢", [C.travailler, C.realisations]),
        ] },
        { id: sf(), type: 0, title: "Quelles notifications veux-tu ?", single_select: false, required: false, in_onboarding: true, options: [
          opt("Lives et ateliers", "Être prévenu des ateliers", "🎓", [C.ateliers], [rid("Notif lives")]),
          opt("Annonces", "Les nouveautés KX", "📢", [C.annonces], [rid("Notif annonces")]),
        ] },
        { id: sf(), type: 0, title: "Tes outils", single_select: false, required: false, in_onboarding: true, options: [
          opt("n8n", null, "⚙️", [C.no_code]), opt("Make / Zapier", null, "🔗", [C.no_code]),
          opt("Python / JavaScript", null, "🐍", [C.code]), opt("Agents IA", null, "🤖", [C.veille_ia]),
        ] },
      ],
    };
    return ok(await h.discord(env, "PUT", `/guilds/${h.GUILD_ID}/onboarding`, body));
  });

  return out;
}
