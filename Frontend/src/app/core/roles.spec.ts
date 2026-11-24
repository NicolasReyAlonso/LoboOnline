import { availablePowers, compositionChips, roleIcon, roleName, rolesInOrder, villagersName } from './roles';
import { activeSeason } from './season';

describe('personajes por temporada', () => {
  afterEach(() => activeSeason.set(null));

  it('fuera de temporada son los de siempre y no hay Papá Noel', () => {
    expect(roleName('hunter')).toBe('Cazador');
    expect(villagersName()).toBe('Aldeanos');
    expect(rolesInOrder()).not.toContain('santa');
    expect(availablePowers()).not.toContain('santa');
  });

  it('en Navidad hay Grinch, elfos, Mamá Claus y Papá Noel', () => {
    activeSeason.set('christmas');
    expect(roleName('hunter')).toBe('Grinch');
    expect(roleName('villager')).toBe('Elfo');
    expect(roleName('protector')).toBe('Mamá Claus');
    expect(roleName('seer')).toBe('Vidente');
    expect(roleName('werewolf')).toBe('Lobo');
    expect(roleIcon('santa')).toBe('🎅');
    expect(villagersName()).toBe('Elfos');
    expect(rolesInOrder()).toContain('santa');
    expect(availablePowers()).toContain('santa');
    expect(compositionChips({ powers: { santa: 1 }, wolves: { min: 1, max: 1 } }).map((c) => c.label)).toEqual([
      '🐺 1 lobo',
      '🎅 Papá Noel',
      '🧝 Elfos (el resto)',
    ]);
  });

  it('se puede pedir una temporada concreta sin cambiar la activa', () => {
    expect(roleName('hunter', 'christmas')).toBe('Grinch');
    expect(roleName('hunter')).toBe('Cazador');
  });
});
