/**
 * Error "esperado" (acción no válida, no es tu turno...). El mensaje está en
 * castellano y se puede mostrar directamente al usuario; `code` sirve para que
 * el frontend reaccione de forma programática.
 */
export class GameError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}
