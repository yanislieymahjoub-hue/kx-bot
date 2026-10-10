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
