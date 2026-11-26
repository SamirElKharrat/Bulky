import type { SetMeta } from "./types";

// Número de expansión que usa el código rápido: 0704 = carta 070 de la expansión 4.
export const EXPANSIONS: SetMeta[] = [
  { id: "OGN", number: 1, name: "Origins", color: "var(--set-ogn)", art: "/assets/sets/ogn.jpg", base: 298, release: "2025-10-31", kind: "expansion" },
  { id: "SFD", number: 2, name: "Spiritforged", color: "var(--set-sfd)", art: "/assets/sets/sfd.jpg", base: 221, release: "2026-02-13", kind: "expansion" },
  { id: "UNL", number: 3, name: "Unleashed", color: "var(--set-unl)", art: "/assets/sets/unl.jpg", base: 219, release: "2026-05-08", kind: "expansion" },
  { id: "VEN", number: 4, name: "Vendetta", color: "var(--set-ven)", art: "/assets/sets/ven.jpg", base: 166, release: "2026-07-31", kind: "expansion" },
  { id: "RAD", number: 5, name: "Radiance", color: "var(--set-rad)", art: "/assets/sets/rad.jpg", base: 167, release: "2026-10-23", kind: "expansion" },
  { id: "OGS", number: null, name: "Proving Grounds", color: "var(--set-ogs)", art: null, base: 24, release: "2025-10-31", kind: "expansion" },
];

// Colores e imágenes de las ediciones especiales (el contenido está en public/data/specials.json).
export const SPECIAL_LOOK: Record<string, { color: string; art: string | null }> = {
  KDA: { color: "#D6336C", art: "/assets/specials/kda.jpg" },
  T1S: { color: "#D7263D", art: "/assets/specials/t1.jpg" },
  T1A: { color: "#9E1B32", art: "/assets/specials/t1.jpg" },
  W26: { color: "#2D5BFF", art: "/assets/specials/w26.jpg" },
  GOR: { color: "#C99A00", art: null },
};

export const SET_BY_NUMBER: Record<number, string> = Object.fromEntries(
  EXPANSIONS.filter((s) => s.number != null).map((s) => [s.number!, s.id]),
);
