import type { Lang } from "./types";

/** Una carta puesta a la venta. Sus copias salen de la colección de origen mientras están en la lista. */
export interface SaleItem {
  id: string;
  cardKey: string;
  lang: Lang;
  foil: boolean;
  qty: number;
  /** Precio por copia puesto a mano; null = el de Cardmarket. */
  price: number | null;
  /** Colección de la que salió (para devolverla si la quitas de la lista). */
  fromColl: string;
}

export interface SaleList {
  id: string;
  name: string;
  /** Redondear precios: 0 = no, cualquier otro valor = sí. */
  round: number;
  items: SaleItem[];
  createdAt: number;
  updatedAt: number;
}

/** Si la lista lo tiene activado, redondea hacia arriba al siguiente múltiplo de 0,05 € (0,02 → 0,05 · 0,12 → 0,15 · 2,31 → 2,35). */
export function roundUp(v: number, on: number | boolean): number {
  if (!on || v <= 0) return Math.round(v * 100) / 100;
  return Math.round(Math.ceil(v / 0.05 - 1e-9) * 0.05 * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Enlace compartible (fase 1): la lista viaja comprimida en el propio enlace */
/* ------------------------------------------------------------------ */

/** [clave, nombre, id de imagen de Riot, idioma, foil 1/0, copias, precio] */
export type ShareRow = [string, string, string, string, number, number, number];
export interface SharePayload { v: 1; n: string; d: string; r: ShareRow[] }

const toB64Url = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/**
 * Enlace corto (v2): solo [clave, idioma (+"*" si es foil), copias, precio en céntimos].
 * El nombre y la imagen los pone la web con su listado de cartas (cards.json).
 */
export type ShortRow = [string, string, number, number];
export interface ShortPayload { v: 2; n: string; d: string; r: ShortRow[] }

export function toShort(p: SharePayload): ShortPayload {
  return { v: 2, n: p.n, d: p.d.slice(0, 10), r: p.r.map((x) => [x[0], `${x[3]}${x[4] ? "*" : ""}`, x[5], Math.round(x[6] * 100)]) };
}

export async function encodeShare(p: SharePayload | ShortPayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  return toB64Url(await pipe(json, new CompressionStream("deflate-raw")));
}

/** Lee un enlace (corto o antiguo) y lo devuelve completo, con nombres e imágenes. */
export async function decodeShare(code: string, cardsUrl = "/cards.json"): Promise<SharePayload> {
  const bytes = await pipe(fromB64Url(code), new DecompressionStream("deflate-raw"));
  const p = JSON.parse(new TextDecoder().decode(bytes)) as SharePayload | ShortPayload;
  if (!Array.isArray(p.r)) throw new Error("Enlace no válido");
  if (p.v === 1) return p;
  if (p.v !== 2) throw new Error("Enlace no válido");
  const cards = (await fetch(cardsUrl).then((r) => r.json()).catch(() => ({}))) as Record<string, [string, string]>;
  return {
    v: 1, n: p.n, d: p.d,
    r: p.r.map(([key, lf, qty, cents]) => {
      const [name, img] = cards[key] ?? [key, ""];
      return [key, name, img, lf.replace("*", ""), lf.endsWith("*") ? 1 : 0, qty, cents / 100];
    }),
  };
}

/** Id de imagen del CDN de Riot a partir de la URL completa (para que el enlace sea corto). */
export const imageId = (url: string | null) => url?.match(/game_data_live\/([0-9a-f]+-\d+x\d+)\.png/)?.[1] ?? "";
export const imageFromId = (id: string, w = 300) =>
  id ? `https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/${id}.png?accountingTag=RB&w=${w}` : null;
