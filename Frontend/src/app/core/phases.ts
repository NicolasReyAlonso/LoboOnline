import type { Phase } from '@lobo/game/types';

export interface PhaseInfo {
  icon: string;
  title: string;
  narration: string;
}

/** Lo que "dice el narrador" en cada fase. Se muestra a todos por igual. */
export const PHASE_INFO: Record<Phase, PhaseInfo> = {
  night_cupid: { icon: '💘', title: 'Noche', narration: 'Cupido despierta y lanza sus flechas…' },
  night_protector: { icon: '🛡️', title: 'Noche', narration: 'El protector vela por alguien del pueblo…' },
  night_seer: { icon: '🔮', title: 'Noche', narration: 'La vidente consulta su bola de cristal…' },
  night_wolves: { icon: '🐺', title: 'Noche', narration: 'Los lobos salen de caza…' },
  night_witch: { icon: '🧪', title: 'Noche', narration: 'La bruja remueve sus pociones…' },
  dawn: { icon: '🌅', title: 'Amanecer', narration: 'El pueblo despierta y descubre lo ocurrido.' },
  hunter: { icon: '🏹', title: 'El cazador', narration: 'En su último aliento, el cazador levanta la escopeta…' },
  day_discussion: { icon: '🗣️', title: 'Debate', narration: '¿Quién de vosotros es un lobo?' },
  day_vote: { icon: '⚖️', title: 'Votación', narration: 'El pueblo decide a quién linchar.' },
  dusk: { icon: '🌇', title: 'Atardecer', narration: 'El pueblo ha tomado una decisión.' },
  ended: { icon: '🏁', title: 'Fin de la partida', narration: 'Se descubren todas las cartas.' },
};
