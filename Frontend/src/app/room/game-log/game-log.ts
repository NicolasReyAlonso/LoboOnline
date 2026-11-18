import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameService } from '../../core/game.service';
import { describePrivate, describePublic } from '../../core/log';
import { ROLE_ICON, ROLE_ORDER, roleName } from '../../core/roles';

/** Composición de la partida, tus secretos y la crónica (lo más reciente primero). */
@Component({
  selector: 'app-game-log',
  templateUrl: './game-log.html',
  styleUrl: './game-log.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameLog {
  private readonly game = inject(GameService);
  private readonly view = computed(() => this.game.game()!);
  private readonly nameOf = (id: string) => this.game.nameOf(id);

  protected readonly composition = computed(() => {
    const counts = this.view().roleCounts;
    return ROLE_ORDER.filter((r) => counts[r] > 0).map(
      (r) => `${ROLE_ICON[r]} ${roleName(r)}${counts[r] > 1 ? ` ×${counts[r]}` : ''}`,
    );
  });

  protected readonly secrets = computed(() =>
    this.view()
      .privateLog.map((e) => describePrivate(e, this.nameOf))
      .reverse(),
  );

  protected readonly chronicle = computed(() =>
    this.view()
      .log.flatMap((e) => describePublic(e, this.nameOf))
      .reverse(),
  );
}
