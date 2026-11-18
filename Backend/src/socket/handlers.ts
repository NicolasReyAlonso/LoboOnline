import type { Server, Socket } from 'socket.io';
import { GameError } from '../game/errors.js';
import type { AckResponse, ClientToServerEvents, ServerToClientEvents, Session, SocketData } from '../protocol.js';
import type { Room, RoomPlayer } from '../rooms/Room.js';
import type { RoomManager } from '../rooms/RoomManager.js';
import {
  actionSchema,
  chatSchema,
  createSchema,
  joinSchema,
  kickSchema,
  parse,
  rejoinSchema,
  settingsSchema,
} from './schemas.js';

type NoEvents = Record<string, never>;
export type LoboServer = Server<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;
type LoboSocket = Socket<ClientToServerEvents, ServerToClientEvents, NoEvents, SocketData>;

/**
 * Registra un evento con la convención común: el último argumento puede ser
 * un callback (ack) que recibe `{ ok: true, data? }` o `{ ok: false, code, error }`.
 */
function on(
  socket: LoboSocket,
  event: keyof ClientToServerEvents,
  hasPayload: boolean,
  handler: (payload: unknown) => unknown,
): void {
  const untyped = socket as unknown as { on(event: string, listener: (...args: unknown[]) => void): void };
  untyped.on(event, (...args: unknown[]) => {
    const last = args.at(-1);
    const ack = typeof last === 'function' ? (last as (res: AckResponse<unknown>) => void) : undefined;
    try {
      const data = handler(hasPayload ? args[0] : undefined);
      ack?.(data === undefined ? { ok: true } : { ok: true, data });
    } catch (err) {
      if (err instanceof GameError) {
        ack?.({ ok: false, code: err.code, error: err.message });
      } else {
        console.error(`[socket] error en "${event}":`, err);
        ack?.({ ok: false, code: 'internal', error: 'Error interno del servidor.' });
      }
    }
  });
}

export function registerHandlers(io: LoboServer, rooms: RoomManager): void {
  const detachSocket = (socketId: string | null): void => {
    const s = socketId ? io.sockets.sockets.get(socketId) : undefined;
    if (!s) return;
    s.data.roomCode = undefined;
    s.data.playerId = undefined;
  };

  io.on('connection', (socket) => {
    /** Sala y jugador asociados a este socket (o error si no está en ninguna). */
    const session = (): { room: Room; playerId: string } => {
      const { roomCode, playerId } = socket.data;
      const room = roomCode ? rooms.get(roomCode) : undefined;
      if (!room || !playerId || !room.hasPlayer(playerId)) {
        throw new GameError('not_in_room', 'No estás en ninguna sala.');
      }
      return { room, playerId };
    };

    const leaveCurrent = (): void => {
      const { roomCode, playerId } = socket.data;
      detachSocket(socket.id);
      if (roomCode && playerId) rooms.get(roomCode)?.leave(playerId);
    };

    const enter = (room: Room, player: RoomPlayer): Session => {
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      socket.emit('chat:history', room.chatHistoryFor(player.id));
      return { code: room.code, playerId: player.id, token: player.token };
    };

    on(socket, 'room:create', true, (payload) => {
      const { name } = parse(createSchema, payload);
      leaveCurrent();
      const room = rooms.create();
      try {
        return enter(room, room.join(name, socket.id));
      } catch (err) {
        rooms.delete(room.code);
        throw err;
      }
    });

    on(socket, 'room:join', true, (payload) => {
      const { code, name } = parse(joinSchema, payload);
      const room = rooms.get(code);
      if (!room) throw new GameError('room_not_found', 'No existe ninguna sala con ese código.');
      if (socket.data.roomCode === room.code) throw new GameError('already_in_room', 'Ya estás en esta sala.');
      leaveCurrent();
      return enter(room, room.join(name, socket.id));
    });

    on(socket, 'room:rejoin', true, (payload) => {
      const { code, token } = parse(rejoinSchema, payload);
      const room = rooms.get(code);
      if (!room) throw new GameError('room_not_found', 'La sala ya no existe.');
      const previous = { ...socket.data };
      if (previous.roomCode && previous.roomCode !== room.code) leaveCurrent();

      const { player, previousSocketId } = room.rejoin(token, socket.id);
      // Este socket era otro jugador de la misma sala: ese jugador queda desconectado.
      if (previous.roomCode === room.code && previous.playerId && previous.playerId !== player.id) {
        room.disconnect(previous.playerId, socket.id);
      }
      // La misma sesión estaba abierta en otro sitio: se cierra allí.
      if (previousSocketId && previousSocketId !== socket.id) {
        detachSocket(previousSocketId);
        io.to(previousSocketId).emit('room:replaced');
      }
      return enter(room, player);
    });

    on(socket, 'room:leave', false, () => {
      leaveCurrent();
    });

    on(socket, 'room:kick', true, (payload) => {
      const { playerId: targetId } = parse(kickSchema, payload);
      const { room, playerId } = session();
      detachSocket(room.kick(playerId, targetId));
    });

    on(socket, 'room:settings', true, (payload) => {
      const patch = parse(settingsSchema, payload);
      const { room, playerId } = session();
      room.updateSettings(playerId, patch);
    });

    on(socket, 'room:lobby', false, () => {
      const { room, playerId } = session();
      room.returnToLobby(playerId);
    });

    on(socket, 'game:start', false, () => {
      const { room, playerId } = session();
      room.start(playerId);
    });

    on(socket, 'game:action', true, (payload) => {
      const action = parse(actionSchema, payload);
      const { room, playerId } = session();
      room.act(playerId, action);
    });

    on(socket, 'chat:send', true, (payload) => {
      const { channel, text } = parse(chatSchema, payload);
      const { room, playerId } = session();
      room.sendChat(playerId, channel, text);
    });

    on(socket, 'chat:history', false, () => {
      const { room, playerId } = session();
      return room.chatHistoryFor(playerId);
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      if (roomCode && playerId) rooms.get(roomCode)?.disconnect(playerId, socket.id);
    });
  });
}
