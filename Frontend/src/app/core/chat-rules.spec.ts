import { DEFAULT_SETTINGS } from '@lobo/game/settings';
import type { GameView, Phase, Role } from '@lobo/game/types';
import type { RoomState } from '@lobo/protocol';
import { readableChannels, writableChannels, writeBlockReason } from './chat-rules';

function state(phase: Phase | null, role: Role = 'villager', alive = true): RoomState {
  const game = phase
    ? ({
        phase,
        me: { id: 'me', role, alive, loverId: null },
      } as GameView)
    : null;
  return {
    code: 'ABCDE',
    status: game ? 'playing' : 'lobby',
    hostId: 'me',
    youId: 'me',
    players: [],
    settings: DEFAULT_SETTINGS,
    limits: { minPlayers: 4, maxPlayers: 20 },
    rolePreview: null,
    game,
    serverTime: 0,
  };
}

describe('reglas del chat', () => {
  it('en el lobby solo existe el canal general', () => {
    expect(readableChannels(state(null))).toEqual(['general']);
    expect(writeBlockReason(state(null), 'general')).toBeNull();
  });

  it('de noche el pueblo no habla, pero los lobos sí en su canal', () => {
    expect(writeBlockReason(state('night_wolves'), 'general')).toContain('De noche');
    expect(readableChannels(state('night_wolves', 'werewolf'))).toEqual(['general', 'wolves']);
    expect(writeBlockReason(state('night_wolves', 'werewolf'), 'wolves')).toBeNull();
    expect(writeBlockReason(state('day_discussion', 'werewolf'), 'wolves')).toContain('de noche');
  });

  it('los muertos solo escriben en su canal (y por defecto leen el de los lobos)', () => {
    const dead = state('day_vote', 'seer', false);
    expect(readableChannels(dead)).toEqual(['general', 'wolves', 'dead']);
    expect(writeBlockReason(dead, 'general')).not.toBeNull();
    expect(writeBlockReason(dead, 'dead')).toBeNull();
  });

  it('se puede escribir como mucho en un canal, y para un muerto siempre es el mismo', () => {
    expect(writableChannels(state('day_discussion'))).toEqual(['general']);
    expect(writableChannels(state('night_seer'))).toEqual([]);
    expect(writableChannels(state('night_seer', 'werewolf'))).toEqual(['wolves']);
    for (const phase of ['night_wolves', 'dawn', 'day_discussion', 'day_vote', 'dusk'] as const) {
      expect(writableChannels(state(phase, 'werewolf', false))).toEqual(['dead']);
    }
  });

  it('al acabar la partida se pueden leer todos los canales', () => {
    expect(readableChannels(state('ended'))).toEqual(['general', 'wolves', 'dead']);
  });
});
