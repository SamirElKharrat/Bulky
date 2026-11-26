// Importa el catálogo completo de Riftbound desde la galería oficial de Riot.
// Uso: node scripts/import-gallery.mjs
// Genera public/data/catalog.json (cartas normalizadas) y data/sets.json.
// Los nombres y textos se guardan por idioma (en, fr, ko, zh). Las imágenes no se descargan:
// se guarda la URL del CDN de Riot y la app las cachea en local cuando se ven.

import { writeFile, mkdir, readFile } from "node:fs/promises";

const LOCALES = { en: "en-us", fr: "fr-fr", ko: "ko-kr", zh: "zh-cn" };
// Número de expansión que usa el código rápido (0704 = carta 070 de la expansión 4)
const SET_NUMBER = { OGN: 1, SFD: 2, UNL: 3, VEN: 4, RAD: 5 };
const UA = "Mozilla/5.0 (BulkSort personal catalog importer)";

async function fetchGallery(locale) {
  const url = `https://riftbound.leagueoflegends.com/${locale}/card-gallery/`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`${url}: no se encontraron datos de cartas (¿ha cambiado la web?)`);
  const blade = JSON.parse(m[1]).props.pageProps.page.blades.find((b) => b.cards?.items);
  if (!blade) throw new Error(`${url}: estructura de página desconocida`);
  return blade.cards.items;
}

const val = (f) => (f?.value?.id ?? null);
const stripHtml = (s) => (s ?? "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").trim();

function variantOf(id, code, number, total) {
  // ids tipo: ven-070-166, unl-116a-219 (alt art), ogn-299-star-298 (firmada), ven-sp2-006, ven-r03
  const num = id.split("-")[1] ?? "";
  if (id.includes("-star-") || (code ?? "").includes("*")) return "signature";
  if (/^\d+a$/.test(num)) return "alt";
  if (total && number > total) return "overnumbered";
  if (/^sp\d/.test(num)) return "showcase";
  if (/^r\d/.test(num)) return "rune";
  return "normal";
}

function normalize(c) {
  const setId = c.set?.value?.id;
  const [, printed, total] = (c.publicCode ?? "").match(/^[A-Z]+-([^/]+)\/(\d+)/) ?? [];
  return {
    id: c.id,
    code: c.publicCode,
    set: setId,
    setNumber: SET_NUMBER[setId] ?? null,
    number: c.collectorNumber,
    printed: printed ?? null,
    setTotal: total ? Number(total) : null,
    variant: variantOf(c.id, c.publicCode, c.collectorNumber, total ? Number(total) : 0),
    type: c.cardType?.type?.map((t) => t.id) ?? [],
    supertype: c.cardType?.superType?.map((t) => t.id) ?? [],
    rarity: val(c.rarity),
    domains: c.domain?.values?.map((d) => d.id) ?? [],
    energy: val(c.energy),
    might: val(c.might),
    power: val(c.power),
    tags: c.tags?.tags ?? c.tags?.values?.map((t) => t.label) ?? [],
    artist: c.illustrator?.values?.map((a) => a.label).join(", ") ?? null,
    image: c.cardImage?.url ?? null,
    orientation: c.orientation ?? "portrait",
    name: {},
    subtitle: {},
    text: {},
  };
}

const byId = new Map();
for (const [lang, locale] of Object.entries(LOCALES)) {
  const items = await fetchGallery(locale);
  console.log(`${locale}: ${items.length} cartas`);
  for (const c of items) {
    if (!c.name) continue; // entradas vacías o de prueba en la galería
    if (!byId.has(c.id)) byId.set(c.id, normalize(c));
    const card = byId.get(c.id);
    card.name[lang] = c.name;
    if (c.subtitle) card.subtitle[lang] = c.subtitle;
    card.text[lang] = stripHtml(c.text?.richText?.body);
  }
}

const cards = [...byId.values()].sort(
  (a, b) => (a.setNumber ?? 99) - (b.setNumber ?? 99) || a.set.localeCompare(b.set) || a.number - b.number || a.id.localeCompare(b.id)
);

const sets = {};
for (const c of cards) {
  const s = (sets[c.set] ??= { id: c.set, number: c.setNumber, base: c.setTotal, printings: 0 });
  s.printings++;
  if (c.variant === "normal" && c.setTotal) s.base = c.setTotal;
}

// Las ediciones especiales (K/DA, T1, promos) no están en la galería: se mantienen a mano.
let specials = [];
try { specials = JSON.parse(await readFile("public/data/specials.json", "utf8")).products ?? []; } catch {}

await mkdir("public/data", { recursive: true });
await writeFile("public/data/catalog.json", JSON.stringify({ source: "riftbound.leagueoflegends.com/card-gallery", fetchedAt: new Date().toISOString(), cards }, null, 1));
await writeFile("public/data/sets.json", JSON.stringify(Object.values(sets), null, 2));
console.log(`\n${cards.length} cartas únicas guardadas en data/catalog.json`);
console.table(Object.values(sets));
console.log(`${specials.length} productos especiales en data/specials.json (mantenidos a mano)`);
