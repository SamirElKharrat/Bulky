import { create } from "zustand";
import { get as idbGet, set as idbSet } from "idb-keyval";

/** Noticias de Riftbound: web oficial de Riot. */

export type SourceId = "riot";

export const SOURCES: { id: SourceId; label: string; color: string; site: string }[] = [
  { id: "riot", label: "Riot oficial", color: "#D13639", site: "riftbound.leagueoflegends.com" },
];

export interface NewsItem {
  id: string;
  source: SourceId;
  title: string;
  summary: string;
  url: string;
  image: string | null;
  date: string;
  topic: string | null;
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function getText(url: string): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("fetch_url", { url });
  }
  const r = await fetch(url); // en el navegador las fuentes no lo permiten (CORS): solo funciona en escritorio
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** Abre un enlace fuera de la app (en el navegador del sistema). */
export async function openExternal(url: string) {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_url", { url });
  } else window.open(url, "_blank", "noopener");
}

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();

/* ------------------------- Riot (web oficial) ------------------------- */
async function riot(): Promise<NewsItem[]> {
  const html = await getText("https://riftbound.leagueoflegends.com/en-us/news/");
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("la web de Riot ha cambiado");
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  const walk = (o: unknown) => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (!o || typeof o !== "object") return;
    const x = o as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (typeof x.title === "string" && typeof x.publishedAt === "string") {
      const path: string | undefined = x.action?.payload?.url;
      const url = path ? (path.startsWith("http") ? path : `https://riftbound.leagueoflegends.com${path}`) : null;
      if (url && !seen.has(url)) {
        seen.add(url);
        const img: string | undefined = x.media?.url ?? x.imageMedia?.url;
        out.push({
          id: `riot:${url}`, source: "riot", title: x.title, summary: strip(x.description?.body ?? ""), url,
          image: img ? `${img}${img.includes("?") ? "&" : "?"}w=480` : null, date: x.publishedAt, topic: x.category?.title ?? null,
        });
      }
    }
    for (const k in x) walk(x[k]);
  };
  walk(JSON.parse(m[1]));
  return out;
}

const FETCHERS: Record<SourceId, () => Promise<NewsItem[]>> = { riot };

/* ------------------------------- Estado ------------------------------- */
const CACHE = "bulksort-news";
const READ = "bs-news-read";
const STALE_MS = 3 * 3600 * 1000;

interface NewsState {
  items: NewsItem[];
  fetchedAt: number | null;
  errors: Partial<Record<SourceId, string>>;
  loading: boolean;
  read: Set<string>;
  load: () => Promise<void>;
  refresh: () => Promise<void>;
  markRead: (ids: string[]) => void;
}

const loadRead = () => { try { return new Set<string>(JSON.parse(localStorage.getItem(READ) ?? "[]")); } catch { return new Set<string>(); } };

export const useNews = create<NewsState>()((set, get) => ({
  items: [],
  fetchedAt: null,
  errors: {},
  loading: false,
  read: loadRead(),
  load: async () => {
    const c = (await idbGet(CACHE)) as { items: NewsItem[]; fetchedAt: number } | undefined;
    const known = new Set(SOURCES.map((s) => s.id as string));
    if (c) set({ items: c.items.filter((i) => known.has(i.source)), fetchedAt: c.fetchedAt });
    if (!c || Date.now() - c.fetchedAt > STALE_MS) await get().refresh();
    // Primera vez: lo de hace más de una semana ya cuenta como leído, para no empezar con 99+.
    if (!c && !get().read.size) {
      const week = Date.now() - 7 * 24 * 3600 * 1000;
      get().markRead(get().items.filter((i) => new Date(i.date).getTime() < week).map((i) => i.id));
    }
  },
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    const errors: NewsState["errors"] = {};
    const results = await Promise.all(SOURCES.map(async (s) => {
      try { return await FETCHERS[s.id](); }
      catch (e) { errors[s.id] = isTauri() ? String((e as Error).message ?? e) : "solo en la app de escritorio"; return get().items.filter((i) => i.source === s.id); }
    }));
    const items = results.flat().filter((i) => i.title && i.date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
    const fetchedAt = Date.now();
    set({ items, fetchedAt, errors, loading: false });
    await idbSet(CACHE, { items, fetchedAt });
  },
  markRead: (ids) => {
    const read = new Set(get().read);
    ids.forEach((i) => read.add(i));
    try { localStorage.setItem(READ, JSON.stringify([...read].slice(-2000))); } catch { /* sin almacenamiento */ }
    set({ read });
  },
}));
