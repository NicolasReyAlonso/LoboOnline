import { randomBytes } from 'node:crypto';
import { createGame } from '../game/createGame.js';
import { GameError } from '../game/errors.js';
import type { Game } from '../game/Game.js';
import { buildRoleList, countRoles, isWolf, MAX_PLAYERS, MIN_PLAYERS } from '../game/roles.js';
import { DEFAULT_SETTINGS, validateSettings } from '../game/settings.js';
import { isNightPhase, type GameAction, type GameSettings } from '../game/types.js';
import type {
  ChatChannel,
  ChatMessage,
  RoomState,
  RoomStatus,
  ServerToClientEvents,
  SettingsPatch,
} from '../protocol.js';

export interface RoomConfig {
  /** Tiempo que se guarda el sitio en el lobby a un jugador desconectado. */
  lobbyGraceMs: number;
  /** Tiempo que sobrevive una sala sin nadie conectado. */
  emptyRoomTtlMs: number;
  maxChatHistory: number;
  chatMinIntervalMs: number;
}

export interface RoomPlayer {
  id: string;
  name: string;
  /** Secreto para reconectar. Nunca se envía a otros jugadores. */
  token: string;
  socketId: string | null;
}

/** Cómo la sala envía mensajes a un socket concreto (en producción, Socket.IO). */
export interface Transport {
  emit<E extends keyof ServerToClientEvents>(
    socketId: string,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ): void;
}

type Timer = ReturnType<typeof setTimeout>;

const randomId = (bytes = 6): string => randomBytes(bytes).toString('base64url');

/**
 * Una sala: lobby, ajustes, anfitrión, la partida en curso, sus temporizadores
 * y el chat. Toda la lógica de juego vive en `Game`; aquí solo se orquesta.
 */
export class Room {
  hostId: string | null = null;
  private settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  private game: Game | null = null;
  private readonly players = new Map<string, RoomPlayer>();
  private readonly chat: Record<ChatChannel, ChatMessage[]> = { general: [], wolves: [], dead: [] };
  private readonly lastChatAt = new Map<string, number>();
  private readonly removalTimers = new Map<string, Timer>();
  private phaseTimer: Timer | null = null;
  private phaseTimerId = -1;
  private emptyTimer: Timer | null = null;

  constructor(
    readonly code: string,
    private readonly transport: Transport,
    private readonly config: RoomConfig,
    private readonly onEmpty: (room: Room) => void,
  ) {}

  get status(): RoomStatus {
    if (!this.game) return 'lobby';
    return this.game.isOver ? 'ended' : 'playing';
  }

  get size(): number {
    return this.players.size;
  }

  get currentGame(): Game | null {
    return this.game;
  }

  hasPlayer(playerId: string): boolean {
    return this.players.has(playerId);
  }

  // -------------------------------------------------------------------------
  // Entrar / salir
  // -------------------------------------------------------------------------

  join(rawName: string, socketId: string): RoomPlayer {
    if (this.status === 'playing') throw new GameError('game_in_progress', 'La partida ya ha empezado.');
    if (this.players.size >= MAX_PLAYERS) throw new GameError('room_full', 'La sala está llena.');
    const name = rawName.trim();
    const lower = name.toLocaleLowerCase('es');
    for (const p of this.players.values()) {
      if (p.name.toLocaleLowerCase('es') === lower) {
        throw new GameError('name_taken', 'Ya hay alguien con ese nombre en la sala.');
      }
    }

    const player: RoomPlayer = { id: randomId(), name, token: randomId(24), socketId };
    this.players.set(player.id, player);
    this.hostId ??= player.id;
    this.cancelEmptyTimer();
    this.broadcast();
    return player;
  }

  /** Reconecta a un jugador con su token. Devuelve el socket anterior, si lo había. */
  rejoin(token: string, socketId: string): { player: RoomPlayer; previousSocketId: string | null } {
    const player = [...this.players.values()].find((p) => p.token === token);
    if (!player) throw new GameError('invalid_session', 'No se ha podido recuperar la sesión.');
    const previousSocketId = player.socketId;
    player.socketId = socketId;
    this.clearRemovalTimer(player.id);
    this.cancelEmptyTimer();
    this.broadcast();
    return { player, previousSocketId };
  }

  /** El socket se ha caído. En partida se guarda el sitio; en el lobby, solo durante un rato. */
  disconnect(playerId: string, socketId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.socketId !== socketId) return;
    p.socketId = null;
    if (this.status !== 'playing') this.scheduleRemoval(p.id);
    this.scheduleEmptyCheck();
    this.broadcast();
  }

  /**
   * Salida voluntaria. Durante una partida el jugador sigue en ella (puede
   * volver con su token), pero deja de ser anfitrión.
   */
  leave(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    if (this.status === 'playing') {
      p.socketId = null;
      if (this.hostId === p.id) this.transferHost();
      this.scheduleEmptyCheck();
      this.broadcast();
    } else {
      this.remove(playerId);
    }
  }

  /** Expulsa a un jugador (solo el anfitrión, fuera de partida). Devuelve su socket. */
  kick(byId: string, targetId: string): string | null {
    this.assertHost(byId);
    if (this.status === 'playing') throw new GameError('game_in_progress', 'No se puede expulsar durante la partida.');
    const target = this.players.get(targetId);
    if (!target) throw new GameError('invalid_target', 'Ese jugador no está en la sala.');
    if (target.id === byId) throw new GameError('invalid_target', 'No puedes expulsarte a ti mismo.');
    const socketId = target.socketId;
    if (socketId) this.transport.emit(socketId, 'room:kicked');
    this.remove(targetId);
    return socketId;
  }

  // -------------------------------------------------------------------------
  // Ajustes y partida
  // -------------------------------------------------------------------------

  updateSettings(byId: string, patch: SettingsPatch): void {
    this.assertHost(byId);
    if (this.status === 'playing') throw new GameError('game_in_progress', 'No se pueden cambiar los ajustes en partida.');
    const durations = { ...this.settings.durations };
    for (const [key, value] of Object.entries(patch.durations ?? {})) {
      if (value !== undefined) durations[key as keyof typeof durations] = value;
    }
    const next: GameSettings = {
      roles: patch.roles === undefined ? this.settings.roles : patch.roles,
      revealRoleOnDeath: patch.revealRoleOnDeath ?? this.settings.revealRoleOnDeath,
      deadSeeEverything: patch.deadSeeEverything ?? this.settings.deadSeeEverything,
      durations,
    };
    validateSettings(next);
    this.settings = next;
    this.broadcast();
  }

  start(byId: string): void {
    this.assertHost(byId);
    if (this.status === 'playing') throw new GameError('game_in_progress', 'La partida ya ha empezado.');
    const players = [...this.players.values()].map(({ id, name }) => ({ id, name }));
    this.game = createGame(players, this.settings);
    // Los desconectados ya forman parte de la partida: no se les echa.
    for (const id of [...this.removalTimers.keys()]) this.clearRemovalTimer(id);
    this.chat.wolves = [];
    this.chat.dead = [];
    this.afterGameChange();
  }

  act(playerId: string, action: GameAction): void {
    if (!this.game) throw new GameError('no_game', 'No hay ninguna partida en curso.');
    this.game.act(playerId, action);
    this.afterGameChange();
  }

  /** Tras una partida terminada, vuelve al lobby (y se va quien no esté conectado). */
  returnToLobby(byId: string): void {
    this.assertHost(byId);
    if (this.status !== 'ended') throw new GameError('invalid_action', 'La partida no ha terminado.');
    this.game = null;
    this.clearPhaseTimer();
    this.chat.wolves = [];
    this.chat.dead = [];
    for (const p of [...this.players.values()]) {
      if (!p.socketId) this.remove(p.id, false);
    }
    this.broadcast();
  }

  // -------------------------------------------------------------------------
  // Chat
  // -------------------------------------------------------------------------

  sendChat(playerId: string, channel: ChatChannel, rawText: string): ChatMessage {
    const p = this.players.get(playerId);
    if (!p) throw new GameError('not_in_room', 'No estás en esta sala.');
    if (!this.canWrite(playerId, channel)) {
      throw new GameError('chat_forbidden', 'No puedes escribir en este canal ahora mismo.');
    }
    const text = rawText.trim();
    if (!text) throw new GameError('invalid_payload', 'El mensaje está vacío.');
    const now = Date.now();
    if (now - (this.lastChatAt.get(playerId) ?? 0) < this.config.chatMinIntervalMs) {
      throw new GameError('chat_rate_limit', 'Estás escribiendo demasiado rápido.');
    }
    this.lastChatAt.set(playerId, now);

    const message: ChatMessage = { id: randomId(), channel, playerId, name: p.name, text, ts: now };
    const history = this.chat[channel];
    history.push(message);
    if (history.length > this.config.maxChatHistory) history.shift();

    for (const q of this.players.values()) {
      if (q.socketId && this.canRead(q.id, channel)) this.transport.emit(q.socketId, 'chat:message', message);
    }
    return message;
  }

  chatHistoryFor(playerId: string): ChatMessage[] {
    const channels = (Object.keys(this.chat) as ChatChannel[]).filter((c) => this.canRead(playerId, c));
    return channels.flatMap((c) => this.chat[c]).sort((a, b) => a.ts - b.ts);
  }

  private canRead(playerId: string, channel: ChatChannel): boolean {
    const game = this.game;
    if (!game) return channel === 'general';
    if (game.isOver) return true;
    const info = game.playerInfo(playerId);
    if (!info) return channel === 'general';
    switch (channel) {
      case 'general':
        return true;
      case 'wolves':
        return info.alive ? isWolf(info.role) : game.settings.deadSeeEverything;
      case 'dead':
        return !info.alive;
    }
  }

  private canWrite(playerId: string, channel: ChatChannel): boolean {
    const game = this.game;
    if (!game || game.isOver) return channel === 'general';
    const info = game.playerInfo(playerId);
    if (!info) return false;
    const night = isNightPhase(game.phase);
    switch (channel) {
      case 'general':
        return info.alive && !night;
      case 'wolves':
        return info.alive && isWolf(info.role) && night;
      case 'dead':
        return !info.alive;
    }
  }

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------

  stateFor(playerId: string): RoomState {
    return {
      code: this.code,
      status: this.status,
      hostId: this.hostId,
      youId: playerId,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.socketId !== null,
        isHost: p.id === this.hostId,
      })),
      settings: this.settings,
      limits: { minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS },
      rolePreview: this.status === 'playing' ? null : this.rolePreview(),
      game: this.game ? this.game.viewFor(playerId) : null,
      serverTime: Date.now(),
    };
  }

  broadcast(): void {
    for (const p of this.players.values()) {
      if (p.socketId) this.transport.emit(p.socketId, 'room:state', this.stateFor(p.id));
    }
  }

  dispose(): void {
    this.clearPhaseTimer();
    this.cancelEmptyTimer();
    for (const id of [...this.removalTimers.keys()]) this.clearRemovalTimer(id);
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private rolePreview(): NonNullable<RoomState['rolePreview']> {
    try {
      return { roles: countRoles(buildRoleList(this.players.size, this.settings.roles)), error: null };
    } catch (err) {
      return { roles: null, error: err instanceof GameError ? err.message : 'Reparto no válido.' };
    }
  }

  private remove(playerId: string, notify = true): void {
    if (!this.players.delete(playerId)) return;
    this.clearRemovalTimer(playerId);
    this.lastChatAt.delete(playerId);
    if (this.hostId === playerId) this.transferHost();
    if (this.players.size === 0) {
      this.onEmpty(this);
      return;
    }
    if (notify) this.broadcast();
  }

  /** El anfitrión pasa al primer jugador conectado (o al primero que quede). */
  private transferHost(): void {
    const others = [...this.players.values()].filter((p) => p.id !== this.hostId);
    this.hostId = (others.find((p) => p.socketId) ?? others[0])?.id ?? null;
  }

  private assertHost(playerId: string): void {
    if (this.hostId !== playerId) throw new GameError('not_host', 'Solo el anfitrión puede hacer esto.');
  }

  /** Tras cualquier cambio en la partida: reprograma el temporizador de fase y avisa a todos. */
  private afterGameChange(): void {
    this.syncPhaseTimer();
    if (this.game?.isOver) {
      // Quien se desconectó durante la partida y no ha vuelto deja la sala tras el periodo de gracia
      // (si era el anfitrión, otro podrá volver al lobby).
      for (const p of this.players.values()) {
        if (!p.socketId && !this.removalTimers.has(p.id)) this.scheduleRemoval(p.id);
      }
    }
    this.broadcast();
  }

  private scheduleRemoval(playerId: string): void {
    this.clearRemovalTimer(playerId);
    this.removalTimers.set(
      playerId,
      setTimeout(() => this.remove(playerId), this.config.lobbyGraceMs),
    );
  }

  private syncPhaseTimer(): void {
    const game = this.game;
    if (!game || game.isOver) {
      this.clearPhaseTimer();
      return;
    }
    if (game.phaseId === this.phaseTimerId) return;
    this.clearPhaseTimer();
    const phaseId = game.phaseId;
    this.phaseTimerId = phaseId;
    const delay = Math.max(0, (game.nextTimeoutAt ?? Date.now()) - Date.now());
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      if (this.game === game && game.timeout(phaseId)) this.afterGameChange();
    }, delay);
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    this.phaseTimerId = -1;
  }

  private clearRemovalTimer(playerId: string): void {
    const t = this.removalTimers.get(playerId);
    if (t) clearTimeout(t);
    this.removalTimers.delete(playerId);
  }

  private scheduleEmptyCheck(): void {
    if (this.emptyTimer) return;
    if ([...this.players.values()].some((p) => p.socketId)) return;
    this.emptyTimer = setTimeout(() => {
      this.emptyTimer = null;
      if (![...this.players.values()].some((p) => p.socketId)) this.onEmpty(this);
    }, this.config.emptyRoomTtlMs);
  }

  private cancelEmptyTimer(): void {
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
  }
}
