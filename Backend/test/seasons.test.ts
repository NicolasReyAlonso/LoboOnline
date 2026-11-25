import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/createGame.js';
import { defaultPowers, planComposition } from '../src/game/roles.js';
import { parseSeasonOverride, roleInfo, seasonAt } from '../src/game/seasons.js';
import { DEFAULT_SETTINGS } from '../src/game/settings.js';
import { passDay, setupGame } from './helpers.js';

const day = (month: number, d: number, year = 2026) => new Date(year, month - 1, d, 12);

describe('temporadas', () => {
  it('la Navidad va del 23 de noviembre al 7 de enero, ambos incluidos, todos los años', () => {
    expect(seasonAt(day(11, 22))).toBeNull();
    expect(seasonAt(day(11, 23))).toBe('christmas');
    expect(seasonAt(day(12, 31))).toBe('christmas');
    expect(seasonAt(day(1, 1, 2027))).toBe('christmas');
    expect(seasonAt(day(1, 7, 2027))).toBe('christmas');
    expect(seasonAt(day(1, 8, 2027))).toBeNull();
    expect(seasonAt(day(7, 15))).toBeNull();
    expect(seasonAt(day(11, 30, 2031))).toBe('christmas');
  });

  it('en Navidad el cazador es el Grinch, los aldeanos elfos y el protector Mamá Claus', () => {
    expect(roleInfo('hunter', 'christmas').name).toBe('Grinch');
    expect(roleInfo('villager', 'christmas').name).toBe('Elfo');
    expect(roleInfo('protector', 'christmas').name).toBe('Mamá Claus');
    // Los demás no cambian, y el bando tampoco.
    expect(roleInfo('werewolf', 'christmas').name).toBe('Lobo');
    expect(roleInfo('seer', 'christmas').name).toBe('Vidente');
    expect(roleInfo('hunter', 'christmas').team).toBe('village');
    expect(roleInfo('hunter', null).name).toBe('Cazador');
  });

  it('la variable SEASON fuerza una temporada o ninguna', () => {
    expect(parseSeasonOverride(undefined)).toBeUndefined();
    expect(parseSeasonOverride('auto')).toBeUndefined();
    expect(parseSeasonOverride('none')).toBeNull();
    expect(parseSeasonOverride('christmas')).toBe('christmas');
    expect(() => parseSeasonOverride('halloween')).toThrow(/SEASON/);
  });
});

describe('Papá Noel en el reparto', () => {
  const wolves = { minWolves: 1, maxWolves: 2 };

  it('solo sale en Navidad, y entonces está en el reparto automático desde 5 jugadores', () => {
    expect(defaultPowers(5, 'christmas')).toMatchObject({ santa: 1 });
    expect(defaultPowers(4, 'christmas').santa).toBeUndefined();
    expect(defaultPowers(10, null).santa).toBeUndefined();
    expect(planComposition(6, { ...wolves, roles: null }, 'christmas').powers.santa).toBe(1);
  });

  it('si se eligió y ya no es Navidad, simplemente no se reparte', () => {
    expect(planComposition(6, { ...wolves, roles: { seer: 1, santa: 1 } }, 'christmas').powers).toEqual({ seer: 1, santa: 1 });
    expect(planComposition(6, { ...wolves, roles: { seer: 1, santa: 1 } }, null).powers).toEqual({ seer: 1 });
    const players = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));
    const game = createGame(players, { ...DEFAULT_SETTINGS, roles: { santa: 1 } }, { season: null });
    expect(players.some((p) => game.playerInfo(p.id)?.role === 'santa')).toBe(false);
  });
});

describe('Papá Noel en partida', () => {
  it('cada noche descubre la carta de un jugador vivo al azar, aunque se repita', () => {
    // rng = 0: siempre le toca el primer jugador vivo que no es él (el lobo).
    const { game } = setupGame(['werewolf', 'santa', 'villager', 'villager', 'villager']);
    expect(game.viewFor('p1').privateLog).toEqual([{ kind: 'gift', night: 1, targetId: 'p0', role: 'werewolf' }]);
    expect(game.viewFor('p1').players.map((p) => p.role)).toEqual(['werewolf', 'santa', null, null, null]);
    expect(game.viewFor('p2').privateLog).toEqual([]);

    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    passDay(game, ['p0', 'p1', 'p3', 'p4']);
    expect(game.night).toBe(2);
    expect(game.viewFor('p1').privateLog).toEqual([
      { kind: 'gift', night: 1, targetId: 'p0', role: 'werewolf' },
      { kind: 'gift', night: 2, targetId: 'p0', role: 'werewolf' },
    ]);
  });

  it('nunca se descubre a sí mismo ni a los muertos', () => {
    const { game } = setupGame(['santa', 'werewolf', 'villager', 'villager', 'villager']);
    game.act('p1', { type: 'wolf_vote', target: 'p2' });
    passDay(game, ['p0', 'p1', 'p3', 'p4']);
    const gift = game.viewFor('p0').privateLog.at(-1);
    // Con rng = 0 le toca el primero de los vivos sin contarle a él: p1 (p2 ha muerto).
    expect(gift).toEqual({ kind: 'gift', night: 2, targetId: 'p1', role: 'werewolf' });
  });

  it('si Papá Noel está muerto ya no hay regalos', () => {
    const { game } = setupGame(['werewolf', 'santa', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p1' });
    passDay(game, ['p0', 'p2', 'p3', 'p4']);
    expect(game.night).toBe(2);
    expect(game.viewFor('p1').privateLog.filter((e) => e.kind === 'gift')).toHaveLength(1);
  });
});
