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

  it('a quien le miran la carta se le avisa al amanecer, sin decirle quién ha sido; a nadie más', () => {
    const { game } = setupGame(['werewolf', 'seer', 'villager', 'villager', 'villager']);
    game.act('p1', { type: 'see', target: 'p2' });
    expect(game.viewFor('p2').privateLog).toEqual([]); // todavía es de noche
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    expect(game.phase).toBe('dawn');
    expect(game.viewFor('p2').privateLog).toEqual([{ kind: 'seen', night: 1 }]);
    for (const id of ['p0', 'p3', 'p4']) {
      expect(game.viewFor(id).privateLog.some((e) => e.kind === 'seen')).toBe(false);
    }
    expect(game.viewFor('p2').players.find((p) => p.id === 'p1')?.role).toBeNull(); // no sabe quién ha sido
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

  it('si quedan el lobo y el cazador y el cazador se lleva al lobo, es empate', () => {
    const { game } = setupGame(['werewolf', 'hunter', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    skipTo(game, 'day_vote');
    game.act('p0', { type: 'vote', target: 'p1' });
    game.act('p1', { type: 'vote', target: 'p0' });
    game.timeout(); // atardecer: empate, nadie muere
    expect(game.phase).toBe('night_wolves'); // un lobo contra el cazador: la partida sigue
    game.act('p0', { type: 'wolf_vote', target: 'p1' });
    game.timeout(); // amanecer
    game.act('p1', { type: 'shoot', target: 'p0' });
    expect(game.phase).toBe('ended');
    expect(game.viewFor('p1').winner).toEqual({ side: 'draw', playerIds: [] });
    expect(game.viewFor('p1').log.at(-1)).toEqual({ kind: 'game_over', winner: 'draw', winnerIds: [] });
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
    const { game } = setupGame(['werewolf', 'hunter', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    skipTo(game, 'day_vote');
    for (const id of ['p0', 'p1', 'p3', 'p4', 'p5']) game.act(id, { type: 'vote', target: 'p1' });
    game.timeout(); // atardecer
    expect(game.phase).toBe('hunter');
    game.act('p1', { type: 'shoot', target: 'p3' });
    expect(game.phase).toBe('night_wolves');
    expect(game.night).toBe(2);
  });

  it('no ve los roles de los demás hasta haber disparado', () => {
    const { game } = setupGame(['werewolf', 'hunter', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p1' });
    expect(game.phase).toBe('dawn');
    expect(game.viewFor('p1').me?.pendingShot).toBe(true);
    expect(game.viewFor('p1').players.map((p) => p.role)).toEqual([null, 'hunter', null, null, null]);

    game.timeout(); // amanecer
    expect(game.phase).toBe('hunter');
    expect(game.viewFor('p1').players.map((p) => p.role)).toEqual([null, 'hunter', null, null, null]);

    game.act('p1', { type: 'shoot', target: 'p2' });
    const after = game.viewFor('p1');
    expect(after.me?.pendingShot).toBe(false);
    expect(after.players.map((p) => p.role)).toEqual(['werewolf', 'hunter', 'villager', 'villager', 'villager']);
  });

  it('si pierde el disparo, a partir de entonces lo ve todo como cualquier muerto', () => {
    const { game } = setupGame(['werewolf', 'hunter', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p1' });
    skipTo(game, 'hunter');
    game.timeout(); // no dispara
    expect(game.viewFor('p1').me?.pendingShot).toBe(false);
    expect(game.viewFor('p1').players.every((p) => p.role !== null)).toBe(true);
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

  it('si más de la mitad piden votar, el debate acaba tras una cuenta atrás de 10 s', () => {
    const { game, now, tick } = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p5' });
    skipTo(game, 'day_discussion'); // quedan 5 vivos: hace falta que lo pidan 3
    const regular = game.viewFor('p1').endsAt;
    const phaseStart = now();
    expect(regular).toBe(now() + game.settings.durations.discussion * 1000);
    expect(game.viewFor('p1').timerStartedAt).toBe(phaseStart);

    tick(1_000);
    game.act('p1', { type: 'ready', ready: true });
    game.act('p2', { type: 'ready', ready: true });
    expect(game.viewFor('p1').endsAt).toBe(regular); // 2 de 5 no es mayoría
    expect(game.viewFor('p1').timerStartedAt).toBe(phaseStart);

    game.act('p3', { type: 'ready', ready: true });
    const countdownStart = now();
    expect(game.viewFor('p1').endsAt).toBe(now() + 10_000);
    expect(game.viewFor('p1').timerStartedAt).toBe(countdownStart); // el reloj cuenta los 10 s
    expect(game.nextTimeoutAt).toBe(now() + 10_000);

    // Otro más no reinicia la cuenta atrás.
    tick(4_000);
    game.act('p4', { type: 'ready', ready: true });
    expect(game.viewFor('p1').endsAt).toBe(now() + 6_000);
    expect(game.viewFor('p1').timerStartedAt).toBe(countdownStart);

    // Si dejan de ser mayoría, se cancela y vuelve el tiempo normal.
    game.act('p4', { type: 'ready', ready: false });
    game.act('p3', { type: 'ready', ready: false });
    expect(game.viewFor('p1').endsAt).toBe(regular);
    expect(game.viewFor('p1').timerStartedAt).toBe(phaseStart);
    expect(game.nextTimeoutAt).toBe(regular);

    game.act('p3', { type: 'ready', ready: true });
    expect(game.viewFor('p1').endsAt).toBe(now() + 10_000);
    expect(game.phase).toBe('day_discussion');
    game.timeout();
    expect(game.phase).toBe('day_vote');
  });

  it('la cuenta atrás no alarga el debate si quedaba menos tiempo', () => {
    const { game, now, tick } = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    skipTo(game, 'day_discussion');
    const regular = game.viewFor('p1').endsAt!;
    tick(regular - now() - 3_000);
    for (const id of ['p1', 'p2', 'p3']) game.act(id, { type: 'ready', ready: true });
    expect(game.viewFor('p1').endsAt).toBe(regular);
  });

  it('si todos piden votar se acaba el debate', () => {
    const { game } = setupGame(['werewolf', 'villager', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    skipTo(game, 'day_discussion');
    for (const id of ['p0', 'p1', 'p2']) game.act(id, { type: 'ready', ready: true });
    expect(game.viewFor('p3').readyIds).toEqual(['p0', 'p1', 'p2']);
    expect(game.phase).toBe('day_discussion');
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
  it('ganan los lobos en cuanto son tantos como el resto', () => {
    const { game } = setupGame(['werewolf', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p1' });
    skipTo(game, 'day_vote');
    game.act('p0', { type: 'vote', target: 'p2' });
    game.act('p2', { type: 'vote', target: 'p0' });
    game.act('p3', { type: 'vote', target: 'p2' });
    game.timeout(); // atardecer: queda un lobo contra un aldeano
    expect(game.phase).toBe('ended');
    expect(game.viewFor('p1').winner).toEqual({ side: 'wolves', playerIds: ['p0'] });
  });

  it('con dos lobos, al quedar dos aldeanos ganan los lobos al amanecer', () => {
    const { game } = setupGame(['werewolf', 'werewolf', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    game.act('p1', { type: 'wolf_vote', target: 'p2' });
    game.timeout(); // amanecer
    expect(game.viewFor('p3').winner).toEqual({ side: 'wolves', playerIds: ['p0', 'p1'] });
  });

  it('si la bruja aún tiene pociones la partida sigue; sin pociones, ganan los lobos', () => {
    const withPotions = setupGame(['werewolf', 'witch', 'villager', 'villager']).game;
    withPotions.act('p0', { type: 'wolf_vote', target: 'p2' });
    withPotions.act('p1', { type: 'witch', heal: false, poison: null });
    skipTo(withPotions, 'day_vote');
    for (const id of ['p0', 'p1']) withPotions.act(id, { type: 'vote', target: 'p3' });
    withPotions.act('p3', { type: 'vote', target: 'p0' });
    withPotions.timeout(); // atardecer: lobo contra bruja con las dos pociones
    expect(withPotions.phase).toBe('night_wolves');

    const { game } = setupGame(['werewolf', 'witch', 'villager', 'villager', 'villager']);
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    game.act('p1', { type: 'witch', heal: true, poison: 'p3' }); // gasta las dos
    skipTo(game, 'day_vote');
    for (const id of ['p0', 'p1', 'p2']) game.act(id, { type: 'vote', target: 'p4' });
    game.act('p4', { type: 'vote', target: 'p0' });
    game.timeout(); // atardecer: lobo contra bruja y aldeano
    expect(game.phase).toBe('night_wolves');
    game.act('p0', { type: 'wolf_vote', target: 'p2' });
    game.timeout(); // turno fantasma de la bruja
    game.timeout(); // amanecer: lobo contra bruja sin pociones
    expect(game.viewFor('p1').winner).toEqual({ side: 'wolves', playerIds: ['p0'] });
  });

  it('con el protector o el cazador vivos la partida sigue aunque los lobos igualen', () => {
    for (const role of ['protector', 'hunter'] as const) {
      const { game } = setupGame(['werewolf', role, 'villager', 'villager']);
      if (role === 'protector') game.act('p1', { type: 'protect', target: 'p1' });
      game.act('p0', { type: 'wolf_vote', target: 'p2' });
      skipTo(game, 'day_vote');
      for (const id of ['p0', 'p1']) game.act(id, { type: 'vote', target: 'p3' });
      game.act('p3', { type: 'vote', target: 'p0' });
      game.timeout(); // atardecer: lobo contra protector / cazador
      expect(game.phase).not.toBe('ended');
      expect(game.night).toBe(2);
    }
  });

  it('un lobo enamorado de alguien del pueblo no cuenta para la manada', () => {
    const { game } = setupGame(['werewolf', 'werewolf', 'cupid', 'villager', 'villager']);
    game.act('p2', { type: 'cupid', targets: ['p0', 'p3'] });
    game.act('p0', { type: 'wolf_vote', target: 'p4' });
    game.act('p1', { type: 'wolf_vote', target: 'p4' });
    game.timeout(); // amanecer: 2 lobos de 4 vivos, pero uno está enamorado de un aldeano
    expect(game.phase).toBe('day_discussion');
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
    expect(view.me).toEqual({ id: 'p2', role: 'villager', alive: true, loverId: null, pendingShot: false });
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
