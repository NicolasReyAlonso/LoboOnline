import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { AvatarId } from '@lobo/avatars';
import type { PlayerView } from '@lobo/game/types';
import { avatarUrl } from '../../core/avatar';
import { isWolfRole, roleIcon, roleName } from '../../core/roles';
import { Tilt } from '../../shared/tilt/tilt';

export interface Voter {
  id: string;
  name: string;
  avatar: AvatarId | null;
}

/** Todo lo que se pinta en la tarjeta de un jugador. */
export interface CardState {
  player: PlayerView;
  avatar: AvatarId | null;
  /** Es tu tarjeta. */
  me: boolean;
  /** Se puede elegir para la acción de ahora. */
  pickable: boolean;
  selected: boolean;
  /** Le has votado tú. */
  voted: boolean;
  /** Quiere pasar a votar. */
  ready: boolean;
  offline: boolean;
  /** Quién le vota (en la votación del día, o los lobos de noche). */
  voters: Voter[];
}

/** Cuántas caras de votantes caben; el resto se cuenta. */
const MAX_VOTER_FACES = 5;

/** Tarjeta de un jugador: su avatar, su nombre, su personaje si se sabe y quién le vota. */
@Component({
  selector: 'app-player-card',
  imports: [Tilt],
  templateUrl: './player-card.html',
  styleUrl: './player-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerCard {
  readonly card = input.required<CardState>();
  readonly pick = output<void>();

  protected readonly url = avatarUrl;
  protected readonly roleIcon = roleIcon;
  protected readonly roleName = roleName;
  protected readonly isWolf = isWolfRole;

  protected readonly faces = computed(() => this.card().voters.slice(0, MAX_VOTER_FACES));
  protected readonly votersText = computed(() => {
    const voters = this.card().voters;
    if (!voters.length) return '';
    return `Le ${voters.length === 1 ? 'vota' : 'votan'}: ${voters.map((v) => v.name).join(', ')}`;
  });

  protected readonly ariaLabel = computed(() => {
    const { player, me, ready, offline, voters } = this.card();
    const parts = [me ? `${player.name} (tú)` : player.name];
    if (player.role) parts.push(roleName(player.role));
    if (!player.alive) parts.push('muerto');
    if (player.lover) parts.push('enamorado');
    if (ready) parts.push('quiere votar');
    if (offline) parts.push('desconectado');
    if (voters.length) parts.push(this.votersText());
    return parts.join(', ');
  });

  protected onClick(): void {
    if (this.card().pickable) this.pick.emit();
  }
}
