import type { Card, Domain, SetMeta, Variant } from "./types";
import { EXPANSIONS, SPECIAL_LOOK } from "./sets";

export const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

interface RawCard {
  id: string; code: string; set: string; setNumber: number | null; number: number; variant: string;
  type: string[]; supertype?: string[]; rarity: string | null; domains: string[]; energy: number | null; might: number | null;
  power: number | null; tags: string[]; artist: string | null; image: string | null; orientation?: string;
  name: Record<string, string>; subtitle?: Record<string, string>; text: Record<string, string>;
}
interface RawSpecial {
  code: string; name: string; released?: string; serialMax?: number; notes?: string;
  cards: {
    n: number; name: string; type?: string; player?: string; image?: string; orientation?: string;
    domains?: string[]; energy?: number; might?: number; power?: number;
  }[];
}

export interface Catalog {
  cards: Card[];
  byKey: Map<string, Card>;
  bySet: Map<string, Card[]>;
  sets: SetMeta[];
  specials: SetMeta[];
  fetchedAt: string;
}

const SUPER = new Set(["champion", "signature", "token"]);

export async function loadCatalog(): Promise<Catalog> {
  const [catRes, spRes] = await Promise.all([fetch("/data/catalog.json"), fetch("/data/specials.json")]);
  if (!catRes.ok) throw new Error("No se encontró public/data/catalog.json. Ejecuta: npm run import:cards");
  const raw: { fetchedAt: string; cards: RawCard[] } = await catRes.json();
  const sp: { products: RawSpecial[] } = spRes.ok ? await spRes.json() : { products: [] };

  const cards: Card[] = [];
  const byKey = new Map<string, Card>();
  for (const r of raw.cards) {
    const base = r.name?.en;
    if (!base || !r.code) continue;
    const sub = r.subtitle?.en;
    const tags = r.tags ?? [];
    const isLegend = (r.type ?? []).includes("legend");
    // Como en Piltover Archive / RiftAtlas: "Kai'Sa, Daughter of the Void" (leyenda), "Evelynn, Consuming" (campeón).
    // En las leyendas el subtítulo es solo una etiqueta ("Starter"); el nombre de mazo es "Campeón, Título".
    const name = isLegend && tags[0] ? (base.startsWith(tags[0]) ? base : `${tags[0]}, ${base}`) : sub ? `${base}, ${sub}` : base;
    const sup = [...(r.supertype ?? []), ...(r.type ?? [])];
    const key = r.code.split("/")[0].toUpperCase();
    if (byKey.has(key)) continue;
    const types = r.type ?? [];
    const card: Card = {
      key, set: r.set, setNumber: r.setNumber, number: r.number, variant: r.variant as Variant,
      type: types.find((t) => !SUPER.has(t)) ?? types[0] ?? "",
      supertype: sup.includes("champion") ? "champion" : null,
      tags, champion: sup.includes("champion"), signature: sup.includes("signature"), token: sup.includes("token"),
      rarity: r.rarity, domains: (r.domains ?? []).filter((d) => d !== "colorless") as Domain[],
      energy: r.energy, might: r.might, power: r.power, artist: r.artist, image: r.image,
      landscape: r.orientation === "landscape",
      name, nameZh: r.name?.zh && r.name.zh !== base ? r.name.zh : null, text: r.text?.en ?? "",
      search: norm(`${name} ${key} ${r.tags?.join(" ") ?? ""} ${r.name?.zh ?? ""}`),
    };
    cards.push(card);
    byKey.set(key, card);
  }

  const specials: SetMeta[] = [];
  for (const p of sp.products) {
    const look = SPECIAL_LOOK[p.code] ?? { color: "var(--ink)", art: null };
    specials.push({
      id: p.code, number: null, name: p.name, color: look.color, art: look.art, base: p.cards.length,
      release: p.released, kind: "special", note: p.notes, serialMax: p.serialMax,
    });
    for (const c of p.cards) {
      const key = `${p.code}-${String(c.n).padStart(3, "0")}`;
      const card: Card = {
        key, set: p.code, setNumber: null, number: c.n, variant: "special", type: c.type ?? "unit", supertype: null,
        tags: [], champion: !!c.player, signature: false, token: false,
        rarity: null, domains: (c.domains ?? []) as Domain[], energy: c.energy ?? null, might: c.might ?? null, power: c.power ?? null,
        artist: null, image: c.image ?? null, landscape: c.orientation === "landscape",
        name: c.name, nameZh: null, text: "", search: norm(`${c.name} ${key} ${p.name} ${c.player ?? ""}`), player: c.player,
      };
      cards.push(card);
      byKey.set(key, card);
    }
  }

  const bySet = new Map<string, Card[]>();
  for (const c of cards) {
    if (!bySet.has(c.set)) bySet.set(c.set, []);
    bySet.get(c.set)!.push(c);
  }
  // Orden de carpeta: numeradas (con sus alt/firmadas al lado), y al final runas y showcase.
  const tail = (c: Card) => (c.variant === "rune" || c.variant === "showcase" ? 1 : 0);
  for (const list of bySet.values()) list.sort((a, b) => tail(a) - tail(b) || a.number - b.number || a.key.localeCompare(b.key));

  return { cards, byKey, bySet, sets: EXPANSIONS, specials, fetchedAt: raw.fetchedAt };
}

/** URL de imagen de carta redimensionada por el CDN de Riot. */
export const cardImage = (c: Card, w = 300) => {
  if (!c.image) return null;
  if (!c.image.startsWith("http")) return c.image; // imagen local en public/
  return `${c.image}${c.image.includes("?") ? "&" : "?"}w=${c.landscape ? Math.round(w * 1.4) : w}`;
};
