// K’X Bot, version Cloudflare Worker (interactions HTTP Discord + IA Workers AI)
import { GUILD_ID, CHANNELS, SELF_ROLES, RDV_URL, RSS_FEEDS, AI_MODEL, AI_SYSTEM, LADDER, MENTOR_ROLE, DEFI_PROMPT } from "./config.js";
import { handleFde, handleFdeComponent, handleFdeModal, postDefi } from "./fde.js";
import { handleFeatures, handleFeaturesComponent, handleFeaturesModal, weeklyLeaderboard, buildInPublic } from "./features.js";
import { runPublish } from "./publish.js";
import { store } from "./store.js";
import { handleTicketComponent, handleTicketModal, rdvReminders } from "./tickets.js";
import { parisToUtc } from "./features.js";
import { syncInvites } from "./invites.js";
import { planEspaces, planTexte, rejoindreFde, demandeClientModal, demandeClient, decisionClient, commandeAutorisee, setStatut, STATUTS, ROLE_FDE, ROLE_CLIENT, creerDossierClient, isCoord } from "./espaces.js";
import { BOTS, tokenOf, publicKeyOf, botByPath } from "./bots.js";
import { tourStep, tourLoading, TOUR, V2, botCard, INTRO_CMD } from "./guide.js";
export { KXStore } from "./store.js";
import { setJobRunner } from "./store.js";
import { etapeTravail } from "./jobs.js";

const API = "https://discord.com/api/v10";
const VIOLET = 0x8b5cf6, LILAS = 0xb69cff, AMBRE = 0xf5b83d;
const EPHEMERAL = 64;
const FOOTER = { text: "K’X Automatisation · kxautomatisation.fr" };

// ------------------------------------------------------------ utilitaires
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const reply = (data, ephemeral = false) =>
  json({ type: 4, data: { ...data, flags: ephemeral ? EPHEMERAL : 0, allowed_mentions: { parse: [] } } });

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function verify(request, body, publicKey) {
  const sig = request.headers.get("x-signature-ed25519");
  const ts = request.headers.get("x-signature-timestamp");
  if (!sig || !ts) return false;
  const key = await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, hexToBytes(sig), new TextEncoder().encode(ts + body));
}

// Appel à l'API Discord avec le jeton d'un bot de l'équipe (K’X Bot par défaut, et en secours si l'autre n'a pas accès)
async function discord(env, method, path, body, as = "kx") {
  const call = (token) => fetch(API + path, {
    method,
    headers: { Authorization: `Bot ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const own = as !== "kx" ? tokenOf(env, as) : null;
  let res = await call(own || env.DISCORD_BOT_TOKEN);
  if (own && [401, 403, 404].includes(res.status)) res = await call(env.DISCORD_BOT_TOKEN);
  if (!res.ok) console.log("Discord", method, path, res.status, await res.clone().text());
  return res;
}

async function followUp(env, interaction, data) {
  // complète une réponse différée (type 5), au nom du bot qui a reçu la commande
  await fetch(`${API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...data }),
  });
}

const opt = (interaction, name) => interaction.data.options?.find((o) => o.name === name)?.value;
const isStaff = (interaction) => (BigInt(interaction.member?.permissions ?? "0") & 0x8n) === 0x8n || (BigInt(interaction.member?.permissions ?? "0") & 0x2000n) === 0x2000n;

async function ask(env, messages, max_tokens = 1200) {
  // Qwen 3: /no_think coupe la phase de réflexion, sinon elle consomme tout le budget
  const msgs = messages.map((m, k) => (k === messages.length - 1 && m.role === "user" ? { ...m, content: `${m.content}\n\n/no_think` } : m));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await env.AI.run(AI_MODEL, { messages: msgs, max_tokens });
      let text = out?.response ?? out?.choices?.[0]?.message?.content ?? "";
      if (typeof text !== "string") text = JSON.stringify(text);
      text = text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").trim();
      if (text) return text.slice(0, 3900);
    } catch (e) {
      console.log("IA erreur", e.message);
    }
  }
  return "";
}
// ------------------------------------------------------------ commandes
async function handleCommand(interaction, env, ctx) {
  const name = interaction.data.name;
  const user = interaction.member?.user ?? interaction.user;
  if (!(await commandeAutorisee(interaction, env, name))) return reply({ content: "Cette commande n'est pas disponible dans ton espace." }, true);

  if (name === "kx-espaces") {
    if (!isCoord(interaction) || (BigInt(interaction.member.permissions) & 8n) !== 8n) return reply({ content: "Réservé aux administrateurs." }, true);
    const mode = opt(interaction, "mode");
    if (mode === "plan") {
      ctx.waitUntil((async () => followUp(env, interaction, { content: planTexte(await planEspaces(env, helpers)).slice(0, 1990) }))());
    } else {
      // travail long: confié au Durable Object, qui répond dans ce même message à la fin
      ctx.waitUntil(store(env, "jobStart", { job: { kind: `espaces-${mode}`, app: interaction.application_id, token: interaction.token } }));
    }
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (name === "kx-statut") {
    if (!isCoord(interaction)) return reply({ content: "Réservé à la coordination." }, true);
    const target = opt(interaction, "membre"), statut = opt(interaction, "statut");
    ctx.waitUntil((async () => {
      const roles = await (await discord(env, "GET", `/guilds/${GUILD_ID}/roles`)).json();
      const id = (n) => roles.find((r) => r.name === n)?.id;
      const set = async (n, on) => id(n) && discord(env, on ? "PUT" : "DELETE", `/guilds/${GUILD_ID}/members/${target}/roles/${id(n)}`);
      await set(ROLE_FDE, statut === "fde");
      await set(ROLE_CLIENT, statut === "client");
      let extra = "";
      if (statut === "client") {
        const d = await store(env, "dossierOf", { user: target, kind: "client" }).catch(() => null);
        if (!d) { const n = await creerDossierClient(env, helpers, target); extra = ` Dossier ${n.ref} créé, <#${n.suivi.id}>.`; await store(env, "dossierSet", { ...(await store(env, "dossierGet", { ref: n.ref })), etat: "actif" }); }
      }
      await setStatut(env, target, statut === "aucun" ? STATUTS.aucun : statut);
      await store(env, "journal", { quoi: `arbitrage ${statut}`, par: user.id, cible: target });
      await followUp(env, interaction, { content: `Statut de <@${target}> fixé à **${statut}**.${extra}` });
    })());
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (name === "kx") {
    return reply({
      embeds: [{
        title: "K’X Automatisation", url: "https://kxautomatisation.fr", color: VIOLET, footer: FOOTER,
        description:
          "On fait gagner du temps aux entreprises, de l'artisan au groupe.\n\n" +
          "**1.** Échange découverte gratuit de 30 à 40 min\n" +
          "**2.** Analyse de ce qui peut être automatisé\n" +
          "**3.** Livraison au forfait, puis maintenance si besoin",
      }],
    });
  }

  if (name === "rdv") {
    return reply({
      content: "Choisis ton créneau ici:",
      components: [{ type: 1, components: [{ type: 2, style: 5, label: "Prendre rendez-vous", emoji: { name: "📅" }, url: RDV_URL }] }],
    }, true);
  }

  if (name === "ia") {
    const question = opt(interaction, "question");
    ctx.waitUntil((async () => {
      const answer = await ask(env, [
        { role: "system", content: AI_SYSTEM },
        { role: "user", content: question },
      ]);
      await followUp(env, interaction, {
        embeds: [{ color: BOTS.ia.color, author: { name: `${user.global_name ?? user.username} demande` }, title: question.slice(0, 250), description: answer || "Je n'ai pas réussi à répondre, réessaie dans un instant.", footer: { text: "Réponse générée par l'IA de K’X · à vérifier" } }],
      });
    })());
    return json({ type: 5 });
  }

  if (name === "resume") {
    const channelId = interaction.channel_id;
    const n = Math.min(Number(opt(interaction, "messages") ?? 50), 100);
    ctx.waitUntil((async () => {
      const res = await discord(env, "GET", `/channels/${channelId}/messages?limit=${n}`);
      const msgs = res.ok ? (await res.json()).reverse() : [];
      const transcript = msgs.filter((m) => m.content).map((m) => `${m.author.global_name ?? m.author.username}: ${m.content}`).join("\n").slice(0, 12000);
      const answer = transcript
        ? await ask(env, [
            { role: "system", content: "Tu résumes des conversations Discord en français, en 5 points maximum, phrases courtes, sans inventer." },
            { role: "user", content: transcript },
          ], 500)
        : "Rien à résumer ici pour l'instant.";
      await followUp(env, interaction, { embeds: [{ color: BOTS.ia.color, title: `Résumé des ${n} derniers messages`, description: answer || "Rien à résumer pour l'instant.", footer: FOOTER }] });
    })());
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (name === "contact") {
    return json({
      type: 9,
      data: {
        custom_id: "contact-modal", title: "Parler de ton projet avec K’X",
        components: [
          { type: 1, components: [{ type: 4, custom_id: "nom", label: "Ton prénom", style: 1, max_length: 60, required: true }] },
          { type: 1, components: [{ type: 4, custom_id: "entreprise", label: "Entreprise et secteur", style: 1, max_length: 100, required: true }] },
          { type: 1, components: [{ type: 4, custom_id: "besoin", label: "Quelle tâche te prend trop de temps ?", style: 2, max_length: 1000, required: true }] },
          { type: 1, components: [{ type: 4, custom_id: "contact", label: "E-mail ou téléphone (facultatif)", style: 1, max_length: 100, required: false }] },
        ],
      },
    });
  }

  if (name === "suggestion") {
    const texte = opt(interaction, "idee");
    ctx.waitUntil(discord(env, "POST", `/channels/${CHANNELS.suggestions}/messages`, {
      content: `Suggestion de <@${user.id}>`,
      allowed_mentions: { parse: [] },
      poll: {
        question: { text: texte.slice(0, 300) },
        answers: [{ poll_media: { text: "Pour", emoji: { name: "👍" } } }, { poll_media: { text: "Contre", emoji: { name: "👎" } } }],
        duration: 72, allow_multiselect: false,
      },
    }));
    return reply({ content: `Merci, ta suggestion est en vote dans <#${CHANNELS.suggestions}>.` }, true);
  }

  if (name === "annonce") {
    if (!isStaff(interaction)) return reply({ content: "Commande réservée à l'équipe." }, true);
    const ping = opt(interaction, "ping"), cible = opt(interaction, "public") ?? "fde";
    ctx.waitUntil((async () => {
      const embed = { title: opt(interaction, "titre"), description: String(opt(interaction, "texte")).replace(/\\n/g, "\n"), color: AMBRE, footer: FOOTER, timestamp: new Date().toISOString() };
      if (cible !== "fde") {
        // copies indépendantes dans chaque dossier client, sans mention ni lien entre eux
        for (const d of await store(env, "dossiers", { kind: "client" })) if (d.etat === "actif" && d.annonces) await discord(env, "POST", `/channels/${d.annonces}/messages`, { embeds: [embed], allowed_mentions: { parse: [] } });
        if (cible === "clients") return;
      }
      let content;
      if (ping) {
        const roles = await (await discord(env, "GET", `/guilds/${GUILD_ID}/roles`)).json();
        const r = roles.find((x) => x.name === "Notif annonces");
        if (r) content = `<@&${r.id}>`;
      }
      await discord(env, "POST", `/channels/${CHANNELS.annonces}/messages`, {
        content, allowed_mentions: { parse: ["roles"] },
        embeds: [{ title: opt(interaction, "titre"), description: String(opt(interaction, "texte")).replace(/\\n/g, "\n"), color: AMBRE, footer: FOOTER, timestamp: new Date().toISOString() }],
      });
    })());
    return reply({ content: "Annonce en cours de publication." }, true);
  }

  if (name === "kx-roles") {
    if (!isStaff(interaction)) return reply({ content: "Commande réservée à l'équipe." }, true);
    return reply({
      embeds: [{ title: "Choisis tes notifications", description: "Clique pour ajouter ou retirer un rôle. Tu peux changer quand tu veux.", color: LILAS, footer: FOOTER }],
      components: [{ type: 1, components: SELF_ROLES.map(([label, emoji]) => ({ type: 2, style: 2, label, emoji: { name: emoji }, custom_id: `role:${label}` })) }],
    });
  }

  if (INTRO_CMD[name]) {
    const k = INTRO_CMD[name];
    const res = await fetch(`${API}/applications/${interaction.application_id}/guilds/${GUILD_ID}/commands`, { headers: { Authorization: `Bot ${tokenOf(env, k) || env.DISCORD_BOT_TOKEN}` } }).catch(() => null);
    const ids = {};
    if (res?.ok) for (const c of await res.json()) ids[c.name] = c.id;
    return json({ type: 4, data: botCard(k, ids) });
  }

  if (name === "kx-publier") {
    if ((BigInt(interaction.member?.permissions ?? "0") & 0x8n) !== 0x8n) return reply({ content: "Commande réservée aux administrateurs." }, true);
    ctx.waitUntil((async () => followUp(env, interaction, { content: (await runPublish(env, helpers)).join("\n").slice(0, 1900) }))());
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (name === "veille") {
    ctx.waitUntil((async () => {
      const items = (await latestNews(6)).map((it) => `**[${it.title.slice(0, 120)}](${it.link})**\n*${it.source}*${it.date ? ` · <t:${Math.floor(it.date / 1000)}:R>` : ""}`);
      await followUp(env, interaction, { embeds: [{ color: BOTS.veille.color, title: "Les dernières actus IA", description: items.join("\n\n") || "Aucune actu récupérée pour l'instant, réessaie plus tard.", footer: { text: "K’X Veille · publiée aussi chaque heure dans le salon veille" } }] });
    })());
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (name === "Profil FDE") {
    interaction.data.options = [{ name: "membre", value: interaction.data.target_id }];
    return handleFde("profil", interaction, env, ctx, helpers);
  }
  const fde = await handleFde(name, interaction, env, ctx, helpers);
  if (fde) return fde;
  const feat = await handleFeatures(name, interaction, env, ctx, helpers);
  if (feat) return feat;

  return reply({ content: "Commande inconnue." }, true);
}

// ------------------------------------------------------------ visite guidée animée
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const v2only = (d) => ({ ...d, flags: V2 }); // une modification ne peut pas changer le caractère privé

async function editOriginal(interaction, data) {
  for (let k = 0; k < 3; k++) {
    const res = await fetch(`${API}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(v2only(data)),
    });
    if (res.status !== 429) { if (!res.ok) console.log("Visite", res.status, await res.text()); return; }
    const wait = Number((await res.json().catch(() => ({}))).retry_after ?? 1);
    await sleep(wait * 1000 + 50);
  }
}

async function animateTour(interaction, n, intro) {
  const total = TOUR[n - 1][3].length;
  if (intro) {
    await sleep(450); await editOriginal(interaction, tourLoading(5));
    await sleep(450); await editOriginal(interaction, tourStep(n, 0));
  }
  await sleep(intro ? 550 : 380); await editOriginal(interaction, tourStep(n, 1));
  if (total > 1) { await sleep(420); await editOriginal(interaction, tourStep(n, total)); }
}

// ------------------------------------------------------------ boutons et formulaires
async function handleComponent(interaction, env, ctx) {
  const id = interaction.data.custom_id;
  if (id.startsWith("tour:")) {
    const n = Math.min(Math.max(Number(id.slice(5)) || 1, 1), TOUR.length);
    const inTour = (interaction.message?.flags ?? 0) & EPHEMERAL;
    ctx.waitUntil(animateTour(interaction, n, !inTour));
    // depuis #bienvenue: nouveau message privé; dans la visite: on met à jour le même message
    return inTour ? json({ type: 7, data: v2only(tourStep(n, 0)) }) : json({ type: 4, data: tourLoading(1) });
  }
  if (id === "open:candidature") return handleFde("candidature", interaction, env, ctx, helpers);
  if (id === "esp:fde") return rejoindreFde(interaction, env, helpers);
  if (id === "esp:client") return json(demandeClientModal());
  if (id.startsWith("client:")) return decisionClient(interaction, env, ctx, helpers);
  const ticket = await handleTicketComponent(interaction, env, ctx, helpers);
  if (ticket) return ticket;
  if (id.startsWith("role:")) {
    const label = id.slice(5);
    const roles = await (await discord(env, "GET", `/guilds/${GUILD_ID}/roles`)).json();
    const role = roles.find((r) => r.name === label);
    if (!role) return reply({ content: "Rôle introuvable, préviens l'équipe." }, true);
    const userId = interaction.member.user.id;
    const has = interaction.member.roles.includes(role.id);
    const res = await discord(env, has ? "DELETE" : "PUT", `/guilds/${GUILD_ID}/members/${userId}/roles/${role.id}`);
    if (!res.ok) return reply({ content: "Je n'ai pas pu changer ton rôle. Le rôle du bot doit être placé au-dessus." }, true);
    return reply({ content: has ? `Rôle **${label}** retiré.` : `Rôle **${label}** ajouté.` }, true);
  }
  const fde = await handleFdeComponent(interaction, env, ctx, helpers);
  if (fde) return fde;
  const feat = await handleFeaturesComponent(interaction, env, ctx, helpers);
  if (feat) return feat;
  return reply({ content: "Action inconnue." }, true);
}

async function handleModal(interaction, env, ctx) {
  if (interaction.data.custom_id === "client-modal") return demandeClient(interaction, env, ctx, helpers);
  const ticket = await handleTicketModal(interaction, env, ctx, helpers, parisToUtc);
  if (ticket) return ticket;
  if (interaction.data.custom_id !== "contact-modal") {
    const fde = await handleFdeModal(interaction, env, ctx, helpers);
    if (fde) return fde;
    const feat = await handleFeaturesModal(interaction, env, ctx, helpers);
    return feat ?? reply({ content: "Formulaire inconnu." }, true);
  }
  const f = {};
  for (const row of interaction.data.components) for (const c of row.components) f[c.custom_id] = c.value;
  const user = interaction.member?.user ?? interaction.user;
  const fields = [
    { name: "Membre", value: `<@${user.id}>`, inline: false },
    { name: "Prénom", value: f.nom || "-", inline: true },
    { name: "Entreprise", value: f.entreprise || "-", inline: true },
    { name: "Besoin", value: f.besoin || "-", inline: false },
  ];
  if (f.contact) fields.push({ name: "Contact", value: f.contact, inline: false });
  ctx.waitUntil(Promise.all([
    discord(env, "POST", `/channels/${CHANNELS.staff}/messages`, { embeds: [{ title: "Nouvelle demande de contact", color: AMBRE, fields, timestamp: new Date().toISOString() }] }),
    env.CT_WEBHOOK_URL
      ? fetch(env.CT_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "x-kx-secret": env.CT_WEBHOOK_SECRET ?? "" }, body: JSON.stringify({ source: "discord", discord_id: user.id, ...f }) })
      : Promise.resolve(),
  ]));
  return reply({ content: "Merci, ta demande est bien arrivée. L'équipe K’X revient vers toi rapidement." }, true);
}

// ------------------------------------------------------------ veille IA (cron)
function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/g) ?? [];
  for (const b of blocks) {
    const pick = (re) => (b.match(re)?.[1] ?? "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/);
    const link = pick(/<link>([\s\S]*?)<\/link>/) || (b.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? "");
    const date = pick(/<pubDate>([\s\S]*?)<\/pubDate>/) || pick(/<published>([\s\S]*?)<\/published>/) || pick(/<updated>([\s\S]*?)<\/updated>/);
    if (title && link) items.push({ title, link, date: date ? new Date(date) : null });
  }
  return items;
}

async function latestNews(n) {
  const all = [];
  await Promise.all(RSS_FEEDS.map(async (url) => {
    try {
      const xml = await (await fetch(url, { headers: { "user-agent": "KX-Bot/1.0" } })).text();
      for (const it of parseFeed(xml).slice(0, 10)) all.push({ ...it, source: new URL(url).hostname.replace(/^www\./, "") });
    } catch (e) {
      console.log("Flux indisponible", url, e.message);
    }
  }));
  return all.filter((it) => it.date && !isNaN(it.date)).sort((a, b) => b.date - a.date).slice(0, n);
}

async function veille(env) {
  const since = Date.now() - 60 * 60 * 1000; // dernière heure, le cron tourne toutes les heures
  for (const it of (await latestNews(30)).reverse()) {
    if (it.date.getTime() < since) continue;
    await discord(env, "POST", `/channels/${CHANNELS.veille_ia}/messages`, {
      embeds: [{ title: it.title.slice(0, 250), url: it.link, color: BOTS.veille.color, footer: { text: it.source }, timestamp: it.date.toISOString() }],
    }, "veille");
  }
}

// ------------------------------------------------------------ point d'entrée
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // état des travaux longs (aucune donnée sensible)
    if (url.pathname === "/etat-travaux") {
      const st = await store(env, "setting", { key: "job_status" }), es = await store(env, "setting", { key: "espaces" });
      return new Response(`espaces ${es.value ?? "?"}\n${st.value ?? "aucun travail"}`);
    }
    const bot = botByPath(url.pathname);
    if (!bot) return new Response("Introuvable", { status: 404 });
    if (request.method === "GET") return new Response(`${BOTS[bot].name} en ligne`);
    if (request.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
    const key = publicKeyOf(env, bot);
    const body = await request.text();
    if (!key || !(await verify(request, body, key))) return new Response("Signature invalide", { status: 401 });
    const interaction = JSON.parse(body);
    switch (interaction.type) {
      case 1: return json({ type: 1 }); // PING
      case 2: return handleCommand(interaction, env, ctx);
      case 3: return handleComponent(interaction, env, ctx);
      case 5: return handleModal(interaction, env, ctx);
      default: return reply({ content: "Interaction non gérée." }, true);
    }
  },
  async scheduled(event, env, ctx) {
    if (event.cron === "0 7 * * MON") ctx.waitUntil(Promise.all([postDefi(env, helpers), buildInPublic(env, helpers)]));
    else if (event.cron === "0 16 * * SUN") ctx.waitUntil(weeklyLeaderboard(env, helpers));
    else ctx.waitUntil(Promise.all([veille(env), rdvReminders(env, helpers), syncInvites(env, helpers)]));
  },
};

// exécution des travaux longs par l'alarme du Durable Object
setJobRunner((env, job) => etapeTravail(env, helpers, job));

// outils partagés avec fde.js
const helpers = { BOTS, json, reply, discord, followUp, opt, isStaff, ask, VIOLET, LILAS, AMBRE, FOOTER, EPHEMERAL, GUILD_ID, CHANNELS, LADDER, MENTOR_ROLE, DEFI_PROMPT, AI_SYSTEM };
