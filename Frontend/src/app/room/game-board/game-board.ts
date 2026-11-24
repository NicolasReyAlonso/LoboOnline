import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { isNightPhase, type LogEntry } from '@lobo/game/types';
import { GameService } from '../../core/game.service';
import { describePublic } from '../../core/log';
import { phaseInfo } from '../../core/phases';
import { roleDescription, roleIcon, roleName } from '../../core/roles';
import { Countdown } from '../../shared/countdown/countdown';
import { ActionPanel } from '../action-panel/action-panel';
import { Chat } from '../chat/chat';
import { EndScreen } from '../end-screen/end-screen';
import { GameLog } from '../game-log/game-log';
import { PlayerGrid } from '../player-grid/player-grid';
import { RoleCard } from '../role-card/role-card';

type Tab = 'game' | 'chat' | 'log';

function lastIndex(log: readonly LogEntry[], kind: LogEntry['kind']): number {
  for (let i = log.length - 1; i >= 0; i--) if (log[i].kind === kind) return i;
  return -1;
}

/**
 * Pantalla de partida. En el móvil se divide en pestañas (partida, chat,
 * crónica); en pantallas anchas se ve todo a la vez.
 */
@Component({
  selector: 'app-game-board',
  imports: [Countdown, ActionPanel, PlayerGrid, Chat, GameLog, EndScreen, RoleCard],
  templateUrl: './game-board.html',
  styleUrl: './game-board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameBoard {
  protected readonly game = inject(GameService);

  protected readonly view = computed(() => this.game.game()!);
  protected readonly me = computed(() => this.view().me);
  protected readonly action = computed(() => this.view().action);
  protected readonly phase = computed(() => phaseInfo(this.view().phase));
  protected readonly counter = computed(() => {
    const v = this.view();
    if (v.phase === 'ended') return `${v.night} ${v.night === 1 ? 'noche' : 'noches'}`;
    return isNightPhase(v.phase) ? `Noche ${v.night}` : `Día ${v.day}`;
  });

  protected readonly roleIcon = roleIcon;
  protected readonly roleName = roleName;
  protected readonly roleDescription = roleDescription;

  protected readonly tab = signal<Tab>('game');
  protected readonly showRoleInfo = signal(false);
  /** Jugadores seleccionados para la acción actual (se comparte con el panel de acción). */
  protected readonly selected = signal<string[]>([]);

  protected readonly selectable = computed<ReadonlySet<string>>(() => {
    const a = this.action();
    if (!a || a.type === 'ready') return new Set();
    if (a.type === 'witch') return new Set(a.canPoison ? a.targets : []);
    return new Set(a.targets);
  });

  /** Votos visibles: los del día (públicos) o los de la manada (solo lobos). */
  protected readonly votes = computed(() => {
    const a = this.action();
    return a?.type === 'wolf_vote' ? a.votes : this.view().votes;
  });

  protected readonly myVote = computed(() => {
    const a = this.action();
    const me = this.me();
    if (a?.type === 'vote') return a.hasVoted ? a.myVote : null;
    if (a?.type === 'wolf_vote' && me) return a.votes[me.id] ?? null;
    return null;
  });

  protected readonly offline = computed<ReadonlySet<string>>(
    () => new Set(this.game.state()!.players.filter((p) => !p.connected).map((p) => p.id)),
  );

  /** Lo que ha pasado desde que acabó la noche (o desde la votación), para anunciarlo arriba. */
  protected readonly announcement = computed(() => {
    const v = this.view();
    if (!['dawn', 'hunter', 'day_discussion', 'dusk'].includes(v.phase)) return [];
    const lastNight = lastIndex(v.log, 'night_start');
    const lastVote = lastIndex(v.log, 'vote_result');
    const from = lastVote > lastNight ? lastVote : lastNight + 1;
    const lines = v.log
      .slice(from)
      .filter((e) => e.kind !== 'night_start' && e.kind !== 'game_over')
      .flatMap((e) => describePublic(e, (id) => this.game.nameOf(id)));
    // Aviso privado de esta noche: la vidente te ha mirado la carta (solo te llega a ti).
    if (lastNight > lastVote && v.privateLog.some((e) => e.kind === 'seen' && e.night === v.night)) {
      lines.push({ icon: '👁️', text: 'Esta noche alguien ha mirado tu carta. Solo lo sabes tú.' });
    }
    return lines;
  });

  // Lo que ya se leyó en el lobby no cuenta como pendiente.
  private readonly chatSeen = signal(this.game.messages().length);
  protected readonly unreadChat = computed(() =>
    this.tab() === 'chat' ? 0 : Math.max(0, this.game.messages().length - this.chatSeen()),
  );

  constructor() {
    // Nueva fase: se limpia la selección.
    effect(() => {
      this.view().phaseId;
      untracked(() => this.selected.set([]));
    });

    // En el móvil, vibra cuando te toca actuar.
    let notifiedPhase = -1;
    effect(() => {
      const v = this.view();
      if (v.action && v.action.type !== 'ready' && v.phaseId !== notifiedPhase) {
        notifiedPhase = v.phaseId;
        navigator.vibrate?.(150);
      }
    });

    effect(() => {
      if (this.tab() === 'chat') {
        const count = this.game.messages().length;
        untracked(() => this.chatSeen.set(count));
      }
    });
  }

  protected onPick(id: string): void {
    const a = this.action();
    if (!a) return;
    switch (a.type) {
      // Votos: se envían al momento y se pueden cambiar.
      case 'vote':
        void this.game.act({ type: 'vote', target: id });
        break;
      case 'wolf_vote':
        void this.game.act({ type: 'wolf_vote', target: id });
        break;
      // Cupido elige a dos.
      case 'cupid':
        this.selected.update((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2)));
        break;
      // El resto elige a uno y confirma en el panel de acción.
      case 'protect':
      case 'see':
      case 'shoot':
      case 'witch':
        this.selected.update((s) => (s[0] === id ? [] : [id]));
        break;
    }
  }
}
