import { getCodeFromDeck, getDeckFromCode } from "@piltoverarchive/riftbound-deck-codes";
import type { Card, Domain } from "./types";
import { DOMAINS } from "./types";
import type { Catalog } from "./catalog";
import { norm } from "./catalog";
import { exactByName, keyFromCode, searchCards } from "./codes";
import { parseEntryKey } from "./store";

/* ------------------------------------------------------------------ */
/* Modelo                                                             */
/* ------------------------------------------------------------------ */

export type Zone = "legend" | "champion" | "main" | "battlefields" | "runes" | "side";

/** Zonas y cabeceras del formato de texto de Piltover Archive / RiftAtlas. */
export const ZONES: { id: Zone; label: string; header: string }[] = [
  { id: "legend", label: "Leyenda", header: "Legend" },
  { id: "champion", label: "Campeón elegido", header: "Champion" },
  { id: "main", label: "Mazo principal", header: "MainDeck" },
  { id: "battlefields", label: "Campos de batalla", header: "Battlefields" },
  { id: "runes", label: "Runas", header: "Runes" },
  { id: "side", label: "Banquillo", header: "Sideboard" },
];

/** Reglas de construcción (Core Rules 103 y reglas de torneo, julio 2026). */
export const RULES = { mainWithChampion: 40, runes: 12, battlefields: 3, sideMax: 10, copies: 3, signatures: 3 };

/** Campos de batalla prohibidos en Construido (Rules Hub de Riot). */
export const BANNED_BATTLEFIELDS = ["The Arena's Greatest", "Aspirant's Climb", "The Dreaming Tree", "Dreaming Tree", "Obelisk of Power", "Reaver's Row", "Star Spring", "Emperor's Dais"].map(norm);

export interface Deck {
  id: string;
  name: string;
  /** zona -> clave de carta -> copias */
  zones: Record<Zone, Record<string, number>>;
  notes?: string;
  updatedAt: number;
}

export const emptyZones = (): Record<Zone, Record<string, number>> =>
  ({ legend: {}, champion: {}, main: {}, battlefields: {}, runes: {}, side: {} });

export const newDeck = (name = "Mazo nuevo"): Deck => ({ id: crypto.randomUUID(), name, zones: emptyZones(), updatedAt: Date.now() });

export const zoneCount = (d: Deck, z: Zone) => Object.values(d.zones[z] ?? {}).reduce((a, b) => a + b, 0);

/** Zona en la que cae una carta al añadirla, según su tipo y la leyenda del mazo. */
export function defaultZone(c: Card, deck?: Deck, cat?: Catalog): Zone {
  if (c.type === "legend") return "legend";
  if (c.type === "battlefield") return "battlefields";
  if (c.type === "rune") return "runes";
  if (deck && cat && c.champion && !c.signature && zoneCount(deck, "champion") === 0) {
    const legend = deckLegend(cat, deck);
    if (legend && c.tags.some((t) => legend.tags.includes(t))) return "champion";
  }
  return "main";
}

export function deckLegend(cat: Catalog, deck: Deck): Card | undefined {
  const k = Object.keys(deck.zones.legend)[0];
  return k ? cat.byKey.get(k) : undefined;
}

/* ------------------------------------------------------------------ */
/* Colección                                                          */
/* ------------------------------------------------------------------ */

/** Copias que tienes de cada nombre (cualquier impresión, idioma o foil cuenta). */
export function ownedByName(cat: Catalog, entries: Record<string, number>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [k, v] of Object.entries(entries)) {
    const c = cat.byKey.get(parseEntryKey(k).cardKey);
    if (!c) continue;
    const n = norm(c.name);
    m.set(n, (m.get(n) ?? 0) + v);
  }
  return m;
}

export interface DeckLine { zone: Zone; card: Card; qty: number; owned: number }

export function deckLines(cat: Catalog, deck: Deck, owned: Map<string, number>): DeckLine[] {
  const out: DeckLine[] = [];
  for (const z of ZONES) {
    for (const [key, qty] of Object.entries(deck.zones[z.id] ?? {})) {
      const card = cat.byKey.get(key);
      if (card && qty > 0) out.push({ zone: z.id, card, qty, owned: owned.get(norm(card.name)) ?? 0 });
    }
  }
  return out;
}

/** Cuántas copias necesitas por nombre y cuántas te faltan. */
export function deckSummary(lines: DeckLine[]) {
  const need = new Map<string, { card: Card; qty: number; owned: number }>();
  for (const l of lines) {
    const n = norm(l.card.name);
    const cur = need.get(n);
    if (cur) cur.qty += l.qty; else need.set(n, { card: l.card, qty: l.qty, owned: l.owned });
  }
  let total = 0, have = 0;
  const missing: { card: Card; qty: number }[] = [];
  for (const v of need.values()) {
    total += v.qty;
    have += Math.min(v.qty, v.owned);
    if (v.owned < v.qty) missing.push({ card: v.card, qty: v.qty - v.owned });
  }
  return { total, have, missing, pct: total ? Math.round((have / total) * 100) : 0 };
}

/* ------------------------------------------------------------------ */
/* Validación (mensajes al estilo RiftAtlas)                          */
/* ------------------------------------------------------------------ */

export interface Issue { level: "error" | "warn"; text: string }

export function validateDeck(cat: Catalog, deck: Deck): Issue[] {
  const out: Issue[] = [];
  const err = (text: string) => out.push({ level: "error", text });
  const warn = (text: string) => out.push({ level: "warn", text });
  const get = (z: Zone) => Object.entries(deck.zones[z]).map(([k, q]) => ({ c: cat.byKey.get(k), q })).filter((x) => x.c) as { c: Card; q: number }[];

  const legend = deckLegend(cat, deck);
  const nLegend = zoneCount(deck, "legend");
  if (nLegend !== 1) err(`La leyenda debe tener exactamente 1 carta (tienes ${nLegend}).`);
  const identity = new Set<Domain>(legend?.domains ?? []);

  const champs = get("champion");
  const nChamp = zoneCount(deck, "champion");
  if (nChamp !== 1) err(`El campeón elegido debe ser exactamente 1 carta (tienes ${nChamp}).`);
  for (const { c } of champs) {
    if (!c.champion) err(`${c.name} no es una unidad de campeón.`);
    else if (c.signature) err(`${c.name} es una carta firmada y no puede ser el campeón elegido.`);
    else if (legend && !c.tags.some((t) => legend.tags.includes(t))) err(`${c.name} no es un campeón válido para ${legend.tags[0] ?? legend.name}.`);
  }

  const main = zoneCount(deck, "main") + nChamp;
  if (main !== RULES.mainWithChampion) err(`Mazo principal + campeón debe sumar exactamente ${RULES.mainWithChampion} cartas (tienes ${main}).`);

  const nRunes = zoneCount(deck, "runes");
  if (nRunes !== RULES.runes) err(`Las runas deben ser exactamente ${RULES.runes} (tienes ${nRunes}).`);
  for (const { c } of get("runes")) {
    if (c.type !== "rune") err(`${c.name} no es una runa: va en el mazo principal.`);
    else if (legend && c.domains.some((d) => !identity.has(d))) err(`${c.name} está fuera de la identidad de dominios ${[...identity].join("/")}.`);
  }

  const bfs = get("battlefields");
  const nBf = zoneCount(deck, "battlefields");
  if (nBf !== RULES.battlefields) err(`Los campos de batalla deben ser exactamente ${RULES.battlefields} (tienes ${nBf}).`);
  for (const { c, q } of bfs) {
    if (q > 1) err(`${c.name}: solo se permite 1 copia de cada campo de batalla.`);
    if (BANNED_BATTLEFIELDS.includes(norm(c.name)) || BANNED_BATTLEFIELDS.includes(norm(c.name.replace(/^the /i, "")))) warn(`${c.name} está prohibido en Construido estándar.`);
  }

  const nSide = zoneCount(deck, "side");
  if (nSide > RULES.sideMax) err(`El banquillo puede tener como máximo ${RULES.sideMax} cartas (tienes ${nSide}).`);

  const playable = [...champs, ...get("main"), ...get("side")];
  const byName = new Map<string, { c: Card; q: number }>();
  let sigs = 0;
  for (const { c, q } of playable) {
    const n = norm(c.name);
    const cur = byName.get(n);
    byName.set(n, { c, q: (cur?.q ?? 0) + q });
    if (c.token) err(`${c.name} es una ficha y no puede ir en el mazo.`);
    if (c.type === "rune") err(`${c.name} va en Runas, no en el mazo principal.`);
    if (c.type === "legend") err(`${c.name} es una leyenda: va en Leyenda.`);
    if (c.type === "battlefield") err(`${c.name} va en Campos de batalla.`);
    if (c.signature) {
      sigs += q;
      if (legend && !c.tags.some((t) => legend.tags.includes(t))) err(`${c.name} es firmada de otro campeón (${c.tags[0] ?? "?"}).`);
    }
    if (legend && c.domains.some((d) => !identity.has(d))) err(`${c.name} está fuera de la identidad de dominios ${[...identity].join("/")}.`);
  }
  for (const { c, q } of byName.values()) if (q > RULES.copies) err(`${c.name}: ${q} copias, el máximo es ${RULES.copies}.`);
  if (sigs > RULES.signatures) err(`El mazo tiene ${sigs} cartas firmadas; el máximo es ${RULES.signatures}.`);

  // quita repetidos
  return out.filter((x, i) => out.findIndex((y) => y.text === x.text) === i);
}

/* ------------------------------------------------------------------ */
/* Estadísticas                                                       */
/* ------------------------------------------------------------------ */

export function deckStats(cat: Catalog, deck: Deck) {
  const curve = new Array(9).fill(0) as number[]; // 0..7, 8+
  const byType: Record<string, number> = {};
  const byDomain: Record<string, number> = {};
  const power: Record<string, number> = {};
  for (const z of ["champion", "main"] as Zone[]) {
    for (const [k, q] of Object.entries(deck.zones[z])) {
      const c = cat.byKey.get(k);
      if (!c) continue;
      if (c.energy != null) curve[Math.min(8, c.energy)] += q;
      const t = c.champion ? "champion" : c.type;
      byType[t] = (byType[t] ?? 0) + q;
      for (const d of c.domains) byDomain[d] = (byDomain[d] ?? 0) + q;
      if (c.power && c.domains.length) for (const d of c.domains) power[d] = (power[d] ?? 0) + (c.power * q) / c.domains.length;
    }
  }
  const runes: Record<string, number> = {};
  for (const [k, q] of Object.entries(deck.zones.runes)) {
    const c = cat.byKey.get(k);
    for (const d of c?.domains ?? []) runes[d] = (runes[d] ?? 0) + q;
  }
  return { curve, byType, byDomain, power, runes };
}

/** Reparte 12 runas según la demanda de poder de cada dominio de la leyenda (como "calcular runas" de PA). */
export function suggestRunes(cat: Catalog, deck: Deck): Record<string, number> | null {
  const legend = deckLegend(cat, deck);
  if (!legend?.domains.length) return null;
  const { power } = deckStats(cat, deck);
  const ds = legend.domains;
  const demand = ds.map((d) => power[d] ?? 0);
  const total = demand.reduce((a, b) => a + b, 0);
  let counts = ds.map((_, i) => (total ? Math.round((demand[i] / total) * RULES.runes) : Math.floor(RULES.runes / ds.length)));
  counts = counts.map((n) => Math.max(ds.length > 1 ? 1 : 0, n));
  let diff = RULES.runes - counts.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const i = diff > 0 ? demand.indexOf(Math.max(...demand)) : counts.indexOf(Math.max(...counts));
    counts[i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  const out: Record<string, number> = {};
  ds.forEach((d, i) => {
    const rune = basicRune(cat, d);
    if (rune && counts[i] > 0) out[rune.key] = counts[i];
  });
  return out;
}

/** La runa básica normal más reciente de un dominio ("Fury Rune"). */
export function basicRune(cat: Catalog, d: Domain): Card | undefined {
  const name = `${d[0].toUpperCase()}${d.slice(1)} Rune`;
  const list = cat.cards.filter((c) => c.type === "rune" && c.name === name);
  return list.find((c) => c.set === "OGN" && c.variant === "normal") ?? list.find((c) => c.variant === "normal") ?? list[0];
}

/* ------------------------------------------------------------------ */
/* Exportar                                                            */
/* ------------------------------------------------------------------ */

export type ExportFormat = "pa" | "codes" | "tcgarena" | "code" | "tts";

const zoneRows = (cat: Catalog, deck: Deck, z: Zone) =>
  Object.entries(deck.zones[z]).filter(([, q]) => q > 0).map(([k, q]) => ({ k, q, c: cat.byKey.get(k) }));

/** Clave de BulkSort -> código de carta de la librería de códigos (OGN-007a, OGN-299s). */
const toLibCode = (k: string) => k.replace(/A$/, "a").replace(/\*$/, "s");
/** Código de la librería -> clave de BulkSort. */
const fromLibCode = (c: string) => c.toUpperCase().replace(/S$/, "*").replace(/(\d)\*$/, "$1*");

export function exportDeck(cat: Catalog, deck: Deck, f: ExportFormat): string {
  if (f === "code") return deckCode(cat, deck);
  if (f === "tts") {
    const order: Zone[] = ["legend", "champion", "main", "battlefields", "runes", "side"];
    return order.flatMap((z) => zoneRows(cat, deck, z).flatMap(({ k, q }) => Array(q).fill(`${toLibCode(k)}-1`))).join(" ");
  }
  if (f === "tcgarena") {
    const main = (["legend", "champion", "main", "battlefields", "runes"] as Zone[]).flatMap((z) => zoneRows(cat, deck, z)).map(({ k, q, c }) => `${q} ${c?.name ?? k}`);
    const side = zoneRows(cat, deck, "side").map(({ k, q, c }) => `${q} ${c?.name ?? k}`);
    return [...main, ...(side.length ? ["", "Sideboard:", ...side] : [])].join("\n");
  }
  return ZONES.map((z) => {
    const rows = zoneRows(cat, deck, z.id);
    if (!rows.length) return null;
    return `${z.header}:\n${rows.map(({ k, q, c }) => (f === "codes" ? `${q} ${c?.name ?? k} [${k}]` : `${q} ${c?.name ?? k}`)).join("\n")}`;
  }).filter(Boolean).join("\n\n");
}

/** Código de mazo compatible con Piltover Archive y RiftAtlas. */
export function deckCode(cat: Catalog, deck: Deck): string {
  const main = (["legend", "champion", "main", "battlefields", "runes"] as Zone[]).flatMap((z) => zoneRows(cat, deck, z));
  const merged = new Map<string, number>();
  for (const { k, q } of main) merged.set(k, (merged.get(k) ?? 0) + q);
  const champ = Object.keys(deck.zones.champion)[0];
  return getCodeFromDeck(
    [...merged].map(([k, count]) => ({ cardCode: toLibCode(k), count })),
    zoneRows(cat, deck, "side").map(({ k, q }) => ({ cardCode: toLibCode(k), count: q })),
    champ ? toLibCode(champ) : undefined,
  );
}

export const tcgArenaLink = (cat: Catalog, deck: Deck) =>
  `https://www.tcg-arena.fr/import?game=Riftbound&name=${encodeURIComponent(deck.name)}&deck=${encodeURIComponent(btoa(unescape(encodeURIComponent(exportDeck(cat, deck, "pa")))))}`;
export const riftAtlasLink = (cat: Catalog, deck: Deck) => `https://play.riftatlas.com/?deckCode=${deckCode(cat, deck)}`;

/* ------------------------------------------------------------------ */
/* Importar: texto (PA / RiftAtlas / TCG Arena), código, TTS, Pixelborn, enlaces */
/* ------------------------------------------------------------------ */

const HEADER_TO_ZONE: Record<string, Zone> = {
  legend: "legend", legends: "legend", leyenda: "legend", "additional legend": "legend", "additional legends": "legend",
  champion: "champion", champions: "champion", "chosen champion": "champion", campeon: "champion", "campeon elegido": "champion", chosen_champion: "champion",
  maindeck: "main", "main deck": "main", mainboard: "main", main: "main", deck: "main", mazo: "main", "mazo principal": "main",
  unit: "main", units: "main", spell: "main", spells: "main", gear: "main",
  battlefields: "battlefields", battlefield: "battlefields", "campos de batalla": "battlefields",
  runes: "runes", rune: "runes", runepool: "runes", "rune deck": "runes", runas: "runes",
  sideboard: "side", side: "side", banquillo: "side", maybeboard: "side",
};

export interface ImportResult { deck: Deck; notFound: string[]; source: string }

function fromCardList(cat: Catalog, name: string, main: { code: string; count: number }[], side: { code: string; count: number }[], chosen?: string, source = "código"): ImportResult {
  const deck = newDeck(name);
  const notFound: string[] = [];
  const put = (code: string, count: number, zone?: Zone) => {
    const c = cat.byKey.get(fromLibCode(code)) ?? cat.byKey.get(code.toUpperCase());
    if (!c) { notFound.push(`${count} ${code}`); return; }
    const z = zone ?? (c.type === "legend" && zoneCount(deck, "legend") === 0 ? "legend" : c.type === "legend" ? "side" : defaultZone(c));
    deck.zones[z][c.key] = (deck.zones[z][c.key] ?? 0) + count;
  };
  for (const { code, count } of main) {
    if (chosen && fromLibCode(code) === fromLibCode(chosen)) {
      put(code, 1, "champion");
      if (count > 1) put(code, count - 1);
    } else put(code, count);
  }
  for (const { code, count } of side) put(code, count, "side");
  if (!chosen) autoChampion(cat, deck);
  return { deck, notFound, source };
}

/** Sin sección de campeón: elige como campeón la primera unidad de campeón de la leyenda (como TCG Arena). */
function autoChampion(cat: Catalog, deck: Deck) {
  if (zoneCount(deck, "champion")) return;
  const legend = deckLegend(cat, deck);
  if (!legend) return;
  const k = Object.keys(deck.zones.main).find((key) => {
    const c = cat.byKey.get(key);
    return c?.champion && !c.signature && c.tags.some((t) => legend.tags.includes(t));
  });
  if (!k) return;
  deck.zones.champion[k] = 1;
  if (--deck.zones.main[k] <= 0) delete deck.zones.main[k];
}

function parseText(cat: Catalog, text: string, name: string, source: string): ImportResult {
  const deck = newDeck(name);
  const notFound: string[] = [];
  const specials = new Set(cat.specials.map((s) => s.id));
  let zone: Zone | null = null;
  let sawChampionHeader = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•]\s*/, "");
    if (!line || /^\/\//.test(line)) continue;
    // Cabecera: "MainDeck:", "Runes (12)", "Chosen Champion"
    const h = line.match(/^([A-Za-zÁÉÍÓÚáéíóú_ ]+?)\s*(?:\(\d+\))?\s*:?\s*(?:\(\d+\))?$/);
    if (h && !/^\d/.test(line)) {
      const z = HEADER_TO_ZONE[norm(h[1]).replace(/_/g, " ")] ?? HEADER_TO_ZONE[h[1].toLowerCase()];
      if (z) { zone = z; if (z === "champion") sawChampionHeader = true; continue; }
      if (line.endsWith(":")) continue; // cabecera desconocida
    }
    // Cantidad: "3 Nombre", "3x Nombre", "Nombre x3"
    let qty = 1;
    let rest = line;
    let m = rest.match(/^(\d{1,2})\s*[x×]?\s+(.+)$/i);
    if (m) { qty = Number(m[1]); rest = m[2]; }
    else if ((m = rest.match(/^(.+?)\s+[x×]\s*(\d{1,2})$/i)) || (m = rest.match(/^(.+?)\s*[x×](\d{1,2})$/i))) { qty = Number(m[2]); rest = m[1]; }
    // Código entre corchetes (RiftAtlas): "Nombre [OGN-123]"
    let card: Card | undefined;
    const br = rest.match(/\[([A-Za-z0-9*-]+)\]\s*$/);
    if (br) { card = cat.byKey.get(fromLibCode(br[1])) ?? cat.byKey.get(br[1].toUpperCase()); rest = rest.slice(0, br.index).trim(); }
    if (!card) {
      const k = keyFromCode(rest, specials) ?? keyFromCode(rest.split(/\s+/)[0], specials);
      card = k ? cat.byKey.get(k) : undefined;
    }
    if (!card) card = exactByName(cat, rest.replace(/\s+-\s+/, ", "))[0];
    if (!card) {
      const guess = searchCards(cat, rest, 2);
      if (guess.length === 1) card = guess[0];
    }
    if (!card) { notFound.push(line); continue; }
    const z = zone ?? defaultZone(card);
    deck.zones[z][card.key] = (deck.zones[z][card.key] ?? 0) + qty;
  }
  // Formato PA: MainDeck no incluye el campeón. Si no hubo sección Champion, se elige uno.
  if (!sawChampionHeader) autoChampion(cat, deck);
  return { deck, notFound, source };
}

const b64decode = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

/** Detecta el formato y lo convierte en mazo. Acepta enlaces, códigos y texto. */
export async function importDeck(cat: Catalog, input: string, name: string): Promise<ImportResult> {
  let text = input.trim();
  if (!text) return { deck: newDeck(name), notFound: [], source: "" };

  // Enlaces
  if (/^https?:\/\//i.test(text)) {
    const url = new URL(text);
    const code = url.searchParams.get("deckCode") ?? url.searchParams.get("code");
    if (code) return importDeck(cat, code, name);
    const deckParam = url.searchParams.get("deck");
    if (deckParam && /tcg-arena/i.test(url.hostname)) {
      return parseText(cat, b64decode(deckParam), url.searchParams.get("name") ?? name, "TCG Arena");
    }
    const pa = url.pathname.match(/decks\/view\/([0-9a-f-]{36})/i);
    if (pa && /piltoverarchive/i.test(url.hostname)) {
      const res = await fetch("https://piltoverarchive.com/api/external/v1/decks/export/text", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deckId: pa[1] }),
      }).catch(() => null);
      if (!res?.ok) throw new Error("No se pudo descargar el mazo de Piltover Archive. Copia su texto con Export → Text y pégalo aquí.");
      const j = await res.json();
      return parseText(cat, typeof j === "string" ? j : j.text ?? j.decklist ?? "", name, "Piltover Archive");
    }
    throw new Error("No reconozco ese enlace. Pega el texto del mazo o su código.");
  }

  // Código de mazo (base32, PA / RiftAtlas)
  if (/^[A-Z2-7]{16,}$/.test(text)) {
    const d = getDeckFromCode(text);
    return fromCardList(cat, name, d.mainDeck.map((c) => ({ code: c.cardCode, count: c.count })), d.sideboard.map((c) => ({ code: c.cardCode, count: c.count })), d.chosenChampion, "código de mazo");
  }

  // Exportación TTS: "OGN-017-1 OGN-027-1 ..."
  if (/^([A-Z]{3}-[A-Z0-9]+[a-z*]?-\d+\s*)+$/i.test(text)) {
    const counts = new Map<string, number>();
    for (const t of text.split(/\s+/)) {
      const code = t.replace(/-\d+$/, "");
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    return fromCardList(cat, name, [...counts].map(([code, count]) => ({ code, count })), [], undefined, "TTS");
  }

  // Pixelborn (base64 de "OGN-265-1$OGN-246-1$...")
  if (/^[A-Za-z0-9+/=]{24,}$/.test(text)) {
    let dec = "";
    try { dec = atob(text); } catch { /* no era base64 */ }
    if (/^[A-Z]{3}-[A-Z0-9]+[a-z*]?-\d+(\$[A-Z]{3}-[A-Z0-9]+[a-z*]?-\d+)*$/i.test(dec)) {
      const r = await importDeck(cat, dec.replace(/\$/g, " "), name);
      return { ...r, source: "Pixelborn" };
    }
  }

  const fromTcgArena = !/^\s*(legend|maindeck|champion)\s*:/im.test(text) && /^\s*sideboard\s*:/im.test(text);
  return parseText(cat, text, name, fromTcgArena ? "TCG Arena" : /\[[A-Z]{3}-/.test(text) ? "RiftAtlas" : "texto (Piltover Archive / RiftAtlas)");
}

export { DOMAINS };
