import { Game, type GameOptions } from './Game.js';
import { dealRoles, planComposition, shuffle } from './roles.js';
import { validateSettings } from './settings.js';
import type { GameSettings } from './types.js';

/**
 * Sortea cuántos lobos hay, reparte los roles al azar y arranca la partida
 * (empieza la primera noche).
 */
export function createGame(
  players: { id: string; name: string }[],
  settings: GameSettings,
  options: GameOptions = {},
): Game {
  validateSettings(settings);
  const composition = planComposition(players.length, settings.roles, settings.maxWolves);
  const roles = shuffle(dealRoles(players.length, composition, options.rng), options.rng);
  const game = new Game(
    players.map((p, i) => ({ id: p.id, name: p.name, role: roles[i] ?? 'villager' })),
    settings,
    { ...options, composition },
  );
  game.start();
  return game;
}
