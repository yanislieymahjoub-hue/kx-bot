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
| KX Modération | arc-en-ciel | nettoyage, sanctions et journal privé, réservé à la modération | `/moderation` |

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
| `/clear nombre:50` | Gérer les messages | KX Modération: supprime les messages récents non épinglés parmi les 50 derniers (1–100, 100 par défaut), confirmation privée |
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

## Nettoyage d’un salon

`/clear` examine les 100 derniers messages antérieurs à la commande; `/clear nombre:20` en examine 20. Les épinglés, les messages non supprimables et ceux de plus de 14 jours (avec une minute de marge) sont conservés. Un message envoyé après la commande reste en place.

Le membre doit avoir **Gérer les messages** dans le salon, ou **Administrateur**. KX Modération doit avoir **Voir le salon**, **Voir les anciens messages** et **Gérer les messages**. Les permissions effectives du salon sont contrôlées à chaque appel, indépendamment du statut FDE/client.

La commande agit uniquement dans le salon courant et la confirmation est privée. Aucun test ne supprime de messages sur le vrai serveur.

## KX Modération

Les onze commandes sont enregistrées exclusivement sur KX Modération. Elles sont masquées par défaut aux membres sans les permissions nécessaires et refusées côté serveur si ces droits manquent, même lorsqu’un réglage Discord rend la commande visible. Les autres fonctionnalités KX ne sont pas accessibles via ce bot.

| Commande | Permission du membre | Effet |
|---|---|---|
| `/clear nombre:20` | Gérer les messages | Nettoyage du salon courant |
| `/ban membre raison confirmer:Vrai` | Bannir des membres | Bannissement; conserve l’historique des messages |
| `/unban identifiant raison` | Bannir des membres | Retrait du bannissement par identifiant Discord |
| `/kick membre raison confirmer:Vrai` | Expulser des membres | Expulsion |
| `/timeout membre minutes raison` | Modérer les membres | Pause de 1 minute à 28 jours |
| `/untimeout membre raison` | Modérer les membres | Fin de la pause |
| `/warn membre raison` | Modérer les membres | Avertissement privé, sans message automatique ni sanction automatique |
| `/unwarn membre dossier raison` | Modérer les membres | Révocation d’un avertissement, trace conservée |
| `/historique membre` | Modérer les membres | Dix dernières sanctions, auteur, date, raison, état et identifiant |
| `/slowmode secondes raison` | Gérer les salons | Délai entre messages de 0 à 21600 secondes; 0 désactive |
| `/mod-aide` | Gérer les messages | Aide privée |

Chaque sanction nécessite un motif. La hiérarchie est revérifiée auprès de Discord avant l’action: le modérateur doit être au-dessus de la cible (sauf le propriétaire); le bot doit aussi être au-dessus. Le propriétaire, soi-même et les bots sont protégés. Une permission Administrateur ne contourne pas la hiérarchie du modérateur. Les mises en pause ne ciblent pas les administrateurs.

Les sanctions sont journalisées dans la table SQLite `moderation`, avec un identifiant unique par interaction pour éviter de répéter une action. États: `pending` (en cours), `done` (appliquée), `failed` (refusée), `uncertain` (à vérifier), `revoked` (avertissement retiré). Après une réponse réseau perdue, vérifier Discord avant une nouvelle commande. Le journal concerne les sanctions et le mode lent; `/clear` utilise le journal d’audit Discord.

Le jeton dédié `DISCORD_TOKEN_MODERATION` est transmis depuis GitHub à Cloudflare. Aucun recours au jeton administrateur de KX Bot en cas d’erreur. Le script `setup-moderation.mjs` donne au nouveau bot ses permissions précises, sans Administrateur, le place sous les rôles de l’équipe et lui ouvre les salons pour la modération. Il ne change aucune permission des membres. Certains modérateurs peuvent donc devoir recevoir séparément une permission, par exemple Bannir des membres, avant d’utiliser la commande correspondante.

L’avatar arc-en-ciel reprend les quatre prismes du logo KX: `assets/bots/moderation.svg`, rendu dans `public/bots/moderation.png`. Pas d’intent privilégié ni de surveillance permanente des messages.

Pendant une installation incomplète, seul l’ancien `/clear` reste sur KX Bot; aucune commande de sanction ne s’y ajoute. Le déploiement échoue si le jeton de Modération existe mais que le bot n’a pas été invité.

## Secrets (jamais dans le code)
Dans GitHub → Settings → Secrets and variables → Actions:
- `CLOUDFLARE_API_TOKEN`: jeton Cloudflare modèle « Modifier Cloudflare Workers »
- `DISCORD_BOT_TOKEN`: jeton de KX Bot (portail Discord → Bot → Reset Token)
- `DISCORD_TOKEN_IA`, `DISCORD_TOKEN_ACADEMIE`, `DISCORD_TOKEN_MISSIONS`, `DISCORD_TOKEN_ARENE`, `DISCORD_TOKEN_VEILLE`: jetons des autres bots
- `DISCORD_TOKEN_MODERATION`: jeton du bot privé de modération

Chaque push sur `main` redéploie le Worker, transmet les jetons de façon chiffrée et configure chaque bot (`scripts/setup-bots.mjs`).

## Réglages
`src/config.js`: salons, rôles, flux RSS, modèle IA et consignes de l'IA.
`src/guide.js`: textes du guide des commandes et de l'accueil (relancer `/kx-publier` après modification).
`src/publish.js`: `INVITE_ROLES`, les rôles autorisés à inviter.
`assets/`: logo KX (SVG d'origine et PNG 512).
