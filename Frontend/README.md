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
    roles.ts, phases.ts Iconos y textos de personajes y fases
    log.ts              Convierte el historial de la partida en frases
    chat-rules.ts       Qué canales puedes leer y escribir (copia de las reglas del servidor)
  pages/
    home/               Inicio: crear sala o unirse con código
    room/               /sala/:code → enlace de invitación, reconexión, lobby o partida
  room/
    lobby/              Sala de espera
    settings-panel/     Personajes, tiempos y opciones (el anfitrión los edita)
    game-board/         Pantalla de partida (pestañas en el móvil, columnas en el ordenador)
    action-panel/       "Lo que te toca hacer ahora"
    player-grid/        Rejilla de jugadores (se tocan para elegir)
    game-log/           Composición, tus secretos y crónica
    end-screen/         Resultado final
    chat/               Chat por canales
  shared/               Countdown y toasts
```

## Cómo funciona

- **Los tipos vienen del backend.** El alias `@lobo/*` apunta a `../Backend/src/*` (ver `tsconfig.json`). Si el
  backend cambia un evento o un campo, el frontend deja de compilar en vez de fallar en mitad de una partida. Los
  nombres y descripciones de los personajes también se importan de allí.
- **El estado entero llega en cada cambio** (`room:state`). `GameService` lo guarda en un signal y los componentes
  solo lo leen: no hace falta sincronizar nada a mano.
- **`view.action` dice qué puede hacer el jugador** (votar, mirar una carta, usar pociones...). La rejilla resalta a
  quién se puede elegir y `ActionPanel` muestra las instrucciones y el botón de confirmar.
- **El tema cambia según la fase:** azul noche o pergamino de día, mediante `<body data-theme>` y las variables CSS
  de [`styles.scss`](src/styles.scss).
- **Reconexión:** si se cae la conexión o se recarga la página, el servicio vuelve a la sala con el token guardado.

## Producción

`npm run build` genera una web estática en `dist/Frontend/browser`, que se puede servir desde cualquier hosting
estático. Si el backend está en otro dominio, pon su URL en
[`src/environments/environment.ts`](src/environments/environment.ts) y añade el dominio de la web a `CORS_ORIGIN` en
el backend.
