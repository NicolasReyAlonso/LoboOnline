import type { RoomConfig } from './rooms/Room.js';

export interface ServerConfig {
  port: number;
  /** Orígenes permitidos por CORS. `*` = cualquiera (cómodo en desarrollo). */
  corsOrigin: string | string[];
  rooms: RoomConfig & { maxRooms: number };
}

export const DEFAULT_ROOM_CONFIG: ServerConfig['rooms'] = {
  lobbyGraceMs: 30_000,
  emptyRoomTtlMs: 10 * 60_000,
  maxChatHistory: 200,
  chatMinIntervalMs: 300,
  maxRooms: 1000,
};

/**
 * Variables de entorno:
 * - `PORT` (por defecto 3000)
 * - `CORS_ORIGIN`: lista separada por comas, p. ej. `https://lobo.example.com,http://localhost:5173`
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const origins = (env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return {
    port: Number(env.PORT) || 3000,
    corsOrigin: origins.length === 0 || origins.includes('*') ? '*' : origins,
    rooms: { ...DEFAULT_ROOM_CONFIG },
  };
}
