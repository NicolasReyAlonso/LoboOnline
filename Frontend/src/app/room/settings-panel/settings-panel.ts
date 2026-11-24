import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { defaultPowers, MAX_WOLVES, MIN_PLAYERS } from '@lobo/game/roles';
import { DURATION_LIMITS } from '@lobo/game/settings';
import type { Durations, GameSettings, PowerRole, RoleCounts } from '@lobo/game/types';
import { GameService } from '../../core/game.service';
import { seasonLabel } from '../../core/season';
import { availablePowers, compositionChips, roleIcon, roleName, villagersName } from '../../core/roles';

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
  private readonly season = computed(() => this.game.state()!.season);
  protected readonly seasonText = computed(() => {
    const season = this.season();
    return season ? seasonLabel(season) : null;
  });
  protected readonly playerCount = computed(() => this.game.state()!.players.length);
  protected readonly editable = this.game.isHost;
  protected readonly auto = computed(() => this.settings().roles === null);

  private readonly preview = computed(() => this.game.state()!.rolePreview);
  protected readonly error = computed(() => this.preview()?.error ?? null);
  protected readonly chips = computed(() => {
    const composition = this.preview()?.composition;
    return composition ? compositionChips(composition) : [];
  });

  /** Si con los jugadores actuales caben menos lobos de los elegidos, se avisa. */
  protected readonly wolvesNote = computed(() => {
    const max = this.preview()?.composition?.wolves.max;
    if (max === undefined || max >= this.settings().maxWolves) return null;
    return `Con ${this.playerCount()} jugadores caben como mucho ${max}.`;
  });

  /** Personajes con poderes actuales (los elegidos, o los automáticos para el número de jugadores). */
  protected readonly counts = computed<RoleCounts>(
    () => this.settings().roles ?? defaultPowers(Math.max(MIN_PLAYERS, this.playerCount()), this.season()),
  );

  /** Los de la temporada actual (Papá Noel solo aparece en Navidad). */
  protected readonly powers = computed(() => availablePowers(this.season()));
  protected readonly maxWolvesLimit = MAX_WOLVES;
  protected readonly roleIcon = roleIcon;
  protected readonly roleName = roleName;
  protected readonly villagers = computed(() => villagersName(this.season()).toLowerCase());

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

  protected setMaxWolves(n: number): void {
    if (n < 1 || n > MAX_WOLVES) return;
    void this.game.updateSettings({ maxWolves: n });
  }

  protected setAuto(auto: boolean): void {
    void this.game.updateSettings({ roles: auto ? null : { ...this.counts() } });
  }

  protected toggleRole(role: PowerRole, on: boolean): void {
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
