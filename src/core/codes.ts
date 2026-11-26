import type { Card, Lang } from "./types";
import type { Catalog } from "./catalog";
import { norm } from "./catalog";
import { SET_BY_NUMBER } from "./sets";

/**
 * Convierte lo que escribe el usuario en una clave del catálogo.
 *  0704      -> VEN-070   (número 070 + expansión 4)
 *  1385      -> RAD-138
 *  ven-70    -> VEN-070
 *  unl-116a  -> UNL-116A  (alt art)
 *  ogn-299*  -> OGN-299*  (firmada)
 *  t1s-1     -> T1S-001   (edición especial)
 */
export function keyFromCode(raw: string, specials: Set<string>): string | null {
  const t = raw.trim().toUpperCase();
  let m = t.match(/^(\d{3})(\d{1,2})$/);
  if (m) {
    const set = SET_BY_NUMBER[Number(m[2])];
    return set ? `${set}-${m[1]}` : null;
  }
  m = t.match(/^([A-Z0-9]{3})-?(\d{1,3})([A*]?)$/);
  if (!m) return null;
  if (specials.has(m[1])) return `${m[1]}-${m[2].padStart(3, "0")}`;
  return `${m[1]}-${m[2].padStart(3, "0")}${m[3]}`;
}

export interface QuickQuery { text: string; qty: number }

/** Separa una cantidad final del tipo "x3". */
export function splitQty(raw: string): QuickQuery {
  const m = raw.match(/\s*[x×](\d{1,2})\s*$/i);
  if (!m) return { text: raw.trim(), qty: 1 };
  return { text: raw.slice(0, m.index).trim(), qty: Math.max(1, Number(m[1])) };
}

/** Busca por código (exacto, con sus variantes) o por nombre. */
export function searchCards(cat: Catalog, raw: string, limit = 8): Card[] {
  const text = raw.trim();
  if (!text) return [];
  const specials = new Set(cat.specials.map((s) => s.id));
  const key = keyFromCode(text, specials);
  if (key) {
    const exact = cat.byKey.get(key);
    const variants = [key + "A", key + "*"].map((k) => cat.byKey.get(k)).filter(Boolean) as Card[];
    const all = exact ? [exact, ...variants.filter((v) => v !== exact)] : variants;
    if (all.length) return all;
  }
  if (text.length < 2) return [];
  const q = norm(text);
  const starts: Card[] = [];
  const contains: Card[] = [];
  for (const c of cat.cards) {
    const n = norm(c.name);
    if (n.startsWith(q)) starts.push(c);
    else if (c.search.includes(q)) contains.push(c);
  }
  // Primero el nombre exacto ("Evelynn, Entrancing"), luego los que empiezan igual y después el resto.
  const rank = (c: Card) => (norm(c.name) === q ? 0 : 1) * 2 + (c.variant === "normal" || c.variant === "special" ? 0 : 1);
  return [...starts.sort((a, b) => rank(a) - rank(b)), ...contains.sort((a, b) => rank(a) - rank(b))].slice(0, limit);
}

/** Busca una carta por nombre exacto (sin tener en cuenta mayúsculas ni signos). Prefiere la versión normal. */
export function exactByName(cat: Catalog, name: string): Card[] {
  const q = norm(name);
  const hits = cat.cards.filter((c) => norm(c.name) === q);
  const normal = hits.filter((c) => c.variant === "normal" || c.variant === "special");
  return normal.length ? normal : hits;
}

export interface ParsedLine { line: string; qty: number; card: Card | null; options: Card[]; lang: Lang | null; foil: boolean; guess: boolean }

/**
 * Interpreta una lista pegada, una carta por línea:
 *   "3x Evelynn, Entrancing" · "Evelynn, Entrancing x3" · "0704 x2" · "2 VEN-070" · "VEN-070"
 */
export function parseList(cat: Catalog, text: string): ParsedLine[] {
  const specials = new Set(cat.specials.map((s) => s.id));
  const out: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    // Idioma y foil al final: "(EN, foil)" del texto exportado, o "KO" / "foil" sueltos.
    let lang: Lang | null = null;
    let foil = false;
    // El chino se escribe CN; se acepta también ZH (listas antiguas).
    const toLang = (s: string) => { const u = s.toUpperCase(); return (u === "ZH" ? "CN" : u) as Lang; };
    const p = line.match(/\s*\((EN|KO|ZH|CN|FR)(, ?foil)?\)\s*$/i);
    if (p) { lang = toLang(p[1]); foil = !!p[2]; line = line.slice(0, p.index).trim(); }
    for (let k = 0; k < 2; k++) {
      if (/\sfoil$/i.test(line)) { foil = true; line = line.slice(0, -5).trim(); }
      if (/\s(EN|KO|ZH|CN|FR)$/i.test(line)) { lang = toLang(line.slice(-2)); line = line.slice(0, -3).trim(); }
    }
    let qty = 1;
    let m = line.match(/^(\d{1,2})\s*[x×]?\s+(.+)$/i); // "3x Nombre", "3 Nombre"
    if (m && !/^\d{4,5}$/.test(line.split(/\s+/)[0])) { qty = Number(m[1]); line = m[2]; }
    m = line.match(/^(.+?)\s*[x×](\d{1,2})$/i); // "Nombre x3"
    if (m) { qty = Number(m[2]); line = m[1]; }
    m = line.match(/^(.+?)\s+(\d{1,2})$/); // "VEN-070 2"
    if (m && keyFromCode(m[1], specials)) { qty = Number(m[2]); line = m[1]; }
    const key = keyFromCode(line, specials) ?? keyFromCode(line.split(/\s+/)[0], specials);
    const byCode = key ? cat.byKey.get(key) : undefined;
    const exact = byCode ? [byCode] : exactByName(cat, line);
    // Sin coincidencia exacta ("Jinx"): se proponen las cartas parecidas para que elijas.
    const options = exact.length ? exact : searchCards(cat, line, 10);
    out.push({ line: raw.trim(), qty: Math.max(1, qty), card: options[0] ?? null, options, lang, foil, guess: !exact.length && options.length > 0 });
  }
  return out;
}
