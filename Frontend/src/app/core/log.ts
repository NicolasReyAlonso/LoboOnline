import type { LogEntry, PrivateEntry, PublicDeath } from '@lobo/game/types';
import { roleName, SIDE_INFO } from './roles';

export interface LogLine {
  icon: string;
  text: string;
}

type NameOf = (id: string) => string;

function who(death: PublicDeath, nameOf: NameOf): string {
  return death.role ? `${nameOf(death.playerId)} (${roleName(death.role)})` : nameOf(death.playerId);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

function griefLines(deaths: PublicDeath[], nameOf: NameOf): LogLine[] {
  return deaths
    .filter((d) => d.cause === 'grief')
    .map((d) => ({ icon: '💔', text: `${who(d, nameOf)} muere de pena.` }));
}

/** Convierte una entrada del historial público en frases para mostrar. */
export function describePublic(entry: LogEntry, nameOf: NameOf): LogLine[] {
  switch (entry.kind) {
    case 'night_start':
      return [{ icon: '🌙', text: `Cae la noche ${entry.night}.` }];
    case 'dawn': {
      if (entry.deaths.length === 0) return [{ icon: '🌅', text: 'Amanece. Esta noche no ha muerto nadie.' }];
      const names = entry.deaths.map((d) => who(d, nameOf));
      const verb = names.length === 1 ? 'ha muerto' : 'han muerto';
      return [{ icon: '🌅', text: `Amanece. Esta noche ${verb} ${joinNames(names)}.` }];
    }
    case 'vote_result': {
      const lynched = entry.deaths.find((d) => d.cause === 'lynch');
      if (!lynched) {
        const anyVote = Object.keys(entry.votes).length > 0;
        return [{ icon: '⚖️', text: anyVote ? 'El pueblo no se pone de acuerdo: nadie es linchado.' : 'Nadie ha votado.' }];
      }
      const votes = Object.values(entry.votes).filter((v) => v === lynched.playerId).length;
      return [
        { icon: '⚖️', text: `El pueblo lincha a ${who(lynched, nameOf)} con ${votes} ${votes === 1 ? 'voto' : 'votos'}.` },
        ...griefLines(entry.deaths, nameOf),
      ];
    }
    case 'hunter_shot': {
      const shot = entry.deaths.find((d) => d.cause === 'hunter');
      if (!entry.targetId || !shot) {
        return [{ icon: '🏹', text: `${nameOf(entry.hunterId)}, el cazador, no llega a disparar.` }];
      }
      return [
        { icon: '🏹', text: `${nameOf(entry.hunterId)}, el cazador, dispara a ${who(shot, nameOf)}.` },
        ...griefLines(entry.deaths, nameOf),
      ];
    }
    case 'game_over':
      if (entry.winner === 'draw') return [{ icon: SIDE_INFO.draw.icon, text: 'Empate: no queda nadie con vida.' }];
      return [{ icon: SIDE_INFO[entry.winner].icon, text: `${SIDE_INFO[entry.winner].label}.` }];
  }
}

/** Información privada del jugador (visiones, pareja, pociones...). */
export function describePrivate(entry: PrivateEntry, nameOf: NameOf): LogLine {
  switch (entry.kind) {
    case 'lovers':
      return {
        icon: '💘',
        text: `Cupido te ha unido a ${nameOf(entry.partnerId)} (${roleName(entry.partnerRole)}). Si uno de los dos muere, el otro también.`,
      };
    case 'cupid':
      return { icon: '💘', text: `Has unido a ${nameOf(entry.loverIds[0])} y ${nameOf(entry.loverIds[1])}.` };
    case 'vision':
      return { icon: '🔮', text: `Noche ${entry.night}: ${nameOf(entry.targetId)} es ${roleName(entry.role)}.` };
    case 'seen':
      return { icon: '👁️', text: `Noche ${entry.night}: alguien ha mirado tu carta.` };
    case 'protected':
      return { icon: '🛡️', text: `Noche ${entry.night}: proteges a ${nameOf(entry.targetId)}.` };
    case 'wolves_victim':
      return {
        icon: '🐺',
        text: entry.targetId
          ? `Noche ${entry.night}: la manada ataca a ${nameOf(entry.targetId)}.`
          : `Noche ${entry.night}: la manada no ataca a nadie.`,
      };
    case 'witch': {
      const parts: string[] = [];
      if (entry.healedId) parts.push(`salvas a ${nameOf(entry.healedId)}`);
      if (entry.poisonedId) parts.push(`envenenas a ${nameOf(entry.poisonedId)}`);
      return { icon: '🧪', text: `Noche ${entry.night}: ${parts.length ? joinNames(parts) : 'no usas ninguna poción'}.` };
    }
  }
}
