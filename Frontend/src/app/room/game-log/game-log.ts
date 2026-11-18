import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { GameService } from '../../core/game.service';
import { describePrivate, describePublic } from '../../core/log';
import { compositionChips } from '../../core/roles';

/** Reparto, tus secretos y la crónica (lo más reciente primero). */
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

  protected readonly composition = computed(() => compositionChips(this.view().composition));

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
