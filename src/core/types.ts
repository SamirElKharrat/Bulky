export type Lang = "EN" | "KO" | "CN" | "FR";
export const LANGS: Lang[] = ["EN", "KO", "CN", "FR"];

export type Domain = "fury" | "calm" | "mind" | "body" | "chaos" | "order";
export const DOMAINS: Domain[] = ["fury", "calm", "mind", "body", "chaos", "order"];

export type Variant = "normal" | "alt" | "overnumbered" | "signature" | "showcase" | "rune" | "special";

/** Una carta del catálogo (una impresión concreta: normal, alt art, firmada…). */
export interface Card {
  /** Clave única para la colección, p. ej. "VEN-070", "UNL-116A", "OGN-299*", "KDA-02". */
  key: string;
  set: string;
  setNumber: number | null;
  number: number;
  variant: Variant;
  type: string;
  supertype: string | null;
  /** Campeón al que pertenece (p. ej. "Kai'Sa"): une leyenda, campeón elegido y firmadas. */
  tags: string[];
  champion: boolean;
  signature: boolean;
  token: boolean;
  rarity: string | null;
  domains: Domain[];
  energy: number | null;
  might: number | null;
  power: number | null;
  artist: string | null;
  image: string | null;
  /** Campos de batalla: imagen horizontal. */
  landscape: boolean;
  /** Nombre completo, con el título del campeón: "Evelynn, Entrancing". */
  name: string;
  nameZh: string | null;
  text: string;
  /** Texto normalizado para buscar. */
  search: string;
  /** Solo ediciones especiales. */
  player?: string;
}

export interface SetMeta {
  id: string;
  number: number | null;
  name: string;
  /** Variable CSS con el color de la expansión. */
  color: string;
  art: string | null;
  base: number;
  release?: string;
  kind: "expansion" | "special";
  note?: string;
  serialMax?: number;
}
