// /kx-publier: logo du bot et du serveur, mode d'emploi dans #bienvenue, salon 📖・commandes, invitations réservées
import { LOGO_DATA_URI } from "./logo.js";
import { guideEmbeds, welcomeGuide } from "./guide.js";
import { SELF_ROLES } from "./config.js";

const INVITE = 1n;
const SEND = 2048n, PUB_THREADS = 1n << 35n, PRIV_THREADS = 1n << 36n, SEND_IN_THREADS = 1n << 38n;
// Rôles qui peuvent inviter (les administrateurs le peuvent toujours)
export const INVITE_ROLES = ["Fondateur", "Équipe KX", "Mentor"];
const GUIDE_NAME = "📖・commandes";

export async function runPublish(env, h) {
  const out = [];
  const step = async (label, fn) => { try { const r = await fn(); out.push(`${r === false ? "⚠️" : "✅"} ${label}${typeof r === "string" ? ` · ${r}` : ""}`); } catch (e) { out.push(`❌ ${label} · ${e.message}`); } };
  const ok = async (res) => { if (res.ok) return res; throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`); };
  const get = async (path) => (await ok(await h.discord(env, "GET", path))).json();
  const C = h.CHANNELS, G = h.GUILD_ID, botId = env.DISCORD_APP_ID;

  // ---------- logo
  await step("Avatar du bot", async () => { await ok(await h.discord(env, "PATCH", "/users/@me", { avatar: LOGO_DATA_URI })); });
  await step("Profil de l'application", async () => { await ok(await h.discord(env, "PATCH", "/applications/@me", {
    icon: LOGO_DATA_URI,
    description: "L'assistant de la communauté KX Automatisation. IA, parcours FDE, défis, points et tickets. Tape /aide pour tout voir.",
  })); });
  await step("Icône, description et règlement du serveur", async () => {
    await ok(await h.discord(env, "PATCH", `/guilds/${G}`, {
      icon: LOGO_DATA_URI,
      description: "La communauté des FDE. Automatisation, agents IA et missions clients, par KX Automatisation.",
      rules_channel_id: C.reglement,
    }));
  });

  let chans = await get(`/guilds/${G}/channels`);
  const guild = await get(`/guilds/${G}`);

  // ---------- salon 📖・commandes, en lecture seule, juste après le règlement
  let guide = chans.find((c) => c.name === GUIDE_NAME);
  await step(`Salon ${GUIDE_NAME}`, async () => {
    const parent = chans.find((c) => c.id === C.bienvenue)?.parent_id;
    let created = false;
    if (!guide) {
      guide = await (await ok(await h.discord(env, "POST", `/guilds/${G}/channels`, {
        name: GUIDE_NAME, type: 0, parent_id: parent, topic: "Toutes les commandes du KX Bot, expliquées.",
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

    // une seule publication, modifiée en place aux lancements suivants
    const mine = (await get(`/channels/${guide.id}/messages?limit=20`)).filter((m) => m.author.id === botId).reverse();
    const payload = { embeds: guideEmbeds() };
    if (mine[0]) await ok(await h.discord(env, "PATCH", `/channels/${guide.id}/messages/${mine[0].id}`, payload));
    else await ok(await h.discord(env, "POST", `/channels/${guide.id}/messages`, payload));
    return `${created ? "créé" : "déjà présent"}, guide ${mine[0] ? "mis à jour" : "publié"}`;
  });

  // ---------- le salon des commandes visible dès l'arrivée
  await step("Accueil guidé", async () => {
    if (!guide) return false;
    const ob = await get(`/guilds/${G}/onboarding`);
    if (ob.default_channel_ids.includes(guide.id)) return "déjà à jour";
    const body = {
      enabled: ob.enabled, mode: ob.mode,
      default_channel_ids: [...ob.default_channel_ids, guide.id],
      prompts: ob.prompts.map((p) => ({
        id: p.id, type: p.type, title: p.title, single_select: p.single_select, required: p.required, in_onboarding: p.in_onboarding,
        options: p.options.map((o) => ({
          id: o.id, title: o.title, ...(o.description ? { description: o.description } : {}),
          ...(o.emoji?.id ? { emoji_id: o.emoji.id } : {}), ...(o.emoji?.name ? { emoji_name: o.emoji.name } : {}),
          channel_ids: o.channel_ids, role_ids: o.role_ids,
        })),
      })),
    };
    await ok(await h.discord(env, "PUT", `/guilds/${G}/onboarding`, body));
    return "salon des commandes ajouté";
  });

  // ---------- mode d'emploi dans #bienvenue (remplace l'ancien panneau de notifications)
  await step("Mode d'emploi dans #bienvenue", async () => {
    const payload = welcomeGuide(guide?.id, SELF_ROLES);
    const msgs = await get(`/channels/${C.bienvenue}/messages?limit=50`);
    const panel = msgs.find((m) => m.author.id === botId && JSON.stringify(m.components ?? []).includes('"role:'));
    if (panel) {
      const res = await h.discord(env, "PATCH", `/channels/${C.bienvenue}/messages/${panel.id}`, payload);
      if (res.ok) return "ancien panneau remplacé";
    }
    await ok(await h.discord(env, "POST", `/channels/${C.bienvenue}/messages`, payload));
    return panel ? "nouveau message, l'ancien panneau peut être supprimé" : "publié";
  });

  // ---------- invitations réservées à l'équipe et aux mentors
  await step("Invitations", async () => {
    const roles = await get(`/guilds/${G}/roles`);
    const allowedIds = roles.filter((r) => INVITE_ROLES.includes(r.name)).map((r) => r.id);
    let removed = 0, granted = 0;
    for (const r of roles) {
      if (r.managed) continue;
      const p = BigInt(r.permissions);
      const allowed = allowedIds.includes(r.id);
      if (!allowed && p & INVITE) { await ok(await h.discord(env, "PATCH", `/guilds/${G}/roles/${r.id}`, { permissions: String(p & ~INVITE) })); removed++; }
      if (allowed && !(p & INVITE)) { await ok(await h.discord(env, "PATCH", `/guilds/${G}/roles/${r.id}`, { permissions: String(p | INVITE) })); granted++; }
    }
    let overwrites = 0;
    for (const c of chans) for (const o of c.permission_overwrites ?? []) {
      if (!(BigInt(o.allow) & INVITE) || allowedIds.includes(o.id)) continue;
      await ok(await h.discord(env, "PUT", `/channels/${c.id}/permissions/${o.id}`, { type: o.type, allow: String(BigInt(o.allow) & ~INVITE), deny: o.deny }));
      overwrites++;
    }
    const missing = INVITE_ROLES.filter((n) => !roles.some((r) => r.name === n));
    return `retiré à ${removed} rôle${removed > 1 ? "s" : ""}${overwrites ? ` et ${overwrites} salon${overwrites > 1 ? "s" : ""}` : ""}, accordé à ${INVITE_ROLES.filter((n) => !missing.includes(n)).join(", ")}${granted ? ` (${granted} modifié${granted > 1 ? "s" : ""})` : ""}${missing.length ? `, rôle introuvable ${missing.join(", ")}` : ""}`;
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
