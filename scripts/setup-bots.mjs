// Configure chaque bot de l'équipe KX à partir de son jeton (lancé par GitHub Actions après le déploiement):
// description, logo, adresse des interactions, commandes. Un bot sans jeton ou pas encore invité laisse ses commandes à KX Bot.
// Aucun jeton n'est jamais affiché.
import fs from "node:fs";
import { BOTS, BOT_PERMISSIONS } from "../src/bots.js";
import { GUILD_ID, ASSETS_URL } from "../src/config.js";
import { COMMANDS } from "./commands.mjs";

const API = "https://discord.com/api/v10";
const tokenOf = (k) => (k === "kx" ? process.env.DISCORD_BOT_TOKEN : process.env[`DISCORD_TOKEN_${k.toUpperCase()}`]);
const call = async (token, method, path, body) => {
  const res = await fetch(API + path, { method, headers: { Authorization: `Bot ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};
const logo = (k) => `data:image/png;base64,${fs.readFileSync(new URL(`../public/bots/${BOTS[k].logo}.png`, import.meta.url)).toString("base64")}`;
const invite = (id) => `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot+applications.commands&permissions=${BOT_PERMISSIONS}&guild_id=${GUILD_ID}&disable_guild_select=true`;

const ready = {};
for (const [k, b] of Object.entries(BOTS)) {
  const token = tokenOf(k);
  if (!token) { console.log(`· ${b.name}: pas de jeton (secret DISCORD_TOKEN_${k.toUpperCase()}), commandes gardées par KX Bot`); continue; }
  const app = await call(token, "GET", "/applications/@me");
  if (!app.ok) { console.log(`✗ ${b.name}: jeton refusé (${app.status})`); continue; }
  if (b.id && app.data.id !== b.id) { console.log(`✗ ${b.name}: ce jeton appartient à une autre application (${app.data.name}), vérifie le secret`); continue; }

  // profil de l'application (KX Bot garde son adresse et son logo actuels)
  if (k !== "kx") {
    const patch = {
      description: b.about,
      interactions_endpoint_url: ASSETS_URL + b.path,
      install_params: { scopes: ["bot", "applications.commands"], permissions: String(BOT_PERMISSIONS) },
      ...(app.data.icon ? {} : { icon: logo(k) }),
    };
    const r = await call(token, "PATCH", "/applications/@me", patch);
    console.log(`${r.ok ? "✓" : "✗"} ${b.name}: profil${r.ok ? "" : ` (${r.status} ${JSON.stringify(r.data).slice(0, 200)})`}`);
    const me = await call(token, "GET", "/users/@me");
    if (me.ok && !me.data.avatar) {
      const a = await call(token, "PATCH", "/users/@me", { avatar: logo(k) });
      console.log(`${a.ok ? "✓" : "✗"} ${b.name}: avatar${a.ok ? "" : ` (${a.status})`}`);
    }
  }

  const guilds = await call(token, "GET", "/users/@me/guilds");
  if (!guilds.ok || !guilds.data.some((g) => g.id === GUILD_ID)) {
    console.log(`· ${b.name}: pas encore sur le serveur, lien d'invitation ${invite(app.data.id)}`);
    continue;
  }
  ready[k] = { token, id: app.data.id };
}

if (!ready.kx) { console.log("KX Bot indisponible, commandes non enregistrées"); process.exit(1); }

// répartition des commandes
const owner = {};
for (const [k, b] of Object.entries(BOTS)) for (const name of b.commands) owner[name] = ready[k] ? k : "kx";
const missing = COMMANDS.filter((c) => !owner[c.name]).map((c) => c.name);
if (missing.length) console.log("Commandes sans bot (ajoutées à KX Bot):", missing.join(", "));
for (const c of COMMANDS) owner[c.name] ??= "kx";

let failed = false;
for (const [k, r] of Object.entries(ready)) {
  const list = COMMANDS.filter((c) => owner[c.name] === k);
  const res = await call(r.token, "PUT", `/applications/${r.id}/guilds/${GUILD_ID}/commands`, list);
  console.log(`${res.ok ? "✓" : "✗"} ${BOTS[k].name}: ${list.length} commandes${res.ok ? "" : ` (${res.status} ${JSON.stringify(res.data).slice(0, 300)})`}`);
  if (!res.ok) failed = true;
}
if (failed) process.exit(1);
