import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { avatarColor, initial } from '../../core/avatar';
import { GameService } from '../../core/game.service';
import { isWolfRole, roleIcon, roleName, SIDE_INFO } from '../../core/roles';

@Component({
  selector: 'app-end-screen',
  templateUrl: './end-screen.html',
  styleUrl: './end-screen.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EndScreen {
  protected readonly game = inject(GameService);
  private readonly view = computed(() => this.game.game()!);

  protected readonly side = computed(() => SIDE_INFO[this.view().winner?.side ?? 'village']);
  protected readonly meId = computed(() => this.view().me?.id ?? null);

  protected readonly result = computed(() => {
    const me = this.view().me;
    if (!me) return null;
    const winner = this.view().winner;
    if (winner?.side === 'draw') return 'Nadie gana esta vez.';
    return winner?.playerIds.includes(me.id) ? '¡Has ganado!' : 'Has perdido…';
  });

  /** Por qué ha acabado, cuando no es evidente. */
  protected readonly reason = computed(() => {
    const v = this.view();
    switch (v.winner?.side) {
      case 'draw':
        return 'No queda nadie con vida.';
      case 'wolves':
        return v.players.some((p) => p.alive && p.role && !isWolfRole(p.role))
          ? 'Los lobos ya son tantos como el resto y al pueblo no le queda nada con lo que pararlos.'
          : null;
      default:
        return null;
    }
  });

  protected readonly rows = computed(() => {
    const winners = new Set(this.view().winner?.playerIds ?? []);
    return this.view().players.map((p) => ({
      ...p,
      won: winners.has(p.id),
      roleLabel: p.role ? `${roleIcon(p.role)} ${roleName(p.role)}` : '¿?',
    }));
  });

  protected readonly color = avatarColor;
  protected readonly initial = initial;
}
