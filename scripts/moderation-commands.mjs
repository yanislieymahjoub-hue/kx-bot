import { MOD_PERMISSIONS } from '../src/moderation-policy.js';
const member = { type: 6, name: 'membre', description: 'Membre concerné', required: true };
const reason = { type: 3, name: 'raison', description: 'Motif conservé dans le journal privé', required: true, min_length: 1, max_length: 300 };
const confirm = { type: 5, name: 'confirmer', description: 'Choisir Vrai pour confirmer cette sanction', required: true };
const definitions = [
  ['ban', 'Bannir un membre du serveur', [member, reason, confirm]],
  ['unban', 'Lever un bannissement', [{ type: 3, name: 'identifiant', description: 'Identifiant Discord du compte banni', required: true, min_length: 17, max_length: 20 }, reason]],
  ['kick', 'Expulser un membre du serveur', [member, reason, confirm]],
  ['timeout', 'Mettre un membre en pause temporaire', [member, { type: 4, name: 'minutes', description: 'Durée en minutes, de 1 à 40320 (28 jours)', required: true, min_value: 1, max_value: 40320 }, reason]],
  ['untimeout', 'Lever la pause temporaire d’un membre', [member, reason]],
  ['warn', 'Enregistrer un avertissement dans le journal privé', [member, reason]],
  ['unwarn', 'Révoquer un avertissement sans effacer sa trace', [member, { type: 3, name: 'dossier', description: 'Identifiant de l’avertissement indiqué dans /historique', required: true, max_length: 20 }, reason]],
  ['historique', 'Voir les dix dernières sanctions d’un membre en privé', [member]],
  ['slowmode', 'Régler le mode lent du salon courant', [{ type: 4, name: 'secondes', description: 'Délai entre messages: 0 pour désactiver, maximum 21600', required: true, min_value: 0, max_value: 21600 }, reason]],
  ['mod-aide', 'Afficher les commandes réservées à la modération', []],
];
export const MODERATION_COMMANDS = definitions.map(([name, description, options]) => ({ name, description, options, default_member_permissions: String(MOD_PERMISSIONS[name]), dm_permission: false }));
