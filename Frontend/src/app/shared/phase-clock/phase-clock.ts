import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, untracked } from '@angular/core';
import { ClockService } from '../../core/clock.service';

/**
 * Reloj redondo de la fase: un anillo que se vacía según pasa el tiempo y los
 * segundos que quedan en el centro. `startedAt` es desde cuándo corre `endsAt`
 * (los dos en hora del servidor, en ms).
 */
@Component({
  selector: 'app-phase-clock',
  template: `
    <div class="clock" [class.urgent]="urgent()" role="timer" [attr.aria-label]="ariaLabel()">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="track" cx="50" cy="50" r="44" />
        <circle class="ring" cx="50" cy="50" r="44" pathLength="100" [style.stroke-dashoffset]="offset()" />
      </svg>
      <span class="time" aria-hidden="true">{{ label() }}</span>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: var(--clock-size, 88px);
      aspect-ratio: 1;
    }

    .clock {
      position: relative;
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: var(--surface-strong);
      box-shadow: var(--shadow);
      -webkit-backdrop-filter: blur(8px);
      backdrop-filter: blur(8px);
    }

    svg {
      position: absolute;
      inset: 0;
      rotate: -90deg;
    }

    circle {
      fill: none;
      stroke-width: 7;
    }

    .track {
      stroke: var(--border);
    }

    .ring {
      stroke: var(--accent);
      stroke-dasharray: 100;
      stroke-linecap: round;
      transition:
        stroke-dashoffset 0.25s linear,
        stroke 0.4s ease;
    }

    .time {
      font-size: calc(var(--clock-size, 88px) * 0.3);
      font-variant-numeric: tabular-nums;
      font-weight: 800;
      line-height: 1;
    }

    .urgent {
      animation: pulse 1s ease-in-out infinite;

      .ring {
        stroke: var(--danger);
      }

      .time {
        color: var(--danger);
      }
    }

    @keyframes pulse {
      50% {
        transform: scale(1.06);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PhaseClock {
  readonly endsAt = input<number | null>(null);
  readonly startedAt = input<number | null>(null);
  private readonly clock = inject(ClockService);

  /** Si el servidor no dice desde cuándo corre, se cuenta desde que llegó este `endsAt`. */
  private readonly seenAt = linkedSignal(() => {
    this.endsAt();
    return untracked(this.clock.now);
  });

  protected readonly seconds = computed(() => {
    const endsAt = this.endsAt();
    if (endsAt === null) return null;
    return Math.max(0, Math.ceil((endsAt - this.clock.now()) / 1000));
  });

  /** Parte del tiempo que queda, de 1 (recién empezado) a 0. */
  private readonly left = computed(() => {
    const end = this.endsAt();
    if (end === null) return 0;
    const start = this.startedAt() ?? this.seenAt();
    if (end <= start) return 0;
    return Math.min(1, Math.max(0, (end - this.clock.now()) / (end - start)));
  });

  protected readonly offset = computed(() => 100 - this.left() * 100);
  protected readonly urgent = computed(() => {
    const s = this.seconds();
    return s !== null && s <= 10;
  });

  protected readonly label = computed(() => {
    const s = this.seconds();
    if (s === null) return '–';
    return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s);
  });

  protected readonly ariaLabel = computed(() => {
    const s = this.seconds();
    return s === null ? 'Sin límite de tiempo' : `Quedan ${s} segundos`;
  });
}
