# Actualités publiques Implementation Plan

> **For execution:** Implement this plan task-by-task in the authorized session and method.

**Goal:** Publier l’actualité IA et tech dans un nouveau salon public en lecture seule, avec alertes volontaires.

**Architecture:** Étendre le Worker et les bots existants. Le cron utilise K’X Veille (K’X Bot en secours), un registre SQLite empêche les doublons, K’X Bot gère le rôle volontaire sans nouveaux secrets.

**Tech Stack:** JavaScript, Cloudflare Worker/Durable Object SQLite, Discord API v10, RSS/Atom.

**Spec:** Demande de Yanis dans cette conversation du 14 octobre 2026 : réutiliser les bots, salon Actualité public, liens et boutons de notification.

## Global Constraints
- Aucun nouveau bot ni jeton, aucune modification des salons privés existants.
- Salon `📰・actualité`, rôle `Alertes IA & Tech` sans permissions, aucune mention everyone.
- Vérification horaire, maximum trois articles récents par passage, pas de déversement d’archives au lancement.
- Les nouveaux membres et les clients peuvent lire et utiliser les boutons sans accéder aux espaces FDE.

## Review Focus
- Deux passages simultanés ne doivent pas publier le même article.
- Une réponse Discord refusée doit permettre une nouvelle tentative ; une livraison incertaine ne doit pas provoquer une répétition automatique.
- Une source indisponible ne doit pas empêcher les autres de publier.
- Un lien invalide, une date future et du HTML ne doivent pas produire de carte invalide ou de mention inattendue.
- Le cloisonnement FDE ne doit pas rendre le nouveau salon privé.

### Task 1: Flux et publication
**Files:** `src/news.js`, `src/store.js`, `src/config.js`, `test/news.test.js`.
**Interfaces:** `parseFeed(xml, source)`, `latestNews(n, now)`, `runNews(env, helpers, {now})`, opérations `newsClaim`, `newsComplete`, `newsInitialize`, `newsStatus`.
- [ ] Tests : RSS/Atom, données invalides, arrêt des archives, dédoublonnage concurrent, reprise après refus et mention limitée au rôle.
- [ ] Exécuter les tests en échec, implémenter, puis vérifier leur réussite.

### Task 2: Salon et boutons
**Files:** `scripts/setup-news.mjs`, `src/news.js`, `src/index.js`, `scripts/commands.mjs`, `src/bots.js`, `src/espaces.js`, `test/news-setup.test.js`.
**Interfaces:** `setupNews(api)`, `handleNewsComponent(interaction, env, ctx, helpers)` ; commande admin `/actualites` pour déclencher et vérifier.
- [ ] Tests : création idempotente, droits en lecture seule, rôle sans pouvoir supplémentaire, abonnement/désabonnement, réponse privée et échecs API.
- [ ] Exécuter les tests en échec, implémenter, vérifier.

### Task 3: Mise en service
**Files:** `.github/workflows/deploy.yml`, `README.md`.
- [ ] Brancher le setup après le déploiement et remplacer l’ancien cron de veille.
- [ ] Exécuter `node --test` et `git diff --check`, relire les changements.
- [ ] Pousser le code, vérifier GitHub Actions, le salon réel, la première publication et les boutons.
