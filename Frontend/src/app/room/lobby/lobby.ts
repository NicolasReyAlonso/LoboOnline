import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AVATAR_NAMES, avatarUrl } from '../../core/avatar';
import { GameService } from '../../core/game.service';
import { ToastService } from '../../core/toast.service';
import { Chat } from '../chat/chat';
import { SettingsPanel } from '../settings-panel/settings-panel';

@Component({
  selector: 'app-lobby',
  imports: [Chat, SettingsPanel],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Lobby {
  protected readonly game = inject(GameService);
  private readonly toasts = inject(ToastService);

  protected readonly state = computed(() => this.game.state()!);
  protected readonly avatarUrl = avatarUrl;
  protected readonly avatarName = AVATAR_NAMES;

  protected readonly missing = computed(() => Math.max(0, this.state().limits.minPlayers - this.state().players.length));

  /** Motivo por el que no se puede empezar, o `null` si se puede. */
  protected readonly startBlocker = computed(() => {
    const state = this.state();
    if (this.missing() > 0) {
      return `Faltan ${this.missing()} ${this.missing() === 1 ? 'jugador' : 'jugadores'} para empezar.`;
    }
    return state.rolePreview?.error ?? null;
  });

  protected async invite(): Promise<void> {
    const code = this.state().code;
    // Relativo a <base href>: en GitHub Pages la web vive en /LoboOnline/, no en la raíz.
    const url = new URL(`sala/${code}`, document.baseURI).href;
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch && navigator.share) {
      try {
        await navigator.share({ title: 'LoboOnline', text: `¡Únete a mi partida del Lobo! Sala ${code}`, url });
      } catch {
        // El usuario ha cerrado el menú de compartir.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      this.toasts.show('Enlace de invitación copiado.', 'success');
    } catch {
      this.toasts.show(`Comparte este enlace: ${url}`);
    }
  }
}
