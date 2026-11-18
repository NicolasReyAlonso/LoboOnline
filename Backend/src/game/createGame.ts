import { Game, type GameOptions } from './Game.js';
import { buildRoleList, shuffle } from './roles.js';
import { validateSettings } from './settings.js';
import type { GameSettings } from './types.js';

/** Reparte los roles al azar y arranca la partida (empieza la primera noche). */
export function createGame(
  players: { id: string; name: string }[],
  settings: GameSettings,
  options: GameOptions = {},
): Game {
  validateSettings(settings);
  const roles = shuffle(buildRoleList(players.length, settings.roles), options.rng);
  const game = new Game(
    players.map((p, i) => ({ id: p.id, name: p.name, role: roles[i] ?? 'villager' })),
    settings,
    options,
  );
  game.start();
  return game;
}
