import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROOM_CONFIG } from '../src/config.js';
import { Room, type Transport } from '../src/rooms/Room.js';

/** Pruebas de la sala sin red: un transporte falso guarda lo que se enviaría. */
function makeRoom() {
  const sent: { socketId: string; event: string; args: unknown[] }[] = [];
  const transport: Transport = {
    emit: (socketId, event, ...args) => {
      sent.push({ socketId, event, args });
    },
  };
  const onEmpty = vi.fn();
  const room = new Room('ABCDE', transport, { ...DEFAULT_ROOM_CONFIG, chatMinIntervalMs: 0 }, onEmpty);
  return { room, sent, onEmpty };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Room', () => {
  it('en el lobby guarda el sitio un rato al desconectado y luego lo saca', () => {
    const { room } = makeRoom();
    const a = room.join('Ana', 's1');
    const b = room.join('Bea', 's2');
    room.disconnect(b.id, 's2');
    expect(room.size).toBe(2);
    vi.advanceTimersByTime(DEFAULT_ROOM_CONFIG.lobbyGraceMs + 1);
    expect(room.size).toBe(1);
    expect(room.hostId).toBe(a.id);
  });

  it('reconectar a tiempo cancela la expulsión', () => {
    const { room } = makeRoom();
    room.join('Ana', 's1');
    const b = room.join('Bea', 's2');
    room.disconnect(b.id, 's2');
    room.rejoin(b.token, 's3');
    vi.advanceTimersByTime(DEFAULT_ROOM_CONFIG.lobbyGraceMs + 1);
    expect(room.size).toBe(2);
  });

  it('una sala sin nadie conectado se cierra', () => {
    const { room, onEmpty } = makeRoom();
    const a = room.join('Ana', 's1');
    room.disconnect(a.id, 's1');
    vi.advanceTimersByTime(DEFAULT_ROOM_CONFIG.lobbyGraceMs + 1);
    expect(onEmpty).toHaveBeenCalledWith(room);
  });

  it('las fases avanzan solas cuando vence el tiempo', () => {
    const { room } = makeRoom();
    const players = ['Ana', 'Bea', 'Carla', 'Dani'].map((n, i) => room.join(n, `s${i}`));
    room.updateSettings(players[0]!.id, { maxWolves: 1, roles: {} });
    room.start(players[0]!.id);
    const game = room.currentGame!;
    expect(game.phase).toBe('night_wolves');
    vi.advanceTimersByTime(game.settings.durations.wolves * 1000 + 1);
    // Sin votos de los lobos no hay víctima: se pasa al amanecer sin muertos.
    expect(game.phase).toBe('dawn');
  });

  it('si más de la mitad piden votar, la votación empieza a los 10 segundos', () => {
    const { room } = makeRoom();
    const players = ['Ana', 'Bea', 'Carla', 'Dani'].map((n, i) => room.join(n, `s${i}`));
    room.updateSettings(players[0]!.id, { maxWolves: 1, roles: {} });
    room.start(players[0]!.id);
    const game = room.currentGame!;
    const wolf = players.find((p) => game.playerInfo(p.id)?.role === 'werewolf')!;
    const [victim, ...rest] = players.filter((p) => p !== wolf);
    room.act(wolf.id, { type: 'wolf_vote', target: victim!.id });
    vi.advanceTimersByTime(game.settings.durations.announcement * 1000 + 1);
    expect(game.phase).toBe('day_discussion');

    // Quedan 3 vivos: con 2 ya es mayoría.
    room.act(rest[0]!.id, { type: 'ready', ready: true });
    room.act(rest[1]!.id, { type: 'ready', ready: true });
    vi.advanceTimersByTime(9_900);
    expect(game.phase).toBe('day_discussion');
    vi.advanceTimersByTime(200);
    expect(game.phase).toBe('day_vote');
  });

  it('si el anfitrión abandona en mitad de la partida, el cargo pasa a otro', () => {
    const { room } = makeRoom();
    const players = ['Ana', 'Bea', 'Carla', 'Dani'].map((n, i) => room.join(n, `s${i}`));
    room.start(players[0]!.id);
    room.leave(players[0]!.id);
    expect(room.size).toBe(4); // sigue en la partida
    expect(room.hostId).toBe(players[1]!.id);
  });

  it('el chat de muertos solo lo reciben los muertos', () => {
    const { room, sent } = makeRoom();
    const players = ['Ana', 'Bea', 'Carla', 'Dani'].map((n, i) => room.join(n, `s${i}`));
    room.updateSettings(players[0]!.id, { maxWolves: 1, roles: {} });
    room.start(players[0]!.id);
    const game = room.currentGame!;
    const wolf = players.find((p) => game.playerInfo(p.id)?.role === 'werewolf')!;
    const victim = players.find((p) => p !== wolf)!;

    expect(() => room.sendChat(victim.id, 'general', 'socorro')).toThrow(/No puedes escribir/); // es de noche
    expect(() => room.sendChat(victim.id, 'dead', 'hola')).toThrow(/No puedes escribir/); // sigue vivo

    room.act(wolf.id, { type: 'wolf_vote', target: victim.id });
    sent.length = 0;
    room.sendChat(victim.id, 'dead', 'buuu');
    const receivers = sent.filter((m) => m.event === 'chat:message').map((m) => m.socketId);
    expect(receivers).toEqual([victim.socketId]);
  });
});
