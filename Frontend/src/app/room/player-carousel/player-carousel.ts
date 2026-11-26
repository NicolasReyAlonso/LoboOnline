import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { PlayerCard, type CardState } from '../player-card/player-card';

/** Fila de tarjetas de jugadores que se desliza con el dedo, la rueda o las flechas. */
@Component({
  selector: 'app-player-carousel',
  imports: [PlayerCard],
  templateUrl: './player-carousel.html',
  styleUrl: './player-carousel.scss',
  host: { '(window:resize)': 'updateEnds()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerCarousel {
  readonly cards = input.required<readonly CardState[]>();
  readonly pick = output<string>();

  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  protected readonly canPrev = signal(false);
  protected readonly canNext = signal(false);

  constructor() {
    afterRenderEffect(() => {
      this.cards();
      this.updateEnds();
    });
  }

  protected updateEnds(): void {
    const el = this.track().nativeElement;
    this.canPrev.set(el.scrollLeft > 4);
    this.canNext.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  protected scroll(direction: 1 | -1): void {
    const el = this.track().nativeElement;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }
}
