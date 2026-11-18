import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { defaultRoleCounts, MIN_PLAYERS } from '@lobo/game/roles';
import { DURATION_LIMITS } from '@lobo/game/settings';
import type { Durations, GameSettings, RoleCounts, SpecialRole } from '@lobo/game/types';
import { GameService } from '../../core/game.service';
import { ROLE_ICON, ROLE_ORDER, roleName } from '../../core/roles';

type Option = 'revealRoleOnDeath' | 'deadSeeEverything';

/** Ajustes de la partida. El anfitrión los edita; el resto solo los ve. */
@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.html',
  styleUrl: './settings-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPanel {
  protected readonly game = inject(GameService);

  protected readonly settings = computed(() => this.game.state()!.settings);
  protected readonly preview = computed(() => this.game.state()!.rolePreview);
  protected readonly editable = this.game.isHost;
  protected readonly auto = computed(() => this.settings().roles === null);

  /** Reparto actual (el personalizado, o el automático para el número de jugadores). */
  protected readonly counts = computed<RoleCounts>(() => {
    const players = Math.max(MIN_PLAYERS, this.game.state()!.players.length);
    return this.settings().roles ?? defaultRoleCounts(players);
  });

  protected readonly previewChips = computed(() => {
    const roles = this.preview()?.roles;
    if (!roles) return [];
    return ROLE_ORDER.filter((r) => roles[r] > 0).map((r) => ({
      role: r,
      label: `${ROLE_ICON[r]} ${roleName(r)}${roles[r] > 1 ? ` ×${roles[r]}` : ''}`,
    }));
  });

  protected readonly uniqueRoles: readonly SpecialRole[] = ['seer', 'witch', 'hunter', 'cupid', 'protector'];
  protected readonly icon = ROLE_ICON;
  protected readonly roleName = roleName;

  protected readonly durationFields: readonly { key: keyof Durations; label: string }[] = [
    { key: 'discussion', label: 'Debate' },
    { key: 'vote', label: 'Votación' },
    { key: 'wolves', label: 'Turno de los lobos' },
    { key: 'nightAction', label: 'Turno de cada personaje' },
  ];
  protected readonly limits = DURATION_LIMITS;

  protected readonly options: readonly { key: Option; label: string }[] = [
    { key: 'revealRoleOnDeath', label: 'Mostrar el personaje de quien muere' },
    { key: 'deadSeeEverything', label: 'Los muertos lo ven todo' },
  ];

  protected setAuto(auto: boolean): void {
    void this.game.updateSettings({ roles: auto ? null : { ...this.counts() } });
  }

  protected setWolves(n: number): void {
    if (n < 1 || n > 6) return;
    void this.game.updateSettings({ roles: { ...this.counts(), werewolf: n } });
  }

  protected toggleRole(role: SpecialRole, on: boolean): void {
    void this.game.updateSettings({ roles: { ...this.counts(), [role]: on ? 1 : 0 } });
  }

  protected setDuration(key: keyof Durations, input: HTMLInputElement): void {
    const [min, max] = DURATION_LIMITS[key];
    const value = Math.round(Number(input.value));
    if (!Number.isFinite(value) || value < min || value > max) {
      input.value = String(this.settings().durations[key]);
      return;
    }
    void this.game.updateSettings({ durations: { [key]: value } });
  }

  protected setOption(key: Option, value: boolean): void {
    void this.game.updateSettings({ [key]: value } satisfies Partial<GameSettings>);
  }

  protected formatSeconds(s: number): string {
    return s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`;
  }
}
