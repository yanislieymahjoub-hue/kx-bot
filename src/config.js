// Réglages du KX Bot. Tout se modifie ici.

export const GUILD_ID = "1558481384601813183";

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
};

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

export const AI_SYSTEM = `Tu es l'assistant du serveur Discord de KX Automatisation, une entreprise française qui automatise les tâches répétitives des entreprises (n8n, Make, Python, Excel/VBA, agents IA).
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
