# Présentation obligatoire et premiers modules

Objectif : un nouvel arrivant FDE se présente avant de recevoir Accès B. Les membres déjà admis gardent leur accès. Le parcours entreprise reste séparé. Aucun déploiement ni changement du serveur réel pendant la préparation.

1. Tester les interactions HTTP signées avec le Worker réel, une base SQLite locale et une API Discord simulée à la frontière réseau.
2. Remplacer l'accès direct par un formulaire explicite de publication. Vérifier les champs côté serveur, publier avant d'accorder le rôle, conserver l'identifiant du message pour reprendre après une erreur. Sérialiser les soumissions d'un membre et refuser les conflits client/FDE.
3. Fermer les voies secondaires : anciennes candidatures, rôles en libre-service hors liste et migration qui accorde automatiquement l'accès aux nouveaux membres.
4. Ajouter `/formation` : catalogue de modules intermédiaires autonomes, leçons paginées, cas pratique, exercice et critères de correction. Lecture privée, aucun badge automatique.
5. Mettre à jour les guides et ajouter les tests au contrôle avant déploiement. Exécuter tests, vérification syntaxique et revue du diff.
6. Livrer un audit distinguant observations UI, constats du dépôt et éléments du compte rendu de Claude restant à vérifier. Archiver les skills documentaires récupérés avec leurs limites.

Limites : la complétude du formulaire est vérifiable automatiquement ; la qualité réelle de la présentation exige une modération humaine. Les permissions Discord et la hiérarchie des rôles doivent être vérifiées sur un compte test avant mise en production. Les membres déjà présents ne sont pas rétroactivement bloqués.
