import { TestBed } from '@angular/core/testing';
import type { Role } from '@lobo/game/types';
import { DRAWN_CARDS } from '../../core/role-cards';
import { activeSeason } from '../../core/season';
import { CardArt, cardKey } from './card-art';

function render(role: Role) {
  const fixture = TestBed.createComponent(CardArt);
  fixture.componentRef.setInput('role', role);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CardArt', () => {
  afterEach(() => activeSeason.set(null));

  it('pinta el dibujo con las máscaras de public/tarjetas/', () => {
    const el = render('werewolf');
    expect(el.getAttribute('aria-label')).toBe('Tarjeta: Lobo');
    const lines = el.querySelector<HTMLElement>('.lines')!;
    expect(lines.style.getPropertyValue('--mask')).toContain('/tarjetas/werewolf-lineas.png');
    expect(el.querySelector<HTMLElement>('.paper')!.style.getPropertyValue('--mask')).toContain('werewolf-silueta.png');
  });

  it('sin dibujo, usa una tarjeta provisional con el icono y el nombre', () => {
    // Ahora todos tienen dibujo: se simula que a la vidente le falta.
    const drawn = DRAWN_CARDS as Set<string>;
    drawn.delete('seer');
    try {
      const el = render('seer');
      expect(el.querySelector('.lines')).toBeNull();
      expect(el.querySelector('.placeholder')?.textContent).toContain('Vidente');
    } finally {
      drawn.add('seer');
    }
  });

  it('todos los personajes clásicos tienen ya su tarjeta', () => {
    for (const role of ['cupid', 'hunter', 'protector', 'seer', 'villager', 'werewolf', 'witch']) {
      expect(DRAWN_CARDS.has(role)).toBe(true);
    }
  });

  it('en Navidad los disfraces usan su propia tarjeta, nunca la del personaje de siempre', () => {
    expect(cardKey('hunter', 'christmas')).toBe('christmas/hunter');
    expect(cardKey('seer', 'christmas')).toBe('seer');
    expect(cardKey('hunter', null)).toBe('hunter');
    // El lobo se sigue llamando Lobo, pero tiene dibujo de Navidad.
    expect(cardKey('werewolf', 'christmas')).toBe('christmas/werewolf');
    expect(cardKey('werewolf', null)).toBe('werewolf');

    activeSeason.set('christmas');
    const grinch = render('hunter');
    expect(grinch.getAttribute('aria-label')).toBe('Tarjeta: Grinch');
    if (DRAWN_CARDS.has('christmas/hunter')) {
      expect(grinch.querySelector<HTMLElement>('.lines')!.style.getPropertyValue('--mask')).toContain(
        '/tarjetas/christmas/hunter-lineas.png',
      );
    } else {
      expect(grinch.querySelector('.placeholder')?.textContent).toContain('Grinch');
    }
    // La vidente no cambia en Navidad: sigue con su dibujo.
    expect(render('seer').querySelector<HTMLElement>('.lines')!.style.getPropertyValue('--mask')).toContain(
      '/tarjetas/seer-lineas.png',
    );
  });
});
