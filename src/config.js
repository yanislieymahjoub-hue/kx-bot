// Réglages du KX Bot. Tout se modifie ici.

export const GUILD_ID = "1558481384601813183";

export const CHANNELS = {
  annonces: "1558493861309841518",
  veille_ia: "1558493905807212574",
  suggestions: "1558494143863591082",
  staff: "1558494157511725187",
};

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
