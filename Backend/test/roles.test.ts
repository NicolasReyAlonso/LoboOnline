import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/createGame.js';
import { buildRoleList, countRoles, defaultRoleCounts, MAX_PLAYERS, MIN_PLAYERS } from '../src/game/roles.js';
import { DEFAULT_SETTINGS } from '../src/game/settings.js';

describe('reparto de roles', () => {
  it('el reparto automático es válido para cualquier número de jugadores permitido', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const roles = buildRoleList(n, null);
      expect(roles).toHaveLength(n);
      const counts = countRoles(roles);
      expect(counts.werewolf).toBe(defaultRoleCounts(n).werewolf);
      expect(counts.werewolf * 2).toBeLessThan(n);
    }
  });

  it('los aldeanos rellenan los huecos de un reparto personalizado', () => {
    const counts = countRoles(buildRoleList(8, { werewolf: 2, witch: 1 }));
    expect(counts).toMatchObject({ werewolf: 2, witch: 1, villager: 5, seer: 0 });
  });

  it('rechaza repartos imposibles', () => {
    expect(() => buildRoleList(3, null)).toThrow(/al menos/);
    expect(() => buildRoleList(6, { werewolf: 3 })).toThrow(/menos lobos/);
    expect(() => buildRoleList(6, { werewolf: 0, seer: 1 })).toThrow(/al menos un lobo/);
    expect(() => buildRoleList(6, { werewolf: 1, seer: 2 })).toThrow(/Como mucho/);
    expect(() => buildRoleList(4, { werewolf: 1, seer: 1, witch: 1, hunter: 1, cupid: 1 })).toThrow(/cartas especiales/);
  });

  it('createGame reparte un rol a cada jugador y empieza la primera noche', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `J${i}` }));
    const game = createGame(players, DEFAULT_SETTINGS);
    expect(game.night).toBe(1);
    expect(game.phase).toBe('night_cupid');
    const roles = players.map((p) => game.playerInfo(p.id)?.role);
    expect(countRoles(roles.filter((r) => r !== undefined))).toEqual(countRoles(buildRoleList(8, null)));
  });
});
