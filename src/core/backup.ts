import { DEFAULT_COLLECTION, entryKey, parseEntryKey, useStore, type Collection, type Theme } from "./store";
import type { Deck } from "./decks";
import type { SaleList } from "./sales";
import type { Lang } from "./types";
import { useProfileStore, type PriceProfile } from "./prices";
import { APP_VERSION } from "./updates";

/**
 * Copia de seguridad completa de Bulky: cartas, colecciones, mazos, listas de venta,
 * fotos propias (portadas y cartas) y ajustes. También lee las copias antiguas (solo cartas y colecciones).
 */
export interface FullBackup {
  app: "Bulky";
  version: 3;
  appVersion: string;
  exportedAt: string;
  entries: Record<string, number>;
  collections: Collection[];
  decks: Deck[];
  saleLists: SaleList[];
  covers: Record<string, string>;
  cardImages: Record<string, string>;
  settings: {
    theme: Theme; textSize: "normal" | "large" | "xlarge"; accent: string; lastLang: Lang; lastCollection: string;
    shareBase: string; priceProfile: PriceProfile;
  };
}

export interface BackupSummary {
  exportedAt: string | null;
  full: boolean;
  copies: number;
  collections: number;
  decks: number;
  saleLists: number;
  onSale: number;
  images: number;
}

const fixLang = (l: string) => (l === "ZH" ? "CN" : l) as Lang;

export function makeBackup(): FullBackup {
  const s = useStore.getState();
  return {
    app: "Bulky", version: 3, appVersion: APP_VERSION, exportedAt: new Date().toISOString(),
    entries: s.entries, collections: s.collections, decks: s.decks, saleLists: s.saleLists, covers: s.covers, cardImages: s.cardImages,
    settings: {
      theme: s.theme, textSize: s.textSize, accent: s.accent, lastLang: s.lastLang, lastCollection: s.lastCollection,
      shareBase: s.shareBase, priceProfile: useProfileStore.getState().profile,
    },
  };
}

export const backupFileName = () => `bulky-copia-${new Date().toISOString().slice(0, 10)}.json`;

/** Lee un archivo de copia (completa o antigua) y lo deja en formato completo. */
export function parseBackup(text: string): { backup: FullBackup; summary: BackupSummary } {
  let j: Partial<FullBackup> & { entries?: Record<string, number> };
  try { j = JSON.parse(text); } catch { throw new Error("Ese archivo no es una copia de Bulky."); }
  if (!j || typeof j !== "object" || !j.entries || typeof j.entries !== "object") throw new Error("Ese archivo no es una copia de Bulky.");
  const full = j.version === 3;
  const s = useStore.getState();
  const backup: FullBackup = {
    app: "Bulky", version: 3, appVersion: j.appVersion ?? "", exportedAt: j.exportedAt ?? "",
    entries: j.entries,
    collections: Array.isArray(j.collections) ? j.collections : [],
    decks: full && Array.isArray(j.decks) ? j.decks : [],
    saleLists: full && Array.isArray(j.saleLists) ? j.saleLists : [],
    covers: full && j.covers ? j.covers : {},
    cardImages: full && j.cardImages ? j.cardImages : {},
    settings: full && j.settings ? j.settings : {
      theme: s.theme, textSize: s.textSize, accent: s.accent, lastLang: s.lastLang, lastCollection: s.lastCollection, shareBase: s.shareBase,
      priceProfile: useProfileStore.getState().profile,
    },
  };
  const summary: BackupSummary = {
    exportedAt: backup.exportedAt || null,
    full,
    copies: Object.values(backup.entries).reduce((a, n) => a + (n > 0 ? n : 0), 0),
    collections: backup.collections.length,
    decks: backup.decks.length,
    saleLists: backup.saleLists.length,
    onSale: backup.saleLists.reduce((a, l) => a + l.items.reduce((b, i) => b + i.qty, 0), 0),
    images: Object.keys(backup.covers).length + Object.keys(backup.cardImages).length + backup.collections.filter((c) => c.image).length,
  };
  return { backup, summary };
}

/**
 * Restaura una copia.
 *  - "replace": deja la app exactamente como estaba en la copia (lo que tengas ahora se pierde).
 *  - "merge": suma las cartas y añade lo que no tengas (colecciones, mazos, listas y fotos nuevas); no cambia tus ajustes.
 */
export function applyBackup(b: FullBackup, mode: "replace" | "merge") {
  useStore.setState((s) => {
    const collections: Collection[] = mode === "replace" ? [...b.collections] : [...s.collections];
    if (mode === "merge") for (const c of b.collections) if (!collections.some((x) => x.id === c.id)) collections.push(c);
    if (!collections.length) collections.push({ id: DEFAULT_COLLECTION, name: "Mi bulk", color: "#4558C9", createdAt: 0 });
    const valid = new Set(collections.map((c) => c.id));
    const fallback = valid.has(DEFAULT_COLLECTION) ? DEFAULT_COLLECTION : collections[0].id;

    const entries: Record<string, number> = mode === "replace" ? {} : { ...s.entries };
    for (const [raw, n] of Object.entries(b.entries)) {
      if (!(n > 0)) continue;
      const p = parseEntryKey(raw);
      const k = entryKey(p.cardKey, fixLang(p.lang), p.foil, valid.has(p.coll) ? p.coll : fallback);
      entries[k] = (entries[k] ?? 0) + n;
    }
    const saleIn = b.saleLists.map((l) => ({ ...l, items: l.items.map((i) => ({ ...i, lang: fixLang(i.lang) })) }));
    const add = <T extends { id: string }>(mine: T[], theirs: T[]) => [...mine, ...theirs.filter((t) => !mine.some((m) => m.id === t.id))];

    if (mode === "replace") {
      const st = b.settings;
      return {
        entries, collections, decks: b.decks, saleLists: saleIn, covers: b.covers, cardImages: b.cardImages,
        theme: st.theme, textSize: st.textSize, accent: st.accent, lastLang: fixLang(st.lastLang),
        lastCollection: valid.has(st.lastCollection) ? st.lastCollection : fallback, shareBase: st.shareBase ?? "", lastBatch: null,
      };
    }
    return {
      entries, collections, decks: add(s.decks, b.decks), saleLists: add(s.saleLists, saleIn),
      covers: { ...b.covers, ...s.covers }, cardImages: { ...b.cardImages, ...s.cardImages }, lastBatch: null,
    };
  });
  if (mode === "replace" && b.settings.priceProfile) useProfileStore.getState().setProfile(b.settings.priceProfile);
}
