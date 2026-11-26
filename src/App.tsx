import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadCatalog, type Catalog } from "./core/catalog";
import type { Card } from "./core/types";
import { useStore } from "./core/store";
import { Home } from "./views/Home";
import { SetView } from "./views/SetView";
import { AddView } from "./views/AddView";
import { CollectionView } from "./views/CollectionView";
import { DecksView } from "./views/DecksView";
import { SalesView } from "./views/SalesView";
import { NewsView } from "./views/NewsView";
import { SearchView } from "./views/SearchView";
import { useNews } from "./core/news";
import { CardDialog } from "./ui/CardDialog";
import { SettingsPanel, TEXT_SIZES } from "./ui/SettingsPanel";
import { usePrices } from "./core/prices";
import { saveAddList, useAddList } from "./core/addList";
import { DestinationDialog } from "./ui/CollectionDialog";
import { BulkyLogo } from "./ui/icons";

type View = { name: "home" } | { name: "set"; id: string } | { name: "add" } | { name: "search" } | { name: "collection" } | { name: "decks" } | { name: "sales" } | { name: "news" } | { name: "soon"; title: string; text: string };

const SOON: Record<string, string> = {};

export default function App() {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: "home" });
  const [card, setCard] = useState<Card | null>(null);
  const theme = useStore((s) => s.theme);
  const textSize = useStore((s) => s.textSize);
  const accent = useStore((s) => s.accent);
  const [settings, setSettings] = useState(false);
  const pending = useAddList((s) => s.list.reduce((a, it) => a + it.qty, 0));
  /** Sección a la que quiere ir el usuario mientras tiene cartas sin guardar en "Añadir cartas". */
  const [leaving, setLeaving] = useState<View | null>(null);
  const [leaveSave, setLeaveSave] = useState(false);
  const [searchFocus, setSearchFocus] = useState(0);
  const go = (v: View) => {
    if (view.name === "add" && v.name !== "add" && pending > 0) { setLeaving(v); return; }
    setView(v);
  };
  const entries = useStore((s) => s.entries);
  const decks = useStore((s) => s.decks.length);
  const sales = useStore((s) => s.saleLists.length);
  const unreadNews = useNews((s) => s.items.filter((i) => !s.read.has(i.id)).length);

  useEffect(() => { loadCatalog().then(setCat).catch((e) => setError(String(e.message ?? e))); }, []);
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);
  // Pantalla de carga (está en index.html): se va cuando ya hay catálogo y tus datos.
  useEffect(() => {
    if (!((cat && hydrated) || error)) return;
    const el = document.getElementById("splash");
    if (!el) return;
    el.classList.add("out");
    const t = setTimeout(() => el.remove(), 400);
    return () => clearTimeout(t);
  }, [cat, hydrated, error]);
  useEffect(() => { if (cat) usePrices.getState().load(cat); }, [cat]);
  useEffect(() => { useNews.getState().load(); }, []);
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("bs-theme", theme); } catch { /* sin almacenamiento */ }
  }, [theme]);
  // Color principal: lo usan botones, selección, menú y carpetas. El texto encima es claro u oscuro según el color.
  useEffect(() => {
    const st = document.documentElement.style;
    st.setProperty("--app-acc", accent);
    try { localStorage.setItem("bs-accent", accent); } catch { /* sin almacenamiento */ }
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16) / 255);
    st.setProperty("--app-on-acc", 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#16171B" : "#FFFFFF");
  }, [accent]);
  // Tamaño del texto: escala toda la interfaz
  useEffect(() => { (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(TEXT_SIZES.find((t) => t.id === textSize)?.zoom ?? 1); }, [textSize]);

  const copies = useMemo(() => Object.values(entries).reduce((a, b) => a + b, 0), [entries]);
  const openSet = useCallback((id: string) => { setView({ name: "set", id }); document.querySelector(".main")?.scrollTo(0, 0); }, []);
  // Ctrl F (o Cmd F): abre Buscar desde cualquier pantalla.
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setCard(null); setSettings(false);
        goRef.current({ name: "search" });
        setSearchFocus((n) => n + 1);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (!leaving || leaveSave) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setLeaving(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [leaving, leaveSave]);
  const openCard = useCallback((c: Card) => setCard(c), []);

  const nav = (label: string, v: View, active: boolean, extra?: React.ReactNode) => (
    <button key={label} aria-current={active ? "page" : undefined} onClick={() => go(v)}>{label}{extra}</button>
  );

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><BulkyLogo />Bulky</div>
        <nav className="nav" aria-label="Secciones">
          {nav("Expansiones", { name: "home" }, view.name === "home" || view.name === "set")}
          {nav("Añadir cartas", { name: "add" }, view.name === "add")}
          {nav("Buscar", { name: "search" }, view.name === "search", <span className="kbd">Ctrl F</span>)}
          {nav("Colecciones", { name: "collection" }, view.name === "collection", <span className="count">{copies}</span>)}
          {nav("Mazos", { name: "decks" }, view.name === "decks", <span className="count">{decks}</span>)}
          {nav("Ventas", { name: "sales" }, view.name === "sales", <span className="count">{sales}</span>)}
          {nav("Noticias", { name: "news" }, view.name === "news", unreadNews > 0 ? <span className="news-badge">{unreadNews > 99 ? "99+" : unreadNews}</span> : undefined)}
          {Object.entries(SOON).map(([t, text]) => nav(t, { name: "soon", title: t, text }, view.name === "soon" && view.title === t, <span className="soon">pronto</span>))}
        </nav>
        <div className="side-foot">
          {settings && <SettingsPanel cat={cat} onClose={() => setSettings(false)} />}
          <button className={`settings-btn${settings ? " on" : ""}`} onClick={() => setSettings(!settings)} aria-expanded={settings}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4l-.3 2.6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.3 2.6h4l.3-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/></svg>
            Ajustes
          </button>
        </div>
      </aside>
      <main className="main">
        {error ? (
          <div className="page"><div className="notice bad">{error}</div></div>
        ) : !cat ? (
          <div className="page"><span className="muted">Cargando catálogo…</span></div>
        ) : view.name === "home" ? (
          <Home cat={cat} openSet={openSet} />
        ) : view.name === "set" ? (
          <SetView cat={cat} setId={view.id} openSet={openSet} openCard={openCard} />
        ) : view.name === "add" ? (
          <AddView cat={cat} />
        ) : view.name === "search" ? (
          <SearchView cat={cat} openCard={openCard} focusKey={searchFocus} />
        ) : view.name === "collection" ? (
          <CollectionView cat={cat} openCard={openCard} />
        ) : view.name === "decks" ? (
          <DecksView cat={cat} openCard={openCard} />
        ) : view.name === "sales" ? (
          <SalesView cat={cat} openCard={openCard} />
        ) : view.name === "news" ? (
          <NewsView />
        ) : (
          <div className="page"><h1>{view.title}</h1><div className="soon-page">{view.text}<br /><br />Esta sección llegará en las siguientes fases.</div></div>
        )}
      </main>
      {card && <CardDialog card={card} onClose={() => setCard(null)} />}
      {leaving && !leaveSave && (
        <div className="overlay" onClick={() => setLeaving(null)} role="presentation">
          <div className="confirm" role="alertdialog" aria-modal="true" aria-labelledby="leave-t" onClick={(e) => e.stopPropagation()}>
            <h2 id="leave-t">¿Seguro que quieres salir?</h2>
            <p>Tienes {pending} {pending === 1 ? "copia" : "copias"} en la lista sin añadir a ninguna colección. Si sales, se perderá el progreso.</p>
            <div className="confirm-actions">
              <button className="btn btn-danger" onClick={() => { useAddList.setState({ list: [] }); setView(leaving); setLeaving(null); }}>No importa, salir</button>
              <span style={{ flex: 1 }} />
              <button className="btn" autoFocus onClick={() => setLeaving(null)}>Seguir</button>
              <button className="btn btn-primary" onClick={() => setLeaveSave(true)}>Agregar a colección…</button>
            </div>
          </div>
        </div>
      )}
      {leaving && leaveSave && (
        <DestinationDialog copies={pending} onClose={() => setLeaveSave(false)}
          onPick={(coll) => { saveAddList(coll); setView(leaving); setLeaving(null); setLeaveSave(false); }} />
      )}
    </div>
  );
}
