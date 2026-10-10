// Enregistre les commandes slash sur le serveur KX. Lancé automatiquement par GitHub Actions.
const { DISCORD_BOT_TOKEN, DISCORD_APP_ID } = process.env;
const GUILD_ID = "1558481384601813183";
const MANAGE_MESSAGES = String(0x2000);
const MANAGE_ROLES = String(0x10000000);

const commands = [
  { name: "kx", description: "Présentation de KX Automatisation" },
  { name: "rdv", description: "Prendre rendez-vous avec KX" },
  { name: "contact", description: "Décrire ton besoin à l'équipe KX" },
  {
    name: "ia", description: "Poser une question à l'IA de KX",
    options: [{ type: 3, name: "question", description: "Ta question", required: true, max_length: 1000 }],
  },
  {
    name: "resume", description: "Résumer les derniers messages de ce salon (réponse visible par toi seul)",
    options: [{ type: 4, name: "messages", description: "Nombre de messages (max 100)", required: false, min_value: 10, max_value: 100 }],
  },
  {
    name: "suggestion", description: "Proposer une idée, soumise au vote",
    options: [{ type: 3, name: "idee", description: "Ton idée", required: true, max_length: 300 }],
  },
  {
    name: "annonce", description: "(Équipe) Publier une annonce", default_member_permissions: MANAGE_MESSAGES,
    options: [
      { type: 3, name: "titre", description: "Titre", required: true, max_length: 250 },
      { type: 3, name: "texte", description: "Contenu (\\n pour un retour à la ligne)", required: true, max_length: 3000 },
      { type: 5, name: "ping", description: "Prévenir le rôle Notif annonces", required: false },
    ],
  },
  { name: "kx-roles", description: "(Équipe) Poster le panneau de rôles", default_member_permissions: MANAGE_MESSAGES },
  { name: "aide", description: "Toutes les commandes du KX Bot" },
  { name: "candidature", description: "Rejoindre le parcours FDE (formation et certification)" },
  {
    name: "profil", description: "Voir le niveau FDE d'un membre",
    options: [{ type: 6, name: "membre", description: "Membre (toi par défaut)", required: false }],
  },
  {
    name: "niveau", description: "(Équipe) Changer le niveau FDE d'un membre", default_member_permissions: MANAGE_ROLES,
    options: [
      { type: 6, name: "membre", description: "Membre", required: true },
      { type: 3, name: "niveau", description: "Nouveau niveau", required: true, choices: [
        { name: "🌱 Apprenti", value: "apprenti" },
        { name: "🛠️ En formation", value: "formation" },
        { name: "🏅 FDE Certifié", value: "fde" },
        { name: "🎓 Mentor (en plus)", value: "mentor" },
      ] },
    ],
  },
  { name: "mission", description: "(Équipe) Publier une mission client pour les FDE", default_member_permissions: MANAGE_ROLES },
  { name: "defi", description: "(Équipe) Publier un défi d'automatisation maintenant", default_member_permissions: MANAGE_MESSAGES },

  // Lot 2
  {
    name: "merci", description: "Remercier un membre qui t'a aidé (+10 points pour lui)",
    options: [
      { type: 6, name: "membre", description: "Qui veux-tu remercier ?", required: true },
      { type: 3, name: "raison", description: "Pour quoi ? (facultatif)", required: false, max_length: 120 },
    ],
  },
  {
    name: "classement", description: "Classement des contributeurs",
    options: [{ type: 3, name: "periode", description: "Semaine ou général", required: false, choices: [{ name: "Cette semaine", value: "semaine" }, { name: "Général", value: "total" }] }],
  },
  {
    name: "points", description: "(Équipe) Donner ou retirer des points", default_member_permissions: MANAGE_ROLES,
    options: [
      { type: 6, name: "membre", description: "Membre", required: true },
      { type: 4, name: "nombre", description: "Points (négatif pour retirer)", required: true, min_value: -500, max_value: 500 },
      { type: 3, name: "raison", description: "Raison", required: false, max_length: 120 },
    ],
  },
  {
    name: "quiz", description: "Une question FDE générée par l'IA (+5 points si tu trouves)",
    options: [{ type: 3, name: "theme", description: "Thème (ex. n8n, API REST, RGPD, agents IA)", required: false, max_length: 80 }],
  },
  { name: "review", description: "Faire relire ton workflow ou ton code par l'IA (visible par toi seul)" },
  {
    name: "pitch", description: "Transformer ton automatisation en pitch client",
    options: [
      { type: 3, name: "automatisation", description: "Ce que fait ton automatisation", required: true, max_length: 1000 },
      { type: 3, name: "client", description: "À qui tu le présentes (ex. gérant d'une PME du BTP)", required: false, max_length: 120 },
    ],
  },
  {
    name: "roi", description: "Calculer le temps et l'argent qu'une automatisation fait gagner",
    options: [
      { type: 4, name: "minutes", description: "Durée de la tâche en minutes", required: true, min_value: 1, max_value: 1440 },
      { type: 4, name: "fois_par_semaine", description: "Combien de fois par semaine", required: true, min_value: 1, max_value: 500 },
      { type: 4, name: "personnes", description: "Nombre de personnes qui la font", required: false, min_value: 1, max_value: 1000 },
      { type: 4, name: "cout_horaire", description: "Coût horaire chargé en € (35 par défaut)", required: false, min_value: 10, max_value: 500 },
    ],
  },
  {
    name: "ticket", description: "Ouvrir un fil privé avec l'équipe KX",
    options: [{ type: 3, name: "sujet", description: "Sujet (facultatif)", required: false, max_length: 150 }],
  },
  {
    name: "atelier", description: "(Équipe) Créer un atelier live (événement + annonce)", default_member_permissions: MANAGE_ROLES,
    options: [
      { type: 3, name: "titre", description: "Titre", required: true, max_length: 100 },
      { type: 3, name: "date", description: "JJ/MM ou JJ/MM/AAAA", required: true, max_length: 10 },
      { type: 3, name: "heure", description: "18:30 ou 18h (heure de Paris)", required: true, max_length: 5 },
      { type: 3, name: "description", description: "Ce qu'on va voir", required: false, max_length: 1000 },
      { type: 4, name: "duree", description: "Durée en minutes (60 par défaut)", required: false, min_value: 15, max_value: 480 },
    ],
  },
  { name: "stats", description: "La communauté KX en chiffres" },
  { name: "kx-setup", description: "(Admin) Configurer salons, forums, support, accueil", default_member_permissions: "8" },
  { name: "kx-publier", description: "(Admin) Logo, mode d'emploi d'accueil, guide des commandes, invitations", default_member_permissions: "8" },

  // Menus clic droit (Applications)
  { type: 3, name: "Résumer avec l'IA" },
  { type: 3, name: "Expliquer avec l'IA" },
  { type: 3, name: "Remercier l'auteur" },
  { type: 2, name: "Profil FDE" },
];

const res = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APP_ID}/guilds/${GUILD_ID}/commands`, {
  method: "PUT",
  headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}`, "content-type": "application/json" },
  body: JSON.stringify(commands),
});
console.log("Enregistrement des commandes:", res.status);
if (!res.ok) {
  console.log(await res.text());
  process.exit(1);
}
