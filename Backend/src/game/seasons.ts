import { ROLE_INFO, type RoleInfo } from './roles.js';
import { SEASONS, type Role, type Season } from './types.js';

/** Día del año sin año: `[mes (1-12), día]`. */
type MonthDay = readonly [month: number, day: number];

/** Lo que cambia un personaje durante una temporada. Su forma de jugar es la misma. */
export interface RoleSkin {
  name: string;
  description: string;
  plural?: string;
}

export interface SeasonInfo {
  name: string;
  /** Primer y último día de la temporada, ambos incluidos. Puede cruzar el fin de año. */
  from: MonthDay;
  to: MonthDay;
  /** Personaje exclusivo de la temporada (además, `ROLE_INFO[role].season` apunta aquí). */
  role: Role;
  /** Personajes de siempre que cambian de nombre y descripción. */
  skins: Partial<Record<Role, RoleSkin>>;
}

export const SEASON_INFO: Record<Season, SeasonInfo> = {
  christmas: {
    name: 'Navidad',
    from: [11, 23],
    to: [1, 7],
    role: 'santa',
    skins: {
      villager: {
        name: 'Elfo',
        description:
          'Ayudante de Santa sin poderes. Su arma es la palabra: debe descubrir a los lobos y votar para eliminarlos.',
      },
      hunter: {
        name: 'Grinch',
        description: 'Cuando muere, en un último arrebato de mal humor, se lleva a otro jugador con él.',
      },
      protector: {
        name: 'Mamá Claus',
        description:
          'Cada noche arropa a un jugador y lo protege del ataque de los lobos. No puede proteger a la misma persona dos noches seguidas.',
      },
    },
  },
};

const dayOfYear = ([month, day]: MonthDay): number => month * 100 + day;

/** Temporada activa en `date` (según la hora local de quien llama), o `null` si no hay ninguna. */
export function seasonAt(date: Date): Season | null {
  const today = dayOfYear([date.getMonth() + 1, date.getDate()]);
  for (const season of SEASONS) {
    const from = dayOfYear(SEASON_INFO[season].from);
    const to = dayOfYear(SEASON_INFO[season].to);
    const inside = from <= to ? today >= from && today <= to : today >= from || today <= to;
    if (inside) return season;
  }
  return null;
}

/** Nombre, descripción, bando... de un personaje tal y como se ve en la temporada. */
export function roleInfo(role: Role, season: Season | null): RoleInfo {
  const skin = season ? SEASON_INFO[season].skins[role] : undefined;
  return skin ? { ...ROLE_INFO[role], ...skin } : ROLE_INFO[role];
}

/** `true` si el personaje va disfrazado en esta temporada (y necesita su propia tarjeta). */
export function hasSkin(role: Role, season: Season | null): boolean {
  return !!season && SEASON_INFO[season].skins[role] !== undefined;
}

/** Lee `SEASON` del entorno: `christmas`, `none` (ninguna) o sin definir (según la fecha). */
export function parseSeasonOverride(value: string | undefined): Season | null | undefined {
  if (value === undefined || value === '' || value === 'auto') return undefined;
  if (value === 'none') return null;
  if ((SEASONS as readonly string[]).includes(value)) return value as Season;
  throw new Error(`SEASON no válida: "${value}". Usa ${[...SEASONS, 'none', 'auto'].join(', ')}.`);
}
