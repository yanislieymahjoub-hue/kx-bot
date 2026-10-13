# KX Modération

**Goal:** créer un bot dédié aux modérateurs, déplacer `/clear` et ajouter les sanctions utiles avec une PP arc-en-ciel dérivée du logo KX.

**Architecture:** nouvelle application Discord `/moderation` sur le Worker existant. Jeton propre, sans repli sur KX Bot. Les permissions Discord, l’identité du bot et la hiérarchie de l’auteur et de la cible sont contrôlées. Les sanctions sont gardées dans SQLite avec un identifiant d’interaction unique.

**Tech Stack:** JavaScript, Discord REST v10, Cloudflare Worker et Durable Object SQLite, node:test.

**Spec:** demandes de Yanis dans cette conversation: bot réservé à la modération, clear, ban et outils utiles; reprendre la PP KX en arc-en-ciel.

## Livraison

- [x] Préparer les tests de permissions, hiérarchie, confirmation, jeton dédié et journalisation; vérifier leurs échecs avant implémentation.
- [x] Créer les gestionnaires et les définitions de commandes: clear, ban, unban, kick, timeout, untimeout, warn, unwarn, historique, slowmode, mod-aide.
- [x] Préparer le routage exclusif des commandes et le déploiement avec le secret dédié, l’avatar et les droits du bot.
- [x] Vérifier l’enregistrement du secret fourni par Yanis, sans lire sa valeur.
- [x] Reprendre les quatre prismes du SVG KX et produire l’avatar PNG arc-en-ciel.
- [ ] Vérification complète, installation sur Discord, push et contrôle du déploiement réel.

## Points de contrôle

Les permissions des membres ne sont pas modifiées. Une commande masquée est aussi contrôlée côté serveur. Pas de surveillance automatique, pas de sanction réelle pendant les tests. Les erreurs réseau sont signalées comme incertaines. Les rôles égaux/supérieurs, le propriétaire et les bots sont protégés. Chaque sanction demande un motif; ban et kick demandent une confirmation explicite dans la commande.
