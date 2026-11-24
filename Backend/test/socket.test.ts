import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_CONFIG } from '../src/config.js';
import type {
  AckResponse,
  ChatMessage,
  ClientToServerEvents,
  RoomState,
  ServerToClientEvents,
  Session,
} from '../src/protocol.js';
import { createLoboServer, type LoboServerInstance } from '../src/server.js';

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

let server: LoboServerInstance;
let url: string;
const clients: Client[] = [];

beforeEach(async () => {
  server = createLoboServer({
    port: 0,
    corsOrigin: '*',
    rooms: { ...DEFAULT_ROOM_CONFIG, chatMinIntervalMs: 0, season: null },
  });
  url = `http://localhost:${await server.listen(0)}`;
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.disconnect();
  await server.close();
});

async function client(): Promise<Client> {
  const socket: Client = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
}

/** Último `room:state` recibido por cada cliente. */
const lastState = new WeakMap<Client, RoomState>();
function track(socket: Client): Client {
  socket.on('room:state', (s) => lastState.set(socket, s));
  return socket;
}

function waitForState(socket: Client, predicate: (s: RoomState) => boolean): Promise<RoomState> {
  const current = lastState.get(socket);
  if (current && predicate(current)) return Promise.resolve(current);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout esperando room:state')), 2000);
    const listener = (s: RoomState) => {
      if (!predicate(s)) return;
      clearTimeout(timer);
      socket.off('room:state', listener);
      resolve(s);
    };
    socket.on('room:state', listener);
  });
}

function ok<T>(res: AckResponse<T>): T {
  if (!res.ok) throw new Error(`Se esperaba ok, llegó: ${res.code} - ${res.error}`);
  return res.data as T;
}

async function lobbyWith(n: number) {
  const host = track(await client());
  const session = ok(await host.emitWithAck('room:create', { name: 'Anfitrión' }));
  const guests: Client[] = [];
  const sessions: Session[] = [session];
  for (let i = 1; i < n; i++) {
    const g = track(await client());
    sessions.push(ok(await g.emitWithAck('room:join', { code: session.code.toLowerCase(), name: `Invitado ${i}` })));
    guests.push(g);
  }
  await waitForState(host, (s) => s.players.length === n);
  return { host, guests, all: [host, ...guests], sessions, code: session.code };
}

describe('servidor', () => {
  it('responde al health check', async () => {
    const res = await fetch(`${url}/health`);
    expect(await res.json()).toEqual({ ok: true, rooms: 0 });
  });

  it('crear sala y unirse', async () => {
    const { host, sessions, code } = await lobbyWith(3);
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
    const state = await waitForState(host, (s) => s.players.length === 3);
    expect(state.status).toBe('lobby');
    expect(state.hostId).toBe(sessions[0]?.playerId);
    expect(state.youId).toBe(sessions[0]?.playerId);
    expect(state.players.map((p) => p.name)).toEqual(['Anfitrión', 'Invitado 1', 'Invitado 2']);
    expect(JSON.stringify(state)).not.toContain(sessions[1]?.token ?? '???'); // los tokens nunca se filtran
  });

  it('rechaza datos no válidos y salas inexistentes', async () => {
    const c = await client();
    expect(await c.emitWithAck('room:create', { name: '' })).toMatchObject({ ok: false, code: 'invalid_payload' });
    expect(await c.emitWithAck('room:join', { code: 'ZZZZZ', name: 'Ana' })).toMatchObject({
      ok: false,
      code: 'room_not_found',
    });
    expect(await c.emitWithAck('game:start')).toMatchObject({ ok: false, code: 'not_in_room' });
  });

  it('no permite nombres repetidos', async () => {
    const { code } = await lobbyWith(1);
    const c = await client();
    expect(await c.emitWithAck('room:join', { code, name: 'anfitrión' })).toMatchObject({
      ok: false,
      code: 'name_taken',
    });
  });

  it('si falla al unirse a otra sala, sigue en la suya', async () => {
    const first = await lobbyWith(2);
    const second = await lobbyWith(1); // su anfitrión se llama igual
    const res = await first.guests[0]!.emitWithAck('room:join', { code: second.code, name: 'Anfitrión' });
    expect(res).toMatchObject({ ok: false, code: 'name_taken' });
    expect(ok(await first.guests[0]!.emitWithAck('chat:history'))).toEqual([]);
    const state = await waitForState(first.host, (s) => s.players.length === 2);
    expect(state.players.every((p) => p.connected)).toBe(true);
  });

  it('solo el anfitrión cambia ajustes y empieza; hacen falta suficientes jugadores', async () => {
    const { host, guests } = await lobbyWith(3);
    expect(await guests[0]!.emitWithAck('game:start')).toMatchObject({ ok: false, code: 'not_host' });
    expect(await host.emitWithAck('game:start')).toMatchObject({ ok: false, code: 'not_enough_players' });
    expect(await guests[0]!.emitWithAck('room:settings', { revealRoleOnDeath: false })).toMatchObject({
      ok: false,
      code: 'not_host',
    });
    ok(await host.emitWithAck('room:settings', { durations: { discussion: 60 }, maxWolves: 3, roles: { seer: 1 } }));
    const state = await waitForState(guests[1]!, (s) => s.settings.durations.discussion === 60);
    expect(state.settings.maxWolves).toBe(3);
    expect(state.settings.roles).toEqual({ seer: 1 });
    expect(state.settings.durations.vote).toBe(60); // el resto se mantiene
    expect(await host.emitWithAck('room:settings', { durations: { vote: 99999 } })).toMatchObject({ ok: false });
  });

  it('juega una noche completa por sockets', async () => {
    const { host, all, sessions } = await lobbyWith(4);
    ok(await host.emitWithAck('room:settings', { maxWolves: 1, roles: { seer: 1 } }));
    ok(await host.emitWithAck('game:start'));

    const states = await Promise.all(all.map((c) => waitForState(c, (s) => s.status === 'playing')));
    const roles = states.map((s) => s.game!.me!.role);
    expect(roles.sort()).toEqual(['seer', 'villager', 'villager', 'werewolf']);
    // Cada uno solo ve su propio rol.
    for (const s of states) {
      expect(s.game!.players.filter((p) => p.role !== null)).toHaveLength(1);
    }

    const byRole = (role: string) => {
      const i = states.findIndex((s) => s.game!.me!.role === role);
      return { socket: all[i]!, id: sessions[i]!.playerId };
    };
    const seer = byRole('seer');
    const wolf = byRole('werewolf');
    const villager = byRole('villager');

    expect(states[0]!.game!.phase).toBe('night_seer');
    expect(await villager.socket.emitWithAck('game:action', { type: 'see', target: wolf.id })).toMatchObject({
      ok: false,
      code: 'not_your_turn',
    });
    ok(await seer.socket.emitWithAck('game:action', { type: 'see', target: wolf.id }));
    const seerState = await waitForState(seer.socket, (s) => s.game!.phase === 'night_wolves');
    expect(seerState.game!.players.find((p) => p.id === wolf.id)?.role).toBe('werewolf');

    ok(await wolf.socket.emitWithAck('game:action', { type: 'wolf_vote', target: villager.id }));
    const dawn = await waitForState(villager.socket, (s) => s.game!.phase === 'dawn');
    expect(dawn.game!.me!.alive).toBe(false);
    expect(dawn.game!.log.at(-1)).toMatchObject({ kind: 'dawn', deaths: [{ playerId: villager.id }] });
  });

  it('chat: de noche solo hablan los lobos, y en su propio canal', async () => {
    const { host, all } = await lobbyWith(4);
    const general: ChatMessage[] = [];
    all[1]!.on('chat:message', (m) => general.push(m));

    ok(await host.emitWithAck('chat:send', { channel: 'general', text: 'hola!' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(general.map((m) => m.text)).toEqual(['hola!']);

    ok(await host.emitWithAck('room:settings', { maxWolves: 1, roles: {} }));
    ok(await host.emitWithAck('game:start'));
    const states = await Promise.all(all.map((c) => waitForState(c, (s) => s.status === 'playing')));
    const wolfIndex = states.findIndex((s) => s.game!.me!.role === 'werewolf');
    const wolf = all[wolfIndex]!;
    const other = all[(wolfIndex + 1) % all.length]!;

    expect(await other.emitWithAck('chat:send', { channel: 'general', text: 'psst' })).toMatchObject({
      ok: false,
      code: 'chat_forbidden',
    });
    expect(await other.emitWithAck('chat:send', { channel: 'wolves', text: 'soy lobo' })).toMatchObject({
      ok: false,
    });
    ok(await wolf.emitWithAck('chat:send', { channel: 'wolves', text: '¿a quién?' }));
    const otherHistory = ok(await other.emitWithAck('chat:history'));
    expect(otherHistory.map((m) => m.text)).toEqual(['hola!']);
    const wolfHistory = ok(await wolf.emitWithAck('chat:history'));
    expect(wolfHistory.map((m) => m.text)).toEqual(['hola!', '¿a quién?']);
  });

  it('reconexión con token: recupera su sitio y su rol', async () => {
    const { host, guests, sessions, code } = await lobbyWith(4);
    ok(await host.emitWithAck('game:start'));
    const before = await waitForState(guests[0]!, (s) => s.status === 'playing');

    guests[0]!.disconnect();
    const seen = await waitForState(host, (s) => s.players.some((p) => p.id === sessions[1]!.playerId && !p.connected));
    expect(seen.status).toBe('playing');

    const again = track(await client());
    const session = ok(await again.emitWithAck('room:rejoin', { code, token: sessions[1]!.token }));
    expect(session.playerId).toBe(sessions[1]!.playerId);
    const after = await waitForState(again, (s) => s.status === 'playing');
    expect(after.game!.me).toEqual(before.game!.me);

    const bad = await client();
    expect(await bad.emitWithAck('room:rejoin', { code, token: 'falso' })).toMatchObject({
      ok: false,
      code: 'invalid_session',
    });
  });

  it('el anfitrión puede expulsar en el lobby', async () => {
    const { host, guests, sessions } = await lobbyWith(3);
    const kicked = new Promise<void>((resolve) => guests[0]!.once('room:kicked', () => resolve()));
    ok(await host.emitWithAck('room:kick', { playerId: sessions[1]!.playerId }));
    await kicked;
    const state = await waitForState(host, (s) => s.players.length === 2);
    expect(state.players.map((p) => p.id)).not.toContain(sessions[1]!.playerId);
    expect(await guests[0]!.emitWithAck('chat:history')).toMatchObject({ ok: false, code: 'not_in_room' });
  });

  it('si el anfitrión se va, otro jugador pasa a ser anfitrión', async () => {
    const { host, guests, sessions } = await lobbyWith(3);
    ok(await host.emitWithAck('room:leave'));
    const state = await waitForState(guests[0]!, (s) => s.players.length === 2);
    expect(state.hostId).toBe(sessions[1]!.playerId);
  });
});
