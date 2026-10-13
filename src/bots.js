// L'équipe de bots K’X. Un seul Worker répond pour tous, chaque bot a son adresse, sa couleur et ses commandes.
// L'identifiant et la clé publique ne sont pas secrets. Le jeton de chaque bot est un secret GitHub (DISCORD_TOKEN_<CLÉ>).
// Tant qu'un bot n'a pas de jeton, ses commandes restent sur K’X Bot.

import { MOD_COMMAND_NAMES, MOD_BOT_PERMISSIONS } from './moderation-policy.js';
export const BOTS = {
  moderation: {
    name: 'KX Modération', path: '/moderation', id: '1559521331530178562',
    publicKey: '962a9586e017a75316b70296439ea7ae36514a7391d5c2e7f5e8f889cbb00f4e',
    color: 0x9a6bff, logo: 'moderation', permissions: MOD_BOT_PERMISSIONS,
    about: 'Modération du serveur KX. Nettoyage, sanctions, avertissements et historique privé. Commandes réservées à l’équipe.',
    commands: MOD_COMMAND_NAMES,
    dedicated: true,
  },
  kx: {
    name: "K’X Bot", path: "/", id: "1558510006364545074", color: 0x8b5cf6, logo: "bot",
    about: "L'assistant de la communauté K’X Automatisation. Accueil, contact, tickets et réglages. Tape /aide pour tout voir.",
    commands: ["kx", "rdv", "contact", "suggestion", "annonce", "kx-roles", "aide", "roi", "ticket", "kx-setup", "kx-publier", "kx-bot", "kx-espaces", "kx-statut", "presentation"],
  },
  ia: {
    name: "K’X IA", path: "/ia", color: 0x22d3ee, logo: "ia",
    id: "1558564369321689339", publicKey: "eb7cfcf8af8fa78fa7c300709495e1ecb7e91b203e1d70ed5426a27c0f4673aa",
    about: "L'IA de la communauté K’X. Questions, résumés, relecture de workflows et pitchs clients.",
    commands: ["ia", "resume", "review", "pitch", "Résumer avec l'IA", "Expliquer avec l'IA", "kx-ia"],
  },
  academie: {
    name: "K’X Académie", path: "/academie", color: 0xf5b83d, logo: "academie",
    id: "1558564596288200945", publicKey: "ce0b67f07b6f6cf4f24d500d96368cbb20d0e73b0127e26ccd88e2a9c3fb4433",
    about: "Le parcours FDE de K’X. Candidatures, niveaux, défis de la semaine et ateliers.",
    commands: ["candidature", "profil", "niveau", "badge", "defi", "atelier", "Profil FDE", "kx-academie", "formation"],
    channels: ["defi", "certifications", "ateliers", "vos_creations", "staff", "rendus", "parcours"],
  },
  missions: {
    name: "K’X Missions", path: "/missions", color: 0x22c55e, logo: "missions",
    id: "1558564888132063264", publicKey: "e4c1ac3095ffdc28808b504ac5964dbdd3e534280e3ba49b6b92f7724c4d80d6",
    about: "Les missions clients réservées aux FDE certifiés K’X.",
    commands: ["mission", "kx-missions"],
    channels: ["missions", "staff"],
  },
  arene: {
    name: "K’X Arène", path: "/arene", color: 0xf43f5e, logo: "arene",
    id: "1558565038594334830", publicKey: "fa96d4983a3a8ad4eb6a3d39490c4c40f668bedfd0fdfd498dc1bbdb38405a17",
    about: "Points, quiz et classement de la communauté K’X.",
    commands: ["merci", "inviter", "classement", "points", "quiz", "stats", "Remercier l'auteur", "kx-arene"],
    channels: ["discussion"],
  },
  veille: {
    name: "K’X Veille", path: "/veille", color: 0xec4899, logo: "veille",
    id: "1558565309814669312", publicKey: "42c10322a9a291743d376584f382855a67e3559123e4435dea07f60cc6a8dc2d",
    about: "L'actu IA et automatisation, publiée chaque heure sur le serveur K’X.",
    commands: ["veille", "kx-veille"],
    channels: ["veille_ia"],
  },
};

// Droits donnés à chaque bot, sur le serveur (invitation) et dans ses salons (même verrouillés)
const P = { VIEW: 1024n, SEND: 2048n, EMBED: 16384n, ATTACH: 32768n, HISTORY: 65536n, REACT: 64n, EXT_EMOJI: 262144n, MENTION: 131072n, PUB_THREADS: 1n << 35n, SEND_THREADS: 1n << 38n };
export const BOT_PERMISSIONS = Object.values(P).reduce((a, b) => a | b, 0n);

export const tokenOf = (env, key) => (key === "kx" ? env.DISCORD_BOT_TOKEN : env[`DISCORD_TOKEN_${key.toUpperCase()}`]);
export const publicKeyOf = (env, key) => (key === "kx" ? env.DISCORD_PUBLIC_KEY : BOTS[key]?.publicKey);
export const botByPath = (pathname) => {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return Object.keys(BOTS).find((k) => BOTS[k].path === clean);
};
