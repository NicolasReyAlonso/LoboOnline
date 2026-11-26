/**
 * Avatares que pueden elegir los jugadores. Sus imágenes están en
 * Frontend/public/avatars/<id>.webp (las prepara `npm run avatares` en el
 * frontend) y sus nombres en Frontend/src/app/core/avatar.ts.
 *
 * En una sala no se pueden repetir, así que tiene que haber al menos tantos
 * como jugadores caben en ella (`MAX_PLAYERS`).
 */
export const AVATARS = [
  'rata',
  'gotica',
  'dragon',
  'cientifica',
  'ejecutiva',
  'arbol',
  'alien',
  'forzudo',
  'cascos',
  'neon',
  'robot',
  'pony',
  'slime',
  'zorro',
  'pulpo',
  'bruja',
  'panda',
  'fantasma',
  'parca',
  'duende',
] as const;

export type AvatarId = (typeof AVATARS)[number];
