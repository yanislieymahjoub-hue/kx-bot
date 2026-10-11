import { SKILLS } from "./onboarding.js";

// Rôles du serveur: équipe, badges d'expertise, rôles de communauté. Créés et rangés par /kx-publier.
// Ordre = du plus haut au plus bas, sous le rôle de K’X Bot. Les rôles déjà existants non listés gardent leur ordre, en dessous.

const P = {
  KICK: 2n, AUDIT: 128n, PRIORITY: 256n, MANAGE_MESSAGES: 8192n, MENTION: 131072n, MUTE: 1n << 22n, DEAFEN: 1n << 23n, MOVE: 1n << 24n,
  NICKNAMES: 1n << 27n, MANAGE_EVENTS: 1n << 33n, MANAGE_THREADS: 1n << 34n, TIMEOUT: 1n << 40n, CREATE_EVENTS: 1n << 44n,
};
const perms = (...k) => String(k.reduce((a, x) => a | P[x], 0n));

// [nom, couleur, affiché à part, droits, type]
export const ROLES = [
  ["Modérateur", 0x3b82f6, true, perms("KICK", "AUDIT", "MANAGE_MESSAGES", "MUTE", "DEAFEN", "MOVE", "NICKNAMES", "MANAGE_THREADS", "TIMEOUT"), "equipe"],
  ["Animateur", 0xff8a3d, true, perms("PRIORITY", "MUTE", "MOVE", "MANAGE_EVENTS", "CREATE_EVENTS"), "equipe"],
  ["Mentor", null, null, null, "existant"],
  ["Top de la semaine", 0xffd479, true, "0", "auto"],
  ["Champion du défi", 0xff7a3d, false, "0", "badge"],
  ["Expert Cyber", 0xef4444, false, "0", "expert"],
  ["Expert Réseau", 0x3b9bff, false, "0", "expert"],
  ["Expert IA", 0x22d3ee, false, "0", "expert"],
  ["Expert No-code", 0xa855f7, false, "0", "expert"],
  ["Expert Dev", 0x10b981, false, "0", "expert"],
  ["Expert Data", 0xeab308, false, "0", "expert"],
  ["FDE Certifié", null, null, null, "existant"],
  ["En formation", null, null, null, "existant"],
  ["Apprenti", null, null, null, "existant"],
  ["Bêta-testeur", 0x94a3b8, false, "0", "badge"],
  ["Pionnier", 0xb69cff, false, "0", "badge"],
  ["Membre", null, null, null, "existant"],
  ...SKILLS.map(([n]) => [n, 0, false, "0", "competence"]),
  ["Notif lives", null, null, null, "existant"],
  ["Notif annonces", null, null, null, "existant"],
  ["Notif défis", 0, false, "0", "notif"],
];

// Badges que l'équipe peut donner avec /badge (K’X Académie)
export const BADGES = ROLES.filter(([, , , , t]) => t === "expert" || t === "badge").map(([n]) => n);
export const BADGE_EMOJI = {
  "Expert Cyber": "🔐", "Expert Réseau": "🌐", "Expert IA": "🤖", "Expert No-code": "⚙️", "Expert Dev": "🐍", "Expert Data": "📊",
  "Champion du défi": "🏆", "Bêta-testeur": "🧪", "Pionnier": "🚀",
};
export const RENAMED = { "Équipe KX": "Équipe K’X" };
export const TOP_ROLE = "Top de la semaine";

// Crée les rôles manquants puis range tout sous K’X Bot
export async function ensureRoles(env, h, botId) {
  const G = h.GUILD_ID;
  const get = async (p) => (await h.discord(env, "GET", p)).json();
  let roles = await get(`/guilds/${G}/roles`);
  const created = [];
  // anciens noms renommés (marque K’X avec apostrophe)
  for (const [from, to] of Object.entries(RENAMED)) {
    const r = roles.find((x) => x.name === from);
    if (r && !roles.some((x) => x.name === to) && (await h.discord(env, "PATCH", `/guilds/${G}/roles/${r.id}`, { name: to })).ok) created.push(`${from} → ${to}`);
  }
  if (created.length) roles = await get(`/guilds/${G}/roles`);
  for (const [name, color, hoist, permissions, type] of ROLES) {
    if (type === "existant" || roles.some((r) => r.name === name)) continue;
    const res = await h.discord(env, "POST", `/guilds/${G}/roles`, { name, color, hoist, permissions, mentionable: type === "equipe" });
    if (!res.ok) throw new Error(`création de ${name} (${res.status})`);
    created.push(name);
  }
  roles = await get(`/guilds/${G}/roles`);
  const me = await get(`/guilds/${G}/members/${botId}`);
  const top = Math.max(...roles.filter((r) => me.roles.includes(r.id)).map((r) => r.position));
  // tout ce qui est sous K’X Bot, dans l'ordre voulu, les autres à la suite dans leur ordre actuel
  const below = roles.filter((r) => r.id !== G && r.position < top).sort((a, b) => b.position - a.position);
  const wanted = ROLES.map(([n]) => below.find((r) => r.name === n)).filter(Boolean);
  const order = [...wanted, ...below.filter((r) => !wanted.includes(r))];
  const res = await h.discord(env, "PATCH", `/guilds/${G}/roles`, order.map((r, k) => ({ id: r.id, position: top - 1 - k })));
  if (!res.ok) throw new Error(`rangement (${res.status})`);
  return `${created.length ? `créés ou renommés ${created.join(", ")}` : "tous déjà là"}, ${order.length} rôles rangés`;
}

// Donne le rôle de la semaine au premier du classement et le retire aux autres
export async function weeklyTopRole(env, h, winnerId) {
  const G = h.GUILD_ID;
  const role = (await (await h.discord(env, "GET", `/guilds/${G}/roles`)).json()).find((r) => r.name === TOP_ROLE);
  if (!role) return;
  const res = await h.discord(env, "GET", `/guilds/${G}/members?limit=1000`);
  const members = res.ok ? await res.json() : [];
  for (const m of members) if (m.roles.includes(role.id) && m.user.id !== winnerId) await h.discord(env, "DELETE", `/guilds/${G}/members/${m.user.id}/roles/${role.id}`);
  if (winnerId) await h.discord(env, "PUT", `/guilds/${G}/members/${winnerId}/roles/${role.id}`);
}
