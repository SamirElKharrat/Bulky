import type { Catalog } from "./catalog";
import { parseEntryKey } from "./store";

export interface Row { key: string; name: string; set: string; number: number; lang: string; foil: boolean; qty: number; coll: string; entry: string }

export function collectionRows(cat: Catalog, entries: Record<string, number>): Row[] {
  const setOrder = new Map([...cat.sets, ...cat.specials].map((s, i) => [s.id, i]));
  return Object.entries(entries)
    .map(([k, qty]) => {
      const { cardKey, lang, foil, coll } = parseEntryKey(k);
      const c = cat.byKey.get(cardKey);
      return { key: cardKey, name: c?.name ?? "¿Carta desconocida?", set: c?.set ?? "", number: c?.number ?? 0, lang, foil, qty, coll, entry: k };
    })
    .sort((a, b) => (setOrder.get(a.set) ?? 99) - (setOrder.get(b.set) ?? 99) || a.number - b.number || a.key.localeCompare(b.key) || a.lang.localeCompare(b.lang));
}

/** Texto para pegar en cualquier sitio: "3x VEN-070 Brutal Hunter (EN)". */
export const toText = (rows: Row[]) =>
  rows.map((r) => `${r.qty}x ${r.key} ${r.name} (${r.lang}${r.foil ? ", foil" : ""})`).join("\n");

const csvCell = (v: string | number | boolean) => {
  const s = String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: Row[]) =>
  ["cantidad,codigo,nombre,expansion,numero,idioma,foil", ...rows.map((r) => [r.qty, r.key, r.name, r.set, r.number, r.lang, r.foil ? "si" : "no"].map(csvCell).join(","))].join("\n");

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reduce una imagen elegida por el usuario para guardarla como portada. */
export function resizeImage(file: File, maxWidth = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("No se pudo leer la imagen. Prueba con un JPG o PNG."));
    img.src = URL.createObjectURL(file);
  });
}
