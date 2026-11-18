# LoboOnline
El lobo pero online

| Carpeta                  | Qué es                                          |
| ------------------------ | ----------------------------------------------- |
| [`Backend/`](Backend/)   | Servidor del juego (Node + TypeScript + Socket.IO) |
| [`Frontend/`](Frontend/) | Web (Angular)                                   |

## Arrancar en local

```bash
# Terminal 1
cd Backend && npm install && npm run dev

# Terminal 2
cd Frontend && npm install && npm start
```

Abre http://localhost:4200. Cada pestaña del navegador es un jugador distinto.
