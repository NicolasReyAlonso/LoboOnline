import { describePrivate, describePublic } from './log';
import { activeSeason } from './season';

const names: Record<string, string> = { a: 'Ana', b: 'Bea', c: 'Carlos' };
const nameOf = (id: string) => names[id] ?? '¿?';

describe('describePublic', () => {
  it('anuncia una noche sin muertos', () => {
    expect(describePublic({ kind: 'dawn', day: 1, deaths: [] }, nameOf)).toEqual([
      { icon: '🌅', text: 'Amanece. Esta noche no ha muerto nadie.' },
    ]);
  });

  it('anuncia varios muertos con su personaje', () => {
    const [line] = describePublic(
      {
        kind: 'dawn',
        day: 2,
        deaths: [
          { playerId: 'a', cause: 'night', role: 'seer' },
          { playerId: 'b', cause: 'night', role: null },
        ],
      },
      nameOf,
    );
    expect(line.text).toBe('Amanece. Esta noche han muerto Ana (Vidente) y Bea.');
  });

  it('cuenta los votos del linchado y añade a quien muere de pena', () => {
    const lines = describePublic(
      {
        kind: 'vote_result',
        day: 1,
        votes: { a: 'c', b: 'c', c: 'a' },
        lynchedId: 'c',
        deaths: [
          { playerId: 'c', cause: 'lynch', role: 'werewolf' },
          { playerId: 'b', cause: 'grief', role: 'villager' },
        ],
      },
      nameOf,
    );
    expect(lines.map((l) => l.text)).toEqual([
      'El pueblo lincha a Carlos (Lobo) con 2 votos.',
      'Bea (Aldeano) muere de pena.',
    ]);
  });

  it('distingue entre empate y nadie votando', () => {
    const tie = describePublic({ kind: 'vote_result', day: 1, votes: { a: 'b', b: 'a' }, lynchedId: null, deaths: [] }, nameOf);
    const none = describePublic({ kind: 'vote_result', day: 1, votes: {}, lynchedId: null, deaths: [] }, nameOf);
    expect(tie[0].text).toContain('no se pone de acuerdo');
    expect(none[0].text).toBe('Nadie ha votado.');
  });

  it('describe el disparo del cazador', () => {
    const lines = describePublic(
      { kind: 'hunter_shot', hunterId: 'a', targetId: 'b', deaths: [{ playerId: 'b', cause: 'hunter', role: 'werewolf' }] },
      nameOf,
    );
    expect(lines[0].text).toBe('Ana, el cazador, dispara a Bea (Lobo).');
  });

  it('en Navidad el cazador es el Grinch y los aldeanos son elfos', () => {
    activeSeason.set('christmas');
    try {
      const lines = describePublic(
        { kind: 'hunter_shot', hunterId: 'a', targetId: 'b', deaths: [{ playerId: 'b', cause: 'hunter', role: 'villager' }] },
        nameOf,
      );
      expect(lines[0]).toEqual({ icon: '😈', text: 'Ana, el Grinch, se lleva a Bea (Elfo).' });
      expect(describePublic({ kind: 'hunter_shot', hunterId: 'a', targetId: null, deaths: [] }, nameOf)[0].text).toBe(
        'Ana, el Grinch, no llega a llevarse a nadie.',
      );
    } finally {
      activeSeason.set(null);
    }
  });

  it('anuncia el empate', () => {
    expect(describePublic({ kind: 'game_over', winner: 'draw', winnerIds: [] }, nameOf)).toEqual([
      { icon: '🤝', text: 'Empate: no queda nadie con vida.' },
    ]);
  });
});

describe('describePrivate', () => {
  it('describe lo que ha visto la vidente', () => {
    expect(describePrivate({ kind: 'vision', night: 3, targetId: 'b', role: 'werewolf' }, nameOf).text).toBe(
      'Noche 3: Bea es Lobo.',
    );
  });

  it('avisa de que te han mirado la carta, sin decir quién', () => {
    expect(describePrivate({ kind: 'seen', night: 2 }, nameOf).text).toBe('Noche 2: alguien ha mirado tu carta.');
  });

  it('describe el regalo de Papá Noel', () => {
    expect(describePrivate({ kind: 'gift', night: 2, targetId: 'c', role: 'werewolf' }, nameOf)).toEqual({
      icon: '🎁',
      text: 'Noche 2: abres tu regalo… Carlos es Lobo.',
    });
  });

  it('describe las pociones de la bruja', () => {
    expect(describePrivate({ kind: 'witch', night: 1, healedId: 'a', poisonedId: 'c' }, nameOf).text).toBe(
      'Noche 1: salvas a Ana y envenenas a Carlos.',
    );
    expect(describePrivate({ kind: 'witch', night: 2, healedId: null, poisonedId: null }, nameOf).text).toBe(
      'Noche 2: no usas ninguna poción.',
    );
  });
});
