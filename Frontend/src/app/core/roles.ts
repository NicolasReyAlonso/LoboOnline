import { ROLE_INFO } from '@lobo/game/roles';
import { POWER_ROLES, type Composition, type Role, type WinningSide } from '@lobo/game/types';

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

/** Etiquetas del reparto público: "Entre 1 y 3 lobos", los personajes con poderes y "Aldeanos (el resto)". */
export function compositionChips(c: Composition): { key: string; label: string }[] {
  const { min, max } = c.wolves;
  const wolves = min === max ? `${max} ${max === 1 ? 'lobo' : 'lobos'}` : `Entre ${min} y ${max} lobos`;
  return [
    { key: 'werewolf', label: `${ROLE_ICON.werewolf} ${wolves}` },
    ...POWER_ROLES.filter((r) => (c.powers[r] ?? 0) > 0).map((r) => ({
      key: r,
      label: `${ROLE_ICON[r]} ${roleName(r)}`,
    })),
    { key: 'villager', label: `${ROLE_ICON.villager} Aldeanos (el resto)` },
  ];
}

export const SIDE_INFO: Record<WinningSide, { icon: string; label: string }> = {
  village: { icon: '🏡', label: 'Gana el pueblo' },
  wolves: { icon: '🐺', label: 'Ganan los lobos' },
  lovers: { icon: '💘', label: 'Ganan los enamorados' },
  draw: { icon: '🤝', label: 'Empate' },
};
