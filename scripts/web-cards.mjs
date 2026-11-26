// Genera web/public/cards.json para la web pública: clave de carta -> [nombre, id de imagen de Riot].
// Así los enlaces de las listas de venta solo llevan el código de cada carta, no su nombre ni su imagen.
// Se ejecuta solo al compilar la web (npm run build:web / dev:web).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const root = new URL("..", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("public/data/catalog.json", root), "utf8"));
const specials = JSON.parse(readFileSync(new URL("public/data/specials.json", root), "utf8"));
const imageId = (url) => url?.match(/game_data_live\/([0-9a-f]+-\d+x\d+)\.png/)?.[1] ?? "";

const out = {};
for (const r of catalog.cards) {
  const base = r.name?.en;
  if (!base || !r.code) continue;
  const key = r.code.split("/")[0].toUpperCase();
  if (out[key]) continue;
  // Mismo nombre que en la app (src/core/catalog.ts): "Campeón, Título" en leyendas y "Nombre, Subtítulo" en el resto.
  const tags = r.tags ?? [];
  const isLegend = (r.type ?? []).includes("legend");
  const sub = r.subtitle?.en;
  const name = isLegend && tags[0] ? (base.startsWith(tags[0]) ? base : `${tags[0]}, ${base}`) : sub ? `${base}, ${sub}` : base;
  out[key] = [name, imageId(r.image)];
}
for (const p of specials.products ?? []) {
  for (const c of p.cards ?? []) out[`${p.code}-${String(c.n).padStart(3, "0")}`] = [c.name, imageId(c.image)];
}

mkdirSync(new URL("web/public", root), { recursive: true });
writeFileSync(new URL("web/public/cards.json", root), JSON.stringify(out));
console.log(`cards.json: ${Object.keys(out).length} cartas`);
