import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { GameService } from '../../core/game.service';
import { PhaseClock } from '../../shared/phase-clock/phase-clock';
import { ActionPanel } from '../action-panel/action-panel';
import { Chat } from '../chat/chat';
import { EndScreen } from '../end-screen/end-screen';
import { GameLog, type LogSection } from '../game-log/game-log';
import { Narrator } from '../narrator/narrator';
import { PlayerCard, type CardState, type Voter } from '../player-card/player-card';
import { PlayerCarousel } from '../player-carousel/player-carousel';
import { RoleCard } from '../role-card/role-card';

/** A partir de este ancho el chat se queda abierto a un lado; por debajo es un panel que se despliega. */
const WIDE = '(min-width: 960px)';

/**
 * Pantalla de partida:
 * - arriba, el narrador, el reloj y el sol o la luna;
 * - en medio, lo que te toca hacer y el carrusel con los demás jugadores;
 * - abajo, tu avatar, tu carta y los botones del reparto, la crónica y el chat;
 * - el chat, a la derecha (en el móvil, un panel que se despliega).
 */
@Component({
  selector: 'app-game-board',
  imports: [PhaseClock, Narrator, ActionPanel, PlayerCarousel, PlayerCard, Chat, GameLog, EndScreen, RoleCard],
  templateUrl: './game-board.html',
  styleUrl: './game-board.scss',
  host: { '(document:keydown.escape)': 'sheet.set(null)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameBoard {
  protected readonly game = inject(GameService);

  protected readonly view = computed(() => this.game.game()!);
  protected readonly me = computed(() => this.view().me);
  protected readonly action = computed(() => this.view().action);
  protected readonly ended = computed(() => this.view().phase === 'ended');

  /** Jugadores seleccionados para la acción actual (se comparte con el panel de acción). */
  protected readonly selected = signal<string[]>([]);

  private readonly selectable = computed<ReadonlySet<string>>(() => {
    const a = this.action();
    if (!a || a.type === 'ready') return new Set();
    if (a.type === 'witch') return new Set(a.canPoison ? a.targets : []);
    return new Set(a.targets);
  });

  /** Votos visibles: los del día (públicos) o los de la manada (solo lobos). */
  private readonly votes = computed(() => {
    const a = this.action();
    return a?.type === 'wolf_vote' ? a.votes : this.view().votes;
  });

  private readonly myVote = computed(() => {
    const a = this.action();
    const me = this.me();
    if (a?.type === 'vote') return a.hasVoted ? a.myVote : null;
    if (a?.type === 'wolf_vote' && me) return a.votes[me.id] ?? null;
    return null;
  });

  /** votado -> quienes le votan */
  private readonly voters = computed(() => {
    const map = new Map<string, Voter[]>();
    for (const [voter, target] of Object.entries(this.votes() ?? {})) {
      if (!target) continue;
      const v: Voter = { id: voter, name: this.game.nameOf(voter), avatar: this.game.avatarOf(voter) };
      map.set(target, [...(map.get(target) ?? []), v]);
    }
    return map;
  });

  private readonly cards = computed<CardState[]>(() => {
    const v = this.view();
    const meId = v.me?.id;
    const selectable = this.selectable();
    const selected = this.selected();
    const ready = new Set(v.readyIds ?? []);
    const online = new Map((this.game.state()?.players ?? []).map((p) => [p.id, p.connected]));
    return v.players.map((p) => ({
      player: p,
      avatar: this.game.avatarOf(p.id),
      me: p.id === meId,
      pickable: selectable.has(p.id),
      selected: selected.includes(p.id),
      voted: p.id === this.myVote(),
      ready: ready.has(p.id),
      offline: online.get(p.id) === false,
      voters: this.voters().get(p.id) ?? [],
    }));
  });

  protected readonly myCard = computed(() => this.cards().find((c) => c.me) ?? null);
  protected readonly others = computed(() => this.cards().filter((c) => !c.me));

  // ---------------------------------------------------------------------------
  // Chat y paneles de abajo
  // ---------------------------------------------------------------------------

  private readonly wide = signal(matchMedia(WIDE).matches);
  protected readonly chatOpen = signal(this.wide());
  protected readonly sheet = signal<LogSection | null>(null);

  // Lo que ya se leyó en el lobby no cuenta como pendiente.
  private readonly chatSeen = signal(this.game.messages().length);
  protected readonly unreadChat = computed(() =>
    this.chatOpen() ? 0 : Math.max(0, this.game.messages().length - this.chatSeen()),
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
      if (this.chatOpen()) {
        const count = this.game.messages().length;
        untracked(() => this.chatSeen.set(count));
      }
    });

    // Al pasar de pantalla ancha a estrecha (o al revés) el chat se cierra (o se abre).
    const query = matchMedia(WIDE);
    const onChange = (e: MediaQueryListEvent) => {
      this.wide.set(e.matches);
      this.chatOpen.set(e.matches);
      if (!e.matches) this.sheet.set(null);
    };
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
  }

  protected toggleChat(): void {
    const open = !this.chatOpen();
    this.chatOpen.set(open);
    // En el móvil solo cabe un panel a la vez.
    if (open && !this.wide()) this.sheet.set(null);
  }

  protected toggleSheet(section: LogSection): void {
    const open = this.sheet() !== section;
    this.sheet.set(open ? section : null);
    if (open && !this.wide()) this.chatOpen.set(false);
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
