import { Game } from '../src/game/Game.js';
import { DEFAULT_SETTINGS } from '../src/game/settings.js';
import type { GameSettings, Phase, Role } from '../src/game/types.js';

/**
 * Crea una partida con roles fijos: el jugador `pN` tiene el rol `roles[N]`.
 * `rng` devuelve siempre 0 (desempates y pasos fantasma deterministas).
 */
export function setupGame(roles: Role[], overrides: Partial<GameSettings> = {}) {
  let now = 1_000_000;
  const game = new Game(
    roles.map((role, i) => ({ id: `p${i}`, name: `Jugador ${i}`, role })),
    { ...DEFAULT_SETTINGS, ...overrides },
    { rng: () => 0, now: () => now },
  );
  game.start();
  return {
    game,
    now: () => now,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

/** Avanza por timeout hasta llegar a `phase` (con un límite para no colgar los tests). */
export function skipTo(game: Game, phase: Phase): void {
  for (let i = 0; i < 50 && game.phase !== phase; i++) game.timeout();
  if (game.phase !== phase) throw new Error(`No se llegó a la fase ${phase} (estamos en ${game.phase})`);
}

/** Todos los vivos votan en blanco: nadie es linchado y se pasa a la siguiente noche. */
export function passDay(game: Game, alive: string[]): void {
  skipTo(game, 'day_vote');
  for (const id of alive) game.act(id, { type: 'vote', target: null });
  skipTo(game, 'night_wolves');
}
