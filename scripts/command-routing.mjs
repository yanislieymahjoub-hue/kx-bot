import { BOTS } from '../src/bots.js';

export function commandOwner(name, ready) {
  const entry = Object.entries(BOTS).find(([, bot]) => bot.commands.includes(name));
  if (!entry) return 'kx';
  const [key, bot] = entry;
  if (ready[key]) return key;
  // Maintient seulement l'ancien /clear pendant l'installation du nouveau bot.
  // Aucune sanction n'est publiée sur un bot différent de Modération.
  return bot.dedicated && name !== 'clear' ? null : 'kx';
}
