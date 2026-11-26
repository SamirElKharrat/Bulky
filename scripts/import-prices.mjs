// Descarga el price guide público y gratuito de Cardmarket para Riftbound (juego 22).
// Uso: node scripts/import-prices.mjs
// Guarda los archivos tal cual en public/data/; la app los empareja con el catálogo al cargar.
// Cardmarket los regenera una vez al día (de madrugada, hora española).

import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://downloads.s3.cardmarket.com/productCatalog";
const FILES = {
  "cm-products.json": `${BASE}/productList/products_singles_22.json`,
  "cm-prices.json": `${BASE}/priceGuide/price_guide_22.json`,
};

await mkdir("public/data", { recursive: true });
for (const [name, url] of Object.entries(FILES)) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  const text = await res.text();
  const j = JSON.parse(text);
  await writeFile(`public/data/${name}`, text);
  console.log(`✓ ${name}: ${(j.products ?? j.priceGuides).length} filas · generado ${j.createdAt}`);
}
