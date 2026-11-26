import { Directive, ElementRef, inject, input } from '@angular/core';

const VARS = ['--tilt-x', '--tilt-y', '--shift-x', '--shift-y', '--shine-x', '--shine-y', '--shine'] as const;

/**
 * Inclina el elemento hacia el ratón y mueve un brillo por encima, como una
 * carta que tienes en la mano. Solo con ratón (no al tocar) y si el sistema no
 * pide reducir el movimiento.
 *
 * No toca el `transform`: deja variables CSS que cada carta usa a su manera:
 * - `--tilt-x`, `--tilt-y`: giro en grados (para `rotateX` y `rotateY`).
 * - `--shift-x`, `--shift-y`: un pequeño desplazamiento hacia el ratón.
 * - `--shine-x`, `--shine-y`: dónde está el ratón (en %), para el brillo.
 * - `--shine`: 1 mientras el ratón está encima, 0 si no.
 */
@Directive({
  selector: '[appTilt]',
  host: {
    '(pointermove)': 'move($event)',
    '(pointerleave)': 'reset()',
  },
})
export class Tilt {
  /** Giro máximo, en grados. */
  readonly appTilt = input<number | ''>(14);

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');

  protected move(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || this.reduced.matches) return;
    const box = this.el.getBoundingClientRect();
    if (!box.width || !box.height) return;
    // De -0.5 a 0.5 respecto al centro.
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    const max = this.appTilt() || 14;
    const style = this.el.style;
    // La carta "mira" al ratón: el lado que tiene encima se aleja un poco.
    style.setProperty('--tilt-x', `${(-y * max).toFixed(2)}deg`);
    style.setProperty('--tilt-y', `${(x * max).toFixed(2)}deg`);
    style.setProperty('--shift-x', `${(x * 8).toFixed(1)}px`);
    style.setProperty('--shift-y', `${(y * 8).toFixed(1)}px`);
    style.setProperty('--shine-x', `${((x + 0.5) * 100).toFixed(1)}%`);
    style.setProperty('--shine-y', `${((y + 0.5) * 100).toFixed(1)}%`);
    style.setProperty('--shine', '1');
  }

  protected reset(): void {
    for (const name of VARS) this.el.style.removeProperty(name);
  }
}
