// KX Bot, version Cloudflare Worker (interactions HTTP Discord + IA Workers AI)
import { GUILD_ID, CHANNELS, SELF_ROLES, RDV_URL, RSS_FEEDS, AI_MODEL, AI_SYSTEM, LADDER, MENTOR_ROLE, DEFI_PROMPT } from "./config.js";
import { handleFde, handleFdeComponent, handleFdeModal, postDefi } from "./fde.js";
import { handleFeatures, handleFeaturesComponent, handleFeaturesModal, weeklyLeaderboard, buildInPublic } from "./features.js";
export { KXStore } from "./store.js";

const API = "https://discord.com/api/v10";
const VIOLET = 0x8b5cf6, LILAS = 0xb69cff, AMBRE = 0xf5b83d;
const EPHEMERAL = 64;
const FOOTER = { text: "KX Automatisation · kxautomatisation.fr" };

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

async function discord(env, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) console.log("Discord", method, path, res.status, await res.text());
  return res;
}

async function followUp(env, interaction, data) {
  // complète une réponse différée (type 5)
  await fetch(`${API}/webhooks/${env.DISCORD_APP_ID}/${interaction.token}/messages/@original`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...data, allowed_mentions: { parse: [] } }),
  });
}

const opt = (interaction, name) => interaction.data.options?.find((o) => o.name === name)?.value;
const isStaff = (interaction) => (BigInt(interaction.member?.permissions ?? "0") & 0x8n) === 0x8n || (BigInt(interaction.member?.permissions ?? "0") & 0x2000n) === 0x2000n;

async function ask(env, messages, max_tokens = 700) {
  const out = await env.AI.run(AI_MODEL, { messages, max_tokens });
  let text = out?.response ?? out?.choices?.[0]?.message?.content ?? "";
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return text.slice(0, 3900) || "Je n'ai pas réussi à répondre, réessaie dans un instant.";
}

// ------------------------------------------------------------ commandes
async function handleCommand(interaction, env, ctx) {
  const name = interaction.data.name;
  const user = interaction.member?.user ?? interaction.user;

  if (name === "kx") {
    return reply({
      embeds: [{
        title: "KX Automatisation", url: "https://kxautomatisation.fr", color: VIOLET, footer: FOOTER,
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
        embeds: [{ color: VIOLET, author: { name: `${user.global_name ?? user.username} demande` }, title: question.slice(0, 250), description: answer, footer: { text: "Réponse générée par l'IA de KX · à vérifier" } }],
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
      await followUp(env, interaction, { embeds: [{ color: LILAS, title: `Résumé des ${n} derniers messages`, description: answer, footer: FOOTER }] });
    })());
    return json({ type: 5, data: { flags: EPHEMERAL } });
  }

  if (name === "contact") {
    return json({
      type: 9,
      data: {
        custom_id: "contact-modal", title: "Parler de ton projet avec KX",
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
    const ping = opt(interaction, "ping");
    ctx.waitUntil((async () => {
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
    return reply({ content: "Annonce publiée." }, true);
  }

  if (name === "kx-roles") {
    if (!isStaff(interaction)) return reply({ content: "Commande réservée à l'équipe." }, true);
    return reply({
      embeds: [{ title: "Choisis tes notifications", description: "Clique pour ajouter ou retirer un rôle. Tu peux changer quand tu veux.", color: LILAS, footer: FOOTER }],
      components: [{ type: 1, components: SELF_ROLES.map(([label, emoji]) => ({ type: 2, style: 2, label, emoji: { name: emoji }, custom_id: `role:${label}` })) }],
    });
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

// ------------------------------------------------------------ boutons et formulaires
async function handleComponent(interaction, env, ctx) {
  const id = interaction.data.custom_id;
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
  return reply({ content: "Merci, ta demande est bien arrivée. L'équipe KX revient vers toi rapidement." }, true);
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

async function veille(env) {
  const since = Date.now() - 60 * 60 * 1000; // dernière heure, le cron tourne toutes les heures
  for (const url of RSS_FEEDS) {
    try {
      const xml = await (await fetch(url, { headers: { "user-agent": "KX-Bot/1.0" } })).text();
      for (const it of parseFeed(xml).slice(0, 10)) {
        if (!it.date || it.date.getTime() < since) continue;
        await discord(env, "POST", `/channels/${CHANNELS.veille_ia}/messages`, {
          embeds: [{ title: it.title.slice(0, 250), url: it.link, color: VIOLET, footer: { text: new URL(url).hostname } }],
        });
      }
    } catch (e) {
      console.log("Flux indisponible", url, e.message);
    }
  }
}

// ------------------------------------------------------------ point d'entrée
export default {
  async fetch(request, env, ctx) {
    if (request.method === "GET") return new Response("KX Bot en ligne");
    if (request.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
    const body = await request.text();
    if (!(await verify(request, body, env.DISCORD_PUBLIC_KEY))) return new Response("Signature invalide", { status: 401 });
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
    else ctx.waitUntil(veille(env));
  },
};

// outils partagés avec fde.js
const helpers = { json, reply, discord, followUp, opt, isStaff, ask, VIOLET, LILAS, AMBRE, FOOTER, EPHEMERAL, GUILD_ID, CHANNELS, LADDER, MENTOR_ROLE, DEFI_PROMPT, AI_SYSTEM };
