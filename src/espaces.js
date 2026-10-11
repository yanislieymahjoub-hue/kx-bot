// Cloisonnement du serveur: un accueil minimal, un espace FDE, un espace privé par client.
// Le statut client/FDE est gardé dans la base privée du bot. Les droits passent par des dérogations
// individuelles (dossiers clients) ou des rôles techniques neutres, sans couleur, ni affichage à part, ni mention.
// Limite assumée: dans un serveur commun, Discord ne permet pas de garantir l'invisibilité totale d'un membre
// ni d'interdire les messages privés entre membres.
import { store } from "./store.js";

const B = { VIEW: 1024n, SEND: 2048n, REACT: 64n, EMBED: 16384n, ATTACH: 32768n, HISTORY: 65536n, MENTION: 131072n,
  CONNECT: 1048576n, SPEAK: 2097152n, PUB_THREADS: 1n << 35n, PRIV_THREADS: 1n << 36n, SEND_THREADS: 1n << 38n, APP_CMDS: 1n << 31n };
export const ROLE_FDE = "Accès B";     // espace FDE (communauté, académie, missions selon niveau)
export const ROLE_CLIENT = "Accès A";  // ne sert qu'à masquer l'accueil aux clients validés
const OLD_CLIENT = "Client";           // ancien badge, renommé en rôle neutre
export const COORD_ROLES = ["Fondateur", "Équipe K’X"];
const FDE_STAFF = ["Fondateur", "Équipe K’X", "Modérateur", "Animateur", "Mentor"];
export const STATUTS = { aucun: "aucun", fde: "fde", client_qualif: "client_qualif", client: "client", conflit: "conflit" };

const has = (bits, b) => (BigInt(bits ?? 0) & b) === b;
const isPrivate = (c, G) => (c.permission_overwrites ?? []).some((o) => o.id === G && has(o.deny, B.VIEW));

// ------------------------------------------------------------ statut d'un membre (base privée)
export async function statutOf(env, userId) {
  return (await store(env, "statutGet", { user: userId }).catch(() => ({}))).statut ?? STATUTS.aucun;
}
export const setStatut = (env, user, statut, ref) => store(env, "statutSet", { user, statut, ref });

// ------------------------------------------------------------ plan de cloisonnement
export async function planEspaces(env, h) {
  const G = h.GUILD_ID, C = h.CHANNELS;
  const chans = await (await h.discord(env, "GET", `/guilds/${G}/channels`)).json();
  const staffCat = chans.find((c) => c.id === C.staff)?.parent_id;
  const accueil = [C.bienvenue, C.reglement];
  const fde = [], prives = [], intacts = [];
  for (const c of chans) {
    if (accueil.includes(c.id)) continue;
    if (c.type === 4 && chans.some((x) => accueil.includes(x.id) && x.parent_id === c.id)) { intacts.push(c); continue; } // catégorie de l'accueil
    if (c.id === staffCat || c.parent_id === staffCat) { intacts.push(c); continue; }
    if (/^◇ C-/.test(c.name) || c.parent_id && chans.find((p) => p.id === c.parent_id && /^◇ (C|M)-/.test(p.name))) { intacts.push(c); continue; }
    if (isPrivate(c, G)) { prives.push(c); continue; }
    fde.push(c);
  }
  return { chans, accueil: chans.filter((c) => accueil.includes(c.id)), fde, prives, intacts };
}

export function planTexte(p) {
  const nom = (c) => `${c.type === 4 ? "▸ " : "#"}${c.name}`;
  return [
    "## Plan de cloisonnement",
    `**Accueil minimal** (nouveaux arrivants seulement): ${p.accueil.map(nom).join(", ")}`,
    `**Espace FDE** (${p.fde.length} salons et catégories, réservés au rôle neutre ${ROLE_FDE} et à l'équipe): ${p.fde.slice(0, 40).map(nom).join(", ")}${p.fde.length > 40 ? "…" : ""}`,
    `**Déjà privés, inchangés**: ${p.prives.map(nom).join(", ") || "aucun"}`,
    "**Clients**: un dossier privé par client (référence neutre C-xxxx), aucune vue sur l'espace FDE ni sur les autres clients",
    "**Membres actuels**: reçoivent l'accès FDE pour ne rien perdre",
    "**Autres réglages**: arrivée guidée Discord désactivée (remplacée par deux boutons dans #bienvenue), messages d'arrivée nominatifs coupés, rôle « Client » renommé en rôle neutre",
    "**Retour arrière**: sauvegarde complète des droits avant application, `/kx-espaces restaurer`",
  ].join("\n");
}

// ------------------------------------------------------------ application
export async function appliquerEspaces(env, h) {
  const G = h.GUILD_ID, out = [];
  const ok = async (res, what) => { if (!res.ok) throw new Error(`${what} ${res.status} ${(await res.text()).slice(0, 200)}`); return res; };
  const p = await planEspaces(env, h);
  let roles = await (await h.discord(env, "GET", `/guilds/${G}/roles`)).json();
  const guild = await (await h.discord(env, "GET", `/guilds/${G}`)).json();

  // 1. sauvegarde pour retour arrière
  const snap = { at: new Date().toISOString(), channels: p.chans.map((c) => ({ id: c.id, overwrites: c.permission_overwrites ?? [] })), system_channel_flags: guild.system_channel_flags };
  await store(env, "setting", { key: "snapshot:espaces", value: JSON.stringify(snap) });
  out.push(`✅ Sauvegarde des droits de ${snap.channels.length} salons`);

  // 2. rôles techniques neutres
  const neutral = { color: 0, hoist: false, mentionable: false, permissions: "0" };
  // l'ancien badge « Client » est renommé si le bot en a le droit, sinon un rôle neutre est créé à côté
  const old = roles.find((r) => r.name === OLD_CLIENT);
  let renamed = false;
  if (old && !roles.some((r) => r.name === ROLE_CLIENT)) renamed = (await h.discord(env, "PATCH", `/guilds/${G}/roles/${old.id}`, { name: ROLE_CLIENT, ...neutral })).ok;
  if (old && !renamed) out.push("⚠️ Le rôle « Client » est au-dessus du bot, renomme-le ou supprime-le toi-même (il n'est plus utilisé)");
  for (const name of [ROLE_CLIENT, ROLE_FDE]) if (!roles.some((r) => r.name === name) && !(name === ROLE_CLIENT && renamed)) await ok(await h.discord(env, "POST", `/guilds/${G}/roles`, { name, ...neutral }), name);
  roles = await (await h.discord(env, "GET", `/guilds/${G}/roles`)).json();
  const rid = (n) => roles.find((r) => r.name === n)?.id;
  const fdeRole = rid(ROLE_FDE), clientRole = rid(ROLE_CLIENT);
  out.push(`✅ Rôles neutres ${ROLE_FDE} et ${ROLE_CLIENT} (sans couleur, ni affichage à part, ni mention)`);

  // 3. membres actuels: accès FDE, sauf clients connus
  const members = await (await h.discord(env, "GET", `/guilds/${G}/members?limit=1000`)).json();
  let n = 0;
  for (const m of members) {
    if (m.user.bot || m.roles.includes(fdeRole)) continue;
    const st = await statutOf(env, m.user.id);
    if (st === STATUTS.client || st === STATUTS.client_qualif || st === STATUTS.conflit) continue;
    if ((await h.discord(env, "PUT", `/guilds/${G}/members/${m.user.id}/roles/${fdeRole}`)).ok) { n++; if (st === STATUTS.aucun) await setStatut(env, m.user.id, STATUTS.fde); }
  }
  out.push(`✅ Accès FDE donné à ${n} membre${n > 1 ? "s" : ""} actuel${n > 1 ? "s" : ""}`);

  // 4. espace FDE: @everyone ne voit plus, le rôle FDE et l'équipe voient
  const staffIds = FDE_STAFF.map(rid).filter(Boolean);
  let f = 0;
  for (const c of p.fde) {
    const ows = c.permission_overwrites ?? [];
    const every = ows.find((o) => o.id === G) ?? { id: G, type: 0, allow: "0", deny: "0" };
    await ok(await h.discord(env, "PUT", `/channels/${c.id}/permissions/${G}`, { type: 0, allow: String(BigInt(every.allow) & ~B.VIEW), deny: String(BigInt(every.deny) | B.VIEW) }), `#${c.name}`);
    const lecture = c.id === h.CHANNELS.annonces ? String(B.SEND | B.REACT | B.PUB_THREADS | B.PRIV_THREADS | B.SEND_THREADS) : "0";
    await ok(await h.discord(env, "PUT", `/channels/${c.id}/permissions/${fdeRole}`, { type: 0, allow: String(B.VIEW | (c.type === 2 ? B.CONNECT : 0n)), deny: lecture }), `#${c.name}`);
    for (const s of staffIds) {
      const cur = ows.find((o) => o.id === s);
      await h.discord(env, "PUT", `/channels/${c.id}/permissions/${s}`, { type: 0, allow: String(BigInt(cur?.allow ?? 0) | B.VIEW | (c.type === 2 ? B.CONNECT : 0n)), deny: String(BigInt(cur?.deny ?? 0) & ~B.VIEW) });
    }
    f++;
  }
  out.push(`✅ Espace FDE, ${f} salons et catégories réservés`);

  // 5. accueil: lecture seule, masqué aux membres déjà orientés (pas d'annuaire commun)
  for (const c of p.accueil) {
    for (const r of [fdeRole, clientRole]) await ok(await h.discord(env, "PUT", `/channels/${c.id}/permissions/${r}`, { type: 0, allow: "0", deny: String(B.VIEW) }), `#${c.name}`);
    const every = (c.permission_overwrites ?? []).find((o) => o.id === G) ?? { allow: "0", deny: "0" };
    await ok(await h.discord(env, "PUT", `/channels/${c.id}/permissions/${G}`, { type: 0, allow: String((BigInt(every.allow) | B.VIEW | B.HISTORY) & ~(B.SEND | B.REACT)), deny: String((BigInt(every.deny) | B.SEND | B.REACT | B.PUB_THREADS | B.PRIV_THREADS | B.SEND_THREADS) & ~B.VIEW) }), `#${c.name}`);
  }
  out.push("✅ Accueil minimal en lecture seule, invisible une fois orienté");

  // 6. arrivée: plus de questions Discord ni de message nominatif
  await h.discord(env, "PUT", `/guilds/${G}/onboarding`, { enabled: false, mode: 0, prompts: [], default_channel_ids: [] }).then((r) => out.push(r.ok ? "✅ Arrivée guidée Discord désactivée" : `⚠️ Arrivée guidée ${r.status}`));
  await h.discord(env, "PATCH", `/guilds/${G}`, { system_channel_flags: (guild.system_channel_flags ?? 0) | 1 | 8 }).then((r) => out.push(r.ok ? "✅ Messages d'arrivée nominatifs coupés" : `⚠️ Messages d'arrivée ${r.status}`));
  await h.discord(env, "PATCH", `/guilds/${G}/welcome-screen`, { enabled: true, description: "Bienvenue chez K’X Automatisation. Choisis ton espace dans le salon de bienvenue.", welcome_channels: [
    { channel_id: h.CHANNELS.bienvenue, description: "Choisir mon espace", emoji_name: "👋" },
    { channel_id: h.CHANNELS.reglement, description: "Lire les règles", emoji_name: "📜" },
  ] });
  await store(env, "setting", { key: "espaces", value: "actif" });
  return out;
}

// ------------------------------------------------------------ retour arrière
export async function restaurerEspaces(env, h) {
  const raw = (await store(env, "setting", { key: "snapshot:espaces" })).value;
  if (!raw) return ["⚠️ Aucune sauvegarde trouvée"];
  const snap = JSON.parse(raw);
  const chans = await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/channels`)).json();
  let n = 0;
  for (const s of snap.channels) {
    const c = chans.find((x) => x.id === s.id);
    if (!c) continue;
    const keep = new Set(s.overwrites.map((o) => o.id));
    for (const o of c.permission_overwrites ?? []) if (!keep.has(o.id)) await h.discord(env, "DELETE", `/channels/${c.id}/permissions/${o.id}`);
    for (const o of s.overwrites) await h.discord(env, "PUT", `/channels/${c.id}/permissions/${o.id}`, { type: o.type, allow: o.allow, deny: o.deny });
    n++;
  }
  await h.discord(env, "PATCH", `/guilds/${h.GUILD_ID}`, { system_channel_flags: snap.system_channel_flags ?? 0 });
  await store(env, "setting", { key: "espaces", value: "inactif" });
  return [`✅ Droits de ${n} salons remis comme au ${snap.at}`, "ℹ️ Les rôles neutres et les dossiers clients créés depuis restent en place, sans effet sur l'ancien fonctionnement. Relance /kx-publier pour remettre l'arrivée guidée."];
}

// ------------------------------------------------------------ choix d'espace à l'arrivée
export async function rejoindreFde(i, env, h) {
  const user = i.member.user;
  const st = await statutOf(env, user.id);
  if (st === STATUTS.client || st === STATUTS.client_qualif) {
    await setStatut(env, user.id, STATUTS.conflit);
    await h.discord(env, "POST", `/channels/${h.CHANNELS.staff}/messages`, { embeds: [{ color: 0xf59e0b, title: "⚖️ Cumul Client et FDE à arbitrer", description: `<@${user.id}> a un dossier client et demande l'espace FDE. Aucun accès n'a été ouvert.\n\`/kx-statut membre:@… statut:…\` pour trancher.` }] });
    return h.reply({ content: "Ta demande est transmise à l'équipe, qui revient vers toi avant d'ouvrir un nouvel accès." }, true);
  }
  const role = (await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/roles`)).json()).find((r) => r.name === ROLE_FDE);
  if (!role) return h.reply({ content: "L'espace FDE n'est pas encore ouvert." }, true);
  await h.discord(env, "PUT", `/guilds/${h.GUILD_ID}/members/${user.id}/roles/${role.id}`);
  await setStatut(env, user.id, STATUTS.fde);
  const dem = (await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/channels`)).json()).find((c) => c.name === "🧭・démarrer");
  return h.reply({ content: `Bienvenue dans la communauté FDE ! Commence par <#${dem?.id ?? h.CHANNELS.discussion}>.` }, true);
}

export const demandeClientModal = () => ({ type: 9, data: { custom_id: "client-modal", title: "Votre projet avec K’X", components: [
  { type: 1, components: [{ type: 4, custom_id: "entreprise", label: "Entreprise et secteur", style: 1, required: true, max_length: 120 }] },
  { type: 1, components: [{ type: 4, custom_id: "besoin", label: "Ce que vous souhaitez automatiser", style: 2, required: true, max_length: 1500 }] },
  { type: 1, components: [{ type: 4, custom_id: "dispos", label: "Vos disponibilités pour un échange", style: 1, required: false, max_length: 150 }] },
] } });

const ref = (p) => `${p}-${crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase()}`;

// Crée le dossier privé d'un client (catégorie neutre, dérogations individuelles)
export async function creerDossierClient(env, h, userId) {
  const G = h.GUILD_ID;
  const roles = await (await h.discord(env, "GET", `/guilds/${G}/roles`)).json();
  const coord = roles.filter((r) => COORD_ROLES.includes(r.name));
  const r = ref("C");
  const allowMember = String(B.VIEW | B.SEND | B.HISTORY | B.ATTACH | B.EMBED | B.SEND_THREADS | B.APP_CMDS);
  const base = [{ id: G, type: 0, deny: String(B.VIEW) }, ...coord.map((x) => ({ id: x.id, type: 0, allow: String(B.VIEW | B.SEND | B.HISTORY | B.ATTACH | B.MENTION) }))];
  const cat = await (await h.discord(env, "POST", `/guilds/${G}/channels`, { name: `◇ ${r}`, type: 4, permission_overwrites: [...base, { id: userId, type: 1, allow: allowMember }] })).json();
  const suivi = await (await h.discord(env, "POST", `/guilds/${G}/channels`, { name: `${r.toLowerCase()}-suivi`, type: 0, parent_id: cat.id, topic: "Votre espace privé avec l'équipe K’X.", permission_overwrites: [...base, { id: userId, type: 1, allow: allowMember }] })).json();
  const annonces = await (await h.discord(env, "POST", `/guilds/${G}/channels`, { name: `${r.toLowerCase()}-annonces`, type: 0, parent_id: cat.id, topic: "Annonces K’X pour les clients, en lecture seule.", permission_overwrites: [...base, { id: userId, type: 1, allow: String(B.VIEW | B.HISTORY), deny: String(B.SEND | B.REACT | B.PUB_THREADS | B.PRIV_THREADS | B.SEND_THREADS) }] })).json();
  await store(env, "dossierSet", { ref: r, kind: "client", user: userId, category: cat.id, suivi: suivi.id, annonces: annonces.id, etat: "qualification" });
  return { ref: r, cat, suivi, annonces };
}

export async function demandeClient(i, env, ctx, h) {
  const user = i.member.user;
  const f = {};
  for (const row of i.data.components) for (const c of row.components) f[c.custom_id] = c.value;
  const st = await statutOf(env, user.id);
  if (st === STATUTS.fde || st === STATUTS.conflit) {
    await setStatut(env, user.id, STATUTS.conflit);
    ctx.waitUntil(h.discord(env, "POST", `/channels/${h.CHANNELS.staff}/messages`, { embeds: [{ color: 0xf59e0b, title: "⚖️ Cumul Client et FDE à arbitrer", description: `<@${user.id}> est dans l'espace FDE et demande un dossier client (${f.entreprise}). Aucun accès client n'a été ouvert.` }] }));
    return h.reply({ content: "Votre demande est transmise à l'équipe, qui revient vers vous avant d'ouvrir un espace." }, true);
  }
  const existing = await store(env, "dossierOf", { user: user.id, kind: "client" }).catch(() => null);
  if (existing?.ref) return h.reply({ content: `Votre espace privé existe déjà, <#${existing.suivi}>.` }, true);
  ctx.waitUntil((async () => {
    await setStatut(env, user.id, STATUTS.client_qualif);
    const d = await creerDossierClient(env, h, user.id);
    await h.discord(env, "POST", `/channels/${d.suivi.id}/messages`, {
      content: `<@${user.id}>`, allowed_mentions: { users: [user.id] },
      embeds: [{ color: 0x8b5cf6, title: `Dossier ${d.ref}`, description: `Merci, votre demande est arrivée. L'équipe K’X l'étudie et vous répond ici.\n\n**Entreprise** ${f.entreprise}\n**Besoin** ${f.besoin}${f.dispos ? `\n**Disponibilités** ${f.dispos}` : ""}`, footer: { text: "Espace visible par vous et la coordination K’X uniquement" } }],
    });
    await h.discord(env, "POST", `/channels/${h.CHANNELS.staff}/messages`, {
      embeds: [{ color: 0x8b5cf6, title: `Nouvelle demande client ${d.ref}`, description: `<@${user.id}> · ${f.entreprise}\n<#${d.suivi.id}>` }],
      components: [{ type: 1, components: [
        { type: 2, style: 3, label: "Valider le client", custom_id: `client:ok:${user.id}:${d.ref}` },
        { type: 2, style: 4, label: "Refuser", custom_id: `client:non:${user.id}:${d.ref}` },
      ] }],
    });
    await h.followUp(env, i, { content: `Votre espace privé est ouvert, <#${d.suivi.id}>. L'équipe K’X vous y répond.` });
  })());
  return h.json({ type: 5, data: { flags: 64 } });
}

// Validation ou refus d'un client par la coordination
export async function decisionClient(i, env, ctx, h) {
  const [, action, userId, r] = i.data.custom_id.split(":");
  if (!isCoord(i)) return h.reply({ content: "Réservé à la coordination." }, true);
  ctx.waitUntil((async () => {
    const d = await store(env, "dossierGet", { ref: r });
    if (action === "ok") {
      await setStatut(env, userId, STATUTS.client, r);
      const role = (await (await h.discord(env, "GET", `/guilds/${h.GUILD_ID}/roles`)).json()).find((x) => x.name === ROLE_CLIENT);
      if (role) await h.discord(env, "PUT", `/guilds/${h.GUILD_ID}/members/${userId}/roles/${role.id}`);
      await store(env, "dossierSet", { ...d, etat: "actif" });
      await h.discord(env, "POST", `/channels/${d.suivi}/messages`, { embeds: [{ color: 0x22c55e, description: "✅ Votre espace client est activé. Vos annonces arrivent dans le salon voisin." }] });
    } else {
      await setStatut(env, userId, STATUTS.aucun);
      for (const id of [d.category, d.suivi, d.annonces]) await h.discord(env, "DELETE", `/channels/${id}/permissions/${userId}`);
      await store(env, "dossierSet", { ...d, etat: "ferme" });
    }
    await store(env, "journal", { quoi: `client ${action}`, ref: r, par: i.member.user.id, cible: userId });
  })());
  return h.json({ type: 7, data: { components: [], embeds: [{ ...(i.message.embeds?.[0] ?? {}), footer: { text: `${action === "ok" ? "Validé" : "Refusé"} par ${i.member.user.global_name ?? i.member.user.username}` } }] } });
}

export const isCoord = (i) => {
  const p = BigInt(i.member?.permissions ?? "0");
  return (p & 8n) === 8n || (p & 0x10000000n) === 0x10000000n;
};

// Commandes autorisées selon le statut, vérifié côté serveur à chaque interaction
const CLIENT_OK = new Set(["kx", "rdv", "contact", "roi", "aide", "mon-contrat"]);
const NOUVEAU_OK = new Set(["kx", "rdv", "contact", "roi", "aide"]);
export async function commandeAutorisee(i, env, name) {
  if (isCoord(i)) return true;
  const st = await statutOf(env, (i.member?.user ?? i.user).id);
  if (st === STATUTS.fde) return true;
  if (st === STATUTS.client || st === STATUTS.client_qualif) return CLIENT_OK.has(name);
  if (st === STATUTS.conflit) return false;
  // pas de statut: avant le cloisonnement, tout le monde garde l'ancien fonctionnement
  const actif = (await store(env, "setting", { key: "espaces" }).catch(() => ({}))).value === "actif";
  return actif ? NOUVEAU_OK.has(name) : true;
}
