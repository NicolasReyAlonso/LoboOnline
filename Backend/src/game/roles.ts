import { GameError } from './errors.js';
import { ROLES, SPECIAL_ROLES, type Role, type RoleCounts, type Team } from './types.js';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 20;

export interface RoleInfo {
  name: string;
  team: Team;
  /** Máximo de cartas de este rol en una partida. */
  max: number;
  description: string;
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
    max: 6,
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
};

export function isWolf(role: Role): boolean {
  return ROLE_INFO[role].team === 'wolves';
}

/** Reparto recomendado según el número de jugadores. */
export function defaultRoleCounts(players: number): RoleCounts {
  const counts: RoleCounts = {
    werewolf: players <= 5 ? 1 : players <= 11 ? 2 : players <= 17 ? 3 : 4,
    seer: 1,
  };
  if (players >= 6) counts.witch = 1;
  if (players >= 7) counts.hunter = 1;
  if (players >= 8) counts.cupid = 1;
  if (players >= 10) counts.protector = 1;
  return counts;
}

/** Validación que no depende del número de jugadores (se puede hacer en el lobby). */
export function checkRoleCounts(counts: RoleCounts): void {
  for (const role of SPECIAL_ROLES) {
    const n = counts[role] ?? 0;
    if (!Number.isInteger(n) || n < 0) {
      throw new GameError('invalid_roles', `Cantidad no válida para ${ROLE_INFO[role].name}.`);
    }
    if (n > ROLE_INFO[role].max) {
      throw new GameError('invalid_roles', `Como mucho puede haber ${ROLE_INFO[role].max} de ${ROLE_INFO[role].name}.`);
    }
  }
  if ((counts.werewolf ?? 0) < 1) {
    throw new GameError('invalid_roles', 'Tiene que haber al menos un lobo.');
  }
}

/** Devuelve la lista de cartas (sin barajar) para `players` jugadores. */
export function buildRoleList(players: number, custom: RoleCounts | null): Role[] {
  if (players < MIN_PLAYERS) {
    throw new GameError('not_enough_players', `Hacen falta al menos ${MIN_PLAYERS} jugadores.`);
  }
  if (players > MAX_PLAYERS) {
    throw new GameError('too_many_players', `Como mucho pueden jugar ${MAX_PLAYERS} personas.`);
  }
  const counts = custom ?? defaultRoleCounts(players);
  checkRoleCounts(counts);

  const list: Role[] = [];
  for (const role of SPECIAL_ROLES) {
    for (let i = 0; i < (counts[role] ?? 0); i++) list.push(role);
  }
  if (list.length > players) {
    throw new GameError(
      'invalid_roles',
      `Hay ${list.length} cartas especiales pero solo ${players} jugadores.`,
    );
  }
  const wolves = counts.werewolf ?? 0;
  if (wolves * 2 >= players) {
    throw new GameError('invalid_roles', 'Tiene que haber menos lobos que aldeanos.');
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
