/**
 * Tipos del motor de juego.
 *
 * Este fichero no depende de nada más, así que el frontend puede copiarlo o
 * importarlo tal cual para tener tipado el estado que envía el servidor.
 */

// ---------------------------------------------------------------------------
// Roles y bandos
// ---------------------------------------------------------------------------

export const ROLES = ['villager', 'werewolf', 'seer', 'witch', 'hunter', 'cupid', 'protector'] as const;
export type Role = (typeof ROLES)[number];

/** Roles que se configuran explícitamente (los aldeanos rellenan el resto). */
export type SpecialRole = Exclude<Role, 'villager'>;
export const SPECIAL_ROLES: readonly SpecialRole[] = ['werewolf', 'seer', 'witch', 'hunter', 'cupid', 'protector'];

/** Número de cartas de cada rol especial. Los aldeanos se calculan solos. */
export type RoleCounts = Partial<Record<SpecialRole, number>>;

export type Team = 'village' | 'wolves';

/** Quién gana: el pueblo, los lobos, una pareja de enamorados mixta, o nadie (todos muertos). */
export type WinningSide = 'village' | 'wolves' | 'lovers' | 'none';

// ---------------------------------------------------------------------------
// Fases
// ---------------------------------------------------------------------------

/** Pasos de la noche, en el orden en que se "despiertan" los roles. */
export const NIGHT_PHASES = ['night_cupid', 'night_protector', 'night_seer', 'night_wolves', 'night_witch'] as const;
export type NightPhase = (typeof NIGHT_PHASES)[number];

export type Phase =
  | NightPhase
  | 'dawn' // Amanecer: se anuncian los muertos de la noche
  | 'hunter' // El cazador muerto elige a quién disparar
  | 'day_discussion' // Debate libre
  | 'day_vote' // Votación para linchar
  | 'dusk' // Atardecer: se anuncia el resultado de la votación
  | 'ended';

export function isNightPhase(phase: Phase): phase is NightPhase {
  return (NIGHT_PHASES as readonly Phase[]).includes(phase);
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

/** Duraciones en segundos. */
export interface Durations {
  /** Turno de Cupido, Protector, Vidente y Bruja. */
  nightAction: number;
  /** Turno de los lobos. */
  wolves: number;
  /** Anuncios de amanecer y atardecer. */
  announcement: number;
  /** Disparo del cazador. */
  hunter: number;
  /** Debate de día. */
  discussion: number;
  /** Votación de día. */
  vote: number;
  /**
   * Cuando el rol que tendría que despertarse está muerto, el paso se sigue
   * mostrando (para no revelar que ha muerto) pero termina tras un tiempo
   * aleatorio entre estos dos valores.
   */
  phantomMin: number;
  phantomMax: number;
}

export interface GameSettings {
  /** Reparto de roles personalizado; `null` = reparto automático según el número de jugadores. */
  roles: RoleCounts | null;
  /** Mostrar el rol de un jugador cuando muere. */
  revealRoleOnDeath: boolean;
  /** Los muertos ven todos los roles y el chat de los lobos. */
  deadSeeEverything: boolean;
  durations: Durations;
}

// ---------------------------------------------------------------------------
// Acciones que envían los jugadores
// ---------------------------------------------------------------------------

export type GameAction =
  | { type: 'cupid'; targets: [string, string] }
  | { type: 'protect'; target: string }
  | { type: 'see'; target: string }
  | { type: 'wolf_vote'; target: string }
  | { type: 'witch'; heal: boolean; poison: string | null }
  | { type: 'shoot'; target: string }
  /** `target: null` = votar en blanco (no linchar a nadie). */
  | { type: 'vote'; target: string | null }
  /** Marcar que quieres pasar ya a la votación. */
  | { type: 'ready'; ready: boolean };

// ---------------------------------------------------------------------------
// Vista del estado que recibe cada jugador
// ---------------------------------------------------------------------------

export type DeathCause = 'wolves' | 'poison' | 'grief' | 'lynch' | 'hunter';

/** Las muertes nocturnas se anuncian como `night` para no delatar a la bruja. */
export type PublicDeathCause = 'night' | 'lynch' | 'hunter' | 'grief';

export interface PublicDeath {
  playerId: string;
  cause: PublicDeathCause;
  /** `null` si la partida está configurada para no revelar roles al morir. */
  role: Role | null;
}

/** Historial público de la partida (lo ven todos). */
export type LogEntry =
  | { kind: 'night_start'; night: number }
  | { kind: 'dawn'; day: number; deaths: PublicDeath[] }
  | {
      kind: 'vote_result';
      day: number;
      /** votante -> votado (`null` = en blanco). */
      votes: Record<string, string | null>;
      lynchedId: string | null;
      deaths: PublicDeath[];
    }
  | { kind: 'hunter_shot'; hunterId: string; targetId: string | null; deaths: PublicDeath[] }
  | { kind: 'game_over'; winner: WinningSide; winnerIds: string[] };

/** Información que solo recibe un jugador concreto. */
export type PrivateEntry =
  | { kind: 'lovers'; partnerId: string; partnerRole: Role }
  | { kind: 'cupid'; loverIds: [string, string] }
  | { kind: 'vision'; night: number; targetId: string; role: Role }
  | { kind: 'protected'; night: number; targetId: string }
  | { kind: 'wolves_victim'; night: number; targetId: string | null }
  | { kind: 'witch'; night: number; healedId: string | null; poisonedId: string | null };

/** Lo que el jugador puede hacer ahora mismo (o `null` si le toca esperar). */
export type PendingAction =
  | { type: 'cupid'; targets: string[] }
  | { type: 'protect'; targets: string[]; forbiddenId: string | null }
  | { type: 'see'; targets: string[] }
  | { type: 'wolf_vote'; targets: string[]; votes: Record<string, string> }
  | { type: 'witch'; victimId: string | null; canHeal: boolean; canPoison: boolean; targets: string[] }
  | { type: 'shoot'; targets: string[] }
  | { type: 'vote'; targets: string[]; hasVoted: boolean; myVote: string | null }
  | { type: 'ready'; ready: boolean };

export interface PlayerView {
  id: string;
  name: string;
  alive: boolean;
  /** `null` = quien mira no conoce el rol de este jugador. */
  role: Role | null;
  /** `true`/`false` si quien mira sabe si está enamorado; `null` si no lo sabe. */
  lover: boolean | null;
}

export interface GameView {
  phase: Phase;
  /** Cambia cada vez que cambia la fase; útil para reiniciar animaciones/contadores. */
  phaseId: number;
  /** Timestamp (ms) en el que termina la fase, para pintar la cuenta atrás. */
  endsAt: number | null;
  night: number;
  day: number;
  /** Composición de la partida (pública, como en el juego de mesa). */
  roleCounts: Record<Role, number>;
  /** `null` si quien mira no participa en la partida. */
  me: { id: string; role: Role; alive: boolean; loverId: string | null } | null;
  players: PlayerView[];
  action: PendingAction | null;
  /** Votos de la votación en curso (públicos). Solo en `day_vote`. */
  votes: Record<string, string | null> | null;
  /** Jugadores que quieren pasar a votar. Solo en `day_discussion`. */
  readyIds: string[] | null;
  /** Cazador que está disparando. Solo en la fase `hunter`. */
  hunterId: string | null;
  log: LogEntry[];
  privateLog: PrivateEntry[];
  winner: { side: WinningSide; playerIds: string[] } | null;
}
