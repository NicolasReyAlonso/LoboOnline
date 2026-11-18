import { ROLE_INFO } from '@lobo/game/roles';
import type { Role, WinningSide } from '@lobo/game/types';

/** Nombres y descripciones vienen del backend, para que no se desincronicen. */
export const ROLE_ICON: Record<Role, string> = {
  villager: '🧑‍🌾',
  werewolf: '🐺',
  seer: '🔮',
  witch: '🧪',
  hunter: '🏹',
  cupid: '💘',
  protector: '🛡️',
};

/** Orden en el que se muestran los roles. */
export const ROLE_ORDER: readonly Role[] = ['werewolf', 'seer', 'witch', 'hunter', 'cupid', 'protector', 'villager'];

export function roleName(role: Role): string {
  return ROLE_INFO[role].name;
}

export function roleDescription(role: Role): string {
  return ROLE_INFO[role].description;
}

export function isWolfRole(role: Role): boolean {
  return ROLE_INFO[role].team === 'wolves';
}

export const SIDE_INFO: Record<WinningSide, { icon: string; label: string }> = {
  village: { icon: '🏡', label: 'Gana el pueblo' },
  wolves: { icon: '🐺', label: 'Ganan los lobos' },
  lovers: { icon: '💘', label: 'Ganan los enamorados' },
};
