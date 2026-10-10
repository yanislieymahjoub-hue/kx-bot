# Bots KX

L'équipe de bots Discord du serveur KX Automatisation, hébergée sur un seul Cloudflare Worker (gratuit, 24h/24).

| Bot | Couleur | Rôle | Adresse des interactions |
|---|---|---|---|
| KX Bot | violet | accueil, contact, tickets, réglages | `/` |
| KX IA | cyan | questions, résumés, relectures, pitchs | `/ia` |
| KX Académie | or | parcours FDE, défis, ateliers | `/academie` |
| KX Missions | vert | missions clients des FDE certifiés | `/missions` |
| KX Arène | rouge | points, quiz, classement, stats | `/arene` |
| KX Veille | rose | actu IA chaque heure | `/veille` |

Ajouter un bot: le créer sur le portail Discord, l'ajouter dans `src/bots.js` (identifiant, clé publique, commandes, salons), coller son jeton dans le secret GitHub `DISCORD_TOKEN_<CLÉ>`, pousser. Le déploiement règle son logo, sa description, son adresse et ses commandes, et affiche le lien d'invitation. Tant qu'il n'est pas sur le serveur, ses commandes restent sur KX Bot.

Animations: les bannières GIF sont rendues depuis `design/*.html` avec `node design/render.mjs design/hero.html public/banners/bienvenue.gif 10.5 12 800 0` (Chromium + ffmpeg), puis servies par le Worker depuis `public/`.

## Commandes
| Commande | Pour qui | Effet |
|---|---|---|
| `/ia question` | tous | Réponse de l'IA KX (Qwen 3 via Workers AI) |
| `/resume` | tous | Résumé IA des derniers messages du salon, visible par soi seul |
| `/kx` | tous | Présentation de KX |
| `/rdv` | tous | Lien de prise de rendez-vous |
| `/contact` | tous | Formulaire envoyé dans #staff (et dans la CT si `CT_WEBHOOK_URL` est rempli) |
| `/suggestion idee` | tous | Sondage Pour/Contre dans #suggestions |
| `/annonce` | équipe | Annonce mise en forme dans #annonces |
| `/kx-roles` | équipe | Panneau de boutons Notif lives / Notif annonces |
| `/aide` | tous | Liste des commandes |
| `/candidature` | tous | Candidature au parcours FDE, passe Apprenti, arrive dans #staff avec boutons Valider / Certifier / Refuser |
| `/profil` | tous | Niveau FDE d'un membre |
| `/niveau` | équipe | Apprenti, En formation, FDE Certifié ou Mentor (MP + annonce dans #certifications) |
| `/mission` | équipe | Publie une mission dans #missions (privé FDE) avec bouton « Je suis intéressé » |
| `/defi` | équipe | Défi d'automatisation généré par l'IA dans #défi-de-la-semaine |
| `/merci` | tous | +10 points au membre remercié (1 fois par jour et par personne) |
| `/classement` | tous | Top 10 de la semaine ou général |
| `/points` | équipe | Donner ou retirer des points |
| `/quiz` | tous | Question FDE générée par l'IA, +5 points si bonne réponse |
| `/review` | tous | Relecture IA d'un workflow ou d'un code (privé) |
| `/pitch` | tous | Pitch client, message LinkedIn et objections (privé) |
| `/roi` | tous | Temps et argent gagnés par une automatisation |
| `/ticket` | tous | Fil privé avec l'équipe (aussi via le bouton dans #support) |
| `/atelier` | équipe | Événement Discord + annonce avec ping Notif lives |
| `/stats` | tous | Membres, niveaux FDE, points, quiz |
| `/kx-setup` | admin | Sujets des salons, tags des forums, salon support, écran d'accueil, accueil guidé |
| `/kx-publier` | admin | Logo KX, accueil animé dans #bienvenue, guide des commandes, droits des bots dans leurs salons, invitations réservées à Fondateur, Équipe KX et Mentor |
| `/veille` | tous | Les dernières actus IA |
| Clic droit message | tous | Résumer avec l'IA, Expliquer avec l'IA, Remercier l'auteur |
| Clic droit membre | tous | Profil FDE |

Tâches automatiques: veille IA toutes les heures, défi IA + fil « build in public » chaque lundi à 9h, top contributeurs chaque dimanche à 18h.

Mémoire (points, quiz, quotas IA): Durable Object SQLite `KXStore`, gratuit.

## Secrets (jamais dans le code)
Dans GitHub → Settings → Secrets and variables → Actions:
- `CLOUDFLARE_API_TOKEN`: jeton Cloudflare modèle « Modifier Cloudflare Workers »
- `DISCORD_BOT_TOKEN`: jeton de KX Bot (portail Discord → Bot → Reset Token)
- `DISCORD_TOKEN_IA`, `DISCORD_TOKEN_ACADEMIE`, `DISCORD_TOKEN_MISSIONS`, `DISCORD_TOKEN_ARENE`, `DISCORD_TOKEN_VEILLE`: jetons des autres bots

Chaque push sur `main` redéploie le Worker, transmet les jetons de façon chiffrée et configure chaque bot (`scripts/setup-bots.mjs`).

## Réglages
`src/config.js`: salons, rôles, flux RSS, modèle IA et consignes de l'IA.
`src/guide.js`: textes du guide des commandes et de l'accueil (relancer `/kx-publier` après modification).
`src/publish.js`: `INVITE_ROLES`, les rôles autorisés à inviter.
`assets/`: logo KX (SVG d'origine et PNG 512).
