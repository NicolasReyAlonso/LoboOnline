import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVATARS } from '../src/avatars.js';
import { DEFAULT_ROOM_CONFIG } from '../src/config.js';
import { MAX_PLAYERS } from '../src/game/roles.js';
import type { Season } from '../src/game/types.js';
import { Room, type Transport } from '../src/rooms/Room.js';

/** Pruebas de la sala sin red: un transporte falso guarda lo que se enviaría. */
function makeRoom(season: Season | null = null) {
  const sent: { socketId: string; event: string; args: unknown[] }[] = [];
  const transport: Transport = {
    emit: (socketId, event, ...args) => {
      sent.push({ socketId, event, args });
    },
  };
  const onEmpty = vi.fn();
  const room = new Room('ABCDE', transport, { ...DEFAULT_ROOM_CONFIG, chatMinIntervalMs: 0, season }, onEmpty);
  return { room, sent, onEmpty };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('avatares', () => {
  it('hay al menos uno por cada jugador que cabe en una sala', () => {
    expect(new Set(AVATARS).size).toBe(AVATARS.length);
    expect(AVATARS.length).toBeGreaterThanOrEqual(MAX_PLAYERS);
  });

  it('al entrar a cada uno le toca uno libre, sin repetir, aunque la sala se llene', () => {
    const { room } = makeRoom();
    const players = Array.from({ length: MAX_PLAYERS }, (_, i) => room.join(`J${i}`, `s${i}`));
    expect(new Set(players.map((p) => p.avatar)).size).toBe(MAX_PLAYERS);
    expect(room.stateFor(players[0]!.id).players.map((p) => p.avatar)).toEqual(players.map((p) => p.avatar));
  });

  it('se puede cambiar por uno libre, y al irse alguien el suyo queda libre', () => {
    const { room } = makeRoom();
    const a = room.join('Ana', 's1');
    const b = room.join('Bea', 's2');
    expect(() => room.setAvatar(a.id, b.avatar)).toThrow(/ya lo tiene otro/);
    room.setAvatar(a.id, a.avatar); // el suyo: no pasa nada

    const free = AVATARS.find((x) => x !== a.avatar && x !== b.avatar)!;
    room.setAvatar(a.id, free);
    expect(room.stateFor(b.id).players.find((p) => p.id === a.id)?.avatar).toBe(free);

    const old = b.avatar;
    room.leave(b.id);
    room.setAvatar(a.id, old);
    expect(room.stateFor(a.id).players[0]?.avatar).toBe(old);
  });

  it('no se puede cambiar durante la partida', () => {
    const { room } = makeRoom();
    const players = ['Ana', 'Bea', 'Carla', 'Dani'].map((n, i) => room.join(n, `s${i}`));
    const free = AVATARS.find((x) => !players.some((p) => p.avatar === x))!;
    room.start(players[0]!.id);
    expect(() => room.setAvatar(players[1]!.id, free)).toThrow(/durante la partida/);
  });
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

  it('en Navidad se reparte a Papá Noel y la temporada no cambia a mitad de partida', () => {
    const { room } = makeRoom('christmas');
    const players = ['Ana', 'Bea', 'Carla', 'Dani', 'Eva'].map((n, i) => room.join(n, `s${i}`));
    expect(room.stateFor(players[0]!.id).season).toBe('christmas');
    expect(room.stateFor(players[0]!.id).rolePreview?.composition?.powers).toEqual({ seer: 1, santa: 1 });

    room.start(players[0]!.id);
    const game = room.currentGame!;
    const santa = players.find((p) => game.playerInfo(p.id)?.role === 'santa')!;
    expect(room.stateFor(santa.id).season).toBe('christmas');
    expect(room.stateFor(santa.id).game?.privateLog[0]).toMatchObject({ kind: 'gift', night: 1 });
  });

  it('fuera de temporada no hay Papá Noel', () => {
    const { room } = makeRoom(null);
    const players = ['Ana', 'Bea', 'Carla', 'Dani', 'Eva'].map((n, i) => room.join(n, `s${i}`));
    room.updateSettings(players[0]!.id, { roles: { seer: 1, santa: 1 } });
    expect(room.stateFor(players[0]!.id).season).toBeNull();
    expect(room.stateFor(players[0]!.id).rolePreview?.composition?.powers).toEqual({ seer: 1 });
  });

  it('el cazador no lee la manada ni a los muertos hasta haber disparado', () => {
    const { room, sent } = makeRoom();
    const players = ['Ana', 'Bea', 'Carla', 'Dani', 'Eva', 'Fran'].map((n, i) => room.join(n, `s${i}`));
    room.updateSettings(players[0]!.id, { maxWolves: 1, roles: { hunter: 1 } });
    room.start(players[0]!.id);
    const game = room.currentGame!;
    const roleOf = (id: string) => game.playerInfo(id)!.role;
    const wolf = players.find((p) => roleOf(p.id) === 'werewolf')!;
    const hunter = players.find((p) => roleOf(p.id) === 'hunter')!;
    const [ghost, target, ...others] = players.filter((p) => roleOf(p.id) === 'villager');

    // Noche 1: los lobos hablan y matan a un aldeano.
    room.sendChat(wolf.id, 'wolves', 'a por el cazador mañana');
    room.act(wolf.id, { type: 'wolf_vote', target: ghost!.id });
    vi.advanceTimersByTime(game.settings.durations.announcement * 1000 + 1);
    expect(game.phase).toBe('day_discussion');

    // Día 1: el pueblo lincha al cazador.
    vi.advanceTimersByTime(game.settings.durations.discussion * 1000 + 1);
    for (const p of [wolf, target!, ...others, hunter]) room.act(p.id, { type: 'vote', target: hunter.id });
    expect(game.phase).toBe('dusk'); // han votado todos

    const channels = () => new Set(room.chatHistoryFor(hunter.id).map((m) => m.channel));
    expect(channels()).toEqual(new Set());
    expect(() => room.sendChat(hunter.id, 'dead', 'hola')).toThrow(/No puedes escribir/);
    sent.length = 0;
    room.sendChat(ghost!.id, 'dead', `el lobo es ${wolf.name}`);
    expect(sent.filter((m) => m.event === 'chat:message').map((m) => m.socketId)).toEqual([ghost!.socketId]);

    vi.advanceTimersByTime(game.settings.durations.announcement * 1000 + 1);
    expect(game.phase).toBe('hunter');
    expect(channels()).toEqual(new Set());

    room.act(hunter.id, { type: 'shoot', target: target!.id });
    expect(game.phase).toBe('night_wolves');
    expect(channels()).toEqual(new Set(['wolves', 'dead']));
    room.sendChat(hunter.id, 'dead', 'ya está');
  });
});
