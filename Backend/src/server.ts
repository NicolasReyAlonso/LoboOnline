import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type { ServerConfig } from './config.js';
import { RoomManager } from './rooms/RoomManager.js';
import type { Transport } from './rooms/Room.js';
import { registerHandlers, type LoboServer } from './socket/handlers.js';

export function createLoboServer(config: ServerConfig) {
  let rooms: RoomManager | undefined;

  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms?.size ?? 0 }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not_found' }));
  });

  const io: LoboServer = new Server(httpServer, { cors: { origin: config.corsOrigin } });

  const transport: Transport = {
    emit(socketId, event, ...args) {
      const target = io.to(socketId) as unknown as { emit(event: string, ...args: unknown[]): boolean };
      target.emit(event, ...args);
    },
  };
  rooms = new RoomManager(transport, config.rooms);
  registerHandlers(io, rooms);
  const manager = rooms;

  return {
    httpServer,
    io,
    rooms: manager,
    /** Arranca el servidor. Con `port = 0` elige un puerto libre (útil en tests). */
    listen(port: number = config.port): Promise<number> {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => resolve((httpServer.address() as AddressInfo).port));
      });
    },
    async close(): Promise<void> {
      manager.disposeAll();
      await io.close();
    },
  };
}

export type LoboServerInstance = ReturnType<typeof createLoboServer>;
