// Définition de toutes les commandes. Chaque commande est enregistrée sur le bot qui la porte (voir src/bots.js).
const MANAGE_MESSAGES = String(0x2000);
const MANAGE_ROLES = String(0x10000000);

export const COMMANDS = [
  { name: 'clear', description: 'Supprimer les derniers messages du salon (100 par défaut, épinglés conservés)', default_member_permissions: MANAGE_MESSAGES, dm_permission: false,
    options: [{ type: 4, name: 'nombre', description: 'Nombre de messages à examiner (1 à 100, récents et non épinglés)', required: false, min_value: 1, max_value: 100 }] },
  { name: 'presentation', description: 'Te présenter pour ouvrir ton accès à la communauté FDE' },
  { name: 'formation', description: 'Approfondir tes bases avec un module et un exercice', options: [{ type: 3, name: 'module', description: 'Choisis un module (facultatif)', choices: [
    { name: 'API et webhooks fiables', value: 'api' }, { name: 'Workflows n8n / Make robustes', value: 'workflows' },
    { name: 'Données en Python / JavaScript', value: 'scripts' }, { name: 'Agents IA et évaluation', value: 'agents' },
    { name: 'Excel / Power Query', value: 'excel' }, { name: 'Livrer en production', value: 'production' },
  ] }] },
  { name: "kx", description: "Présentation de K’X Automatisation" },
  { name: "rdv", description: "Prendre rendez-vous avec K’X" },
  { name: "contact", description: "Décrire ton besoin à l'équipe K’X" },
  {
    name: "ia", description: "Poser une question à l'IA de K’X",
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
      { type: 5, name: "ping", description: "Prévenir le rôle Notif annonces (espace FDE)", required: false },
      { type: 3, name: "public", description: "Espace concerné (FDE par défaut)", required: false, choices: [
        { name: "Espace FDE", value: "fde" }, { name: "Clients (une copie dans chaque dossier)", value: "clients" }, { name: "Les deux, copies séparées", value: "tous" },
      ] },
    ],
  },
  { name: "kx-roles", description: "(Équipe) Poster le panneau de rôles", default_member_permissions: MANAGE_MESSAGES },
  { name: "aide", description: "Toutes les commandes du K’X Bot" },
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
  {
    name: "badge", description: "(Équipe) Donner ou retirer un badge (Expert Cyber, Expert Réseau...)", default_member_permissions: MANAGE_ROLES,
    options: [
      { type: 6, name: "membre", description: "Membre", required: true },
      { type: 3, name: "badge", description: "Badge", required: true, choices: [
        "Expert Cyber", "Expert Réseau", "Expert IA", "Expert No-code", "Expert Dev", "Expert Data", "Champion du défi", "Bêta-testeur", "Pionnier",
      ].map((n) => ({ name: n, value: n })) },
      { type: 5, name: "retirer", description: "Retirer le badge au lieu de le donner", required: false },
    ],
  },

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
    name: "ticket", description: "Ouvrir un fil privé avec l'équipe K’X",
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
  { name: "stats", description: "La communauté K’X en chiffres" },
  { name: "inviter", description: "Ton lien d'invitation personnel, +20 points par personne qui arrive (5 par semaine)" },
  { name: "veille", description: "Les dernières actus IA (visible par toi seul)" },
  { name: "kx-setup", description: "(Admin) Configurer salons, forums, support, accueil", default_member_permissions: "8" },
  { name: "kx-publier", description: "(Admin) Logo, mode d'emploi d'accueil, guide des commandes, invitations", default_member_permissions: "8" },

  // Cloisonnement Clients / FDE
  {
    name: "kx-espaces", description: "(Admin) Cloisonnement Clients / FDE, plan, application ou retour arrière", default_member_permissions: "8",
    options: [{ type: 3, name: "mode", description: "Action", required: true, choices: [
      { name: "Voir le plan", value: "plan" }, { name: "Appliquer (avec sauvegarde)", value: "appliquer" }, { name: "Restaurer la sauvegarde", value: "restaurer" },
    ] }],
  },
  {
    name: "kx-statut", description: "(Coordination) Fixer le statut privé d'un membre, après arbitrage", default_member_permissions: MANAGE_ROLES,
    options: [
      { type: 6, name: "membre", description: "Membre", required: true },
      { type: 3, name: "statut", description: "Statut", required: true, choices: [
        { name: "FDE", value: "fde" }, { name: "Client", value: "client" }, { name: "Aucun (accueil seulement)", value: "aucun" },
      ] },
    ],
  },

  // Présentation de chaque bot et de ses commandes cliquables
  { name: "kx-bot", description: "K’X Bot se présente, avec toutes ses commandes" },
  { name: "kx-ia", description: "K’X IA se présente, avec toutes ses commandes" },
  { name: "kx-academie", description: "K’X Académie se présente, avec toutes ses commandes" },
  { name: "kx-missions", description: "K’X Missions se présente, avec toutes ses commandes" },
  { name: "kx-arene", description: "K’X Arène se présente, avec toutes ses commandes" },
  { name: "kx-veille", description: "K’X Veille se présente, avec toutes ses commandes" },

  // Menus clic droit (Applications)
  { type: 3, name: "Résumer avec l'IA" },
  { type: 3, name: "Expliquer avec l'IA" },
  { type: 3, name: "Remercier l'auteur" },
  { type: 2, name: "Profil FDE" },
];

