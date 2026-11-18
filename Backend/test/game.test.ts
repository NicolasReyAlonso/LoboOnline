import { describe, expect, it } from 'vitest';
import { GameError } from '../src/game/errors.js';
import { passDay, setupGame, skipTo } from './helpers.js';

describe('orden de la noche', () => {
  it('se salta los roles que no están en la partida', () => {
    const { game } = setupGame(['werewolf', 'seer', 'villager', 'villager']);
    expect(game.phase).toBe('night_seer');
    expect(game.night).toBe(1);
  });

  it('cupido solo actúa la primera noche', () => {
    const { game } = setupGame(['werewolf', 'cupid', 'villager', 'villager', 'villager']);
    expect(game.phase).toBe('night_cupid');
    game.act('p1', { type: 'cupid', targets: ['p2', 'p3'] });
    expect(game.phase).toBe('night_wolves');
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    passDay(game, ['p0', 'p1', 'p2', 'p3']);
    expect(game.night).toBe(2);
    expect(game.phase).toBe('night_wolves');
  });
});

describe('vidente', () => {
  it('descubre el rol del jugador que mira', () => {
    const { game } = setupGame(['werewolf', 'seer', 'villager', 'villager']);
    game.act('p1', { type: 'see', target: 'p0' });
    const view = game.viewFor('p1');
    expect(view.privateLog).toContainEqual({ kind: 'vision', night: 1, targetId: 'p0', role: 'werewolf' });
    expect(view.players.find((p) => p.id === 'p0')?.role).toBe('werewolf');
    expect(game.phase).toBe('night_wolves');
  });

  it('no puede mirarse a sí misma ni actuar fuera de su turno', () => {
    const { game } = setupGame(['werewolf', 'seer', 'villager', 'villager']);
    expect(() => game.act('p1', { type: 'see', target: 'p1' })).toThrow(GameError);
    expect(() => game.act('p2', { type: 'see', target: 'p0' })).toThrow(/No es tu turno/);
  });
});

describe('lobos', () => {
  it('matan a su víctima si todos están de acuerdo', () => {
    const { game } = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    expect(game.phase).toBe('night_wolves'); // falta el otro lobo
    game.act('p1', { type: 'wolf_vote', target: 'p2' });
    expect(game.phase).toBe('dawn');
    const dawn = game.viewFor('p3').log.at(-1);
    expect(dawn).toEqual({ kind: 'dawn', day: 1, deaths: [{ playerId: 'p2', cause: 'night', role: 'villager' }] });
  });

  it('si no se ponen de acuerdo, al acabar el tiempo gana el más votado', () => {
    const { game } = setupGame(['werewolf', 'werewolf', 'werewolf', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p3' });
    game.act('p1', { type: 'wolf_vote', target: 'p4' });
    game.act('p2', { type: 'wolf_vote', target: 'p4' });
    expect(game.phase).toBe('night_wolves');
    game.timeout();
    expect(game.viewFor('p0').players.find((p) => p.id === 'p4')?.alive).toBe(false);
  });

  it('no pueden atacar a otro lobo', () => {
    const { game } = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
    expect(() => game.act('p0', { type: 'wolf_vote', target: 'p1' })).toThrow(/otro lobo/);
  });

  it('se ven entre ellos y ven los votos de la manada', () => {
    const { game } = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    const view = game.viewFor('p1');
    expect(view.players.find((p) => p.id === 'p0')?.role).toBe('werewolf');
    expect(view.action).toMatchObject({ type: 'wolf_vote', votes: { p0: 'p2' } });
    expect(view.action?.type === 'wolf_vote' && view.action.targets).toEqual(['p2', 'p3', 'p4']);
  });
});

describe('bruja', () => {
  it('ve a la víctima, puede salvarla y después envenenar', () => {
    const { game } = setupGame(['werewolf', 'witch', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    expect(game.phase).toBe('night_witch');
    expect(game.viewFor('p1').action).toMatchObject({ type: 'witch', victimId: 'p2', canHeal: true, canPoison: true });

    game.act('p1', { type: 'witch', heal: true, poison: null });
    expect(game.phase).toBe('dawn');
    expect(game.viewFor('p2').log.at(-1)).toMatchObject({ kind: 'dawn', deaths: [] });

    passDay(game, ['p0', 'p1', 'p2', 'p3', 'p4']);
    game.act('p0', { type: 'wolf_vote', target: 'p3' });
    expect(game.viewFor('p1').action).toMatchObject({ type: 'witch', canHeal: false, canPoison: true });
    expect(() => game.act('p1', { type: 'witch', heal: true, poison: null })).toThrow(GameError);
    game.act('p1', { type: 'witch', heal: false, poison: 'p4' });
    const dawn = game.viewFor('p2').log.at(-1);
    expect(dawn).toMatchObject({ kind: 'dawn', deaths: [{ playerId: 'p3' }, { playerId: 'p4' }] });
  });

  it('sin pociones su turno sigue existiendo pero no puede hacer nada', () => {
    const { game } = setupGame(['werewolf', 'witch', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    game.act('p1', { type: 'witch', heal: true, poison: 'p3' });
    passDay(game, ['p0', 'p1', 'p2', 'p4', 'p5']);
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    expect(game.phase).toBe('night_witch');
    expect(game.viewFor('p1').action).toBeNull();
    game.timeout();
    expect(game.phase).toBe('dawn');
  });
});

describe('protector', () => {
  it('salva a quien protege', () => {
    const { game } = setupGame(['werewolf', 'protector', 'villager', 'villager', 'villager']);
    game.act('p1', { type: 'protect', target: 'p2' });
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    expect(game.viewFor('p2').log.at(-1)).toMatchObject({ kind: 'dawn', deaths: [] });
  });

  it('no puede proteger a la misma persona dos noches seguidas', () => {
    const { game } = setupGame(['werewolf', 'protector', 'villager', 'villager', 'villager']);
    game.act('p1', { type: 'protect', target: 'p2' });
    game.act('p0', { type: 'wolf_vote', target: 'p3' });
    passDay(game, ['p0', 'p1', 'p2', 'p4']);
    expect(game.phase).toBe('night_protector');
    expect(game.viewFor('p1').action).toMatchObject({ type: 'protect', forbiddenId: 'p2' });
    expect(() => game.act('p1', { type: 'protect', target: 'p2' })).toThrow(/dos noches seguidas/);
    game.act('p1', { type: 'protect', target: 'p1' });
    expect(game.phase).toBe('night_wolves');
  });
});

describe('cupido y enamorados', () => {
  it('los enamorados se conocen y si uno muere el otro muere de pena', () => {
    const { game } = setupGame(['werewolf', 'cupid', 'villager', 'villager', 'villager', 'villager']);
    game.act('p1', { type: 'cupid', targets: ['p2', 'p3'] });
    const v2 = game.viewFor('p2');
    expect(v2.me?.loverId).toBe('p3');
    expect(v2.players.find((p) => p.id === 'p3')).toMatchObject({ role: 'villager', lover: true });
    expect(game.viewFor('p4').players.find((p) => p.id === 'p3')?.lover).toBeNull();

    game.act('p0', { type: 'wolf_vote', target: 'p5' });
    skipTo(game, 'day_vote');
    for (const id of ['p0', 'p1', 'p2', 'p3', 'p4']) game.act(id, { type: 'vote', target: 'p2' });
    expect(game.phase).toBe('dusk');
    expect(game.viewFor('p4').log.at(-1)).toMatchObject({
      kind: 'vote_result',
      lynchedId: 'p2',
      deaths: [
        { playerId: 'p2', cause: 'lynch' },
        { playerId: 'p3', cause: 'grief' },
      ],
    });
  });

  it('una pareja lobo + aldeano gana si son los dos últimos', () => {
    const { game } = setupGame(['werewolf', 'cupid', 'villager', 'villager']);
    game.act('p1', { type: 'cupid', targets: ['p0', 'p2'] });
    game.act('p0', { type: 'wolf_vote', target: 'p3' });
    skipTo(game, 'day_vote');
    game.act('p0', { type: 'vote', target: 'p1' });
    game.act('p2', { type: 'vote', target: 'p1' });
    game.act('p1', { type: 'vote', target: 'p0' });
    game.timeout(); // fin del atardecer
    expect(game.phase).toBe('ended');
    expect(game.viewFor('p1').winner).toEqual({ side: 'lovers', playerIds: ['p0', 'p2'] });
  });
});

describe('cazador', () => {
  it('al morir dispara, y si mata al último lobo gana el pueblo', () => {
    const { game } = setupGame(['werewolf', 'hunter', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p1' });
    expect(game.phase).toBe('dawn');
    game.timeout();
    expect(game.phase).toBe('hunter');
    expect(game.viewFor('p2').hunterId).toBe('p1');
    expect(game.viewFor('p1').action).toEqual({ type: 'shoot', targets: ['p0', 'p2', 'p3'] });
    expect(() => game.act('p2', { type: 'shoot', target: 'p0' })).toThrow(/No es tu turno/);

    game.act('p1', { type: 'shoot', target: 'p0' });
    expect(game.phase).toBe('ended');
    expect(game.viewFor('p2').winner).toEqual({ side: 'village', playerIds: ['p1', 'p2', 'p3'] });
  });

  it('si no dispara a tiempo, pierde el disparo y la partida sigue', () => {
    const { game } = setupGame(['werewolf', 'hunter', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p1' });
    game.timeout(); // amanecer
    expect(game.phase).toBe('hunter');
    game.timeout();
    expect(game.phase).toBe('day_discussion');
    expect(game.viewFor('p2').log.at(-1)).toEqual({ kind: 'hunter_shot', hunterId: 'p1', targetId: null, deaths: [] });
  });

  it('linchado de día, dispara antes de la noche', () => {
    const { game } = setupGame(['werewolf', 'hunter', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    skipTo(game, 'day_vote');
    for (const id of ['p0', 'p1', 'p3', 'p4']) game.act(id, { type: 'vote', target: 'p1' });
    game.timeout(); // atardecer
    expect(game.phase).toBe('hunter');
    game.act('p1', { type: 'shoot', target: 'p3' });
    expect(game.phase).toBe('night_wolves');
    expect(game.night).toBe(2);
  });
});

describe('votación de día', () => {
  it('un empate no lincha a nadie', () => {
    const { game } = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    skipTo(game, 'day_vote');
    game.act('p0', { type: 'vote', target: 'p1' });
    game.act('p1', { type: 'vote', target: 'p0' });
    game.act('p2', { type: 'vote', target: 'p0' });
    game.act('p3', { type: 'vote', target: 'p1' });
    expect(game.viewFor('p1').log.at(-1)).toMatchObject({ kind: 'vote_result', lynchedId: null, deaths: [] });
  });

  it('si gana el voto en blanco no se lincha a nadie', () => {
    const { game } = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    skipTo(game, 'day_vote');
    game.act('p0', { type: 'vote', target: null });
    game.act('p1', { type: 'vote', target: null });
    game.act('p2', { type: 'vote', target: 'p0' });
    game.timeout();
    expect(game.viewFor('p1').log.at(-1)).toMatchObject({ kind: 'vote_result', lynchedId: null });
  });

  it('los votos son públicos y se pueden cambiar', () => {
    const { game } = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    skipTo(game, 'day_vote');
    game.act('p1', { type: 'vote', target: 'p2' });
    game.act('p1', { type: 'vote', target: 'p0' });
    expect(game.viewFor('p3').votes).toEqual({ p1: 'p0' });
    expect(game.viewFor('p1').action).toMatchObject({ type: 'vote', hasVoted: true, myVote: 'p0' });
  });

  it('si todos piden votar se acaba el debate', () => {
    const { game } = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    skipTo(game, 'day_discussion');
    for (const id of ['p0', 'p1', 'p2']) game.act(id, { type: 'ready', ready: true });
    expect(game.viewFor('p3').readyIds).toEqual(['p0', 'p1', 'p2']);
    game.act('p3', { type: 'ready', ready: true });
    expect(game.phase).toBe('day_vote');
  });

  it('los muertos no votan', () => {
    const { game } = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    skipTo(game, 'day_vote');
    expect(() => game.act('p4', { type: 'vote', target: 'p0' })).toThrow(GameError);
  });
});

describe('victoria', () => {
  it('ganan los lobos cuando solo quedan lobos', () => {
    const { game } = setupGame(['werewolf', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p1' });
    skipTo(game, 'day_vote');
    game.act('p0', { type: 'vote', target: 'p2' });
    game.act('p2', { type: 'vote', target: 'p0' });
    game.act('p3', { type: 'vote', target: 'p2' });
    game.timeout(); // atardecer -> noche 2
    game.act('p0', { type: 'wolf_vote', target: 'p3' });
    game.timeout(); // amanecer
    expect(game.phase).toBe('ended');
    expect(game.viewFor('p1').winner).toEqual({ side: 'wolves', playerIds: ['p0'] });
  });

  it('gana el pueblo al linchar al último lobo y al final todos ven todos los roles', () => {
    const { game } = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    game.act('p1', { type: 'see', target: 'p0' });
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    skipTo(game, 'day_vote');
    for (const id of ['p1', 'p2', 'p3']) game.act(id, { type: 'vote', target: 'p0' });
    game.act('p0', { type: 'vote', target: 'p1' });
    game.timeout();
    expect(game.phase).toBe('ended');
    const view = game.viewFor('p2');
    expect(view.winner?.side).toBe('village');
    expect(view.players.every((p) => p.role !== null)).toBe(true);
    expect(() => game.act('p2', { type: 'vote', target: 'p1' })).toThrow(/terminado/);
  });
});

describe('información oculta', () => {
  it('un aldeano solo conoce su propio rol', () => {
    const { game } = setupGame(['werewolf', 'seer', 'villager', 'villager']);
    const view = game.viewFor('p2');
    expect(view.me).toEqual({ id: 'p2', role: 'villager', alive: true, loverId: null });
    expect(view.players.map((p) => p.role)).toEqual([null, null, 'villager', null]);
    expect(view.action).toBeNull();
  });

  it('los muertos lo ven todo (si está activado) y los roles se revelan al morir', () => {
    const { game } = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    game.act('p1', { type: 'see', target: 'p2' });
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    expect(game.viewFor('p4').players.map((p) => p.role)).toEqual([
      'werewolf',
      'seer',
      'villager',
      'villager',
      'villager',
    ]);
    expect(game.viewFor('p3').players.find((p) => p.id === 'p4')?.role).toBe('villager');
  });

  it('con las opciones desactivadas no se revela nada', () => {
    const { game } = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager'], {
      revealRoleOnDeath: false,
      deadSeeEverything: false,
    });
    game.act('p1', { type: 'see', target: 'p2' });
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    expect(game.viewFor('p3').players.find((p) => p.id === 'p4')?.role).toBeNull();
    expect(game.viewFor('p4').players.map((p) => p.role)).toEqual([null, null, null, null, 'villager']);
    expect(game.viewFor('p3').log.at(-1)).toMatchObject({ deaths: [{ playerId: 'p4', role: null }] });
  });
});

describe('pasos fantasma', () => {
  it('si la vidente ha muerto su turno se sigue mostrando, con el mismo contador, pero acaba antes', () => {
    const { game, now } = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    game.act('p1', { type: 'see', target: 'p0' });
    game.act('p0', { type: 'wolf_vote', target: 'p1' }); // muere la vidente
    passDay(game, ['p0', 'p2', 'p3', 'p4']);
    expect(game.night).toBe(2);
    expect(game.phase).toBe('night_seer');

    const view = game.viewFor('p2');
    const { durations } = game.settings;
    expect(view.endsAt).toBe(now() + durations.nightAction * 1000);
    expect(game.nextTimeoutAt).toBe(now() + durations.phantomMin * 1000);
    expect(() => game.act('p1', { type: 'see', target: 'p0' })).toThrow(GameError);
    game.timeout();
    expect(game.phase).toBe('night_wolves');
  });
});

describe('temporizadores', () => {
  it('ignora timeouts de fases que ya han terminado', () => {
    const { game } = setupGame(['werewolf', 'seer', 'villager', 'villager']);
    const stale = game.phaseId;
    game.act('p1', { type: 'see', target: 'p0' });
    expect(game.timeout(stale)).toBe(false);
    expect(game.phase).toBe('night_wolves');
  });

  it('endsAt avanza con la duración de cada fase', () => {
    const { game, now } = setupGame(['werewolf', 'villager', 'villager', 'villager']);
    expect(game.viewFor('p1').endsAt).toBe(now() + game.settings.durations.wolves * 1000);
  });
});
