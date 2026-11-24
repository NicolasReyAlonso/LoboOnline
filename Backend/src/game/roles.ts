import { GameError } from './errors.js';
import { POWER_ROLES, ROLES, type Composition, type Role, type RoleCounts, type Season, type Team } from './types.js';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 20;
export const MAX_WOLVES = 6;

export interface RoleInfo {
  name: string;
  team: Team;
  /** Máximo de cartas de este rol en una partida. */
  max: number;
  description: string;
  /** Plural, si no basta con añadir una "s" (de momento solo se usa el de los aldeanos). */
  plural?: string;
  /** Si solo existe durante una temporada. */
  season?: Season;
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  villager: {
    name: 'Aldeano',
    team: 'village',
    max: MAX_PLAYERS,
    description: 'No tiene poderes. Su arma es la palabra: debe descubrir a los lobos y votar para eliminarlos.',
  },
  werewolf: {
    name: 'Lobo',
    team: 'wolves',
    max: MAX_WOLVES,
    description: 'Cada noche, junto a los demás lobos, elige a quién devorar. De día se hace pasar por un aldeano más.',
  },
  seer: {
    name: 'Vidente',
    team: 'village',
    max: 1,
    description: 'Cada noche puede mirar la carta de un jugador y descubrir su rol.',
  },
  witch: {
    name: 'Bruja',
    team: 'village',
    max: 1,
    description:
      'Tiene dos pociones de un solo uso: una de vida, para salvar a la víctima de los lobos, y otra de muerte, para eliminar a quien quiera.',
  },
  hunter: {
    name: 'Cazador',
    team: 'village',
    max: 1,
    description: 'Cuando muere, dispara su último cartucho y se lleva a otro jugador con él.',
  },
  cupid: {
    name: 'Cupido',
    team: 'village',
    max: 1,
    description:
      'La primera noche enamora a dos jugadores. Si uno muere, el otro muere de pena. Si son de bandos distintos, ganan solos si son los últimos supervivientes.',
  },
  protector: {
    name: 'Protector',
    team: 'village',
    max: 1,
    description:
      'Cada noche protege a un jugador del ataque de los lobos. No puede proteger a la misma persona dos noches seguidas.',
  },
  santa: {
    name: 'Santa Claus',
    team: 'village',
    max: 1,
    season: 'christmas',
    description:
      'Cada noche le llega un regalo: la carta de un jugador vivo al azar. Le puede tocar varias veces la misma persona.',
  },
};

export function isWolf(role: Role): boolean {
  return ROLE_INFO[role].team === 'wolves';
}

/** Si el personaje se puede repartir en esta temporada (`null` = fuera de temporada). */
export function isRoleAvailable(role: Role, season: Season | null): boolean {
  const only = ROLE_INFO[role].season;
  return only === undefined || only === season;
}

/** Personajes con poderes recomendados según el número de jugadores. */
export function defaultPowers(players: number, season: Season | null = null): RoleCounts {
  const counts: RoleCounts = { seer: 1 };
  if (players >= 5 && season === 'christmas') counts.santa = 1;
  if (players >= 6) counts.witch = 1;
  if (players >= 7) counts.hunter = 1;
  if (players >= 8) counts.cupid = 1;
  if (players >= 10) counts.protector = 1;
  return counts;
}

/** Validación que no depende del número de jugadores (se puede hacer en el lobby). */
export function checkRoleCounts(counts: RoleCounts): void {
  for (const role of POWER_ROLES) {
    const n = counts[role] ?? 0;
    if (!Number.isInteger(n) || n < 0) {
      throw new GameError('invalid_roles', `Cantidad no válida para ${ROLE_INFO[role].name}.`);
    }
    if (n > ROLE_INFO[role].max) {
      throw new GameError('invalid_roles', `Como mucho puede haber ${ROLE_INFO[role].max} de ${ROLE_INFO[role].name}.`);
    }
  }
}

export function checkMaxWolves(maxWolves: number): void {
  if (!Number.isInteger(maxWolves) || maxWolves < 1 || maxWolves > MAX_WOLVES) {
    throw new GameError('invalid_settings', `El máximo de lobos tiene que estar entre 1 y ${MAX_WOLVES}.`);
  }
}

/**
 * Qué se puede repartir con `players` jugadores. Lanza `GameError` si no es
 * posible. El máximo de lobos se recorta para que:
 * - haya siempre menos lobos que no-lobos, y
 * - quepan todos los personajes con poderes.
 *
 * Los personajes de otra temporada se quitan sin avisar: si el anfitrión eligió
 * a Santa Claus y la Navidad acaba antes de empezar, simplemente no sale.
 */
export function planComposition(
  players: number,
  roles: RoleCounts | null,
  maxWolves: number,
  season: Season | null = null,
): Composition {
  if (players < MIN_PLAYERS) {
    throw new GameError('not_enough_players', `Hacen falta al menos ${MIN_PLAYERS} jugadores.`);
  }
  if (players > MAX_PLAYERS) {
    throw new GameError('too_many_players', `Como mucho pueden jugar ${MAX_PLAYERS} personas.`);
  }
  checkMaxWolves(maxWolves);
  const chosen = roles ?? defaultPowers(players, season);
  checkRoleCounts(chosen);
  const powers: RoleCounts = {};
  for (const role of POWER_ROLES) {
    if (chosen[role] && isRoleAvailable(role, season)) powers[role] = chosen[role];
  }

  const powerCount = POWER_ROLES.reduce((sum, r) => sum + (powers[r] ?? 0), 0);
  if (powerCount + 1 > players) {
    throw new GameError(
      'invalid_roles',
      `Hay ${powerCount} personajes con poderes y solo ${players} jugadores: tiene que quedar sitio para al menos un lobo.`,
    );
  }
  const max = Math.min(maxWolves, Math.floor((players - 1) / 2), players - powerCount);
  return { powers: { ...powers }, wolves: { min: 1, max } };
}

/** Sortea el número de lobos dentro de lo permitido y devuelve las cartas (sin barajar). */
export function dealRoles(players: number, composition: Composition, rng: () => number = Math.random): Role[] {
  const { min, max } = composition.wolves;
  const wolves = min + Math.min(max - min, Math.floor(rng() * (max - min + 1)));
  const list: Role[] = [];
  for (let i = 0; i < wolves; i++) list.push('werewolf');
  for (const role of POWER_ROLES) {
    for (let i = 0; i < (composition.powers[role] ?? 0); i++) list.push(role);
  }
  while (list.length < players) list.push('villager');
  return list;
}

export function countRoles(roles: Iterable<Role>): Record<Role, number> {
  const out = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
  for (const r of roles) out[r]++;
  return out;
}

/** Fisher-Yates. No modifica el array original. */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
