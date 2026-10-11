// Réglages du K’X Bot. Tout se modifie ici.

export const GUILD_ID = "1558481384601813183";

// Adresse publique du Worker (sert aussi les bannières et logos du dossier public/)
export const ASSETS_URL = "https://kx-bot.yanis-lieymahjoub.workers.dev";

export const CHANNELS = {
  annonces: "1558493861309841518",
  veille_ia: "1558493905807212574",
  suggestions: "1558494143863591082",
  staff: "1558494157511725187",
  parcours: "1558524341832917012",
  defi: "1558524903198691449",
  rendus: "1558525018294591489",
  certifications: "1558524921661890581",
  missions: "1558525306061594634",
  entre_fde: "1558525324420190250",
  bienvenue: "1558493691545522186",
  reglement: "1558493847183687770",
  presente_toi: "1558493875797229608",
  discussion: "1558493890363916369",
  vos_creations: "1558493976804466718",
  detente: "1558493991337721886",
  questions: "1558494464081793106",
  no_code: "1558494006026182736",
  code: "1558494020164911214",
  idees: "1558494034530533396",
  realisations: "1558494099697573959",
  ateliers: "1558494114247614534",
  travailler: "1558494129779114107",
};

// Sujets affichés en haut de chaque salon (appliqués par /kx-setup)
export const TOPICS = {
  bienvenue: "Bienvenue chez K’X. Commence ici, puis choisis tes notifications.",
  reglement: "Les règles du serveur, à lire avant tout.",
  annonces: "Les nouvelles de K’X et de la communauté.",
  presente_toi: "Dis-nous qui tu es et ce que tu automatises.",
  discussion: "Discussion libre entre membres. /ia pour poser une question à l'IA.",
  veille_ia: "Actus IA et automatisation, publiées automatiquement chaque heure.",
  vos_creations: "Montre ce que tu construis, workflows, agents, scripts. Fil « build in public » chaque lundi.",
  detente: "Hors sujet, memes et pause café.",
  no_code: "n8n, Make, Zapier, entraide et astuces.",
  code: "Python, JavaScript, API et scripts.",
  idees: "Des idées de process à automatiser.",
  realisations: "Automatisations livrées par K’X, présentées de façon anonymisée.",
  ateliers: "Dates des ateliers et lives. Prends le rôle Notif lives pour être prévenu.",
  travailler: "Faire automatiser ton entreprise par K’X, /contact ou /rdv.",
  suggestions: "Propose une idée avec /suggestion, la communauté vote.",
  parcours: "Le parcours FDE (Forward Deployed Engineer, l'ingénieur qui déploie l'IA chez le client). Apprenti, En formation, FDE Certifié. /candidature pour commencer.",
  defi: "Un défi d'automatisation chaque lundi à 9h. Rendus dans le forum des rendus.",
  certifications: "Les nouveaux FDE certifiés de la communauté.",
  missions: "Missions clients réservées aux FDE certifiés. Clique « Je suis intéressé ».",
  entre_fde: "Espace d'échange des FDE certifiés.",
  staff: "Espace équipe, candidatures, contacts et alertes du bot.",
};

// Limite d'utilisation de l'IA par membre et par jour (l'équipe n'a pas de limite)
export const AI_DAILY_LIMIT = 30;

// Parcours FDE: un seul de ces rôles à la fois (du plus bas au plus haut)
export const LADDER = [
  { key: "apprenti", role: "Apprenti", label: "Apprenti", emoji: "🌱" },
  { key: "formation", role: "En formation", label: "En formation", emoji: "🛠️" },
  { key: "fde", role: "FDE Certifié", label: "FDE Certifié", emoji: "🏅" },
];
// Rôle cumulable donné à ceux qui accompagnent les apprentis
export const MENTOR_ROLE = "Mentor";

// Rôles que les membres prennent eux-mêmes avec les boutons de /kx-roles
export const SELF_ROLES = [
  ["Notif lives", "🎓"],
  ["Notif annonces", "📢"],
];

export const RDV_URL = "https://kxautomatisation.fr";

// Veille IA: flux RSS publiés toutes les heures dans #veille-ia
export const RSS_FEEDS = [
  "https://www.actuia.com/feed/",
  "https://huggingface.co/blog/feed.xml",
  "https://openai.com/news/rss.xml",
];

// Modèle IA Cloudflare Workers AI (Qwen 3)
export const AI_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";

export const AI_SYSTEM = `Tu es l'assistant du serveur Discord de K’X Automatisation, une entreprise française qui automatise les tâches répétitives des entreprises (n8n, Make, Python, Excel/VBA, agents IA).
Réponds en français, en tutoyant, de façon claire, courte et concrète (10 lignes maximum). Donne des étapes quand c'est utile.
Si la question demande une prestation sur mesure, propose la commande /contact ou /rdv.
Ne promets jamais de prix ni de délai. Si tu ne sais pas, dis-le.
Ne demande jamais de mot de passe, de clé API ou de données client.`;

// Consigne pour le défi automatique du lundi
export const DEFI_PROMPT = `Invente un défi d'automatisation hebdomadaire pour une communauté francophone de FDE (ingénieurs qui déploient des automatisations et agents IA chez des clients).
Le défi doit être réaliste, tiré d'un vrai métier (BTP, RH, compta, commerce, logistique...), faisable en 2 à 4 heures avec n8n, Make, Python ou un agent IA.
Format exact, en français, sans introduction:
**Contexte**: 2 phrases sur l'entreprise et son problème
**Objectif**: ce que l'automatisation doit faire
**Contraintes**: 3 puces
**Bonus**: 1 idée pour aller plus loin
**Livrable**: ce qu'il faut poster dans le forum des rendus`;
