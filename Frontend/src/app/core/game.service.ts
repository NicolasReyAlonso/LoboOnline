import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { AvatarId } from '@lobo/avatars';
import { seasonAt } from '@lobo/game/seasons';
import { isNightPhase } from '@lobo/game/types';
import type {
  AckResponse,
  ChatChannel,
  ChatMessage,
  ClientToServerEvents,
  GameAction,
  RoomState,
  ServerToClientEvents,
  Session,
  SettingsPatch,
} from '@lobo/protocol';
import { io, type Socket } from 'socket.io-client';
import { environment } from '../../environments/environment';
import { readableChannels } from './chat-rules';
import { ClockService } from './clock.service';
import { activeSeason } from './season';
import { loadSession, saveSession } from './session';
import { ToastService } from './toast.service';

const REQUEST_TIMEOUT_MS = 8000;

/** Error devuelto por el servidor (acción no válida, no es tu turno...). */
export class ServerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ConnectionState = 'connecting' | 'online' | 'offline';

/**
 * Único punto de contacto con el backend. Guarda el último `room:state` en un
 * signal: los componentes solo tienen que leerlo y llamar a los métodos.
 */
@Injectable({ providedIn: 'root' })
export class GameService {
  private readonly router = inject(Router);
  private readonly clock = inject(ClockService);
  private readonly toasts = inject(ToastService);
  private readonly socket: Socket<ServerToClientEvents, ClientToServerEvents> = environment.serverUrl
    ? io(environment.serverUrl)
    : io();

  readonly connection = signal<ConnectionState>('connecting');
  readonly session = signal<Session | null>(loadSession());
  readonly state = signal<RoomState | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  /** Se abre el selector de avatar (justo al entrar en una sala, o al tocar el tuyo en el lobby). */
  readonly pickingAvatar = signal(false);

  readonly game = computed(() => this.state()?.game ?? null);
  readonly me = computed(() => this.game()?.me ?? null);
  readonly isHost = computed(() => {
    const s = this.state();
    return !!s && s.hostId === s.youId;
  });
  readonly theme = computed<'night' | 'day'>(() => {
    const game = this.game();
    if (!game || game.phase === 'ended') return 'night';
    return isNightPhase(game.phase) ? 'night' : 'day';
  });

  private readonly avatars = computed(
    () => new Map<string, AvatarId>((this.state()?.players ?? []).map((p) => [p.id, p.avatar])),
  );

  private readonly names = computed(() => {
    const map = new Map<string, string>();
    for (const p of this.state()?.players ?? []) map.set(p.id, p.name);
    for (const p of this.game()?.players ?? []) map.set(p.id, p.name);
    return map;
  });

  constructor() {
    const s = this.socket;
    s.on('connect', () => {
      this.connection.set('online');
      void this.restoreSession();
    });
    s.on('disconnect', () => this.connection.set('offline'));
    s.on('connect_error', () => this.connection.set('offline'));
    s.on('room:state', (state) => {
      this.clock.sync(state.serverTime);
      this.state.set(state);
    });
    s.on('chat:message', (m) => this.messages.update((list) => [...list.slice(-299), m]));
    s.on('chat:history', (list) => this.messages.set(list));
    s.on('room:kicked', () => this.reset('El anfitrión te ha expulsado de la sala.'));
    s.on('room:replaced', () => this.reset('Has abierto esta partida en otra pestaña o dispositivo.'));

    // Temporada que se muestra: la que dice la sala o, fuera de una sala, la de hoy.
    activeSeason.set(seasonAt(new Date()));
    effect(() => {
      const state = this.state();
      activeSeason.set(state ? state.season : seasonAt(new Date()));
    });

    // Al morir o al acabar la partida se pueden leer canales nuevos: se recarga el historial.
    const channels = computed(() => readableChannels(this.state()).join());
    effect(() => {
      channels();
      if (untracked(this.state)) void this.refreshChat();
    });
  }

  nameOf(id: string): string {
    return this.names().get(id) ?? '¿?';
  }

  /** `null` si el jugador ya no está en la sala. */
  avatarOf(id: string): AvatarId | null {
    return this.avatars().get(id) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Salas
  // ---------------------------------------------------------------------------

  /** Devuelve el código de la sala, o `null` si ha fallado (ya se ha mostrado el error). */
  createRoom(name: string): Promise<string | null> {
    return this.enter('room:create', { name });
  }

  joinRoom(code: string, name: string): Promise<string | null> {
    return this.enter('room:join', { code, name });
  }

  async leave(): Promise<void> {
    try {
      await this.request('room:leave');
    } catch {
      // Da igual: nos vamos de todas formas.
    }
    this.reset();
  }

  setAvatar(avatar: AvatarId): Promise<boolean> {
    return this.run('room:avatar', { avatar });
  }

  kick(playerId: string): Promise<boolean> {
    return this.run('room:kick', { playerId });
  }

  updateSettings(patch: SettingsPatch): Promise<boolean> {
    return this.run('room:settings', patch);
  }

  startGame(): Promise<boolean> {
    return this.run('game:start');
  }

  returnToLobby(): Promise<boolean> {
    return this.run('room:lobby');
  }

  // ---------------------------------------------------------------------------
  // Partida y chat
  // ---------------------------------------------------------------------------

  act(action: GameAction): Promise<boolean> {
    return this.run('game:action', action);
  }

  sendChat(channel: ChatChannel, text: string): Promise<boolean> {
    return this.run('chat:send', { channel, text });
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private async enter(event: 'room:create' | 'room:join', payload: object): Promise<string | null> {
    try {
      const session = await this.request<Session>(event, payload);
      this.setSession(session);
      // El servidor te ha dado uno al azar: lo primero es poder cambiarlo.
      this.pickingAvatar.set(true);
      return session.code;
    } catch (err) {
      this.showError(err);
      return null;
    }
  }

  /** Tras (re)conectar el socket, recupera la sala guardada. */
  private async restoreSession(): Promise<void> {
    const session = this.session();
    if (!session) return;
    try {
      this.setSession(await this.request<Session>('room:rejoin', { code: session.code, token: session.token }));
    } catch (err) {
      if (err instanceof ServerError) {
        // La sala ya no existe o nos han echado: olvidamos la sesión.
        this.setSession(null);
        this.state.set(null);
        this.toasts.error(err.message);
      }
    }
  }

  private async refreshChat(): Promise<void> {
    try {
      this.messages.set(await this.request<ChatMessage[]>('chat:history'));
    } catch {
      // Sin importancia: llegarán los mensajes nuevos igualmente.
    }
  }

  private reset(message?: string): void {
    this.setSession(null);
    this.state.set(null);
    this.messages.set([]);
    this.pickingAvatar.set(false);
    if (message) this.toasts.show(message);
    void this.router.navigate(['/']);
  }

  private setSession(session: Session | null): void {
    saveSession(session);
    this.session.set(session);
  }

  private async run(event: keyof ClientToServerEvents, payload?: unknown): Promise<boolean> {
    try {
      await this.request(event, payload);
      return true;
    } catch (err) {
      this.showError(err);
      return false;
    }
  }

  private async request<T = void>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    const emitter = this.socket.timeout(REQUEST_TIMEOUT_MS) as unknown as {
      emitWithAck(event: string, ...args: unknown[]): Promise<AckResponse<T>>;
    };
    const res = payload === undefined ? await emitter.emitWithAck(event) : await emitter.emitWithAck(event, payload);
    if (!res.ok) throw new ServerError(res.code, res.error);
    return res.data as T;
  }

  private showError(err: unknown): void {
    this.toasts.error(err instanceof ServerError ? err.message : 'No hay conexión con el servidor. Inténtalo de nuevo.');
  }
}
