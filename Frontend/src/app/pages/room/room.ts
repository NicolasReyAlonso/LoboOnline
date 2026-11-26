import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameService } from '../../core/game.service';
import { loadName, saveName } from '../../core/session';
import { AvatarPicker } from '../../room/avatar-picker/avatar-picker';
import { GameBoard } from '../../room/game-board/game-board';
import { Lobby } from '../../room/lobby/lobby';

/**
 * /sala/:code. Según el caso muestra:
 * - la sala (lobby o partida) si ya estás dentro,
 * - "volviendo a la sala…" mientras se reconecta con la sesión guardada,
 * - un formulario para unirse si has llegado con un enlace de invitación.
 */
@Component({
  selector: 'app-room-page',
  imports: [Lobby, GameBoard, AvatarPicker, RouterLink],
  templateUrl: './room.html',
  styleUrl: './room.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomPage {
  /** Parámetro de la ruta. */
  readonly code = input.required<string>();

  protected readonly game = inject(GameService);
  protected readonly upperCode = computed(() => this.code().toUpperCase());
  protected readonly name = signal(loadName());
  protected readonly busy = signal(false);

  protected readonly view = computed<'room' | 'connecting' | 'join'>(() => {
    const state = this.game.state();
    if (state?.code === this.upperCode()) return 'room';
    if (this.game.session()?.code === this.upperCode()) return 'connecting';
    return 'join';
  });

  /** El avatar solo se cambia fuera de partida. */
  protected readonly picking = computed(() => this.game.pickingAvatar() && this.game.state()?.status !== 'playing');

  constructor() {
    // Si la partida empieza con el selector abierto, se cierra (y no vuelve a salir al acabar).
    effect(() => {
      if (this.game.state()?.status === 'playing') this.game.pickingAvatar.set(false);
    });
  }

  protected async join(): Promise<void> {
    const name = this.name().trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    saveName(name);
    await this.game.joinRoom(this.upperCode(), name);
    this.busy.set(false);
  }
}
