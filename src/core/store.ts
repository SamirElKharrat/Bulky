import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import type { Lang } from "./types";
import type { Deck } from "./decks";
import type { SaleItem, SaleList } from "./sales";

// La colección se guarda en IndexedDB del propio equipo. En la versión Tauri se pasará a SQLite.
const idbStorage: StateStorage = {
  getItem: async (name) => (await get(name)) ?? null,
  setItem: async (name, value) => { await set(name, value); },
  removeItem: async (name) => { await del(name); },
};

export type Theme = "system" | "light" | "dark";

/** Colección por defecto (donde iba todo antes de existir las colecciones). */
export const DEFAULT_COLLECTION = "main";

export interface Collection { id: string; name: string; color: string; image?: string | null; createdAt: number }

/** Clave de una línea de colección: carta + idioma + foil + colección. */
export const entryKey = (cardKey: string, lang: Lang, foil: boolean, coll: string = DEFAULT_COLLECTION) =>
  `${cardKey}|${lang}|${foil ? 1 : 0}|${coll}`;
export const parseEntryKey = (k: string) => {
  const [cardKey, lang, foil, coll] = k.split("|");
  return { cardKey, lang: lang as Lang, foil: foil === "1", coll: coll || DEFAULT_COLLECTION };
};
const withColl = (k: string, coll: string) => { const p = parseEntryKey(k); return entryKey(p.cardKey, p.lang, p.foil, coll); };

export interface Batch { at: number; items: { key: string; qty: number }[] }

interface State {
  /** entryKey -> copias */
  entries: Record<string, number>;
  /** id de expansión o especial -> imagen elegida por el usuario (data URL) */
  covers: Record<string, string>;
  /** clave de carta -> imagen elegida por el usuario (data URL) */
  cardImages: Record<string, string>;
  decks: Deck[];
  collections: Collection[];
  /** Última colección elegida al añadir cartas. */
  lastCollection: string;
  theme: Theme;
  textSize: "normal" | "large" | "xlarge";
  /** Color principal de la app (botones, selección, carpetas). */
  accent: string;
  saleLists: SaleList[];
  /** Dirección donde está publicada la página pública de listas (share.html). */
  shareBase: string;
  lastLang: Lang;
  lastBatch: Batch | null;
  addMany: (items: { key: string; qty: number }[]) => void;
  undoLastBatch: () => void;
  setQty: (key: string, qty: number) => void;
  setCover: (id: string, dataUrl: string | null) => void;
  setCardImage: (key: string, dataUrl: string | null) => void;
  saveDeck: (deck: Deck) => void;
  deleteDeck: (id: string) => void;
  duplicateDeck: (id: string) => void;
  setTheme: (t: Theme) => void;
  setTextSize: (s: "normal" | "large" | "xlarge") => void;
  setAccent: (c: string) => void;
  saveSaleList: (l: SaleList) => void;
  /** Borra la lista y devuelve sus cartas a su colección. */
  deleteSaleList: (id: string) => void;
  /** Pasa copias de la colección a una lista (dejan de contar en la colección). */
  addToSale: (listId: string, moves: { entry: string; qty: number }[]) => void;
  /** Quita una carta de la lista: "return" la devuelve a su colección, "sold" la da por vendida. */
  removeFromSale: (listId: string, itemId: string, how: "return" | "sold") => void;
  setShareBase: (url: string) => void;
  /** Cambia las copias en venta; las que sobran vuelven a su colección y las que faltan se toman de ella. */
  setSaleQty: (listId: string, itemId: string, qty: number) => void;
  saveCollection: (c: Collection) => void;
  /** Borra una colección y pasa sus cartas a otra. */
  deleteCollection: (id: string, moveTo: string) => void;
  /** Mueve líneas completas (o parte de sus copias) a otra colección. */
  moveEntries: (moves: { key: string; qty?: number }[], to: string) => void;
  setLastCollection: (id: string) => void;
  /** Borra líneas de la colección (se puede deshacer con undoLastBatch). */
  deleteEntries: (keys: string[]) => void;
  /** Quita algunas copias de cada línea (no toda la línea). Se puede deshacer. */
  removeCopies: (moves: { entry: string; qty: number }[]) => void;
  setLastLang: (l: Lang) => void;
  importEntries: (entries: Record<string, number>, mode: "merge" | "replace") => void;
}

export const useStore = create<State>()(
  persist(
    (setState) => ({
      entries: {},
      covers: {},
      cardImages: {},
      decks: [],
      collections: [{ id: DEFAULT_COLLECTION, name: "Mi bulk", color: "#4558C9", createdAt: 0 }],
      lastCollection: DEFAULT_COLLECTION,
      theme: "system",
      textSize: "normal",
      accent: "#4558C9",
      saleLists: [],
      shareBase: "",
      lastLang: "EN",
      lastBatch: null,
      addMany: (items) =>
        setState((s) => {
          const entries = { ...s.entries };
          for (const it of items) entries[it.key] = (entries[it.key] ?? 0) + it.qty;
          return { entries, lastBatch: { at: Date.now(), items } };
        }),
      undoLastBatch: () =>
        setState((s) => {
          if (!s.lastBatch) return s;
          const entries = { ...s.entries };
          for (const it of s.lastBatch.items) {
            const n = (entries[it.key] ?? 0) - it.qty;
            if (n > 0) entries[it.key] = n; else delete entries[it.key];
          }
          return { entries, lastBatch: null };
        }),
      setQty: (key, qty) =>
        setState((s) => {
          const entries = { ...s.entries };
          if (qty > 0) entries[key] = qty; else delete entries[key];
          return { entries };
        }),
      setCover: (id, dataUrl) =>
        setState((s) => {
          const covers = { ...s.covers };
          if (dataUrl) covers[id] = dataUrl; else delete covers[id];
          return { covers };
        }),
      setCardImage: (key, dataUrl) =>
        setState((s) => {
          const cardImages = { ...s.cardImages };
          if (dataUrl) cardImages[key] = dataUrl; else delete cardImages[key];
          return { cardImages };
        }),
      saveDeck: (deck) =>
        setState((s) => {
          const d = { ...deck, updatedAt: Date.now() };
          const i = s.decks.findIndex((x) => x.id === deck.id);
          return { decks: i < 0 ? [d, ...s.decks] : s.decks.map((x) => (x.id === deck.id ? d : x)) };
        }),
      deleteDeck: (id) => setState((s) => ({ decks: s.decks.filter((d) => d.id !== id) })),
      duplicateDeck: (id) =>
        setState((s) => {
          const d = s.decks.find((x) => x.id === id);
          if (!d) return s;
          return { decks: [{ ...structuredClone(d), id: crypto.randomUUID(), name: `${d.name} (copia)`, updatedAt: Date.now() }, ...s.decks] };
        }),
      setTheme: (theme) => setState({ theme }),
      setTextSize: (textSize) => setState({ textSize }),
      setAccent: (accent) => setState({ accent }),
      saveSaleList: (l) =>
        setState((s) => {
          const x = { ...l, updatedAt: Date.now() };
          const i = s.saleLists.findIndex((y) => y.id === l.id);
          return { saleLists: i < 0 ? [x, ...s.saleLists] : s.saleLists.map((y) => (y.id === l.id ? x : y)) };
        }),
      deleteSaleList: (id) =>
        setState((s) => {
          const l = s.saleLists.find((x) => x.id === id);
          if (!l) return s;
          const entries = { ...s.entries };
          for (const it of l.items) {
            const coll = s.collections.some((c) => c.id === it.fromColl) ? it.fromColl : DEFAULT_COLLECTION;
            const k = entryKey(it.cardKey, it.lang, it.foil, coll);
            entries[k] = (entries[k] ?? 0) + it.qty;
          }
          return { entries, saleLists: s.saleLists.filter((x) => x.id !== id), lastBatch: null };
        }),
      addToSale: (listId, moves) =>
        setState((s) => {
          const l = s.saleLists.find((x) => x.id === listId);
          if (!l) return s;
          const entries = { ...s.entries };
          const items: SaleItem[] = l.items.map((x) => ({ ...x }));
          for (const m of moves) {
            const have = entries[m.entry] ?? 0;
            const n = Math.min(have, m.qty);
            if (n <= 0) continue;
            const p = parseEntryKey(m.entry);
            if (have - n > 0) entries[m.entry] = have - n; else delete entries[m.entry];
            const same = items.find((x) => x.cardKey === p.cardKey && x.lang === p.lang && x.foil === p.foil && x.fromColl === p.coll);
            if (same) same.qty += n;
            else items.push({ id: crypto.randomUUID(), cardKey: p.cardKey, lang: p.lang, foil: p.foil, qty: n, price: null, fromColl: p.coll });
          }
          return { entries, saleLists: s.saleLists.map((x) => (x.id === listId ? { ...x, items, updatedAt: Date.now() } : x)), lastBatch: null };
        }),
      removeFromSale: (listId, itemId, how) =>
        setState((s) => {
          const l = s.saleLists.find((x) => x.id === listId);
          const it = l?.items.find((x) => x.id === itemId);
          if (!l || !it) return s;
          const entries = { ...s.entries };
          if (how === "return") {
            const coll = s.collections.some((c) => c.id === it.fromColl) ? it.fromColl : DEFAULT_COLLECTION;
            const k = entryKey(it.cardKey, it.lang, it.foil, coll);
            entries[k] = (entries[k] ?? 0) + it.qty;
          }
          const items = l.items.filter((x) => x.id !== itemId);
          return { entries, saleLists: s.saleLists.map((x) => (x.id === listId ? { ...x, items, updatedAt: Date.now() } : x)) };
        }),
      setShareBase: (shareBase) => setState({ shareBase }),
      setSaleQty: (listId, itemId, qty) =>
        setState((s) => {
          const l = s.saleLists.find((x) => x.id === listId);
          const it = l?.items.find((x) => x.id === itemId);
          if (!l || !it) return s;
          const coll = s.collections.some((c) => c.id === it.fromColl) ? it.fromColl : DEFAULT_COLLECTION;
          const k = entryKey(it.cardKey, it.lang, it.foil, coll);
          const entries = { ...s.entries };
          const available = entries[k] ?? 0;
          const target = Math.max(1, Math.min(qty, it.qty + available));
          const diff = target - it.qty;
          const left = available - diff;
          if (left > 0) entries[k] = left; else delete entries[k];
          const items = l.items.map((x) => (x.id === itemId ? { ...x, qty: target } : x));
          return { entries, saleLists: s.saleLists.map((x) => (x.id === listId ? { ...x, items, updatedAt: Date.now() } : x)) };
        }),
      saveCollection: (c) =>
        setState((s) => {
          const i = s.collections.findIndex((x) => x.id === c.id);
          return { collections: i < 0 ? [...s.collections, c] : s.collections.map((x) => (x.id === c.id ? c : x)) };
        }),
      deleteCollection: (id, moveTo) =>
        setState((s) => {
          if (s.collections.length <= 1) return s;
          const entries: Record<string, number> = {};
          for (const [k, v] of Object.entries(s.entries)) {
            const nk = parseEntryKey(k).coll === id ? withColl(k, moveTo) : k;
            entries[nk] = (entries[nk] ?? 0) + v;
          }
          const collections = s.collections.filter((c) => c.id !== id);
          return { entries, collections, lastCollection: s.lastCollection === id ? moveTo : s.lastCollection, lastBatch: null };
        }),
      moveEntries: (moves, to) =>
        setState((s) => {
          const entries = { ...s.entries };
          // Se apunta lo movido (salida y llegada) para poder deshacerlo.
          const items: { key: string; qty: number }[] = [];
          for (const m of moves) {
            const have = entries[m.key] ?? 0;
            const n = Math.min(have, m.qty ?? have);
            if (!n || parseEntryKey(m.key).coll === to) continue;
            const nk = withColl(m.key, to);
            entries[nk] = (entries[nk] ?? 0) + n;
            if (have - n > 0) entries[m.key] = have - n; else delete entries[m.key];
            items.push({ key: m.key, qty: -n }, { key: nk, qty: n });
          }
          return { entries, lastBatch: items.length ? { at: Date.now(), items } : null };
        }),
      removeCopies: (moves) =>
        setState((s) => {
          const entries = { ...s.entries };
          const items: { key: string; qty: number }[] = [];
          for (const m of moves) {
            const have = entries[m.entry] ?? 0;
            const n = Math.min(have, m.qty);
            if (n <= 0) continue;
            if (have - n > 0) entries[m.entry] = have - n; else delete entries[m.entry];
            items.push({ key: m.entry, qty: -n });
          }
          return { entries, lastBatch: items.length ? { at: Date.now(), items } : s.lastBatch };
        }),
      setLastCollection: (lastCollection) => setState({ lastCollection }),
      deleteEntries: (keys) =>
        setState((s) => {
          const entries = { ...s.entries };
          // se guarda como "lote negativo" para poder deshacerlo
          const items = keys.filter((k) => entries[k]).map((k) => ({ key: k, qty: -entries[k] }));
          for (const k of keys) delete entries[k];
          return { entries, lastBatch: items.length ? { at: Date.now(), items } : s.lastBatch };
        }),
      setLastLang: (lastLang) => setState({ lastLang }),
      importEntries: (incoming, mode) =>
        setState((s) => {
          const entries = mode === "replace" ? {} : { ...s.entries };
          for (const [raw, v] of Object.entries(incoming)) {
            if (!(v > 0)) continue;
            // copias antiguas sin colección -> "Mi bulk"; colecciones que no existen -> "Mi bulk"
            const p = parseEntryKey(raw);
            if ((p.lang as string) === "ZH") p.lang = "CN";
            const coll = s.collections.some((c) => c.id === p.coll) ? p.coll : DEFAULT_COLLECTION;
            const k = entryKey(p.cardKey, p.lang, p.foil, coll);
            entries[k] = (mode === "merge" ? entries[k] ?? 0 : 0) + v;
          }
          return { entries, lastBatch: null };
        }),
    }),
    {
      name: "bulksort-v1", storage: createJSONStorage(() => idbStorage), version: 3,
      // v1 -> v2: todas las copias pasan a la colección "Mi bulk".
      migrate: (old, version) => {
        const st = (old ?? {}) as Partial<State>;
        if (version < 2) {
          const entries: Record<string, number> = {};
          for (const [k, v] of Object.entries(st.entries ?? {})) {
            const nk = k.split("|").length === 3 ? `${k}|${DEFAULT_COLLECTION}` : k;
            entries[nk] = (entries[nk] ?? 0) + v;
          }
          st.entries = entries;
          st.collections = [{ id: DEFAULT_COLLECTION, name: "Mi bulk", color: "#4558C9", createdAt: 0 }];
          st.lastCollection = DEFAULT_COLLECTION;
          st.lastBatch = null;
        }
        // v2 -> v3: el chino pasa de ZH a CN.
        if (version < 3) {
          const fix = (l: string) => (l === "ZH" ? "CN" : l) as Lang;
          const entries: Record<string, number> = {};
          for (const [k, v] of Object.entries(st.entries ?? {})) {
            const p = k.split("|");
            if (p[1] === "ZH") p[1] = "CN";
            const nk = p.join("|");
            entries[nk] = (entries[nk] ?? 0) + v;
          }
          st.entries = entries;
          st.saleLists = (st.saleLists ?? []).map((l) => ({ ...l, items: l.items.map((i) => ({ ...i, lang: fix(i.lang) })) }));
          if (st.lastLang) st.lastLang = fix(st.lastLang);
          st.lastBatch = null;
        }
        return st as State;
      },
    },
  ),
);

/** Copias totales por carta (sumando idiomas y foil). */
export function ownedByCard(entries: Record<string, number>): Map<string, number> {
  const m = new Map<string, number>();
  for (const [k, v] of Object.entries(entries)) {
    const { cardKey } = parseEntryKey(k);
    m.set(cardKey, (m.get(cardKey) ?? 0) + v);
  }
  return m;
}
