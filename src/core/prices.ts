import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";
import type { Card } from "./types";
import type { Catalog } from "./catalog";
import { norm } from "./catalog";

/**
 * Precios del price guide público de Cardmarket (gratuito, se regenera a diario).
 * Son precios globales de Cardmarket: no permiten filtrar por país, idioma ni estado.
 */

export type PriceProfile = "low" | "trend" | "avg30";
export const PROFILES: { id: PriceProfile; label: string; hint: string }[] = [
  { id: "low", label: "Mínimo", hint: "La oferta más barata en Cardmarket (cualquier país, idioma y estado)" },
  { id: "trend", label: "Tendencia", hint: "Precio de tendencia de Cardmarket, más estable que el mínimo" },
  { id: "avg30", label: "Media 30 días", hint: "Media de ventas de los últimos 30 días" },
];

export interface Price {
  idProduct: number;
  low: number | null; trend: number | null; avg30: number | null;
  lowF: number | null; trendF: number | null; avg30F: number | null;
}

interface RawProduct { idProduct: number; name: string; idExpansion: number }
interface RawGuide { idProduct: number; low: number | null; trend: number | null; avg30: number | null; "low-foil": number | null; "trend-foil": number | null; "avg30-foil": number | null }
interface Raw { products: RawProduct[]; guides: RawGuide[]; createdAt: string }

/** Expansiones de Cardmarket -> expansión de BulkSort. */
const EXPANSIONS: Record<number, string> = { 6286: "OGN", 6289: "OGS", 6399: "SFD", 6491: "UNL", 6587: "VEN", 6659: "RAD", 6938: "KDA" };
/** Orden en que Cardmarket da de alta las versiones de una carta. */
const VARIANT_ORDER: Record<string, number> = { normal: 0, rune: 0, special: 0, alt: 1, overnumbered: 2, showcase: 3, signature: 4 };

/**
 * Cardmarket no publica números de carta: se empareja por expansión + nombre y, cuando hay varias
 * versiones (normal, alt art, overnumbered, firmada), por el orden en que se dieron de alta.
 */
export function matchPrices(cat: Catalog, raw: Raw) {
  const guide = new Map(raw.guides.map((g) => [g.idProduct, g]));
  const cmGroups = new Map<string, RawProduct[]>();
  for (const p of raw.products) {
    const set = EXPANSIONS[p.idExpansion];
    if (!set) continue;
    const k = `${set}|${norm(p.name)}`;
    if (!cmGroups.has(k)) cmGroups.set(k, []);
    cmGroups.get(k)!.push(p);
  }
  const ourGroups = new Map<string, Card[]>();
  for (const c of cat.cards) {
    const k = `${c.set}|${norm(c.name)}`;
    if (!ourGroups.has(k)) ourGroups.set(k, []);
    ourGroups.get(k)!.push(c);
  }
  const map = new Map<string, Price>();
  let ambiguous = 0;
  for (const [k, cards] of ourGroups) {
    const prods = cmGroups.get(k);
    if (!prods) continue;
    const ps = [...prods].sort((a, b) => a.idProduct - b.idProduct);
    const cs = [...cards].sort((a, b) => (VARIANT_ORDER[a.variant] ?? 5) - (VARIANT_ORDER[b.variant] ?? 5) || a.number - b.number || a.key.localeCompare(b.key));
    if (ps.length !== cs.length) ambiguous++;
    // Si no cuadra el número de versiones, solo se fía de la primera (la normal).
    const n = ps.length === cs.length ? cs.length : 1;
    for (let i = 0; i < n; i++) {
      const g = guide.get(ps[i].idProduct);
      if (!g) continue;
      map.set(cs[i].key, {
        idProduct: ps[i].idProduct, low: g.low, trend: g.trend, avg30: g.avg30,
        lowF: g["low-foil"], trendF: g["trend-foil"], avg30F: g["avg30-foil"],
      });
    }
  }
  return { map, ambiguous, createdAt: raw.createdAt };
}

/** Precio de una copia según el perfil elegido. Las foil usan su precio foil si existe. */
export function priceOf(p: Price | undefined, profile: PriceProfile, foil = false): number | null {
  if (!p) return null;
  const ok = (v: number | null | undefined) => (v != null && v > 0 ? v : null);
  const pick = (prof: PriceProfile) => (foil ? ok(p[`${prof}F` as const]) ?? ok(p[prof]) : ok(p[prof]));
  // Si Cardmarket aún no tiene ese dato (cartas recién salidas), se usa el siguiente disponible.
  const order: PriceProfile[] = profile === "low" ? ["low", "trend", "avg30"] : profile === "trend" ? ["trend", "avg30", "low"] : ["avg30", "trend", "low"];
  for (const prof of order) { const v = pick(prof); if (v != null) return v; }
  return null;
}

/** Atajo para componentes: precio de una carta con el perfil activo. */
export function usePrice(cardKey: string, foil = false): number | null {
  const p = usePrices((s) => s.map.get(cardKey));
  const profile = usePriceProfile();
  return priceOf(p, profile, foil);
}

export const eur = (v: number | null | undefined) => (v == null ? "—" : `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

/* ------------------------------------------------------------------ */

const IDB_KEY = "bulksort-cm-raw";

/** Perfil de precio elegido (se recuerda en este equipo). */
interface ProfileState { profile: PriceProfile; setProfile: (p: PriceProfile) => void }
export const useProfileStore = create<ProfileState>()((set) => ({
  profile: (() => { try { return (localStorage.getItem("bs-price-profile") as PriceProfile) || "trend"; } catch { return "trend"; } })(),
  setProfile: (profile) => { try { localStorage.setItem("bs-price-profile", profile); } catch { /* sin almacenamiento */ } set({ profile }); },
}));
export const usePriceProfile = () => useProfileStore((s) => s.profile);

interface PriceState {
  map: Map<string, Price>;
  createdAt: string | null;
  ambiguous: number;
  status: "idle" | "loading" | "updating" | "error";
  error: string | null;
  load: (cat: Catalog) => Promise<void>;
  /** Solo en la app de escritorio: descarga los archivos de hoy de Cardmarket. */
  refresh: (cat: Catalog) => Promise<void>;
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const canRefreshPrices = isTauri;

export const usePrices = create<PriceState>()((set) => ({
  map: new Map(),
  createdAt: null,
  ambiguous: 0,
  status: "idle",
  error: null,
  load: async (cat) => {
    set({ status: "loading", error: null });
    try {
      // Lo último que descargó la app; si no, lo que trae la propia app (npm run import:prices).
      let raw = (await idbGet(IDB_KEY)) as Raw | undefined;
      if (!raw) {
        const [p, g] = await Promise.all([fetch("/data/cm-products.json"), fetch("/data/cm-prices.json")]);
        if (!p.ok || !g.ok) throw new Error("No hay precios descargados todavía.");
        const pj = await p.json(), gj = await g.json();
        raw = { products: pj.products, guides: gj.priceGuides, createdAt: gj.createdAt };
      }
      const r = matchPrices(cat, raw);
      set({ map: r.map, createdAt: r.createdAt, ambiguous: r.ambiguous, status: "idle" });
    } catch (e) {
      set({ status: "error", error: (e as Error).message });
    }
  },
  refresh: async (cat) => {
    set({ status: "updating", error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const [pt, gt] = await Promise.all([invoke<string>("fetch_cardmarket", { kind: "products" }), invoke<string>("fetch_cardmarket", { kind: "prices" })]);
      const pj = JSON.parse(pt), gj = JSON.parse(gt);
      const raw: Raw = { products: pj.products, guides: gj.priceGuides, createdAt: gj.createdAt };
      await idbSet(IDB_KEY, raw);
      const r = matchPrices(cat, raw);
      set({ map: r.map, createdAt: r.createdAt, ambiguous: r.ambiguous, status: "idle" });
    } catch (e) {
      set({ status: "error", error: `No se pudieron descargar los precios: ${(e as Error).message ?? e}` });
    }
  },
}));
