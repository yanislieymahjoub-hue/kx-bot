// Écran d'arrivée sur le serveur: questions posées aux nouveaux membres, rôles et salons qui en découlent.

// Compétences proposées à l'arrivée (un rôle chacune, sans couleur)
export const SKILLS = [
  ["n8n", "⚙️", "auto"], ["Make", "🟣", "auto"], ["Zapier", "🟠", "auto"], ["Power Automate", "🔷", "auto"],
  ["Agents IA", "🤖", "auto"], ["Prompt engineering", "✍️", "auto"], ["RAG et bases vectorielles", "🧠", "auto"], ["Excel et VBA", "📊", "auto"],
  ["CRM et ERP", "📇", "auto"],
  ["Python", "🐍", "tech"], ["JavaScript", "🟨", "tech"], ["API et webhooks", "🔌", "tech"], ["SQL et data", "🗄️", "tech"],
  ["Cybersécurité", "🔐", "tech"], ["Réseaux et systèmes", "🌐", "tech"], ["Cloud et DevOps", "☁️", "tech"], ["Web et applis", "🖥️", "tech"],
  ["Scraping", "🕸️", "tech"],
];

export const WELCOME_SCREEN = (C) => ({
  enabled: true,
  description: "La communauté des FDE (ingénieurs qui déploient l'IA chez le client). Automatisation, agents IA, missions clients.",
  welcome_channels: [
    { channel_id: C.reglement, description: "Lis les règles", emoji_name: "📜" },
    { channel_id: C.parcours, description: "Deviens FDE certifié", emoji_name: "🎓" },
    { channel_id: C.questions, description: "Pose tes questions", emoji_name: "❓" },
    { channel_id: C.defi, description: "Relève le défi de la semaine", emoji_name: "🏋️" },
    { channel_id: C.discussion, description: "Viens discuter", emoji_name: "💬" },
  ],
});

export function onboardingBody(C, roles, extraDefault = []) {
  const rid = (n) => roles.find((r) => r.name === n)?.id;
  let seq = 0n;
  const sf = () => String((BigInt(Date.now() - 1420070400000) << 22n) | (seq++));
  const opt = (title, description, emoji, channels, roleNames = []) => ({
    id: sf(), title, ...(description ? { description } : {}), emoji_name: emoji,
    channel_ids: channels.map((k) => C[k] ?? k).filter(Boolean), role_ids: roleNames.map(rid).filter(Boolean),
  });
  // Discord limite l'arrivée à 5 questions, les suivantes restent dans « Salons et rôles »
  const prompt = (title, single, required, options, in_onboarding = true) => ({ id: sf(), type: 0, title, single_select: single, required, in_onboarding, options });

  return {
    enabled: true, mode: 0,
    default_channel_ids: [...new Set([
      C.bienvenue, C.reglement, C.annonces, C.presente_toi, C.discussion, C.veille_ia, C.vos_creations, C.detente,
      C.questions, C.no_code, C.code, C.idees, C.suggestions, C.parcours, C.defi, C.certifications, C.rendus, ...extraDefault,
    ].filter(Boolean))],
    prompts: [
      prompt("Qu'est-ce qui t'amène ici ?", false, true, [
        opt("Devenir FDE", "Forward Deployed Engineer, l'ingénieur qui déploie l'IA chez le client", "🎓", ["parcours", "defi", "rendus"]),
        opt("Décrocher des missions clients", "Réservées aux FDE certifiés par K’X", "💼", ["parcours", "certifications"]),
        opt("Apprendre l'automatisation", "n8n, Make, Zapier, sans forcément coder", "⚙️", ["no_code", "questions"]),
        opt("Progresser en code", "Python, JavaScript, API", "🐍", ["code", "questions"]),
        opt("Construire des agents IA", "LLM, RAG, outils, MCP", "🤖", ["code", "veille_ia"]),
        opt("Automatiser mon entreprise", "Gagner du temps avec l'aide de K’X", "🏢", ["travailler", "realisations"]),
        opt("Recruter un FDE ou un freelance", "Des profils formés et certifiés", "🤝", ["travailler"]),
        opt("Partager mes projets", "Montrer ce que je construis", "🛠️", ["vos_creations"]),
        opt("Suivre l'actu de l'IA", "La veille publiée chaque heure", "📰", ["veille_ia"]),
        opt("Défis et ateliers", "S'entraîner chaque semaine et suivre les lives", "🏋️", ["defi", "ateliers"]),
        opt("Trouver des collaborateurs", "Monter un projet à plusieurs", "👥", ["idees", "discussion"]),
      ]),
      prompt("Où en es-tu en automatisation et IA ?", true, true, [
        opt("Je découvre", "Je n'ai encore rien automatisé", "🌱", ["questions", "no_code"]),
        opt("Débutant", "Quelques premiers workflows", "🔰", ["questions", "defi"]),
        opt("Intermédiaire", "Je livre des automatisations qui tournent", "🛠️", ["defi", "rendus"]),
        opt("Confirmé", "J'en fais mon métier ou presque", "🚀", ["parcours", "rendus"]),
        opt("Expert", "Je peux former et accompagner les autres", "🏅", ["parcours", "rendus"]),
      ]),
      prompt("Ton profil", true, true, [
        opt("Étudiant", null, "🎒", ["presente_toi"]),
        opt("Alternant", null, "🔁", ["presente_toi"]),
        opt("Salarié", null, "💼", ["presente_toi"]),
        opt("Freelance ou indépendant", null, "🧑‍💻", ["presente_toi", "travailler"]),
        opt("Dirigeant ou entrepreneur", null, "🏢", ["presente_toi", "travailler"]),
        opt("En reconversion", null, "🔄", ["presente_toi", "parcours"]),
        opt("Autre", null, "✨", ["presente_toi"]),
      ]),
      prompt("Tes compétences en automatisation et IA", false, false,
        SKILLS.filter(([, , g]) => g === "auto").map(([n, e]) => opt(n, null, e, ["no_code"], [n]))),
      prompt("Tes compétences techniques", false, false,
        SKILLS.filter(([, , g]) => g === "tech").map(([n, e]) => opt(n, null, e, ["code"], [n]))),
      prompt("Quelles notifications veux-tu ?", false, false, [
        opt("Lives et ateliers", "Être prévenu des ateliers", "🎓", ["ateliers"], ["Notif lives"]),
        opt("Défi de la semaine", "Chaque lundi à 9h", "🏋️", ["defi"], ["Notif défis"]),
        opt("Annonces", "Les nouveautés K’X", "📢", ["annonces"], ["Notif annonces"]),
      ], false),
    ],
  };
}
