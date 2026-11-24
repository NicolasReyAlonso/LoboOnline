/**
 * Prepara las tarjetas de personaje para la web. Uso: `npm run tarjetas`.
 *
 * Lee los dibujos de `tarjetas/` (PNG con líneas negras sobre fondo transparente)
 * y, por cada tarjeta, escribe en `public/tarjetas/` dos máscaras de 768×768:
 *
 * - `<tarjeta>-lineas.png`: el dibujo (cuánta "tinta" hay en cada punto).
 * - `<tarjeta>-silueta.png`: la forma de la tarjeta, para pintarle un fondo.
 *
 * `<tarjeta>` es el rol (`seer`) o, para los disfraces de temporada,
 * `<temporada>/<rol>` (`christmas/hunter` es el Grinch).
 *
 * La web las colorea con el tema: de día tinta oscura sobre papel claro y de
 * noche en negativo. También regenera `src/app/core/role-cards.ts` con la lista
 * de tarjetas dibujadas (las que faltan usan una provisional).
 *
 * Sin dependencias: lee y escribe los PNG con el zlib de Node.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

/** Dibujo de cada tarjeta dentro de `tarjetas/`. */
const SOURCES = {
  villager: 'tarjetas_base/tarjeta_Campesino.png',
  werewolf: 'tarjetas_base/tarjeta_lobo.png',
  seer: 'tarjetas_base/tarjeta_vidente.png',
  witch: 'tarjetas_base/tarjeta_bruja.png',
  hunter: 'tarjetas_base/tarjeta_Hunter.png',
  cupid: 'tarjetas_base/tarjeta_Cupido.png',
  protector: 'tarjetas_base/tarjeta_Protector.png',
  // Navidad: Santa Claus solo existe en esta temporada; los demás son disfraces.
  santa: 'tarjetas_christmas/tarjeta_santa_claus.png',
  'christmas/villager': 'tarjetas_christmas/tarjeta_elfo.png',
  'christmas/hunter': 'tarjetas_christmas/tarjeta_grinch.png',
  'christmas/protector': 'tarjetas_christmas/tarjeta_mama_claus.png',
};

/** Lado de las imágenes para la web (de sobra para verla grande en un móvil). */
const SIZE = 768;

const root = new URL('../', import.meta.url);
const srcDir = new URL('tarjetas/', root);
const outDir = new URL('public/tarjetas/', root);
mkdirSync(outDir, { recursive: true });

const done = [];
for (const [card, file] of Object.entries(SOURCES)) {
  const source = new URL(file, srcDir);
  if (!existsSync(source)) {
    console.warn(`· ${card}: falta tarjetas/${file}, se usará la tarjeta provisional.`);
    continue;
  }
  const { width, height, ink } = readPng(readFileSync(source), file);
  if (width !== height) console.warn(`· ${card}: el dibujo no es cuadrado (${width}×${height}), se verá deformado.`);
  const shape = silhouette(ink, width, height);
  const filled = shape.reduce((sum, v) => sum + v, 0) / shape.length;
  if (filled < 0.5) {
    console.warn(`· ${card}: el borde de la tarjeta parece abierto; el fondo no cubrirá bien el dibujo.`);
  }
  const lines = new URL(`${card}-lineas.png`, outDir);
  mkdirSync(dirname(fileURLToPath(lines)), { recursive: true });
  writeMask(lines, resize(ink, width, height, SIZE), SIZE);
  writeMask(new URL(`${card}-silueta.png`, outDir), resize(shape, width, height, SIZE), SIZE);
  done.push(card);
  console.log(`✓ ${card} (${file})`);
}

writeFileSync(
  new URL('src/app/core/role-cards.ts', root),
  `// Generado por \`npm run tarjetas\` (scripts/tarjetas.mjs). No lo edites a mano.

/**
 * Tarjetas dibujadas en public/tarjetas/: \`<rol>\` o, para los disfraces de
 * temporada, \`<temporada>/<rol>\` (ver \`cardKey\` en card-art.ts).
 */
export const DRAWN_CARDS: ReadonlySet<string> = new Set<string>([
${done.map((r) => `  '${r}',\n`).join('')}]);
`,
);

// ---------------------------------------------------------------------------
// Imagen
// ---------------------------------------------------------------------------

/**
 * Silueta de la tarjeta: todo lo que no se alcanza desde los bordes de la
 * imagen sin cruzar una línea. Las líneas se engordan un poco antes para tapar
 * los huecos pequeños del borde dibujado a mano.
 */
function silhouette(ink, w, h) {
  const r = Math.max(2, Math.round(w / 256));
  const wall = dilate(Uint8Array.from(ink, (v) => (v >= 0.35 ? 1 : 0)), w, h, r);
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const visit = (i) => {
    if (!wall[i] && !outside[i]) {
      outside[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < w; x++) visit(x), visit((h - 1) * w + x);
  for (let y = 0; y < h; y++) visit(y * w), visit(y * w + w - 1);
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i < w * (h - 1)) visit(i + w);
  }
  // Se devuelve a "fuera" lo que se comió el engorde, para que el fondo acabe justo en la línea.
  const grown = dilate(outside, w, h, r);
  return Float32Array.from(grown, (v) => 1 - v);
}

/** Engorda una máscara binaria `r` píxeles (cuadrado), por filas y luego por columnas. */
function dilate(mask, w, h, r) {
  const pass = (src, len, count, step, stride) => {
    const out = new Uint8Array(src.length);
    for (let k = 0; k < count; k++) {
      const base = k * stride;
      let run = 0;
      for (let i = 0; i < Math.min(r, len); i++) run += src[base + i * step];
      for (let i = 0; i < len; i++) {
        if (i + r < len) run += src[base + (i + r) * step];
        if (i - r - 1 >= 0) run -= src[base + (i - r - 1) * step];
        out[base + i * step] = run > 0 ? 1 : 0;
      }
    }
    return out;
  };
  return pass(pass(mask, w, h, 1, w), h, w, w, 1);
}

/** Reduce la imagen promediando áreas (para que las líneas queden suaves). */
function resize(values, w, h, size) {
  const wx = areaWeights(w, size);
  const wy = areaWeights(h, size);
  const rows = new Float32Array(size * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (const [sx, k] of wx[x]) sum += values[y * w + sx] * k;
      rows[y * size + x] = sum;
    }
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (const [sy, k] of wy[y]) sum += rows[sy * size + x] * k;
      out[y * size + x] = sum;
    }
  }
  return out;
}

function areaWeights(src, dst) {
  const f = src / dst;
  return Array.from({ length: dst }, (_, i) => {
    const start = i * f;
    const end = start + f;
    const list = [];
    for (let s = Math.floor(start); s < Math.ceil(end); s++) {
      const overlap = Math.min(end, s + 1) - Math.max(start, s);
      if (overlap > 0) list.push([s, overlap / f]);
    }
    return list;
  });
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

/** Lee un PNG de 8 bits por canal y devuelve la tinta de cada píxel (opacidad × oscuridad, de 0 a 1). */
function readPng(buf, name) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${name} no es un PNG`);
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  const idat = [];
  for (let pos = 8; pos < buf.length; ) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      [depth, type] = [data[8], data[9]];
      interlace = data[12];
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 8 || !channels || interlace !== 0) {
    throw new Error(`${name}: guárdalo como PNG de 8 bits por canal (RGBA), sin paleta ni entrelazado.`);
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = v & 255;
    }
  }

  const ink = new Float32Array(width * height);
  for (let i = 0; i < ink.length; i++) {
    const p = i * channels;
    const [r, g, b] = channels >= 3 ? [px[p], px[p + 1], px[p + 2]] : [px[p], px[p], px[p]];
    const alpha = channels === 4 ? px[p + 3] : channels === 2 ? px[p + 1] : 255;
    ink[i] = (alpha / 255) * (1 - (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255);
  }
  return { width, height, ink };
}

/** Escribe una máscara como PNG negro con transparencia (gris + alfa). */
function writeMask(file, values, size) {
  const stride = size * 2;
  const raw = Buffer.alloc(size * (stride + 1));
  const alpha = Uint8Array.from(values, (v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
  for (let y = 0; y < size; y++) {
    const at = y * (stride + 1);
    raw[at] = 2; // filtro "Up": resta la fila de arriba, comprime mejor
    for (let x = 0; x < size; x++) {
      const above = y > 0 ? alpha[(y - 1) * size + x] : 0;
      raw[at + 1 + x * 2 + 1] = (alpha[y * size + x] - above) & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 4; // gris + alfa
  writeFileSync(
    file,
    Buffer.concat([
      Buffer.from('89504e470d0a1a0a', 'hex'),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function chunk(kind, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(kind, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, crc]);
}
