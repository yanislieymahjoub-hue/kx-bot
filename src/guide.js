// Accueil, guide des commandes et visite guidée, en composants Discord v2 (conteneurs, images, séparateurs).
// Une seule source pour #bienvenue, le salon 📖・commandes, /aide et la visite guidée.
import { CHANNELS, ASSETS_URL } from "./config.js";
import { BOTS } from "./bots.js";

export const V2 = 1 << 15; // drapeau « composants v2 »
const SITE = "https://kxautomatisation.fr";
const RESEAUX = "https://linktr.ee/kxautomatisation";
const C = CHANNELS;
const VERSION = "2"; // à changer quand une image est refaite, pour que Discord la recharge
export const asset = (p) => `${ASSETS_URL}/${p}?v=${VERSION}`;

const text = (content) => ({ type: 10, content });
const sep = (spacing = 1, divider = true) => ({ type: 14, divider, spacing });
const gallery = (url, description) => ({ type: 12, items: [{ media: { url }, ...(description ? { description } : {}) }] });
const box = (accent_color, components) => ({ type: 17, accent_color, components });
const row = (...buttons) => ({ type: 1, components: buttons });
const btn = (label, custom_id, style = 2, emoji) => ({ type: 2, style, label, custom_id, ...(emoji ? { emoji: { name: emoji } } : {}) });
const link = (label, url, emoji) => ({ type: 2, style: 5, label, url, ...(emoji ? { emoji: { name: emoji } } : {}) });
const section = (content, thumb) => ({ type: 9, components: [text(content)], accessory: { type: 11, media: { url: thumb } } });

// ------------------------------------------------------------ #bienvenue
export function welcomeV2(commandesId, selfRoles) {
  return {
    flags: V2,
    components: [box(BOTS.kx.color, [
      gallery(asset("banners/bienvenue.gif"), "Bienvenue chez KX Automatisation"),
      text([
        "KX aide les entreprises à gagner du temps grâce à l'automatisation et à l'IA, de l'artisan au grand groupe.",
        "",
        "Ce serveur réunit les **FDE**, les Forward Deployed Engineers. Ils vont sur le terrain, comprennent le métier d'un client et lui livrent des automatisations qui tournent pour de vrai. Débutant ou confirmé, tu as ta place ici.",
        "-# Yanis, fondateur de KX",
      ].join("\n")),
      sep(2),
      text([
        "-# 01 · LE PARCOURS",
        "**Apprenti → En formation → FDE Certifié**",
        "Tu candidates avec `/candidature`, tu relèves le défi du lundi et un mentor valide ta progression. Une fois certifié, tu accèdes aux missions clients.",
        "",
        "-# 02 · LES SALONS",
        `<#${C.annonces}> les nouvelles · <#${C.parcours}> la certification · <#${C.defi}> le défi du lundi · <#${C.rendus}> tes rendus · <#${C.questions}> l'entraide · <#${C.vos_creations}> tes projets · <#${C.discussion}> tout le reste`,
        "",
        "-# 03 · LES BOTS",
        `Six bots KX t'accompagnent, chacun avec sa couleur. Leurs commandes sont expliquées dans ${commandesId ? `<#${commandesId}>` : "`/aide`"}.`,
        "",
        "-# 04 · LES POINTS",
        "Aider quelqu'un, réussir un quiz ou briller sur un défi rapporte des points. Le classement tombe chaque dimanche à 18h.",
        "",
        "-# 05 · L'ÉQUIPE",
        "`/ticket` ouvre un fil privé avec nous. Pour automatiser ton entreprise, utilise `/contact`.",
      ].join("\n")),
      sep(2),
      text([
        "### Tes premiers pas",
        `**1.** Lis le <#${C.reglement}>`,
        `**2.** Présente-toi dans <#${C.presente_toi}>`,
        "**3.** Lance la visite guidée ou choisis tes notifications",
      ].join("\n")),
      row(btn("Visite guidée", "tour:1", 1, "▶️"), btn("Rejoindre le parcours FDE", "open:candidature", 3)),
      row(...selfRoles.map(([label, emoji]) => btn(label, `role:${label}`, 2, emoji))),
      row(link("Site KX", SITE, "🌐"), link("Nos réseaux", RESEAUX, "🔗")),
    ])],
  };
}

// ------------------------------------------------------------ guide des commandes
const DOCS = {
  kx: ["Accueil, contact, tickets et réglages", [
    "`/aide` Ce guide, visible par toi seul 🔒",
    "`/kx` Présente KX Automatisation",
    "`/contact` Décris ton besoin, l'équipe KX te recontacte 🔒",
    "`/rdv` Réserve un échange découverte gratuit 🔒",
    "`/roi` Calcule le temps et l'argent qu'une automatisation fait gagner en un an",
    "`/ticket` Ouvre un fil privé avec l'équipe",
    "`/suggestion` Propose une idée, la communauté vote pendant 3 jours",
    "-# Équipe · `/annonce` `/kx-roles` `/kx-setup` `/kx-publier`",
  ]],
  ia: ["Questions, résumés et relectures", [
    "`/ia` Pose une question sur l'automatisation, l'IA ou KX",
    "`/resume` Résume les derniers messages du salon 🔒",
    "`/review` Colle ton workflow ou ton code, l'IA le relit et propose des améliorations 🔒",
    "`/pitch` Transforme ton automatisation en pitch client et message LinkedIn 🔒",
    "**Clic droit sur un message → Applications** puis Résumer ou Expliquer 🔒",
    "-# 30 demandes par jour et par membre",
  ]],
  academie: ["Parcours FDE, défis et ateliers", [
    "`/candidature` Entre dans le parcours, tu passes Apprenti",
    "`/profil` Ton niveau, ton mentor et tes points",
    "**Clic droit sur un membre → Applications → Profil FDE** donne la même fiche",
    `-# Défi de la semaine chaque lundi à 9h dans <#${C.defi}>, avec un fil « build in public »`,
    "-# Équipe · `/niveau` `/defi` `/atelier`",
  ]],
  missions: ["Contrats pour les FDE certifiés", [
    `Les missions clients arrivent dans <#${C.missions}>, réservé aux FDE certifiés. Un clic sur « Je suis intéressé » et l'équipe te contacte.`,
    "-# Équipe · `/mission`",
  ]],
  arene: ["Points, quiz et classement", [
    "`/quiz` Une question FDE sur le thème de ton choix, +5 points si tu trouves",
    "`/merci` Remercie un membre, il gagne 10 points",
    "**Clic droit sur un message → Applications → Remercier l'auteur** fait pareil",
    "`/classement` Le top de la semaine ou le classement général",
    "`/stats` La communauté en chiffres",
    "-# Top des contributeurs chaque dimanche à 18h · Équipe · `/points`",
  ]],
  veille: ["L'actu IA, chaque heure", [
    "`/veille` Les six dernières actus IA 🔒",
    `-# Publication automatique chaque heure dans <#${C.veille_ia}>`,
  ]],
};

export function guideV2(ephemeral = false) {
  return {
    flags: V2 | (ephemeral ? 64 : 0),
    components: [
      box(BOTS.kx.color, [
        gallery(asset("banners/equipe.gif"), "L'équipe des bots KX"),
        text("## Le guide des commandes\nTape **/** dans n'importe quel salon, choisis une commande et remplis les cases.\n-# 🔒 la réponse n'est visible que par toi"),
      ]),
      ...Object.entries(DOCS).map(([k, [role, lines]]) => box(BOTS[k].color, [
        section(`### ${BOTS[k].name}\n-# ${role}`, asset(`bots/${BOTS[k].logo}.png`)),
        text(lines.join("\n")),
      ])),
    ],
  };
}

// ------------------------------------------------------------ visite guidée
// Chaque étape: [couleur, image (logo ou bannière), titre, lignes]
const TOUR = [
  [BOTS.kx.color, "bots/bot.png", "Bienvenue chez KX", [
    "KX aide les entreprises à gagner du temps avec l'automatisation et l'IA.",
    "Ici, la communauté des FDE apprend, construit et livre de vraies missions.",
    "La visite dure une minute, clique sur Suivant.",
  ]],
  [BOTS.academie.color, "bots/academie.png", "Le parcours FDE", [
    "**Apprenti** tu découvres et tu relèves le défi du lundi",
    "**En formation** un mentor suit tes rendus",
    "**FDE Certifié** tu accèdes aux missions clients",
    "Tout commence avec `/candidature`.",
  ]],
  [BOTS.ia.color, "banners/equipe.gif", "Six bots, chacun son rôle", [
    "**KX Bot** l'accueil et l'équipe · **KX IA** tes questions",
    "**KX Académie** le parcours · **KX Missions** les contrats",
    "**KX Arène** les points · **KX Veille** l'actu IA",
  ]],
  [BOTS.arene.color, "bots/arene.png", "Les points", [
    "Un coup de main remercié avec `/merci` rapporte 10 points.",
    "Un quiz réussi avec `/quiz` en rapporte 5.",
    "Le classement tombe chaque dimanche à 18h.",
  ]],
  [BOTS.missions.color, "bots/missions.png", "À toi de jouer", [
    `Présente-toi dans <#${C.presente_toi}>.`,
    `Pose ta première question dans <#${C.questions}>.`,
    "Et lance-toi dans le parcours, le bouton est juste en dessous.",
  ]],
];
export const TOUR_LENGTH = TOUR.length;

const dots = (n) => Array.from({ length: TOUR.length }, (_, k) => (k < n ? "◆" : "◇")).join(" ");

// Étape n (1 à 5), avec les `shown` premières lignes visibles (pour l'effet d'apparition)
export function tourStep(n, shown = Infinity) {
  const [color, img, title, lines] = TOUR[n - 1];
  const head = `-# ${dots(n)}   VISITE GUIDÉE · ${n} / ${TOUR.length}\n## ${title}`;
  const body = lines.slice(0, shown).join("\n");
  const isBanner = img.startsWith("banners/");
  const top = isBanner
    ? [gallery(asset(img)), text(`${head}${body ? `\n${body}` : ""}`)]
    : [section(`${head}${body ? `\n${body}` : ""}`, asset(img))];
  const nav = n < TOUR.length
    ? row(btn("Précédent", `tour:${n - 1}`, 2), btn("Suivant", `tour:${n + 1}`, 1))
    : row(btn("Précédent", `tour:${n - 1}`, 2), btn("Rejoindre le parcours FDE", "open:candidature", 3), btn("Ouvrir un ticket", "ticket:open", 2));
  if (n === 1) nav.components[0].disabled = true;
  return { flags: V2 | 64, components: [box(color, [...top, sep(1), nav])] };
}

// Écran de chargement de la visite
export function tourLoading(k) {
  const bar = "▰".repeat(k) + "▱".repeat(5 - k);
  return { flags: V2 | 64, components: [box(BOTS.kx.color, [text(`-# PRÉPARATION DE TA VISITE\n### ${bar}`)])] };
}

export { TOUR };
