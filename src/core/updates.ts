import { create } from "zustand";
import { GITHUB_REPO } from "./web";

/** Versión instalada. */
export const APP_VERSION = __APP_VERSION__;

/**
 * Repositorio de GitHub donde se publican las versiones ("usuario/repositorio").
 * Vacío hasta que exista: entonces "Buscar actualizaciones" avisa de que aún no hay sitio configurado.
 */
export const UPDATE_REPO = GITHUB_REPO;

/** Lista de cambios que se ve en Ajustes. La primera es la versión actual. */
export const CHANGELOG: { version: string; items: string[] }[] = [
  {
    version: "0.2.0",
    items: [
      "Nuevo nombre e icono: Bulky",
      "Buscador de cartas y listas (Ctrl F)",
      "Quitar, mover o vender cartas en bloque",
      "Eliminar cartas desde Colecciones",
      "Copia de seguridad completa",
      "Ficha de carta más clara",
      "Aviso al salir de Añadir cartas",
      "El chino sale como CN",
    ],
  },
  {
    version: "0.1.0",
    items: [
      "Primera versión",
    ],
  },
];

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Compara versiones tipo 1.2.3. Positivo si a es más nueva que b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export interface UpdateInfo { version: string; notes: string; url: string; date: string }

type Status = "idle" | "checking" | "latest" | "available" | "error";
interface UpdateState {
  status: Status;
  info: UpdateInfo | null;
  error: string | null;
  checkedAt: number | null;
  check: () => Promise<void>;
}

/** Consulta la última versión publicada en GitHub (Releases). */
export const useUpdates = create<UpdateState>()((set, get) => ({
  status: "idle",
  info: null,
  error: null,
  checkedAt: null,
  check: async () => {
    if (get().status === "checking") return;
    if (!UPDATE_REPO) { set({ status: "error", error: "Todavía no hay un sitio de actualizaciones configurado." }); return; }
    if (!isTauri()) { set({ status: "error", error: "Solo se puede buscar desde la app de escritorio." }); return; }
    set({ status: "checking", error: null });
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("fetch_url", { url: `https://api.github.com/repos/${UPDATE_REPO}/releases/latest` });
      const r = JSON.parse(raw) as { tag_name?: string; body?: string; html_url?: string; published_at?: string };
      if (!r.tag_name) throw new Error("No hay ninguna versión publicada todavía.");
      const info: UpdateInfo = { version: r.tag_name.replace(/^v/i, ""), notes: r.body ?? "", url: r.html_url ?? `https://github.com/${UPDATE_REPO}/releases/latest`, date: r.published_at ?? "" };
      set({ status: compareVersions(info.version, APP_VERSION) > 0 ? "available" : "latest", info, checkedAt: Date.now() });
    } catch (e) {
      const m = String((e as Error)?.message ?? e);
      set({ status: "error", error: /404/.test(m) ? "No hay ninguna versión publicada todavía." : `No se pudo comprobar: ${m}` });
    }
  },
}));
