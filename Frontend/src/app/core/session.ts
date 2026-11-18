import type { Session } from '@lobo/protocol';

/**
 * La sesión (para reconectar) se guarda en sessionStorage: sobrevive a recargar
 * la página, pero cada pestaña es un jugador distinto (útil para probar en local).
 * El nombre se recuerda en localStorage para no tener que escribirlo cada vez.
 */
const SESSION_KEY = 'lobo.session';
const NAME_KEY = 'lobo.name';

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Session>;
    return data.code && data.playerId && data.token ? (data as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Almacenamiento no disponible (modo privado...): simplemente no se podrá reconectar.
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Ignorado.
  }
}
