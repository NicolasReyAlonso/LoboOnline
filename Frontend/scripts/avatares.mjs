/**
 * Prepara los avatares para la web. Uso: `npm run avatares`.
 * Necesita ImageMagick (`brew install imagemagick`).
 *
 * Lee las ilustraciones de `avatars/` (apaisadas) y escribe en
 * `public/avatars/<id>.webp` un retrato 3:4 de 480×640, recortado alrededor del
 * personaje. Así pesan unos 40 KB en vez de 2-3 MB.
 *
 * Los ids tienen que ser los mismos que `AVATARS` en Backend/src/avatars.ts
 * (y sus nombres, los de `AVATAR_NAMES` en src/app/core/avatar.ts).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Ilustración de cada avatar y dónde está el personaje: `x` es el centro del
 * recorte (0 = borde izquierdo, 1 = borde derecho) y `zoom` cuánto se acerca
 * (1 = toda la altura de la imagen).
 */
const SOURCES = {
  rata: { file: 'G.jpg', x: 0.5 },
  gotica: { file: 'Ge.jpg', x: 0.5 },
  dragon: { file: 'Gemini_Generated_Image_7us3ir7us3ir7us3.jpg', x: 0.5 },
  cientifica: { file: 'Gemini_Generated_Image_99t09j99t09j99t0.jpg', x: 0.5 },
  ejecutiva: { file: 'Gemini_Generated_Image_a3x3o4a3x3o4a3x3.jpg', x: 0.5 },
  arbol: { file: 'Gemini_Generated_Image_a5ll6wa5ll6wa5ll.jpg', x: 0.5 },
  alien: { file: 'Gemini_Generated_Image_a8hcjga8hcjga8hc.jpg', x: 0.5 },
  forzudo: { file: 'Gemini_Generated_Image_csuckrcsuckrcsuc.jpg', x: 0.5 },
  cascos: { file: 'Gemini_Generated_Image_e082xie082xie082.jpg', x: 0.5 },
  neon: { file: 'Gemini_Generated_Image_ea9xjxea9xjxea9x.jpg', x: 0.5 },
  robot: { file: 'Gemini_Generated_Image_ihs6cmihs6cmihs6.jpg', x: 0.5 },
  pony: { file: 'Gemini_Generated_Image_k8b624k8b624k8b6.jpg', x: 0.5 },
  slime: { file: 'Gemini_Generated_Image_kv6pdkkv6pdkkv6p.jpg', x: 0.5 },
  zorro: { file: 'Gemini_Generated_Image_n48gxan48gxan48g.jpg', x: 0.5 },
  pulpo: { file: 'Gemini_Generated_Image_p4pmw5p4pmw5p4pm.jpg', x: 0.5 },
  bruja: { file: 'Gemini_Generated_Image_p6jtp0p6jtp0p6jt.jpg', x: 0.56, y: 0.42, zoom: 1.35 },
  panda: { file: 'Gemini_Generated_Image_qzbw9tqzbw9tqzbw.jpg', x: 0.5 },
  fantasma: { file: 'Gemini_Generated_Image_ukl1qjukl1qjukl1.jpg', x: 0.5 },
  parca: { file: 'Gemini_Generated_Image_vekuesvekuesveku.jpg', x: 0.5 },
  duende: { file: 'Gemini_Generated_Image_xs5joyxs5joyxs5j.jpg', x: 0.5 },
};

const WIDTH = 480;
const HEIGHT = 640;

const root = new URL('../', import.meta.url);
const srcDir = new URL('avatars/', root);
const outDir = new URL('public/avatars/', root);
mkdirSync(outDir, { recursive: true });

for (const [id, { file, x, y = 0.5, zoom = 1 }] of Object.entries(SOURCES)) {
  const source = fileURLToPath(new URL(file, srcDir));
  if (!existsSync(source)) {
    console.warn(`· ${id}: falta avatars/${file}`);
    continue;
  }
  const [w, h] = execFileSync('magick', ['identify', '-format', '%w %h', source], { encoding: 'utf8' })
    .split(' ')
    .map(Number);
  // El recorte más grande con proporción 3:4 que cabe, acercado según `zoom`.
  const cropH = Math.round(Math.min(h, (w * HEIGHT) / WIDTH) / zoom);
  const cropW = Math.round((cropH * WIDTH) / HEIGHT);
  const left = clamp(Math.round(x * w - cropW / 2), 0, w - cropW);
  const top = clamp(Math.round(y * h - cropH / 2), 0, h - cropH);
  execFileSync('magick', [
    source,
    '-crop',
    `${cropW}x${cropH}+${left}+${top}`,
    '+repage',
    '-resize',
    `${WIDTH}x${HEIGHT}`,
    '-strip',
    '-quality',
    '78',
    fileURLToPath(new URL(`${id}.webp`, outDir)),
  ]);
  console.log(`✓ ${id} (${file})`);
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
