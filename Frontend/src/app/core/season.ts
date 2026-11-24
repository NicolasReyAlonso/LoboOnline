import { signal } from '@angular/core';
import { SEASON_INFO } from '@lobo/game/seasons';
import type { Season } from '@lobo/game/types';

/**
 * Temporada que se está mostrando (nombres, iconos y tarjetas de los
 * personajes). La mantiene `GameService`: la de la sala si estás en una (en
 * partida, la de cuando empezó) y si no, la de hoy. Mientras nadie la fija
 * (p. ej. en los tests) es `null`: personajes clásicos.
 */
export const activeSeason = signal<Season | null>(null);

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const SEASON_ICON: Record<Season, string> = {
  christmas: '🎄',
};

/** "🎄 Temporada de Navidad · hasta el 7 de enero". */
export function seasonLabel(season: Season): string {
  const info = SEASON_INFO[season];
  const [month, day] = info.to;
  return `${SEASON_ICON[season]} Temporada de ${info.name} · hasta el ${day} de ${MONTHS[month - 1]}`;
}

// ---------------------------------------------------------------------------
// El cazador (o quien lo sustituya en la temporada)
// ---------------------------------------------------------------------------

export interface HunterTexts {
  phaseTitle: string;
  phaseNarration: string;
  /** Lo que ven los demás mientras decide. */
  aiming: (name: string) => string;
  /** Lo que ve él mientras espera su turno. */
  waiting: string;
  heading: string;
  prompt: string;
  confirm: (target: string) => string;
  missed: (name: string) => string;
  shot: (name: string, target: string) => string;
}

const HUNTER: HunterTexts = {
  phaseTitle: 'El cazador',
  phaseNarration: 'En su último aliento, el cazador levanta la escopeta…',
  aiming: (name) => `${name} está apuntando con su escopeta…`,
  waiting: 'Has muerto, pero aún te queda un disparo. Prepárate para apuntar…',
  heading: 'Tu último disparo',
  prompt: 'Has muerto, pero te queda un cartucho. ¿A quién te llevas contigo?',
  confirm: (target) => `Disparar a ${target}`,
  missed: (name) => `${name}, el cazador, no llega a disparar.`,
  shot: (name, target) => `${name}, el cazador, dispara a ${target}.`,
};

const SEASON_HUNTER: Partial<Record<Season, HunterTexts>> = {
  christmas: {
    phaseTitle: 'El Grinch',
    phaseNarration: 'Con su último gruñido, el Grinch busca a quién llevarse…',
    aiming: (name) => `${name} está decidiendo a quién llevarse…`,
    waiting: 'Has muerto, pero no te irás solo. Prepárate para elegir a quién te llevas…',
    heading: 'Tu última travesura',
    prompt: 'Has muerto, pero no te irás solo. ¿A quién te llevas contigo?',
    confirm: (target) => `Llevarme a ${target}`,
    missed: (name) => `${name}, el Grinch, no llega a llevarse a nadie.`,
    shot: (name, target) => `${name}, el Grinch, se lleva a ${target}.`,
  },
};

export function hunterTexts(season: Season | null = activeSeason()): HunterTexts {
  return (season && SEASON_HUNTER[season]) || HUNTER;
}
