import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/createGame.js';
import { countRoles, dealRoles, MAX_PLAYERS, MAX_WOLVES, MIN_PLAYERS, planComposition } from '../src/game/roles.js';
import { DEFAULT_SETTINGS } from '../src/game/settings.js';

const ALL_POWERS = { seer: 1, witch: 1, hunter: 1, cupid: 1, protector: 1 };

describe('reparto de roles', () => {
  it('el número de lobos se sortea entre 1 y el máximo', () => {
    const plan = planComposition(10, null, 3);
    expect(plan.wolves).toEqual({ min: 1, max: 3 });
    const seen = [0, 0.34, 0.67, 0.999].map((r) => countRoles(dealRoles(10, plan, () => r)).werewolf);
    expect(seen).toEqual([1, 2, 3, 3]);
  });

  it('el máximo se recorta para que haya menos lobos que aldeanos y quepan los personajes', () => {
    expect(planComposition(4, null, 6).wolves.max).toBe(1);
    expect(planComposition(7, null, 6).wolves.max).toBe(3);
    expect(planComposition(6, ALL_POWERS, 3).wolves.max).toBe(1);
  });

  it('cualquier combinación permitida da un reparto válido', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      for (let max = 1; max <= MAX_WOLVES; max++) {
        const plan = planComposition(n, null, max);
        for (const r of [0, 0.5, 0.999]) {
          const roles = dealRoles(n, plan, () => r);
          const counts = countRoles(roles);
          expect(roles).toHaveLength(n);
          expect(counts.werewolf).toBeGreaterThanOrEqual(1);
          expect(counts.werewolf).toBeLessThanOrEqual(max);
          expect(counts.werewolf * 2).toBeLessThan(n);
        }
      }
    }
  });

  it('los aldeanos rellenan los huecos de un reparto personalizado', () => {
    const counts = countRoles(dealRoles(8, planComposition(8, { witch: 1 }, 2), () => 0.999));
    expect(counts).toMatchObject({ werewolf: 2, witch: 1, villager: 5, seer: 0 });
  });

  it('rechaza repartos imposibles', () => {
    expect(() => planComposition(3, null, 2)).toThrow(/al menos/);
    expect(() => planComposition(6, null, 0)).toThrow(/máximo de lobos/);
    expect(() => planComposition(6, null, MAX_WOLVES + 1)).toThrow(/máximo de lobos/);
    expect(() => planComposition(6, { seer: 2 }, 1)).toThrow(/Como mucho/);
    expect(() => planComposition(4, ALL_POWERS, 1)).toThrow(/al menos un lobo/);
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
