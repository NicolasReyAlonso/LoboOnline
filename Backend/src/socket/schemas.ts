import { z } from 'zod';
import { GameError } from '../game/errors.js';
import { MAX_WOLVES } from '../game/roles.js';

/** Validación de todo lo que llega de los clientes (nunca nos fiamos del cliente). */

const playerName = z
  .string()
  .trim()
  .min(1, 'El nombre no puede estar vacío.')
  .max(20, 'El nombre puede tener como mucho 20 caracteres.');
const roomCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{5}$/, 'Código de sala no válido.');
const playerId = z.string().min(1).max(64);

export const createSchema = z.object({ name: playerName });
export const joinSchema = z.object({ code: roomCode, name: playerName });
export const rejoinSchema = z.object({ code: roomCode, token: z.string().min(1).max(128) });
export const kickSchema = z.object({ playerId });
export const chatSchema = z.object({
  channel: z.enum(['general', 'wolves', 'dead']),
  text: z.string().trim().min(1, 'El mensaje está vacío.').max(500, 'Mensaje demasiado largo (máx. 500).'),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cupid'), targets: z.tuple([playerId, playerId]) }),
  z.object({ type: z.literal('protect'), target: playerId }),
  z.object({ type: z.literal('see'), target: playerId }),
  z.object({ type: z.literal('wolf_vote'), target: playerId }),
  z.object({ type: z.literal('witch'), heal: z.boolean(), poison: playerId.nullable() }),
  z.object({ type: z.literal('shoot'), target: playerId }),
  z.object({ type: z.literal('vote'), target: playerId.nullable() }),
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
]);

const count = (max: number) => z.number().int().min(0).max(max);
const seconds = z.number().int().positive();

export const settingsSchema = z.strictObject({
  maxWolves: z.number().int().min(1).max(MAX_WOLVES).optional(),
  roles: z
    .strictObject({
      seer: count(1).optional(),
      witch: count(1).optional(),
      hunter: count(1).optional(),
      cupid: count(1).optional(),
      protector: count(1).optional(),
    })
    .nullable()
    .optional(),
  revealRoleOnDeath: z.boolean().optional(),
  deadSeeEverything: z.boolean().optional(),
  durations: z
    .strictObject({
      nightAction: seconds.optional(),
      wolves: seconds.optional(),
      announcement: seconds.optional(),
      hunter: seconds.optional(),
      discussion: seconds.optional(),
      vote: seconds.optional(),
      phantomMin: seconds.optional(),
      phantomMax: seconds.optional(),
    })
    .optional(),
});

export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
  throw new GameError('invalid_payload', `Datos no válidos${where}: ${issue?.message ?? 'formato incorrecto'}`);
}
