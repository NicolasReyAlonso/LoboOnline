/** Color estable para cada nombre (el mismo nombre, el mismo color en todos los clientes). */
export function avatarColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return `hsl(${hash} 55% 45%)`;
}

export function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?';
}
