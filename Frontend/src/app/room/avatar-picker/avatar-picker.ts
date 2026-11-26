import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AVATARS, type AvatarId } from '@lobo/avatars';
import { AVATAR_NAMES, avatarUrl } from '../../core/avatar';
import { GameService } from '../../core/game.service';

/**
 * Selector de avatar: se abre al entrar en una sala (con uno libre ya
 * elegido al azar) y desde el lobby. Los que tienen otros jugadores salen en
 * gris con su nombre. Cada toque se guarda al momento en el servidor.
 */
@Component({
  selector: 'app-avatar-picker',
  templateUrl: './avatar-picker.html',
  styleUrl: './avatar-picker.scss',
  host: { '(document:keydown.escape)': 'close()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarPicker {
  private readonly game = inject(GameService);
  protected readonly busy = signal(false);
  protected readonly url = avatarUrl;

  protected readonly options = computed(() => {
    const state = this.game.state()!;
    const owners = new Map(state.players.map((p) => [p.avatar, p]));
    return AVATARS.map((id) => {
      const owner = owners.get(id);
      return {
        id,
        name: AVATAR_NAMES[id],
        mine: owner?.id === state.youId,
        takenBy: owner && owner.id !== state.youId ? owner.name : null,
      };
    });
  });

  protected readonly mine = computed(() => this.options().find((o) => o.mine) ?? null);

  protected async choose(id: AvatarId): Promise<void> {
    const option = this.options().find((o) => o.id === id);
    if (!option || option.mine || option.takenBy || this.busy()) return;
    this.busy.set(true);
    await this.game.setAvatar(id);
    this.busy.set(false);
  }

  protected close(): void {
    this.game.pickingAvatar.set(false);
  }
}
