import { TestBed } from '@angular/core/testing';
import { PlayerCard, type CardState } from './player-card';

const base: CardState = {
  player: { id: 'p1', name: 'Ana', alive: true, role: null, lover: null },
  avatar: 'zorro',
  me: false,
  pickable: false,
  selected: false,
  voted: false,
  ready: false,
  offline: false,
  voters: [],
};

function render(card: Partial<CardState>) {
  const fixture = TestBed.createComponent(PlayerCard);
  fixture.componentRef.setInput('card', { ...base, ...card });
  const picks: unknown[] = [];
  fixture.componentInstance.pick.subscribe(() => picks.push(true));
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, picks };
}

describe('PlayerCard', () => {
  it('pinta el avatar y el nombre; el personaje, solo si se sabe', () => {
    const { el } = render({});
    expect(el.querySelector('img.art')?.getAttribute('src')).toBe('avatars/zorro.webp');
    expect(el.querySelector('.name')?.textContent).toContain('Ana');
    expect(el.querySelector('.role')).toBeNull();

    const known = render({ player: { ...base.player, role: 'werewolf' } }).el;
    expect(known.querySelector('.role')?.textContent).toContain('Lobo');
    expect(known.querySelector('.role')?.classList.contains('wolf')).toBe(true);
  });

  it('enseña quién le vota', () => {
    const { el } = render({
      voters: [
        { id: 'p2', name: 'Bea', avatar: 'rata' },
        { id: 'p3', name: 'Carlos', avatar: null },
      ],
    });
    expect(el.querySelector('.voters .count')?.textContent?.trim()).toBe('2');
    expect(el.querySelectorAll('.voters img, .voters .initial')).toHaveLength(2);
    const button = el.querySelector('button')!;
    expect(button.getAttribute('title')).toBe('Le votan: Bea, Carlos');
    expect(button.getAttribute('aria-label')).toContain('Le votan: Bea, Carlos');
  });

  it('solo se puede elegir cuando toca', () => {
    const idle = render({});
    idle.el.querySelector('button')!.click();
    expect(idle.picks).toHaveLength(0);

    const pickable = render({ pickable: true });
    pickable.el.querySelector('button')!.click();
    expect(pickable.picks).toHaveLength(1);
  });

  it('los muertos salen con calavera', () => {
    const { el } = render({ player: { ...base.player, alive: false } });
    expect(el.querySelector('.pcard')?.classList.contains('dead')).toBe(true);
    expect(el.querySelector('.skull')).not.toBeNull();
  });
});
