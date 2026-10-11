// /kx-publier: logo du bot et du serveur, mode d'emploi dans #bienvenue, salon 📖・commandes, invitations réservées
import { LOGO_DATA_URI } from "./logo.js";
import { guideV2, welcomeV2, accueilV2 } from "./guide.js";
import { ROLE_FDE } from "./espaces.js";
import { BOTS, BOT_PERMISSIONS } from "./bots.js";
import { ensureRoles } from "./roles.js";
import { onboardingBody, WELCOME_SCREEN } from "./onboarding.js";
import { supportPanel, SUPPORT_NAME, VOICE_NAME, STAFF_ROLES } from "./tickets.js";
import { SELF_ROLES } from "./config.js";
import { store } from "./store.js";

const INVITE = 1n;
const SEND = 2048n, PUB_THREADS = 1n << 35n, PRIV_THREADS = 1n << 36n, SEND_IN_THREADS = 1n << 38n;
// Rôles qui peuvent inviter (les administrateurs le peuvent toujours)
export const INVITE_ROLES = ["Fondateur", "Équipe K’X", "Mentor"];
const GUIDE_NAME = "📖・commandes";
// Bots externes et le nom qu'ils portent sur le serveur
const EXTERNAL_BOTS = { "411916947773587456": "K’X Musique" }; // Jockie Music

export async function runPublish(env, h) {
  const out = [];
  const step = async (label, fn) => { try { const r = await fn(); out.push(`${r === false ? "⚠️" : "✅"} ${label}${typeof r === "string" ? ` · ${r}` : ""}`); } catch (e) { out.push(`❌ ${label} · ${e.message}`); } };
  const ok = async (res) => { if (res.ok) return res; throw new Error(`${res.status} ${(await res.text()).slice(0, 700)}`); };
  const get = async (path) => (await ok(await h.discord(env, "GET", path))).json();
  const C = h.CHANNELS, G = h.GUILD_ID, botId = env.DISCORD_APP_ID;
  // Remplace la publication du bot dans un salon: modification sur place si possible, sinon nouvelle publication et retrait de l'ancienne
  const upsert = async (channelId, payload, pick) => {
    const msgs = await get(`/channels/${channelId}/messages?limit=50`);
    const old = msgs.filter((m) => m.author.id === botId && pick(m));
    if (old[0]) {
      const res = await h.discord(env, "PATCH", `/channels/${channelId}/messages/${old[0].id}`, payload);
      if (res.ok) return "mis à jour";
    }
    await ok(await h.discord(env, "POST", `/channels/${channelId}/messages`, payload));
    for (const m of old) await h.discord(env, "DELETE", `/channels/${channelId}/messages/${m.id}`);
    return old.length ? "nouvelle version publiée" : "publié";
  };

  // ---------- logo (appliqué une seule fois par version du fichier, Discord limite les changements d'avatar)
  const logoHash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(LOGO_DATA_URI)))].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  let applied = (await store(env, "setting", { key: "logo" }).catch(() => ({}))).value;
  if (!applied) {
    // premier passage avec ce suivi: si le bot et le serveur ont déjà une image, on considère le logo en place
    const [meUser, g] = await Promise.all([get("/users/@me"), get(`/guilds/${G}`)]);
    if (meUser.avatar && g.icon) { applied = logoHash; await store(env, "setting", { key: "logo", value: logoHash }).catch(() => {}); }
  }
  if (applied === logoHash) out.push("✅ Logo du bot et du serveur · déjà en place");
  else {
    const before = out.length;
    await step("Avatar du bot", async () => { await ok(await h.discord(env, "PATCH", "/users/@me", { avatar: LOGO_DATA_URI })); });
    await step("Profil de l'application", async () => { await ok(await h.discord(env, "PATCH", "/applications/@me", {
      icon: LOGO_DATA_URI,
      description: "L'assistant de la communauté K’X Automatisation. IA, parcours FDE, défis, points et tickets. Tape /aide pour tout voir.",
    })); });
    await step("Icône et description du serveur", async () => {
      await ok(await h.discord(env, "PATCH", `/guilds/${G}`, {
        icon: LOGO_DATA_URI,
        name: "K’X Automatisation",
      description: "La communauté des FDE (ingénieurs qui déploient l'IA chez le client). Automatisation, agents IA et missions clients, par K’X Automatisation.",
      }));
    });
    if (out.slice(before).every((l) => l.startsWith("✅"))) await store(env, "setting", { key: "logo", value: logoHash }).catch(() => {});
  }
  let chans = await get(`/guilds/${G}/channels`);
  const guild = await get(`/guilds/${G}`);
  if (guild.name !== "K’X Automatisation") await step("Nom du serveur", async () => { await ok(await h.discord(env, "PATCH", `/guilds/${G}`, { name: "K’X Automatisation", description: "La communauté des FDE (ingénieurs qui déploient l'IA chez le client). Automatisation, agents IA et missions clients, par K’X Automatisation." })); return "K’X Automatisation"; });
  // Discord ne laisse pas un bot changer le salon des règles, on le signale seulement
  if (guild.rules_channel_id !== C.reglement) out.push("⚠️ Salon des règles · à régler dans Paramètres du serveur, Communauté, Vue d'ensemble");

  // ---------- catégories à la marque K’X
  await step("Catégories K’X", async () => {
    const cats = chans.filter((c) => c.type === 4 && /\bKX\b/.test(c.name));
    for (const c of cats) await ok(await h.discord(env, "PATCH", `/channels/${c.id}`, { name: c.name.replace(/\bKX\b/g, "K’X") }));
    return cats.length ? `${cats.length} renommée${cats.length > 1 ? "s" : ""}` : "déjà à jour";
  });

  // ---------- rôles (équipe, badges, communauté)
  await step("Rôles", async () => ensureRoles(env, h, botId));
  await step("Badge Pionnier pour les premiers membres", async () => {
    if ((await store(env, "setting", { key: "pionniers" }).catch(() => ({}))).value) return "déjà donné";
    const role = (await get(`/guilds/${G}/roles`)).find((r) => r.name === "Pionnier");
    if (!role) return false;
    const members = await get(`/guilds/${G}/members?limit=1000`);
    let n = 0;
    for (const m of members) if (!m.user.bot && !m.roles.includes(role.id) && (await h.discord(env, "PUT", `/guilds/${G}/members/${m.user.id}/roles/${role.id}`)).ok) n++;
    await store(env, "setting", { key: "pionniers", value: "1" }).catch(() => {});
    return `${n} membre${n > 1 ? "s" : ""}`;
  });

  // ---------- salon 📖・commandes, en lecture seule, juste après le règlement
  let guide = chans.find((c) => c.name === GUIDE_NAME);
  await step(`Salon ${GUIDE_NAME}`, async () => {
    const parent = chans.find((c) => c.id === C.bienvenue)?.parent_id;
    let created = false;
    if (!guide) {
      guide = await (await ok(await h.discord(env, "POST", `/guilds/${G}/channels`, {
        name: GUIDE_NAME, type: 0, parent_id: parent, topic: "Toutes les commandes du K’X Bot, expliquées.",
        permission_overwrites: [{ id: G, type: 0, deny: String(SEND | PUB_THREADS | PRIV_THREADS | SEND_IN_THREADS) }],
      }))).json();
      chans = [...chans, guide];
      created = true;
    }
    const siblings = chans.filter((c) => c.parent_id === parent && c.type !== 2 && c.type !== 13).sort((a, b) => a.position - b.position);
    const rest = siblings.filter((c) => ![C.bienvenue, C.reglement, guide.id].includes(c.id));
    const order = [C.bienvenue, C.reglement, guide.id, ...rest.map((c) => c.id)].filter((id) => siblings.some((c) => c.id === id));
    const base = Math.min(...siblings.map((c) => c.position));
    await ok(await h.discord(env, "PATCH", `/guilds/${G}/channels`, order.map((id, k) => ({ id, position: base + k }))));

    const r = await upsert(guide.id, guideV2(), () => true);
    return `${created ? "créé" : "déjà présent"}, guide ${r}`;
  });

  // ---------- écran d'arrivée: questions, rôles et salons
  const cloison = (await store(env, "setting", { key: "espaces" }).catch(() => ({}))).value === "actif";
  if (!cloison) await step("Écran d'arrivée", async () => {
    const roles = await get(`/guilds/${G}/roles`);
    // Discord limite le nombre de questions à l'arrivée: on garde les premières, les autres passent dans « Salons et rôles »
    const body = onboardingBody(C, roles, guide ? [guide.id] : []);
    let shown = body.prompts.length, res;
    for (;;) {
      body.prompts.forEach((p, k) => { p.in_onboarding = k < shown; });
      res = await h.discord(env, "PUT", `/guilds/${G}/onboarding`, body);
      if (res.ok || shown <= 1 || !(await res.clone().text()).includes("TOO_MANY_ONBOARDING_PROMPTS")) break;
      shown--;
    }
    await ok(res);
    await ok(await h.discord(env, "PATCH", `/guilds/${G}/welcome-screen`, WELCOME_SCREEN(C)));
    return `${shown} questions à l'arrivée${shown < body.prompts.length ? `, ${body.prompts.length - shown} dans Salons et rôles` : ""}`;

  });

  // ---------- tickets: panneau de choix et salon vocal des entretiens
  await step("Tickets et salon vocal des entretiens", async () => {
    const support = chans.find((c) => c.name === SUPPORT_NAME);
    if (!support) return "salon support absent, lance /kx-setup";
    let voice = chans.find((c) => c.name === VOICE_NAME);
    if (!voice) {
      const roles = await get(`/guilds/${G}/roles`);
      const staff = roles.filter((r) => STAFF_ROLES.includes(r.name));
      voice = await (await ok(await h.discord(env, "POST", `/guilds/${G}/channels`, {
        name: VOICE_NAME, type: 2, parent_id: support.parent_id,
        permission_overwrites: [
          { id: G, type: 0, deny: String(1024n) },
          ...staff.map((r) => ({ id: r.id, type: 0, allow: String(1024n | 1048576n | 2097152n | 512n | 33554432n) })),
        ],
      }))).json();
    }
    const r = await upsert(support.id, supportPanel(BOTS.kx.color), (m) => JSON.stringify(m.components ?? []).includes('"ticket:'));
    return `panneau ${r}, vocal <#${voice.id}>`;
  });

  // ---------- accueil dans #bienvenue (bannière animée, présentation, boutons)
  if (!cloison) await step("Accueil dans #bienvenue", async () => upsert(C.bienvenue, welcomeV2(guide?.id, SELF_ROLES), (m) => JSON.stringify(m.components ?? []).includes('"role:')));
  else {
    await step("Accueil commun dans #bienvenue", async () => upsert(C.bienvenue, accueilV2(), (m) => /"(role|esp):/.test(JSON.stringify(m.components ?? []))));
    await step("Salon 🧭・démarrer de l'espace FDE", async () => {
      let dem = chans.find((c) => c.name === "🧭・démarrer");
      if (!dem) {
        const roles = await get(`/guilds/${G}/roles`);
        const fde = roles.find((r) => r.name === ROLE_FDE);
        const staff = roles.filter((r) => ["Fondateur", "Équipe K’X", "Modérateur", "Animateur", "Mentor"].includes(r.name));
        dem = await (await ok(await h.discord(env, "POST", `/guilds/${G}/channels`, {
          name: "🧭・démarrer", type: 0, parent_id: chans.find((c) => c.id === C.discussion)?.parent_id, position: 0, topic: "Le mode d'emploi de l'espace FDE.",
          permission_overwrites: [
            { id: G, type: 0, deny: String(1024n | 2048n) },
            ...(fde ? [{ id: fde.id, type: 0, allow: String(1024n), deny: String(2048n) }] : []),
            ...staff.map((r) => ({ id: r.id, type: 0, allow: String(1024n) })),
          ],
        }))).json();
      }
      return `<#${dem.id}> ${await upsert(dem.id, welcomeV2(guide?.id, SELF_ROLES), () => true)}`;
    });
  }

  // ---------- chaque bot peut publier dans ses salons, même verrouillés ou privés
  await step("Salons des bots", async () => {
    const roles = await get(`/guilds/${G}/roles`);
    const done = [], absent = [];
    for (const [k, b] of Object.entries(BOTS)) {
      if (k === "kx" || !b.channels?.length) continue;
      const role = roles.find((r) => r.tags?.bot_id === b.id);
      if (!role) { absent.push(b.name); continue; }
      for (const key of b.channels) if (C[key]) await ok(await h.discord(env, "PUT", `/channels/${C[key]}/permissions/${role.id}`, { type: 0, allow: String(BOT_PERMISSIONS), deny: "0" }));
      done.push(b.name);
    }
    return [done.length ? `réglés pour ${done.join(", ")}` : "", absent.length ? `pas encore sur le serveur ${absent.join(", ")}` : ""].filter(Boolean).join(", ");
  });

  // ---------- lien d'invitation qui arrive directement dans #bienvenue
  await step("Lien d'invitation vers #bienvenue", async () => {
    const all = await get(`/guilds/${G}/invites`);
    let inv = all.find((x) => x.channel?.id === C.bienvenue && !x.max_age && !x.max_uses && !x.temporary);
    if (!inv) inv = await (await ok(await h.discord(env, "POST", `/channels/${C.bienvenue}/invites`, { max_age: 0, max_uses: 0, unique: true }))).json();
    const others = all.filter((x) => x.channel?.id !== C.bienvenue);
    return `https://discord.gg/${inv.code}${others.length ? `, ${others.length} ancien${others.length > 1 ? "s" : ""} lien${others.length > 1 ? "s" : ""} mène${others.length > 1 ? "nt" : ""} ailleurs (${others.map((x) => `${x.code} → #${x.channel?.name}`).join(", ")})` : ""}`;
  });

  // ---------- bots externes renommés aux couleurs de K’X
  await step("Surnoms des bots externes", async () => {
    const done = [];
    for (const [id, nick] of Object.entries(EXTERNAL_BOTS)) {
      const m = await h.discord(env, "GET", `/guilds/${G}/members/${id}`);
      if (!m.ok) continue;
      if ((await m.json()).nick === nick) { done.push(nick); continue; }
      await ok(await h.discord(env, "PATCH", `/guilds/${G}/members/${id}`, { nick }));
      done.push(nick);
    }
    return done.length ? done.join(", ") : "aucun bot externe sur le serveur";
  });

  // ---------- invitations réservées à l'équipe et aux mentors
  await step("Invitations", async () => {
    const roles = await get(`/guilds/${G}/roles`);
    const me = await get(`/guilds/${G}/members/${botId}`);
    const top = Math.max(0, ...roles.filter((r) => me.roles.includes(r.id)).map((r) => r.position));
    const allowedIds = roles.filter((r) => INVITE_ROLES.includes(r.name)).map((r) => r.id);
    let removed = 0, granted = 0;
    const failed = [];
    const patch = async (r, permissions) => {
      const res = await h.discord(env, "PATCH", `/guilds/${G}/roles/${r.id}`, { permissions: String(permissions) });
      if (!res.ok) failed.push(`${r.name === "@everyone" ? "@everyone" : r.name} (${res.status})`);
      return res.ok;
    };
    for (const r of roles) {
      const p = BigInt(r.permissions);
      if (r.managed || p & 8n) continue; // les administrateurs peuvent toujours inviter
      if (r.id !== G && r.position >= top) { if (!allowedIds.includes(r.id) && p & INVITE) failed.push(`${r.name} (au-dessus du bot)`); continue; }
      const allowed = allowedIds.includes(r.id);
      if (!allowed && p & INVITE && (await patch(r, p & ~INVITE))) removed++;
      if (allowed && !(p & INVITE) && (await patch(r, p | INVITE))) granted++;
    }
    let overwrites = 0;
    for (const c of chans) for (const o of c.permission_overwrites ?? []) {
      if (!(BigInt(o.allow) & INVITE) || allowedIds.includes(o.id)) continue;
      const res = await h.discord(env, "PUT", `/channels/${c.id}/permissions/${o.id}`, { type: o.type, allow: String(BigInt(o.allow) & ~INVITE), deny: o.deny });
      if (res.ok) overwrites++; else failed.push(`#${c.name} (${res.status})`);
    }
    const everyone = roles.find((r) => r.id === G);
    const stillOpen = everyone && BigInt(everyone.permissions) & INVITE && failed.some((f) => f.startsWith("@everyone"));
    const missing = INVITE_ROLES.filter((n) => !roles.some((r) => r.name === n));
    const msg = [
      `retiré à ${removed} rôle${removed > 1 ? "s" : ""}${overwrites ? ` et ${overwrites} salon${overwrites > 1 ? "s" : ""}` : ""}`,
      `réservé à ${INVITE_ROLES.filter((n) => !missing.includes(n)).join(", ")} et aux administrateurs${granted ? ` (${granted} rôle${granted > 1 ? "s" : ""} complété${granted > 1 ? "s" : ""})` : ""}`,
      missing.length ? `rôle introuvable ${missing.join(", ")}` : "",
      failed.length ? `échec ${failed.join(", ")}` : "",
    ].filter(Boolean).join(", ");
    if (stillOpen || failed.length) throw new Error(msg);
    return msg;
  });

  // ---------- salon des mises à jour Discord rangé avec l'équipe
  await step("Salon des mises à jour Discord", async () => {
    const upd = chans.find((c) => c.id === guild.public_updates_channel_id);
    const staffParent = chans.find((c) => c.id === C.staff)?.parent_id;
    if (!upd || !staffParent) return false;
    if (upd.parent_id === staffParent) return "déjà rangé";
    await ok(await h.discord(env, "PATCH", `/channels/${upd.id}`, { parent_id: staffParent }));
    return `#${upd.name} rangé dans l'espace équipe`;
  });

  const oldRules = chans.find((c) => c.name === "rules" && c.id !== C.reglement);
  if (oldRules) out.push(`ℹ️ Le salon <#${oldRules.id}> ne sert plus, tu peux le supprimer`);
  return out;
}
