import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ClockService } from '../../core/clock.service';

/** Cuenta atrás hasta `endsAt` (hora del servidor, en ms). */
@Component({
  selector: 'app-countdown',
  template: `
    @if (seconds(); as s) {
      <span class="countdown" [class.urgent]="s <= 10" role="timer" [attr.aria-label]="s + ' segundos'">
        {{ label() }}
      </span>
    }
  `,
  styles: `
    .countdown {
      display: inline-block;
      min-width: 64px;
      padding: 4px 12px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-strong);
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      text-align: center;
    }
    .urgent {
      border-color: var(--danger);
      color: var(--danger);
      animation: pulse 1s ease-in-out infinite;
    }
    @keyframes pulse {
      50% {
        transform: scale(1.06);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Countdown {
  readonly endsAt = input<number | null>(null);
  private readonly clock = inject(ClockService);

  protected readonly seconds = computed(() => {
    const endsAt = this.endsAt();
    if (endsAt === null) return null;
    return Math.max(0, Math.ceil((endsAt - this.clock.now()) / 1000));
  });

  protected readonly label = computed(() => {
    const s = this.seconds() ?? 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
}
