# KX Bot

Bot Discord du serveur KX Automatisation, hébergé sur Cloudflare Workers (gratuit, 24h/24).

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

Tâches automatiques: veille IA toutes les heures dans #veille-ia, défi IA chaque lundi à 9h dans #défi-de-la-semaine.

## Secrets (jamais dans le code)
Dans GitHub → Settings → Secrets and variables → Actions:
- `CLOUDFLARE_API_TOKEN`: jeton Cloudflare modèle « Modifier Cloudflare Workers »
- `DISCORD_BOT_TOKEN`: jeton du bot (portail Discord → Bot → Reset Token)

Chaque push sur `main` redéploie le bot, transmet le jeton au Worker de façon chiffrée et met à jour les commandes.

## Réglages
`src/config.js`: salons, rôles, flux RSS, modèle IA et consignes de l'IA.
