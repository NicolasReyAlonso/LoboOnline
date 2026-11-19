import { isNightPhase } from '@lobo/game/types';
import type { ChatChannel, RoomState } from '@lobo/protocol';
import { isWolfRole } from './roles';

/*
 * Copia de las reglas del chat del servidor (Backend/src/rooms/Room.ts), solo
 * para la interfaz: mostrar las pestañas correctas y explicar por qué no puedes
 * escribir. Quien decide de verdad es el servidor.
 */

export const CHANNEL_INFO: Record<ChatChannel, { icon: string; label: string }> = {
  general: { icon: '🏘️', label: 'Pueblo' },
  wolves: { icon: '🐺', label: 'Manada' },
  dead: { icon: '👻', label: 'Muertos' },
};

export function readableChannels(state: RoomState | null): ChatChannel[] {
  const game = state?.game;
  if (!state || !game) return ['general'];
  if (game.phase === 'ended') return ['general', 'wolves', 'dead'];
  const me = game.me;
  if (!me) return ['general'];
  const channels: ChatChannel[] = ['general'];
  if (me.alive ? isWolfRole(me.role) : state.settings.deadSeeEverything) channels.push('wolves');
  if (!me.alive) channels.push('dead');
  return channels;
}

/** Canales en los que puedes escribir ahora mismo (como mucho uno). */
export function writableChannels(state: RoomState | null): ChatChannel[] {
  return readableChannels(state).filter((c) => !writeBlockReason(state, c));
}

/** `null` si puedes escribir en el canal; si no, el motivo para mostrarlo. */
export function writeBlockReason(state: RoomState | null, channel: ChatChannel): string | null {
  const game = state?.game;
  if (!game || game.phase === 'ended') {
    return channel === 'general' ? null : 'Este canal solo se usa durante la partida.';
  }
  const me = game.me;
  if (!me) return 'No participas en esta partida.';
  const night = isNightPhase(game.phase);
  switch (channel) {
    case 'general':
      if (!me.alive) return 'Los muertos no hablan con los vivos. Usa el canal de los muertos.';
      return night ? 'De noche el pueblo duerme. Podrás hablar al amanecer.' : null;
    case 'wolves':
      if (!me.alive) return 'Solo los lobos vivos pueden hablar en la manada.';
      if (!isWolfRole(me.role)) return 'Solo para lobos.';
      return night ? null : 'La manada solo se reúne de noche.';
    case 'dead':
      return me.alive ? 'Solo para los muertos.' : null;
  }
}
