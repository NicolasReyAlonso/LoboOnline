import type { AvatarId } from '@lobo/avatars';

/** Nombre de cada avatar (para lectores de pantalla y el selector). */
export const AVATAR_NAMES: Record<AvatarId, string> = {
  rata: 'Rata',
  gotica: 'Gótica',
  dragon: 'Dragón',
  cientifica: 'Científica',
  ejecutiva: 'Ejecutiva',
  arbol: 'Árbol',
  alien: 'Alien',
  forzudo: 'Forzudo',
  cascos: 'Melómano',
  neon: 'Neón',
  robot: 'Robot',
  pony: 'Unicornio',
  slime: 'Slime',
  zorro: 'Zorro',
  pulpo: 'Pulpo pirata',
  bruja: 'Bruja',
  panda: 'Panda rojo',
  fantasma: 'Fantasma',
  parca: 'La Parca',
  duende: 'Duende',
};

/**
 * Retrato 3:4 del avatar (lo genera `npm run avatares`). Relativo a
 * `<base href>`, para que funcione igual en local y en GitHub Pages.
 */
export function avatarUrl(avatar: AvatarId): string {
  return `avatars/${avatar}.webp`;
}

/** Color estable para cada nombre (el mismo nombre, el mismo color en todos los clientes). */
export function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return `hsl(${hash} 55% 45%)`;
}
