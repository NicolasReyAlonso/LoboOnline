import { isRoleAvailable, isWolf } from '@lobo/game/roles';
import { roleInfo } from '@lobo/game/seasons';
import {
  POWER_ROLES,
  type Composition,
  type PowerRole,
  type Role,
  type Season,
  type WinningSide,
} from '@lobo/game/types';
import { activeSeason } from './season';

/*
 * Nombres y descripciones vienen del backend (ROLE_INFO y los disfraces de
 * cada temporada en seasons.ts), para que no se desincronicen. Todas las
 * funciones usan la temporada activa salvo que se les pase otra.
 */

const ICON: Record<Role, string> = {
  villager: '🧑‍🌾',
  werewolf: '🐺',
  seer: '🔮',
  witch: '🧪',
  hunter: '🏹',
  cupid: '💘',
  protector: '🛡️',
  santa: '🎅',
};

/** Iconos de los personajes que se disfrazan en cada temporada. */
const SEASON_ICON: Record<Season, Partial<Record<Role, string>>> = {
  christmas: { villager: '🧝', hunter: '😈', protector: '🤶' },
};

/** Orden en el que se muestran los roles. */
const ROLE_ORDER: readonly Role[] = ['werewolf', 'seer', 'santa', 'witch', 'hunter', 'cupid', 'protector', 'villager'];

export function roleIcon(role: Role, season: Season | null = activeSeason()): string {
  return (season && SEASON_ICON[season][role]) || ICON[role];
}

export function roleName(role: Role, season: Season | null = activeSeason()): string {
  return roleInfo(role, season).name;
}

export function roleDescription(role: Role, season: Season | null = activeSeason()): string {
  return roleInfo(role, season).description;
}

/** "Aldeanos" o, en Navidad, "Elfos". */
export function villagersName(season: Season | null = activeSeason()): string {
  const info = roleInfo('villager', season);
  return info.plural ?? `${info.name}s`;
}

export function isWolfRole(role: Role): boolean {
  return isWolf(role);
}

/** Los personajes que existen en la temporada, en el orden en que se muestran. */
export function rolesInOrder(season: Season | null = activeSeason()): Role[] {
  return ROLE_ORDER.filter((r) => isRoleAvailable(r, season));
}

/** Personajes con poderes que se pueden elegir en la temporada. */
export function availablePowers(season: Season | null = activeSeason()): PowerRole[] {
  return POWER_ROLES.filter((r) => isRoleAvailable(r, season));
}

/** Etiquetas del reparto público: "Entre 1 y 3 lobos", los personajes con poderes y "Aldeanos (el resto)". */
export function compositionChips(c: Composition): { key: string; label: string }[] {
  const { min, max } = c.wolves;
  const wolves = min === max ? `${max} ${max === 1 ? 'lobo' : 'lobos'}` : `Entre ${min} y ${max} lobos`;
  return [
    { key: 'werewolf', label: `${roleIcon('werewolf')} ${wolves}` },
    ...POWER_ROLES.filter((r) => (c.powers[r] ?? 0) > 0).map((r) => ({
      key: r,
      label: `${roleIcon(r)} ${roleName(r)}`,
    })),
    { key: 'villager', label: `${roleIcon('villager')} ${villagersName()} (el resto)` },
  ];
}

export const SIDE_INFO: Record<WinningSide, { icon: string; label: string }> = {
  village: { icon: '🏡', label: 'Gana el pueblo' },
  wolves: { icon: '🐺', label: 'Ganan los lobos' },
  lovers: { icon: '💘', label: 'Ganan los enamorados' },
  draw: { icon: '🤝', label: 'Empate' },
};
