# LoboOnline – Frontend

Web del juego del Lobo. Angular 21 (componentes *standalone*, signals y sin zone.js) + `socket.io-client`.
Está pensada primero para el móvil y se adapta al ordenador.

## Arrancar en local

Hacen falta **dos terminales**:

```bash
# 1. Backend (http://localhost:3000)
cd Backend && npm install && npm run dev

# 2. Frontend (http://localhost:4200)
cd Frontend && npm install && npm start
```

`ng serve` reenvía `/socket.io` al backend (ver [`proxy.conf.json`](proxy.conf.json)), así que la web y el servidor
parecen el mismo sitio y no hay problemas de CORS.

**Jugar varios en el mismo ordenador:** cada pestaña es un jugador distinto. La sesión se guarda en `sessionStorage`,
así que se puede recargar una pestaña sin perder el sitio.

**Probar desde el móvil** (en la misma wifi): arranca con `npm run start:lan` y abre `http://<IP-del-ordenador>:4200`
en el móvil.

```bash
npm test         # tests unitarios (vitest)
npm run build    # build de producción en dist/
```

## Estructura

```
src/app/
  core/                 Lógica sin pantallas
    game.service.ts     Único punto de contacto con el backend (socket, estado, acciones)
    clock.service.ts    Reloj ajustado a la hora del servidor (cuentas atrás)
    toast.service.ts    Avisos emergentes
    session.ts          Sesión (para reconectar) y nombre guardados en el navegador
    avatar.ts           Nombre e imagen de cada avatar
    roles.ts, phases.ts Iconos y textos de personajes y fases
    log.ts              Convierte el historial de la partida en frases
    chat-rules.ts       Qué canales puedes leer y escribir (copia de las reglas del servidor)
    role-cards.ts       Qué personajes tienen tarjeta dibujada (lo genera `npm run tarjetas`)
  pages/
    home/               Inicio: crear sala o unirse con código
    room/               /sala/:code → enlace de invitación, reconexión, lobby o partida
  room/
    lobby/              Sala de espera
    avatar-picker/      Elegir avatar (al entrar en una sala y desde el lobby; no se repiten)
    settings-panel/     Personajes, tiempos y opciones (el anfitrión los edita)
    game-board/         Pantalla de partida: junta todo lo de abajo
    narrator/           El narrador: cuenta cada fase en una viñeta que se cierra sola
    action-panel/       "Lo que te toca hacer ahora"
    player-carousel/    Carrusel con las tarjetas de los demás (se tocan para elegir)
    player-card/        Tarjeta de un jugador: avatar, nombre, personaje si se sabe y quién le vota
    game-log/           Reparto, tus secretos y crónica
    end-screen/         Resultado final
    chat/               Chat por canales
    role-card/          Tu carta: aparece en grande al empezar y luego se queda abajo, en la mano
  shared/
    phase-clock/        Reloj redondo con el anillo que se vacía
    tilt/               Directiva appTilt: la carta se inclina hacia el ratón y brilla
    card-art/           El dibujo de una tarjeta de personaje
    toasts/             Avisos emergentes
tarjetas/               Dibujos originales de las tarjetas (2048×2048): tarjetas_base/ y tarjetas_<temporada>/
scripts/tarjetas.mjs    Los prepara para la web en public/tarjetas/
avatars/                Ilustraciones originales de los avatares
scripts/avatares.mjs    Las recorta y aligera para la web en public/avatars/
```

## Cómo funciona

- **Los tipos vienen del backend.** El alias `@lobo/*` apunta a `../Backend/src/*` (ver `tsconfig.json`). Si el
  backend cambia un evento o un campo, el frontend deja de compilar en vez de fallar en mitad de una partida. Los
  nombres y descripciones de los personajes también se importan de allí.
- **El estado entero llega en cada cambio** (`room:state`). `GameService` lo guarda en un signal y los componentes
  solo lo leen: no hace falta sincronizar nada a mano.
- **`view.action` dice qué puede hacer el jugador** (votar, mirar una carta, usar pociones...). El carrusel resalta a
  quién se puede elegir y `ActionPanel` muestra las instrucciones y el botón de confirmar.
- **La pantalla de partida** sigue el boceto: arriba el narrador, el reloj y el sol o la luna; en medio lo que te toca
  hacer y el carrusel con los demás; abajo tu avatar, tu carta y los botones del reparto, la crónica y el chat. En
  pantallas anchas el chat se queda abierto a la derecha; en el móvil es un panel que sube desde abajo.
- **El tema cambia según la fase:** azul noche o pergamino de día, mediante `<body data-theme>` y las variables CSS
  de [`styles.scss`](src/styles.scss). El sol se pone (y la luna sale) a la vez que cambian los colores: los dos
  duran `--theme-time`.
- **Tarjetas:** cada dibujo se convierte en dos máscaras (las líneas y la silueta de la tarjeta) que se pintan con
  `--card-ink` y `--card-paper`: tinta oscura sobre papel claro de día y en negativo de noche.
- **Reconexión:** si se cae la conexión o se recarga la página, el servicio vuelve a la sala con el token guardado.

## Añadir o cambiar una tarjeta

1. Guarda el dibujo en `tarjetas/tarjetas_base/` (o en la carpeta de su temporada) como PNG cuadrado, con líneas negras sobre fondo transparente y con el borde de la
   tarjeta cerrado. Si es un personaje nuevo, añade su fichero a la lista del principio de
   [`scripts/tarjetas.mjs`](scripts/tarjetas.mjs).
2. Ejecuta `npm run tarjetas`. Genera las imágenes de `public/tarjetas/` y actualiza `src/app/core/role-cards.ts`.
3. Haz commit de todo. Mientras un personaje no tenga dibujo, se usa una tarjeta provisional con su icono.

Las tarjetas de Navidad van en `tarjetas/tarjetas_christmas/`, con estos nombres (ya están en la lista del script):

| Fichero                    | Personaje                        |
| -------------------------- | -------------------------------- |
| `tarjeta_santa_claus.png`  | Papá Noel                        |
| `tarjeta rudolf.png`       | Lobo (mismo nombre, otro dibujo) |
| `tarjeta_elfo.png`         | Elfo (el aldeano en Navidad)     |
| `tarjeta_grinch.png`       | Grinch (el cazador)              |
| `tarjeta_mama_claus.png`   | Mamá Claus (el protector)        |

Un disfraz nunca usa la tarjeta del personaje de siempre: si falta su dibujo, sale la provisional con el nombre
del disfraz. Un personaje que no se disfraza (como el lobo) puede tener igualmente un dibujo de temporada: si está
en la lista del script, se usa en esa temporada; si no, sale su tarjeta de siempre. Los textos y los iconos de cada temporada están en [`core/season.ts`](src/app/core/season.ts),
[`core/roles.ts`](src/app/core/roles.ts) y [`core/phases.ts`](src/app/core/phases.ts).

## Avatares

Cada jugador tiene un avatar y no se pueden repetir en una sala. Al entrar, el servidor le da uno libre al azar y se
abre el selector para cambiarlo; en el lobby se cambia tocando el tuyo. Durante la partida no se puede cambiar.

Para añadir o cambiar uno:

1. Guarda la ilustración en `avatars/` (vale cualquier tamaño; se recorta en vertical, 3:4).
2. Añádela a la lista de [`scripts/avatares.mjs`](scripts/avatares.mjs) con su id. Si el personaje no está centrado,
   ajusta `x` (y `y` o `zoom` si hace falta).
3. Añade el id a `AVATARS` en [`Backend/src/avatars.ts`](../Backend/src/avatars.ts) y su nombre a `AVATAR_NAMES` en
   [`core/avatar.ts`](src/app/core/avatar.ts).
4. Ejecuta `npm run avatares` (necesita ImageMagick: `brew install imagemagick`). Genera `public/avatars/<id>.webp`.

Tiene que haber al menos tantos avatares como jugadores caben en una sala (20); un test del backend lo comprueba.

## Producción

La web se publica sola en GitHub Pages con cada push a `main` (ver el README principal y
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml)). El workflow:

- compila con `--base-href /LoboOnline/`, porque Pages sirve la web en esa subcarpeta;
- copia `index.html` como `404.html`, para que los enlaces de invitación (`/LoboOnline/sala/CODIGO`) no den 404;
- escribe la URL del backend (variable `BACKEND_URL` del repositorio) en
  [`src/environments/environment.ts`](src/environments/environment.ts).

Para publicarla en otro sitio: `npm run build` genera una web estática en `dist/Frontend/browser`. Pon la URL del
backend en `environment.ts` y añade el dominio de la web a `CORS_ORIGIN` en el backend.
