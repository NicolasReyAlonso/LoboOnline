import { TestBed } from '@angular/core/testing';
import { ClockService } from '../../core/clock.service';
import { PhaseClock } from './phase-clock';

function render(endsAt: number | null, startedAt: number | null) {
  TestBed.inject(ClockService).sync(1_000_000);
  const fixture = TestBed.createComponent(PhaseClock);
  fixture.componentRef.setInput('endsAt', endsAt);
  fixture.componentRef.setInput('startedAt', startedAt);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    time: el.querySelector('.time')!.textContent!.trim(),
    urgent: el.querySelector('.clock')!.classList.contains('urgent'),
    label: el.querySelector('.clock')!.getAttribute('aria-label'),
  };
}

describe('PhaseClock', () => {
  it('muestra los segundos que quedan', () => {
    expect(render(1_030_000, 970_000)).toEqual({ time: '30', urgent: false, label: 'Quedan 30 segundos' });
  });

  it('a partir de un minuto, en minutos y segundos', () => {
    expect(render(1_095_000, 1_000_000).time).toBe('1:35');
  });

  it('en los últimos 10 segundos avisa', () => {
    expect(render(1_008_000, 990_000)).toMatchObject({ time: '8', urgent: true });
  });

  it('sin límite de tiempo', () => {
    expect(render(null, null)).toEqual({ time: '–', urgent: false, label: 'Sin límite de tiempo' });
  });
});
