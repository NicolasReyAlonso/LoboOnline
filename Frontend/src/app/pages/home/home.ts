import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GameService } from '../../core/game.service';
import { roleDescription, roleIcon, roleName, rolesInOrder } from '../../core/roles';
import { activeSeason, seasonLabel } from '../../core/season';
import { loadName, saveName } from '../../core/session';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home {
  protected readonly game = inject(GameService);
  private readonly router = inject(Router);

  protected readonly name = signal(loadName());
  protected readonly code = signal('');
  protected readonly busy = signal(false);
  protected readonly validName = computed(() => this.name().trim().length > 0);

  protected readonly season = computed(() => {
    const season = activeSeason();
    return season ? seasonLabel(season) : null;
  });
  protected readonly roles = computed(() =>
    rolesInOrder().map((role) => ({
      role,
      icon: roleIcon(role),
      name: roleName(role),
      description: roleDescription(role),
    })),
  );

  protected setCode(input: HTMLInputElement): void {
    const clean = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    input.value = clean;
    this.code.set(clean);
  }

  protected create(): Promise<void> {
    return this.go(() => this.game.createRoom(this.name().trim()));
  }

  protected join(): Promise<void> {
    if (this.code().length !== 5) return Promise.resolve();
    return this.go(() => this.game.joinRoom(this.code(), this.name().trim()));
  }

  private async go(action: () => Promise<string | null>): Promise<void> {
    if (!this.validName() || this.busy()) return;
    this.busy.set(true);
    saveName(this.name().trim());
    const code = await action();
    this.busy.set(false);
    if (code) await this.router.navigate(['/sala', code]);
  }
}
