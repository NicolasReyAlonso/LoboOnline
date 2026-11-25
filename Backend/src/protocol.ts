/**
 * Contrato entre el servidor y los clientes (Socket.IO).
 *
 * Si el frontend usa TypeScript puede importar estos tipos para tener los
 * eventos tipados:
 *
 *   import { io, type Socket } from 'socket.io-client';
 *   const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL);
 */
import type { Composition, Durations, GameAction, GameSettings, GameView, RoleCounts, Season } from './game/types.js';

export type * from './game/types.js';

export type RoomStatus = 'lobby' | 'playing' | 'ended';

/**
 * - `general`: todos. En partida solo escriben los vivos y nunca de noche.
 * - `wolves`: los lobos vivos, solo de noche.
 * - `dead`: los muertos (los vivos no lo leen).
 */
export type ChatChannel = 'general' | 'wolves' | 'dead';

export interface RoomPlayerView {
  id: string;
  name: string;
  connected: boolean;
  isHost: boolean;
}

/** Lo que recibe cada cliente en `room:state` cada vez que algo cambia. */
export interface RoomState {
  code: string;
  status: RoomStatus;
  hostId: string | null;
  /** Tu id de jugador. */
  youId: string;
  players: RoomPlayerView[];
  settings: GameSettings;
  limits: { minPlayers: number; maxPlayers: number };
  /** Lo que se repartiría si la partida empezase ahora (solo fuera de partida). */
  rolePreview: { composition: Composition | null; error: string | null } | null;
  /** `null` mientras se está en el lobby. */
  game: GameView | null;
  /**
   * Temporada (personajes y disfraces). En el lobby es la de hoy; durante una
   * partida, la de cuando empezó (no cambia a mitad de partida).
   */
  season: Season | null;
  /**
   * Hora del servidor (ms) al enviar el estado. El reloj de un móvil puede ir
   * desfasado: usa `serverTime - Date.now()` para corregir las cuentas atrás.
   */
  serverTime: number;
}

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  playerId: string;
  name: string;
  text: string;
  ts: number;
}

/** Respuesta (ack) a todos los eventos cliente -> servidor. */
export type AckResponse<T = undefined> = { ok: true; data?: T } | { ok: false; code: string; error: string };

/** Guarda esto (p. ej. en localStorage) para reconectar con `room:rejoin`. */
export interface Session {
  code: string;
  playerId: string;
  token: string;
}

export interface SettingsPatch {
  /** Tiene que quedar `minWolves <= maxWolves`: si cambias uno, manda también el otro si hace falta. */
  minWolves?: number;
  maxWolves?: number;
  roles?: RoleCounts | null;
  revealRoleOnDeath?: boolean;
  deadSeeEverything?: boolean;
  durations?: Partial<Durations>;
}

type Ack<T = undefined> = (res: AckResponse<T>) => void;

export interface ClientToServerEvents {
  'room:create': (payload: { name: string }, ack: Ack<Session>) => void;
  'room:join': (payload: { code: string; name: string }, ack: Ack<Session>) => void;
  'room:rejoin': (payload: { code: string; token: string }, ack: Ack<Session>) => void;
  'room:leave': (ack: Ack) => void;
  'room:kick': (payload: { playerId: string }, ack: Ack) => void;
  'room:settings': (payload: SettingsPatch, ack: Ack) => void;
  /** Tras terminar una partida, el anfitrión vuelve al lobby para jugar otra. */
  'room:lobby': (ack: Ack) => void;
  'game:start': (ack: Ack) => void;
  'game:action': (payload: GameAction, ack: Ack) => void;
  'chat:send': (payload: { channel: ChatChannel; text: string }, ack: Ack) => void;
  'chat:history': (ack: Ack<ChatMessage[]>) => void;
}

export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  /** El anfitrión te ha expulsado de la sala. */
  'room:kicked': () => void;
  /** Tu sesión se ha abierto en otro dispositivo/pestaña. */
  'room:replaced': () => void;
  'chat:message': (message: ChatMessage) => void;
  'chat:history': (messages: ChatMessage[]) => void;
}

export interface SocketData {
  roomCode?: string;
  playerId?: string;
}
