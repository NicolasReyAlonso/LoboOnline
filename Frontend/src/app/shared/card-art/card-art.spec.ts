import { TestBed } from '@angular/core/testing';
import { CardArt } from './card-art';

function render(role: 'werewolf' | 'seer') {
  const fixture = TestBed.createComponent(CardArt);
  fixture.componentRef.setInput('role', role);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CardArt', () => {
  it('pinta el dibujo con las máscaras de public/tarjetas/', () => {
    const el = render('werewolf');
    expect(el.getAttribute('aria-label')).toBe('Tarjeta: Lobo');
    const lines = el.querySelector<HTMLElement>('.lines')!;
    expect(lines.style.getPropertyValue('--mask')).toContain('/tarjetas/werewolf-lineas.png');
    expect(el.querySelector<HTMLElement>('.paper')!.style.getPropertyValue('--mask')).toContain('werewolf-silueta.png');
  });

  it('sin dibujo, usa una tarjeta provisional con el icono y el nombre', () => {
    const el = render('seer');
    expect(el.querySelector('.lines')).toBeNull();
    expect(el.querySelector('.placeholder')?.textContent).toContain('Vidente');
  });
});
