import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import type { ServerConfig } from './config.js';
import type { Transport } from './rooms/Room.js';
import { RoomManager } from './rooms/RoomManager.js';
import { registerHandlers, type LoboServer } from './socket/handlers.js';

export function createLoboServer(config: ServerConfig) {
  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
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
  const rooms = new RoomManager(transport, config.rooms);
  registerHandlers(io, rooms);

  return {
    httpServer,
    io,
    rooms,
    /** Arranca el servidor. Con `port = 0` elige un puerto libre (útil en tests). */
    listen(port: number = config.port): Promise<number> {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, () => resolve((httpServer.address() as AddressInfo).port));
      });
    },
    async close(): Promise<void> {
      rooms.disposeAll();
      await io.close();
    },
  };
}

export type LoboServerInstance = ReturnType<typeof createLoboServer>;
