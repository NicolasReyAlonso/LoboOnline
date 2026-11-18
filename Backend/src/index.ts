import { loadConfig } from './config.js';
import { createLoboServer } from './server.js';

const config = loadConfig();
const server = createLoboServer(config);
const port = await server.listen();
console.log(`LoboOnline backend escuchando en http://localhost:${port}`);

let closing = false;
const shutdown = async (signal: string): Promise<void> => {
  if (closing) return;
  closing = true;
  console.log(`${signal} recibido, cerrando el servidor...`);
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
