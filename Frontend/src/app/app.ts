import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GameService } from './core/game.service';
import { Toasts } from './shared/toasts/toasts';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toasts],
  template: `
    @if (game.connection() === 'offline') {
      <div class="offline" role="status">Sin conexión con el servidor. Reintentando…</div>
    }
    <router-outlet />
    <app-toasts />
  `,
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly game = inject(GameService);

  constructor() {
    // Noche o día: cambia los colores de toda la app.
    effect(() => {
      document.body.dataset['theme'] = this.game.theme();
    });
  }
}
