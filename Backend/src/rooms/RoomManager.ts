import { randomInt } from 'node:crypto';
import { GameError } from '../game/errors.js';
import { Room, type RoomConfig, type Transport } from './Room.js';

/** Sin caracteres que se confundan al dictarlos o leerlos (0/O, 1/I...). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly transport: Transport,
    private readonly config: RoomConfig & { maxRooms: number },
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  create(): Room {
    if (this.rooms.size >= this.config.maxRooms) {
      throw new GameError('server_full', 'El servidor está lleno, inténtalo más tarde.');
    }
    let code: string;
    do code = generateRoomCode();
    while (this.rooms.has(code));
    const room = new Room(code, this.transport, this.config, (r) => this.delete(r.code));
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  delete(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.dispose();
    this.rooms.delete(code);
  }

  disposeAll(): void {
    for (const code of [...this.rooms.keys()]) this.delete(code);
  }
}
