import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/createGame.js';
import { countRoles, dealRoles, MAX_PLAYERS, MAX_WOLVES, MIN_PLAYERS, planComposition } from '../src/game/roles.js';
import { DEFAULT_SETTINGS } from '../src/game/settings.js';
import type { RoleCounts } from '../src/game/types.js';

const ALL_POWERS = { seer: 1, witch: 1, hunter: 1, cupid: 1, protector: 1 };

const plan = (players: number, maxWolves: number, roles: RoleCounts | null = null, minWolves = 1) =>
  planComposition(players, { roles, minWolves, maxWolves });

describe('reparto de roles', () => {
  it('el número de lobos se sortea entre 1 y el máximo', () => {
    const composition = plan(10, 3);
    expect(composition.wolves).toEqual({ min: 1, max: 3 });
    const seen = [0, 0.34, 0.67, 0.999].map((r) => countRoles(dealRoles(10, composition, () => r)).werewolf);
    expect(seen).toEqual([1, 2, 3, 3]);
  });

  it('con mínimo, el número de lobos se sortea entre el mínimo y el máximo', () => {
    const composition = plan(12, 4, null, 2);
    expect(composition.wolves).toEqual({ min: 2, max: 4 });
    const seen = [0, 0.34, 0.67, 0.999].map((r) => countRoles(dealRoles(12, composition, () => r)).werewolf);
    expect(seen).toEqual([2, 3, 4, 4]);
  });

  it('si el mínimo no cabe con los jugadores que hay, baja hasta el máximo recortado', () => {
    expect(plan(6, 6, null, 4).wolves).toEqual({ min: 2, max: 2 });
    expect(plan(9, 5, null, 3).wolves).toEqual({ min: 3, max: 4 });
  });

  it('el máximo se recorta para que haya menos lobos que aldeanos y quepan los personajes', () => {
    expect(plan(4, 6).wolves.max).toBe(1);
    expect(plan(7, 6).wolves.max).toBe(3);
    expect(plan(6, 3, ALL_POWERS).wolves.max).toBe(1);
  });

  it('cualquier combinación permitida da un reparto válido', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let max = 1; max <= MAX_WOLVES; max++) {
        for (let min = 1; min <= max; min++) {
          const composition = plan(n, max, null, min);
          for (const r of [0, 0.5, 0.999]) {
            const roles = dealRoles(n, composition, () => r);
            const counts = countRoles(roles);
            expect(roles).toHaveLength(n);
            expect(counts.werewolf).toBeGreaterThanOrEqual(Math.min(min, composition.wolves.max));
            expect(counts.werewolf).toBeLessThanOrEqual(max);
            expect(counts.werewolf * 2).toBeLessThan(n);
          }
        }
      }
    }
  });

  it('los aldeanos rellenan los huecos de un reparto personalizado', () => {
    const counts = countRoles(dealRoles(8, plan(8, 2, { witch: 1 }), () => 0.999));
    expect(counts).toMatchObject({ werewolf: 2, witch: 1, villager: 5, seer: 0 });
  });

  it('rechaza repartos imposibles', () => {
    expect(() => plan(3, 2)).toThrow(/al menos/);
    expect(() => plan(6, 0)).toThrow(/máximo de lobos/);
    expect(() => plan(6, MAX_WOLVES + 1)).toThrow(/máximo de lobos/);
    expect(() => plan(6, 2, null, 0)).toThrow(/mínimo de lobos/);
    expect(() => plan(6, 2, null, 3)).toThrow(/mínimo de lobos no puede ser mayor/);
    expect(() => plan(6, 1, { seer: 2 })).toThrow(/Como mucho/);
    expect(() => plan(4, 1, ALL_POWERS)).toThrow(/al menos un lobo/);
  });
});

describe('createGame', () => {
  const players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));

  it('reparte un rol a cada jugador y empieza la primera noche', () => {
    const game = createGame(players, { ...DEFAULT_SETTINGS, maxWolves: 3 });
    expect(game.night).toBe(1);
    expect(game.phase).toBe('night_cupid'); // con 10 jugadores hay Cupido
    const wolves = players.filter((p) => game.playerInfo(p.id)?.role === 'werewolf').length;
    expect(wolves).toBeGreaterThanOrEqual(1);
    expect(wolves).toBeLessThanOrEqual(3);
  });

  it('respeta el mínimo de lobos', () => {
    for (let i = 0; i < 20; i++) {
      const game = createGame(players, { ...DEFAULT_SETTINGS, minWolves: 3, maxWolves: 4 });
      const wolves = players.filter((p) => game.playerInfo(p.id)?.role === 'werewolf').length;
      expect(wolves).toBeGreaterThanOrEqual(3);
      expect(wolves).toBeLessThanOrEqual(4);
    }
  });

  it('nadie que no sea lobo puede saber cuántos lobos hay', () => {
    for (let i = 0; i < 20; i++) {
      const game = createGame(players, { ...DEFAULT_SETTINGS, maxWolves: 3 });
      const villager = players.find((p) => game.playerInfo(p.id)?.role !== 'werewolf')!;
      const view = game.viewFor(villager.id);
      expect(view.composition.wolves).toEqual({ min: 1, max: 3 });
      // Ni el rol de lobo ni el número de aldeanos aparecen en lo que recibe.
      expect(JSON.stringify(view)).not.toMatch(/werewolf|villager"?:\s*\d/);
    }
  });
});
