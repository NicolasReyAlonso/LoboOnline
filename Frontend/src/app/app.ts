import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GameService } from './core/game.service';
import { Toasts } from './shared/toasts/toasts';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts],
  template: `
    @if (banner(); as text) {
      <div class="offline" role="status">{{ text }}</div>
    }
    <router-outlet />
    <app-toasts />
  `,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly game = inject(GameService);

  /** Para no enseñar el aviso de "conectando" si la conexión es inmediata. */
  private readonly slowStart = signal(false);

  protected readonly banner = computed(() => {
    switch (this.game.connection()) {
      case 'offline':
        return 'Sin conexión con el servidor. Reintentando…';
      case 'connecting':
        // Un servidor gratuito (p. ej. Render) se duerme si nadie lo usa y tarda en despertar.
        return this.slowStart() ? 'Conectando con el servidor… Si estaba dormido, puede tardar un minuto.' : null;
      default:
        return null;
    }
  });

  constructor() {
    setTimeout(() => this.slowStart.set(true), 1500);

    // Noche o día: cambia los colores de toda la app.
    effect(() => {
      document.body.dataset['theme'] = this.game.theme();
    });
  }
}
