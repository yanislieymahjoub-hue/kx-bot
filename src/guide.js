// Guide des commandes et présentation d'accueil. Une seule source pour /aide, le salon 📖・commandes et #bienvenue.
import { CHANNELS } from "./config.js";

const SITE = "https://kxautomatisation.fr";
const RESEAUX = "https://linktr.ee/kxautomatisation";
const C = CHANNELS;

// [titre, couleur, lignes]
const SECTIONS = [
  ["🤖 L'IA de KX", 0x8b5cf6, [
    "`/ia` Pose une question sur l'automatisation, l'IA ou KX. La réponse s'affiche dans le salon",
    "`/resume` Résume les derniers messages du salon, pratique pour rattraper une discussion 🔒",
    "`/review` Colle ton workflow n8n, ton scénario Make ou ton code, l'IA repère les erreurs et propose des améliorations 🔒",
    "`/pitch` Décris ton automatisation, l'IA en tire un pitch client, un message LinkedIn et des réponses aux objections 🔒",
    "`/quiz` Une question FDE sur le thème de ton choix, +5 points si tu trouves",
    "**Clic droit sur un message → Applications** puis Résumer ou Expliquer avec l'IA 🔒",
    "*30 demandes IA par jour et par membre*",
  ]],
  ["🎓 Le parcours FDE", 0xb69cff, [
    "`/candidature` Entre dans le parcours. Tu passes 🌱 Apprenti et l'équipe étudie ton profil",
    "`/profil` Ton niveau, ton mentor et tes points, ou ceux d'un autre membre",
    "**Clic droit sur un membre → Applications → Profil FDE** donne la même fiche",
    "🌱 Apprenti → 🛠️ En formation → 🏅 FDE Certifié. La certification ouvre l'accès aux missions clients",
  ]],
  ["🏆 Points et entraide", 0xf5b83d, [
    "`/merci` Remercie un membre qui t'a aidé, il gagne 10 points (une fois par jour et par personne)",
    "**Clic droit sur un message → Applications → Remercier l'auteur** fait pareil",
    "`/classement` Le top 10 de la semaine ou le classement général",
    "`/stats` La communauté en chiffres, membres, niveaux FDE et points",
    "`/suggestion` Propose une idée pour le serveur, la communauté vote pendant 3 jours",
    "`/ticket` Ouvre un fil privé avec l'équipe KX, aussi possible avec le bouton du salon support",
  ]],
  ["💼 Travailler avec KX", 0x8b5cf6, [
    "`/roi` Calcule le temps et l'argent qu'une automatisation fait gagner en un an",
    "`/kx` Présente KX Automatisation et sa façon de travailler",
    "`/contact` Décris ton besoin dans un formulaire, l'équipe KX te recontacte 🔒",
    "`/rdv` Le lien pour réserver un échange découverte gratuit 🔒",
    "`/aide` Affiche ce guide, visible par toi seul 🔒",
  ]],
  ["🛡️ Équipe et mentors", 0x6b7280, [
    "`/niveau` Change le niveau FDE d'un membre. Il reçoit un message privé et chaque nouveau certifié est annoncé",
    "`/points` Donne ou retire des points",
    "`/mission` Publie une mission client dans le salon des FDE certifiés",
    "`/defi` Publie un défi d'automatisation tout de suite",
    "`/atelier` Crée un atelier live, l'événement Discord et l'annonce",
    "`/annonce` Publie une annonce mise en forme",
    "`/kx-roles` Poste le panneau des notifications",
    "`/kx-setup` et `/kx-publier` Réglages du serveur, réservés aux administrateurs",
  ]],
  ["⏰ Ce que le bot fait tout seul", 0xb69cff, [
    `Veille IA publiée chaque heure dans <#${C.veille_ia}>`,
    `Défi de la semaine chaque lundi à 9h dans <#${C.defi}>`,
    `Fil « build in public » chaque lundi dans <#${C.vos_creations}>`,
    `Top des contributeurs chaque dimanche à 18h dans <#${C.discussion}>`,
  ]],
];

const FOOTER = { text: "KX Automatisation · kxautomatisation.fr" };

// En-tête + une carte par thème (6 cartes, sous la limite de 10 par message)
export function guideEmbeds() {
  const head = {
    color: 0x8b5cf6, title: "📖 Le guide du KX Bot",
    description: "Le KX Bot est l'assistant du serveur. Tape **/** dans n'importe quel salon, la liste des commandes s'affiche. Choisis-en une et remplis les cases.\n🔒 la réponse n'est visible que par toi.",
  };
  const cards = SECTIONS.map(([title, color, lines], k) => ({ title, color, description: lines.join("\n"), ...(k === SECTIONS.length - 1 ? { footer: FOOTER } : {}) }));
  return [head, ...cards];
}

// Texte du message d'accueil de Yanis (posté à son nom, au-dessus du mode d'emploi)
export const WELCOME_TEXT = [
  "# 👋 Bienvenue chez KX Automatisation",
  "Salut et bienvenue ! Ce serveur est la communauté de **KX Automatisation**. On aide les entreprises à gagner du temps grâce à l'automatisation et à l'IA, de l'artisan au grand groupe.",
  "",
  "Ici on réunit les **FDE**, les Forward Deployed Engineers. Ce sont ceux qui vont sur le terrain, comprennent le métier d'un client et lui livrent des automatisations qui tournent pour de vrai.",
  "### Ce que tu trouves ici",
  "🎓 **Une formation** avec le parcours FDE, un défi chaque semaine et des mentors qui relisent ton travail",
  "🤝 **De l'entraide** sur n8n, Make, Python, les API et les agents IA",
  "💼 **Des missions clients** réservées aux FDE certifiés",
  "🏢 **Un accès direct à l'équipe KX** si tu veux automatiser ton entreprise",
  "",
  "Débutant ou confirmé, tu as ta place ici. Le mode d'emploi du serveur est juste en dessous 👇",
  "",
  "*Yanis, fondateur de KX*",
].join("\n");

// Mode d'emploi posté par le bot dans #bienvenue, avec les boutons de notifications
export function welcomeGuide(commandesId, selfRoles) {
  const how = {
    color: 0x8b5cf6, title: "🧭 Comment fonctionne le serveur",
    fields: [
      { name: "1 · Le parcours FDE", value: "🌱 Apprenti → 🛠️ En formation → 🏅 FDE Certifié\nTape `/candidature` pour y entrer. Tu relèves les défis, tu postes tes rendus et un mentor valide ta progression. Une fois certifié, tu accèdes aux missions clients et à l'espace des FDE." },
      { name: "2 · Les salons à connaître", value: [
        `<#${C.annonces}> les nouvelles de KX`,
        `<#${C.parcours}> tout sur la certification`,
        `<#${C.defi}> un défi d'automatisation chaque lundi`,
        `<#${C.rendus}> tes rendus, commentés par les mentors`,
        `<#${C.questions}> un post par question, la communauté répond`,
        `<#${C.vos_creations}> montre ce que tu construis`,
        `<#${C.veille_ia}> l'actu IA, publiée automatiquement`,
        `<#${C.discussion}> pour parler de tout`,
      ].join("\n") },
      { name: "3 · Le KX Bot", value: `Il répond à tes questions avec l'IA, relit ton code, te teste avec des quiz et compte tes points. Toutes ses commandes sont expliquées dans ${commandesId ? `<#${commandesId}>` : "`/aide`"}.` },
      { name: "4 · Les points", value: "Aider quelqu'un, réussir un quiz ou briller sur un défi rapporte des points. Remercie un membre avec `/merci`, le classement tombe chaque dimanche à 18h." },
      { name: "5 · Besoin de l'équipe ?", value: "`/ticket` ouvre un fil privé avec nous. Pour faire automatiser ton entreprise, utilise `/contact` ou `/rdv`." },
    ],
  };
  const steps = {
    color: 0xf5b83d, title: "✅ Tes premiers pas",
    description: [
      `**1.** Lis le <#${C.reglement}>`,
      `**2.** Présente-toi dans <#${C.presente_toi}>`,
      "**3.** Choisis tes notifications avec les boutons ci-dessous",
      "**4.** Lance `/candidature` si tu veux devenir FDE",
    ].join("\n"),
    footer: FOOTER,
  };
  const components = [
    { type: 1, components: selfRoles.map(([label, emoji]) => ({ type: 2, style: 2, label, emoji: { name: emoji }, custom_id: `role:${label}` })) },
    { type: 1, components: [
      { type: 2, style: 5, label: "Site KX", emoji: { name: "🌐" }, url: SITE },
      { type: 2, style: 5, label: "Nos réseaux", emoji: { name: "🔗" }, url: RESEAUX },
    ] },
  ];
  return { content: "", embeds: [how, steps], components };
}
