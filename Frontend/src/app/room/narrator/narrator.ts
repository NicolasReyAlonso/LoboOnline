import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { isNightPhase, type LogEntry } from '@lobo/game/types';
import { GameService } from '../../core/game.service';
import { describePublic } from '../../core/log';
import { phaseInfo } from '../../core/phases';

/** Cuánto se queda la viñeta abierta: un rato fijo y un poco más por cada novedad. */
const BUBBLE_MS = 7000;
const BUBBLE_MS_PER_LINE = 2500;

function lastIndex(log: readonly LogEntry[], kind: LogEntry['kind']): number {
  for (let i = log.length - 1; i >= 0; i--) if (log[i].kind === kind) return i;
  return -1;
}

/**
 * El narrador de la partida. Al cambiar de fase (o cuando hay algo que
 * anunciar, como los muertos del amanecer) cuenta lo que pasa en una viñeta
 * que se cierra sola. Al tocarlo vuelve a abrirla.
 */
@Component({
  selector: 'app-narrator',
  templateUrl: './narrator.html',
  styleUrl: './narrator.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Narrator {
  private readonly game = inject(GameService);
  private readonly view = computed(() => this.game.game()!);

  protected readonly phase = computed(() => phaseInfo(this.view().phase));
  protected readonly counter = computed(() => {
    const v = this.view();
    if (v.phase === 'ended') return 'Fin de la partida';
    return isNightPhase(v.phase) ? `Noche ${v.night}` : `Día ${v.day}`;
  });

  /** Lo que ha pasado desde que acabó la noche (o desde la votación). */
  protected readonly lines = computed(() => {
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

  protected readonly open = signal(true);
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** Solo cambia con una fase nueva o una novedad, no con cada actualización del estado. */
  private readonly news = computed(() => `${this.view().phaseId}:${this.lines().length}`);

  constructor() {
    effect(() => {
      this.news();
      untracked(() => this.show());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected toggle(): void {
    if (this.open()) this.hide();
    else this.show();
  }

  protected hide(): void {
    clearTimeout(this.timer);
    this.open.set(false);
  }

  private show(): void {
    clearTimeout(this.timer);
    this.open.set(true);
    this.timer = setTimeout(() => this.open.set(false), BUBBLE_MS + this.lines().length * BUBBLE_MS_PER_LINE);
  }
}
