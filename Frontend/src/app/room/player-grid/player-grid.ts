import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { PlayerView } from '@lobo/game/types';
import { avatarColor, initial } from '../../core/avatar';
import { isWolfRole, ROLE_ICON, roleName } from '../../core/roles';

/** Rejilla de jugadores. Solo pinta: qué se puede elegir y qué pasa al tocar lo decide el padre. */
@Component({
  selector: 'app-player-grid',
  templateUrl: './player-grid.html',
  styleUrl: './player-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerGrid {
  readonly players = input.required<PlayerView[]>();
  readonly meId = input<string | null>(null);
  readonly selectable = input<ReadonlySet<string>>(new Set());
  readonly selected = input<readonly string[]>([]);
  /** votante -> votado */
  readonly votes = input<Record<string, string | null> | null>(null);
  readonly myVote = input<string | null>(null);
  readonly readyIds = input<readonly string[] | null>(null);
  readonly offline = input<ReadonlySet<string>>(new Set());
  readonly pick = output<string>();

  protected readonly icon = ROLE_ICON;
  protected readonly roleName = roleName;
  protected readonly isWolf = isWolfRole;
  protected readonly color = avatarColor;
  protected readonly initial = initial;

  /** votado -> nombres de quienes le votan */
  protected readonly voters = computed(() => {
    const names = new Map(this.players().map((p) => [p.id, p.name]));
    const map = new Map<string, string[]>();
    for (const [voter, target] of Object.entries(this.votes() ?? {})) {
      if (!target) continue;
      map.set(target, [...(map.get(target) ?? []), names.get(voter) ?? '¿?']);
    }
    return map;
  });

  protected readonly ready = computed(() => new Set(this.readyIds() ?? []));

  /** Jugadores cuya lista de votantes está desplegada. */
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected toggleVoters(id: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
}
