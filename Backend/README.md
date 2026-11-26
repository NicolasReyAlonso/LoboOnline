# LoboOnline – Backend

Servidor en tiempo real del juego del Lobo. Node.js + TypeScript + Socket.IO.

```bash
cd Backend
npm install
npm run dev      # servidor con recarga automática en http://localhost:3000
npm test         # tests (motor del juego, salas y sockets)
npm run build && npm start   # producción
```

Variables de entorno:

| Variable      | Por defecto | Descripción                                                              |
| ------------- | ----------- | ------------------------------------------------------------------------ |
| `PORT`        | `3000`      | Puerto HTTP/WebSocket                                                    |
| `CORS_ORIGIN` | `*`         | Orígenes permitidos, separados por comas (en producción, pon el del front) |
| `SEASON`      | (por fecha) | Fuerza una temporada (`christmas`) o ninguna (`none`). Útil para probarla |

`GET /health` devuelve `{ "ok": true, "rooms": <n> }`.

## Estructura

```
src/
  game/            Motor del juego: lógica pura, sin red ni temporizadores reales
    types.ts       Tipos compartidos (roles, fases, acciones, vista del estado)
    roles.ts       Roles, reparto automático y validación
    settings.ts    Ajustes por defecto y límites
    Game.ts        Máquina de estados de la partida
    createGame.ts  Baraja los roles y arranca la partida
  rooms/
    Room.ts        Lobby, anfitrión, reconexión, temporizadores y chat
    RoomManager.ts Crea/borra salas y genera los códigos
  socket/
    handlers.ts    Eventos Socket.IO -> Room
    schemas.ts     Validación (zod) de todo lo que manda el cliente
  protocol.ts      Contrato cliente/servidor (tipos de eventos)
  server.ts        Servidor HTTP + Socket.IO
  index.ts         Punto de entrada
test/              Tests con vitest
```

El servidor es la única fuente de verdad: guarda el estado completo y envía a cada jugador
**solo lo que puede ver**. Por ejemplo, un aldeano nunca recibe el rol de los demás, así que no se puede hacer trampa
mirando los mensajes de red.

## Reglas implementadas

**Roles:** Aldeano, Lobo, Vidente, Bruja, Cazador, Cupido y Protector. Y en temporada, su personaje propio.

**Temporadas** ([`seasons.ts`](src/game/seasons.ts)): en ciertas fechas, todos los años, hay un personaje
exclusivo y algunos personajes se disfrazan (cambian nombre, descripción y tarjeta, pero juegan igual). El servidor
decide la temporada por la fecha (o por `SEASON`) y la envía en `RoomState.season`; una partida conserva la de cuando
empezó.

| Temporada              | Fechas                 | Personaje propio | Disfraces                                            |
| ---------------------- | ---------------------- | ---------------- | ---------------------------------------------------- |
| Navidad (`christmas`)  | 23 nov – 7 ene         | Papá Noel        | Cazador → Grinch, Aldeano → Elfo, Protector → Mamá Claus |

**Papá Noel** no tiene turno: cada noche, al caer, descubre la carta de un jugador vivo al azar (que no sea él).
Le puede tocar varias veces la misma persona. Si el anfitrión lo eligió y la temporada acaba antes de empezar,
simplemente no se reparte.

**Lobos secretos:** el anfitrión elige el **mínimo** y el **máximo** de lobos (`minWolves` y `maxWolves`, de 1 a
6, por defecto 1 y 2; el mínimo no puede pasar del máximo). Al empezar cada partida se sortea cuántos hay, entre esos
dos números. El máximo se recorta solo si no cabe: siempre tiene que haber menos lobos que no-lobos, y sitio para los
personajes con poderes. Si el mínimo no cabe, baja hasta ese máximo recortado. Todo el mundo ve "entre M y N lobos",
pero nunca el número exacto (salvo que el mínimo y el máximo coincidan). Por eso tampoco se publica cuántos aldeanos
hay, porque de ahí se deduciría.

**Personajes con poderes:** el anfitrión los elige, o se ponen solos según el número de jugadores. Los aldeanos
rellenan el resto.

| Jugadores | Personajes con poderes automáticos |
| --------- | ---------------------------------- |
| 4–5       | Vidente                            |
| 5 (Navidad) | + Papá Noel                        |
| 6         | + Bruja                            |
| 7         | + Cazador                          |
| 8–9       | + Cupido                           |
| 10–20     | + Protector                        |

**Una noche**, en este orden. Se saltan los roles que no están en la partida:

1. `night_cupid`: solo la primera noche. Cupido enamora a dos jugadores, que se conocen y ven el rol del otro.
2. `night_protector`: protege a alguien de los lobos. No puede repetir la misma persona dos noches seguidas.
3. `night_seer`: la vidente ve el rol de un jugador. A ese jugador (y solo a él) se le avisa al amanecer de que le han
   mirado la carta, sin decirle quién.
4. `night_wolves`: los lobos votan una víctima. Si todos coinciden, se pasa al siguiente paso al momento; si se acaba el
   tiempo, muere el más votado (los empates se deciden al azar).
5. `night_witch`: la bruja ve a la víctima y puede usar la poción de vida y/o la de muerte (cada una, una vez por partida).

Si el rol de un paso está muerto, o la bruja ya no tiene pociones, el paso **se sigue mostrando** con el contador normal,
pero termina tras un tiempo aleatorio. Así nadie puede deducir que la vidente ha muerto porque su turno ya no aparece.

**El día:**

- `dawn`: se anuncian los muertos de la noche. No se dice la causa, para no delatar a la bruja.
- `hunter`: si ha muerto el cazador, dispara a alguien (en cualquier momento de la partida).
- `day_discussion`: debate. Termina por tiempo, o antes si los vivos piden votar: si lo piden **más de la mitad**, el
  debate acaba tras una cuenta atrás de 10 segundos (`VOTE_COUNTDOWN_SECONDS`, se cancela si dejan de ser mayoría); si
  lo piden todos, al momento.
- `day_vote`: votación pública y modificable. Termina cuando han votado todos o se acaba el tiempo. Gana la mayoría
  simple; el voto en blanco cuenta como una opción más, y un empate no lincha a nadie.
- `dusk`: se anuncia el resultado de la votación y vuelve a caer la noche.

**Enamorados:** si uno muere, el otro muere de pena. Si son de bandos distintos (lobo + aldeano), forman su propio
bando y ganan si son los dos últimos vivos.

**Victoria** (se comprueba después de cada anuncio y de cada disparo del cazador):

- No queda nadie vivo: **empate** (`draw`). Por ejemplo, quedan el lobo y el cazador, y el cazador se lleva por
  delante al lobo.
- Pareja mixta de enamorados como únicos supervivientes: ganan **los enamorados**.
- No queda ningún lobo: gana **el pueblo**.
- Los lobos son **tantos o más** que el resto: ganan **los lobos**, porque ya controlan la votación. Un lobo enamorado de
  alguien del pueblo no cuenta para la manada.
  La excepción es que al pueblo le quede un poder con el que aún pueda darle la vuelta: el **cazador** vivo, la
  **bruja** viva con alguna poción o el **protector** vivo. Entonces la partida sigue.

## Protocolo (Socket.IO)

Los tipos exactos están en [`src/protocol.ts`](src/protocol.ts) y [`src/game/types.ts`](src/game/types.ts). Si el
frontend usa TypeScript, lo más cómodo es importarlos o copiarlos.

### Respuestas (ack)

Todos los eventos que manda el cliente aceptan un callback final y reciben:

```ts
{ ok: true, data?: ... }                       // todo bien
{ ok: false, code: 'not_your_turn', error: 'No es tu turno.' }  // error mostrable al usuario
```

Con socket.io-client ≥ 4.6 se puede usar `await socket.emitWithAck(evento, payload)`.

### Cliente → servidor

| Evento          | Payload                                    | Respuesta `data`                 | Quién             |
| --------------- | ------------------------------------------ | -------------------------------- | ----------------- |
| `room:create`   | `{ name }`                                 | `{ code, playerId, token }`      | cualquiera        |
| `room:join`     | `{ code, name }`                           | `{ code, playerId, token }`      | cualquiera        |
| `room:rejoin`   | `{ code, token }`                          | `{ code, playerId, token }`      | cualquiera        |
| `room:leave`    | —                                          | —                                | jugador           |
| `room:kick`     | `{ playerId }`                             | —                                | anfitrión (lobby) |
| `room:settings` | `SettingsPatch` (ver abajo)                | —                                | anfitrión (lobby) |
| `room:avatar`   | `{ avatar }` (uno de `AVATARS`)            | —                                | jugador (fuera de partida) |
| `game:start`    | —                                          | —                                | anfitrión         |
| `game:action`   | `GameAction` (ver abajo)                   | —                                | jugador           |
| `room:lobby`    | —                                          | —                                | anfitrión (al acabar) |
| `chat:send`     | `{ channel: 'general'\|'wolves'\|'dead', text }` | —                          | jugador           |
| `chat:history`  | —                                          | `ChatMessage[]`                  | jugador           |

### Servidor → cliente

| Evento          | Payload        | Cuándo                                                        |
| --------------- | -------------- | ------------------------------------------------------------- |
| `room:state`    | `RoomState`    | Cada vez que cambia algo. **Es el estado completo**: basta con pintarlo. |
| `chat:message`  | `ChatMessage`  | Mensaje nuevo en un canal que puedes leer                     |
| `chat:history`  | `ChatMessage[]`| Al entrar o reconectar                                        |
| `room:kicked`   | —              | El anfitrión te ha expulsado                                  |
| `room:replaced` | —              | Has abierto la misma sesión en otro dispositivo o pestaña     |

### `RoomState`

```ts
{
  code: 'K7QMZ',
  status: 'lobby' | 'playing' | 'ended',
  hostId, youId,
  players: [{ id, name, avatar, connected, isHost }],   // avatar: al entrar, uno libre al azar; no se repiten
  settings: { minWolves, maxWolves, roles, revealRoleOnDeath, deadSeeEverything, durations: {...} },
  limits: { minPlayers: 4, maxPlayers: 20 },
  rolePreview: { composition: Composition | null, error: string | null } | null,
  game: GameView | null,
  season: 'christmas' | null,  // en el lobby, la de hoy; en partida, la de cuando empezó
  serverTime: 1763484000000   // hora del servidor, para corregir el desfase del reloj del cliente
}
```

### `SettingsPatch` (`room:settings`, solo el anfitrión y fuera de partida)

Envía solo lo que cambie:

```ts
{
  minWolves?: 1..6,                   // tiene que quedar minWolves <= maxWolves
  maxWolves?: 1..6,
  roles?: { seer?: 0|1, witch?: 0|1, hunter?: 0|1, cupid?: 0|1, protector?: 0|1, santa?: 0|1 } | null,  // null = automático
  revealRoleOnDeath?: boolean,
  deadSeeEverything?: boolean,
  durations?: { discussion?, vote?, wolves?, nightAction?, announcement?, hunter?, phantomMin?, phantomMax? }  // segundos
}
```

### `GameView` (lo importante para pintar la partida)

```ts
{
  phase: 'night_seer',            // ver "Reglas" para la lista de fases
  phaseId: 7,                     // cambia en cada fase
  endsAt: 1763484000000,          // timestamp para la cuenta atrás
  timerStartedAt: 1763483820000,  // desde cuándo corre endsAt (para pintar cuánto queda en proporción)
  night: 2, day: 1,
  composition: {                  // lo que todos saben del reparto
    powers: { seer: 1, witch: 1 },  // personajes con poderes
    wolves: { min: 1, max: 3 }      // el número exacto es secreto
  },
  me: { id, role: 'seer', alive: true, loverId: null },
  players: [{ id, name, alive, role: 'werewolf' | null, lover: true | false | null }],
  action: { type: 'see', targets: ['id1', 'id2'] } | null,  // QUÉ PUEDES HACER AHORA
  votes:   { votanteId: votadoId | null } | null,           // solo en day_vote
  readyIds: [...] | null,                                    // solo en day_discussion
  hunterId: '...' | null,                                    // solo en la fase hunter
  log: LogEntry[],          // historial público: muertes, votaciones, disparos...
  privateLog: PrivateEntry[], // solo tuyo: visiones, regalos de Papá Noel, pareja, víctima de los lobos, "te han mirado la carta"...
  winner: { side: 'village' | 'wolves' | 'lovers' | 'draw', playerIds } | null  // draw: playerIds vacío
}
```

`role: null` significa que **tú no conoces** ese rol. El frontend no tiene que calcular nada: si `action` no es `null`,
toca mostrar los botones de esa acción con los `targets` que vienen.

### Acciones (`game:action`)

| `action.type` que recibes | Lo que envías                                                    |
| ------------------------- | --------------------------------------------------------------- |
| `cupid`                   | `{ type: 'cupid', targets: [id1, id2] }`                         |
| `protect`                 | `{ type: 'protect', target }`                                    |
| `see`                     | `{ type: 'see', target }`                                        |
| `wolf_vote`               | `{ type: 'wolf_vote', target }` (puedes cambiarlo; ves los votos de la manada en `action.votes`) |
| `witch`                   | `{ type: 'witch', heal: boolean, poison: id \| null }` (un único envío por noche) |
| `shoot`                   | `{ type: 'shoot', target }`                                      |
| `vote`                    | `{ type: 'vote', target: id \| null }` (`null` = en blanco)      |
| `ready`                   | `{ type: 'ready', ready: true \| false }`                        |

### Chat

- `general`: lo leen todos. En partida solo escriben los vivos y nunca de noche.
- `wolves`: escriben los lobos vivos, solo de noche. Lo leen los lobos (y los muertos si `deadSeeEverything`).
- `dead`: solo para los muertos.
- Cuando acaba la partida, todo el mundo puede leer todos los canales.

### Reconexión

Guarda la respuesta de `room:create`/`room:join` (`{ code, playerId, token }`), por ejemplo en `localStorage`. Si se cae
la conexión (o se recarga la página en el móvil), al reconectar llama a `room:rejoin` con `{ code, token }` y
recuperarás tu sitio y tu rol. En el lobby se guarda el sitio 30 s; durante la partida, siempre.

### Ejemplo mínimo de cliente

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('room:state', (state) => render(state));
socket.on('chat:message', (msg) => addMessage(msg));

const res = await socket.emitWithAck('room:create', { name: 'Ana' });
if (!res.ok) alert(res.error);
else localStorage.setItem('lobo-session', JSON.stringify(res.data));

// Más tarde, cuando el anfitrión quiera empezar:
await socket.emitWithAck('game:start');

// Cuando state.game.action?.type === 'see':
await socket.emitWithAck('game:action', { type: 'see', target: otroJugadorId });
```

## Posibles siguientes pasos

- Más roles: Alcalde (su voto vale doble), Niña, Tonto del pueblo, Lobo blanco...
- Espectadores que entren con la partida empezada.
- Persistencia (Redis) para no perder las partidas si se reinicia el servidor.
- Despliegue (Docker, Render/Railway/Fly.io).
