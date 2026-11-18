import { GameError } from './errors.js';
import { checkRoleCounts } from './roles.js';
import type { Durations, GameSettings } from './types.js';

export const DEFAULT_SETTINGS: GameSettings = {
  roles: null,
  revealRoleOnDeath: true,
  deadSeeEverything: true,
  durations: {
    nightAction: 30,
    wolves: 60,
    announcement: 8,
    hunter: 30,
    discussion: 180,
    vote: 60,
    phantomMin: 5,
    phantomMax: 15,
  },
};

/** Límites [mín, máx] en segundos para cada duración. */
export const DURATION_LIMITS: Record<keyof Durations, readonly [number, number]> = {
  nightAction: [5, 300],
  wolves: [5, 300],
  announcement: [1, 60],
  hunter: [5, 120],
  discussion: [10, 1800],
  vote: [10, 600],
  phantomMin: [1, 120],
  phantomMax: [1, 120],
};

export function validateSettings(settings: GameSettings): void {
  for (const [key, [min, max]] of Object.entries(DURATION_LIMITS) as [keyof Durations, readonly [number, number]][]) {
    const value = settings.durations[key];
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new GameError('invalid_settings', `La duración "${key}" debe estar entre ${min} y ${max} segundos.`);
    }
  }
  if (settings.durations.phantomMin > settings.durations.phantomMax) {
    throw new GameError('invalid_settings', 'phantomMin no puede ser mayor que phantomMax.');
  }
  if (settings.roles) checkRoleCounts(settings.roles);
}
