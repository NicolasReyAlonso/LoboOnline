# LoboOnline
El lobo pero online

| Carpeta                  | Qué es                                             |
| ------------------------ | -------------------------------------------------- |
| [`Backend/`](Backend/)   | Servidor del juego (Node + TypeScript + Socket.IO) |
| [`Frontend/`](Frontend/) | Web (Angular)                                      |

## Arrancar en local

```bash
# Terminal 1
cd Backend && npm install && npm run dev

# Terminal 2
cd Frontend && npm install && npm start
```

Abre http://localhost:4200. Cada pestaña del navegador es un jugador distinto.

## Publicar en internet

La web y el servidor van en sitios distintos: GitHub Pages solo sirve ficheros estáticos y no puede ejecutar el
servidor.

**1. Servidor en Render** (gratis, se configura una vez)

1. Crea una cuenta en https://render.com y conecta tu GitHub.
2. *New → Blueprint* → elige este repositorio. Render lee [`render.yaml`](render.yaml) y despliega `Backend/`.
3. Copia la URL que te da (algo como `https://lobo-online-backend.onrender.com`) y comprueba que
   `<URL>/health` responde `{"ok":true,...}`.

En el plan gratuito el servidor se duerme tras un rato sin uso: la primera conexión puede tardar alrededor de un
minuto, y las salas que hubiera se pierden.

**2. Web en GitHub Pages**

1. *Settings → Pages → Source*: **GitHub Actions**.
2. *Settings → Secrets and variables → Actions → Variables*: crea `BACKEND_URL` con la URL de Render.
3. Cada push a `main` que toque el frontend publica la web en https://nicolasreyalonso.github.io/LoboOnline/ (ver
   [`.github/workflows/pages.yml`](.github/workflows/pages.yml)). También se puede lanzar a mano desde la pestaña
   *Actions*.

Si la web se publica en otro dominio, añádelo a `CORS_ORIGIN` en `render.yaml` (o en *Environment* en Render).
