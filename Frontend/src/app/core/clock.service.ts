import { Injectable, signal } from '@angular/core';

/**
 * Reloj ajustado a la hora del servidor. Las fases terminan en `endsAt`
 * (hora del servidor) y el reloj de un móvil puede ir desfasado varios segundos.
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private offset = 0;
  private readonly tick = signal(Date.now());

  /** Hora del servidor estimada, actualizada 4 veces por segundo. */
  readonly now = this.tick.asReadonly();

  constructor() {
    setInterval(() => this.tick.set(Date.now() + this.offset), 250);
  }

  sync(serverTime: number): void {
    this.offset = serverTime - Date.now();
    this.tick.set(serverTime);
  }
}
