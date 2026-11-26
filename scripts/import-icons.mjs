// Descarga los iconos oficiales de Riftbound (dominios, tipos, rarezas y glifos)
// desde la galería oficial de Riot a assets/icons/.
// Uso: node scripts/import-icons.mjs

import { writeFile, mkdir } from "node:fs/promises";

const UA = "Mozilla/5.0 (BulkSort personal icon importer)";
const GLYPHS = "https://assetcdn.rgpub.io/public/live/riot-shared/player-experiences/riot-glyphs/rb/latest/";
// Glifos que aparecen en los textos de las cartas como :rb_might:, :rb_rune_fury:, :rb_exhaust:…
const GLYPH_NAMES = ["might", "exhaust", "artist", "card_type_rune",
  "rune_fury", "rune_calm", "rune_mind", "rune_body", "rune_chaos", "rune_order", "rune_rainbow"];

const res = await fetch("https://riftbound.leagueoflegends.com/en-us/card-gallery/", { headers: { "User-Agent": UA } });
const html = await res.text();
const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (!m) throw new Error("No se encontraron datos en la galería (¿ha cambiado la web?)");
const items = JSON.parse(m[1]).props.pageProps.page.blades.find((b) => b.cards?.items).cards.items;

const icons = {};
for (const c of items) {
  for (const d of c.domain?.values ?? []) if (d.icon?.url) icons[`domain-${d.id}`] = d.icon.url;
  for (const t of c.cardType?.type ?? []) if (t.icon?.url) icons[`type-${t.id}`] = t.icon.url;
  const r = c.rarity?.value;
  if (r?.icon?.url) icons[`rarity-${r.id}`] = r.icon.url.replace(/\?.*$/, "") + "?w=64";
}
for (const g of GLYPH_NAMES) icons[`glyph-${g}`] = `${GLYPHS}${g}.svg`;

await mkdir("public/assets/icons", { recursive: true });
for (const [name, url] of Object.entries(icons)) {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) { console.log(`✗ ${name} (${r.status})`); continue; }
  const ext = url.includes(".svg") ? "svg" : "png";
  await writeFile(`public/assets/icons/${name}.${ext}`, Buffer.from(await r.arrayBuffer()));
  console.log(`✓ ${name}.${ext}`);
}
