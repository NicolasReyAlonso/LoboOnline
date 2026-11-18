import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, untracked } from '@angular/core';
import { isNightPhase, type GameAction } from '@lobo/game/types';
import { GameService } from '../../core/game.service';

/**
 * "Lo que te toca hacer ahora". Muestra las instrucciones de la acción
 * pendiente (`view.action`) y el botón para confirmarla. Los jugadores se
 * eligen en la rejilla; la selección llega por `selected`.
 */
@Component({
  selector: 'app-action-panel',
  templateUrl: './action-panel.html',
  styleUrl: './action-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActionPanel {
  readonly selected = model<string[]>([]);

  protected readonly game = inject(GameService);
  protected readonly view = computed(() => this.game.game()!);
  protected readonly action = computed(() => this.view().action);
  protected readonly heal = signal(false);
  protected readonly busy = signal(false);

  protected readonly target = computed(() => this.selected()[0] ?? null);
  protected readonly aliveCount = computed(() => this.view().players.filter((p) => p.alive).length);
  protected readonly readyCount = computed(() => this.view().readyIds?.length ?? 0);

  protected readonly wolfVotes = computed(() => {
    const a = this.action();
    if (a?.type !== 'wolf_vote') return [];
    return Object.entries(a.votes).map(([wolf, target]) => ({ wolf: this.name(wolf), target: this.name(target) }));
  });

  /** Mensaje cuando no tienes nada que hacer. */
  protected readonly waiting = computed(() => {
    const v = this.view();
    const me = v.me;
    if (!me) return { icon: '👀', text: 'Estás viendo la partida como espectador.' };
    if (v.phase === 'hunter' && v.hunterId) {
      return { icon: '🏹', text: `${this.name(v.hunterId)} está apuntando con su escopeta…` };
    }
    if (!me.alive) {
      return { icon: '👻', text: 'Has muerto. Sigue la partida y habla con los demás muertos en su canal.' };
    }
    if (isNightPhase(v.phase)) return { icon: '💤', text: 'Duermes mientras otros actúan en la oscuridad…' };
    return null;
  });

  constructor() {
    effect(() => {
      this.view().phaseId;
      untracked(() => this.heal.set(false));
    });
  }

  protected name(id: string | null | undefined): string {
    return id ? this.game.nameOf(id) : '';
  }

  protected async confirm(): Promise<void> {
    const a = this.action();
    const [first, second] = this.selected();
    let action: GameAction | null = null;
    switch (a?.type) {
      case 'cupid':
        if (first && second) action = { type: 'cupid', targets: [first, second] };
        break;
      case 'protect':
      case 'see':
      case 'shoot':
        if (first) action = { type: a.type, target: first };
        break;
      case 'witch':
        action = { type: 'witch', heal: this.heal(), poison: first ?? null };
        break;
    }
    if (!action || this.busy()) return;
    this.busy.set(true);
    await this.game.act(action);
    this.busy.set(false);
  }

  protected voteBlank(): void {
    void this.game.act({ type: 'vote', target: null });
  }

  protected setReady(ready: boolean): void {
    void this.game.act({ type: 'ready', ready });
  }
}
