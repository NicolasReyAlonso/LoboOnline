import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { GameService } from '../../core/game.service';
import { roleDescription, roleName } from '../../core/roles';
import { CardArt } from '../../shared/card-art/card-art';
import { Tilt } from '../../shared/tilt/tilt';

/** Cuánto se queda la carta en grande al empezar la partida (incluida la animación de entrada). */
const INTRO_MS = 3400;

/**
 * - `intro`: al empezar la partida, la carta aparece en grande en el centro.
 * - `docked`: después se encoge y se queda abajo, como una carta en la mano.
 * - `zoom`: al tocarla vuelve al centro, con la descripción del personaje.
 */
type Mode = 'intro' | 'docked' | 'zoom';

/** Tu carta de personaje. */
@Component({
  selector: 'app-role-card',
  imports: [CardArt, Tilt],
  templateUrl: './role-card.html',
  styleUrl: './role-card.scss',
  host: { '(document:keydown.escape)': 'dock()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleCard {
  private readonly game = inject(GameService);

  protected readonly me = computed(() => this.game.game()?.me ?? null);
  protected readonly mode = signal<Mode>('docked');
  protected readonly big = computed(() => this.mode() !== 'docked');
  protected readonly roleName = roleName;
  protected readonly roleDescription = roleDescription;

  constructor() {
    // Solo al empezar la partida: si entras a mitad (al reconectar), la carta ya está abajo.
    const view = this.game.game();
    if (view?.me && view.night === 1 && view.day === 0) {
      this.mode.set('intro');
      const timer = setTimeout(() => this.dock(), INTRO_MS);
      inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    }
  }

  protected toggle(): void {
    if (this.big()) this.dock();
    else this.mode.set('zoom');
  }

  protected dock(): void {
    this.mode.set('docked');
  }
}
