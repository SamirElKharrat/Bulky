import { useEffect, useMemo, useState } from "react";
import type { Catalog } from "../core/catalog";
import { cardImage, norm } from "../core/catalog";
import { searchCards } from "../core/codes";
import type { Card, Domain } from "../core/types";
import { DOMAINS } from "../core/types";
import { useStore } from "../core/store";
import { download } from "../core/exporters";
import {
  RULES, ZONES, type Deck, type ExportFormat, type ImportResult, type Zone,
  deckLegend, deckLines, deckStats, deckSummary, defaultZone, exportDeck, importDeck, newDeck, ownedByName,
  riftAtlasLink, suggestRunes, tcgArenaLink, validateDeck, zoneCount,
} from "../core/decks";
import { CardFace, HoverName, domainColor, useCardSrc } from "../ui/CardTile";
import { DOMAIN_ES, Energy, Might, Runes, TYPE_ES } from "../ui/icons";
import { eur, priceOf, usePriceProfile, usePrices } from "../core/prices";

/** Coste del mazo completo y de lo que te falta, con el perfil de precio activo. */
function useDeckCost(lines: ReturnType<typeof deckLines>, missing: { card: Card; qty: number }[]) {
  const map = usePrices((s) => s.map);
  const profile = usePriceProfile();
  const one = (c: Card) => priceOf(map.get(c.key), profile) ?? 0;
  return { full: lines.reduce((a, l) => a + one(l.card) * l.qty, 0), missing: missing.reduce((a, m) => a + one(m.card) * m.qty, 0), has: map.size > 0 };
}

/** Preferencias de vista que solo importan en este equipo. */
const pref = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(`bs-${k}`); return v ? JSON.parse(v) : d; } catch { return d; } };
const savePref = (k: string, v: unknown) => { try { localStorage.setItem(`bs-${k}`, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

/** Menú de tres puntos (⋮) con confirmación para eliminar. */
function DeckMenu({ onDuplicate, onDelete, light }: { onDuplicate: () => void; onDelete: () => void; light?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setConfirm(false); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <span className="menu-wrap" onClick={(e) => e.stopPropagation()}>
      <button className={`dots${light ? " light" : ""}`} aria-label="Opciones del mazo" aria-expanded={open} onClick={() => { setOpen(!open); setConfirm(false); }}>⋮</button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={() => { onDuplicate(); setOpen(false); }}><span>Duplicar</span><small>Crea una copia para probar cambios</small></button>
          {confirm
            ? <button role="menuitem" className="danger" onClick={onDelete}><span>Sí, eliminar para siempre</span><small>No se puede deshacer</small></button>
            : <button role="menuitem" className="danger" onClick={() => setConfirm(true)}><span>Eliminar mazo</span><small>Te pedirá confirmación</small></button>}
        </div>
      )}
    </span>
  );
}

/* ================================================================== */
/* Biblioteca de mazos                                                 */
/* ================================================================== */

export function DecksView({ cat, openCard }: { cat: Catalog; openCard: (c: Card) => void }) {
  const decks = useStore((s) => s.decks);
  const saveDeck = useStore((s) => s.saveDeck);
  const deleteDeck = useStore((s) => s.deleteDeck);
  const duplicateDeck = useStore((s) => s.duplicateDeck);
  const entries = useStore((s) => s.entries);
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const owned = useMemo(() => ownedByName(cat, entries), [cat, entries]);
  const deck = decks.find((d) => d.id === openId) ?? null;

  if (deck) {
    return (
      <DeckBuilder key={deck.id} cat={cat} deck={deck} owned={owned} onSave={saveDeck} openCard={openCard}
        onBack={() => setOpenId(null)} onDuplicate={() => duplicateDeck(deck.id)} onDelete={() => { deleteDeck(deck.id); setOpenId(null); }} />
    );
  }

  const create = () => { const d = newDeck(`Mazo ${decks.length + 1}`); saveDeck(d); setOpenId(d.id); };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Mazos</h1>
          <p>Monta mazos como en Piltover Archive o RiftAtlas y mira al momento qué cartas tienes. Importa y exporta en sus formatos, en el de TCG Arena o con código de mazo.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setImporting(!importing)}>{importing ? "Cerrar importación" : "Importar mazo"}</button>
          <button className="btn btn-primary" onClick={create}>Nuevo mazo</button>
        </div>
      </div>
      {importing && <ImportDeck cat={cat} onDone={(d) => { saveDeck(d); setImporting(false); setOpenId(d.id); }} />}
      {!decks.length && !importing && <div className="empty">Aún no tienes mazos. Crea uno o importa uno de Piltover Archive, RiftAtlas o TCG Arena.</div>}
      <div className="deck-rows">
        {decks.map((d) => (
          <DeckTile key={d.id} cat={cat} deck={d} owned={owned} onOpen={() => setOpenId(d.id)}
            onDuplicate={() => duplicateDeck(d.id)} onDelete={() => deleteDeck(d.id)} />
        ))}
      </div>
    </div>
  );
}

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86400000);
  if (d <= 0) { const h = Math.floor((Date.now() - t) / 3600000); return h <= 0 ? "hace un momento" : `hace ${h} h`; }
  return d === 1 ? "ayer" : `hace ${d} días`;
};

/** Tarjeta de mazo al estilo de Piltover Archive: leyenda a la izquierda, dominios, expansiones y progreso. */
function DeckTile({ cat, deck, owned, onOpen, onDuplicate, onDelete }: {
  cat: Catalog; deck: Deck; owned: Map<string, number>; onOpen: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const legend = deckLegend(cat, deck);
  const lines = deckLines(cat, deck, owned);
  const sum = deckSummary(lines);
  const cost = useDeckCost(lines, sum.missing);
  const errors = validateDeck(cat, deck).filter((i) => i.level === "error").length;
  const sets = [...new Set(lines.map((l) => l.card.set))].filter((s) => cat.sets.some((x) => x.id === s)).sort();
  const src = legend ? cardImage(legend, 260) : null;
  return (
    <div className="deck-row" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}
      style={{ ["--c" as string]: legend ? domainColor(legend) : "var(--line-2)" }}>
      <div className="dr-art">{src ? <img src={src} alt={legend?.name} /> : <span className="muted">Sin leyenda</span>}</div>
      <div className="dr-body">
        <div className="dr-top">
          <div>
            <div className="dr-name">{deck.name}</div>
            <div className="dr-sub">{legend ? legend.name : "Sin leyenda"} · {ago(deck.updatedAt)}</div>
          </div>
          <DeckMenu onDuplicate={onDuplicate} onDelete={onDelete} />
        </div>
        <div className="dr-mid">
          {legend && <span className="dr-doms">{legend.domains.map((d) => <img key={d} src={`/assets/icons/glyph-rune_${d}.svg`} alt={DOMAIN_ES[d]} title={DOMAIN_ES[d]} />)}</span>}
          {sets.map((s) => <span key={s} className="set-chip">{s}</span>)}
          <span className={`set-chip legal-chip ${errors ? "no" : "ok"}`}>{errors ? `✕ ${errors} ${errors === 1 ? "problema" : "problemas"}` : "✓ Legal"}</span>
        </div>
        <div className="dr-foot">
          <span className="dr-own" title="Copias que tienes / copias que necesita el mazo"><b>{sum.have}</b>/{sum.total}</span>
          <span className="dr-bar"><i style={{ width: `${sum.pct}%` }} /></span>
          <span className="dr-pct">{sum.pct}%</span>
          {cost.has && <span className="dr-price" title="Precio del mazo completo en Cardmarket">{eur(cost.full)}</span>}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Importar                                                            */
/* ================================================================== */

function ImportDeck({ cat, onDone }: { cat: Catalog; onDone: (d: Deck) => void }) {
  const [name, setName] = useState("Mazo importado");
  const [text, setText] = useState("");
  const [res, setRes] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
    if (!text.trim()) { setRes(null); return; }
    // Los enlaces de Piltover Archive se descargan al pulsar Importar; el resto se analiza al momento.
    if (/^https?:\/\/[^ ]*piltoverarchive/i.test(text.trim())) { setRes(null); return; }
    const t = setTimeout(() => { importDeck(cat, text, name).then(setRes).catch((e) => { setRes(null); setError(e.message); }); }, 200);
    return () => clearTimeout(t);
  }, [cat, text, name]);

  const go = async () => {
    setBusy(true);
    try {
      const r = res ?? await importDeck(cat, text, name);
      onDone({ ...r.deck, name: name.trim() || r.deck.name });
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  };

  return (
    <div className="panel-box">
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, minWidth: 220 }}><label className="lbl" htmlFor="imp-name">Nombre</label><input id="imp-name" type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
      </div>
      <div className="field">
        <label className="lbl" htmlFor="imp-text">Pega el mazo</label>
        <textarea id="imp-text" className="mono-area" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
          placeholder={"Legend:\n1 Annie, Dark Child\n\nChampion:\n1 Annie, Stubborn\n\nMainDeck:\n3 Cleave\n3 Void Seeker\n...\n\nBattlefields:\n1 Zaun Warrens\n\nRunes:\n7 Fury Rune\n5 Chaos Rune\n\nSideboard:\n2 Gust"} />
        <span className="hint">
          Admite: texto de <b>Piltover Archive</b> (Export → Text) y de <b>RiftAtlas</b> (Copy decklist, con o sin <code>[OGN-123]</code>),
          exportación de <b>TCG Arena</b>, <b>código de mazo</b> (Copy code / Compact share code), exportación TTS, códigos de Pixelborn y enlaces
          de <code>play.riftatlas.com/?deckCode=</code>, <code>tcg-arena.fr/import?…</code> y <code>piltoverarchive.com/decks/view/…</code>.
        </span>
      </div>
      {error && <div className="notice bad">{error}</div>}
      {res && (
        <div className="import-preview">
          <span className="muted">Formato detectado: <b>{res.source}</b></span>
          <div className="zone-counts">{ZONES.map((z) => <span key={z.id} className="zc">{z.label} <b>{zoneCount(res.deck, z.id)}</b></span>)}</div>
          {res.notFound.length > 0 && <div className="notice bad">No se encontraron {res.notFound.length}: {res.notFound.slice(0, 8).join(" · ")}{res.notFound.length > 8 ? "…" : ""}</div>}
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary" disabled={busy || !text.trim() || !!error} onClick={go}>{busy ? "Importando…" : "Importar mazo"}</button>
      </div>
    </div>
  );
}


/* ================================================================== */
/* Constructor                                                         */
/* ================================================================== */

const MAIN_GROUPS: { id: string; label: string; test: (c: Card) => boolean }[] = [
  { id: "champion", label: "Campeones", test: (c) => c.champion },
  { id: "unit", label: "Unidades", test: (c) => c.type === "unit" && !c.champion },
  { id: "spell", label: "Hechizos", test: (c) => c.type === "spell" },
  { id: "gear", label: "Equipo", test: (c) => c.type === "gear" },
  { id: "other", label: "Otras", test: () => true },
];

const EXPORTS: { f: ExportFormat | "ra-link" | "ta-link"; label: string; hint: string }[] = [
  { f: "pa", label: "Texto (Piltover Archive / RiftAtlas)", hint: "Legend:, Champion:, MainDeck:…" },
  { f: "codes", label: "Texto con códigos", hint: "3 Cleave [OGN-123] · RiftAtlas" },
  { f: "tcgarena", label: "Texto para TCG Arena", hint: "Lista + Sideboard:" },
  { f: "code", label: "Código de mazo", hint: "Piltover Archive y RiftAtlas" },
  { f: "tts", label: "Tabletop Simulator", hint: "OGN-001-1 OGN-002-1…" },
  { f: "ra-link", label: "Enlace para jugar en RiftAtlas", hint: "play.riftatlas.com" },
  { f: "ta-link", label: "Enlace para importar en TCG Arena", hint: "tcg-arena.fr" },
];

/* ---------- arrastrar y soltar ---------- */
const DND = "application/x-bulksort-card";
type Drag = { key: string; from: Zone | "browser" };
const startDrag = (e: React.DragEvent, d: Drag) => {
  e.dataTransfer.setData(DND, JSON.stringify(d));
  e.dataTransfer.setData("text/plain", d.key);
  e.dataTransfer.effectAllowed = "copyMove";
};
const readDrag = (e: React.DragEvent): Drag | null => { try { return JSON.parse(e.dataTransfer.getData(DND)); } catch { return null; } };
const isCardDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(DND);

function DeckBuilder({ cat, deck, owned, onSave, onDelete, onDuplicate, onBack, openCard }: {
  cat: Catalog; deck: Deck; owned: Map<string, number>; onSave: (d: Deck) => void; onDelete: () => void; onDuplicate: () => void; onBack: () => void; openCard: (c: Card) => void;
}) {
  const [tab, setTab] = useState<"deck" | "stats">("deck");
  const [view, setView] = useState<"grid" | "list">(() => pref("deck-view", "grid"));
  const [size, setSize] = useState<number>(() => pref("deck-card-size", 118));
  const [width, setWidth] = useState<number>(() => pref("deck-browser-width", 420));
  const [collapsed, setCollapsed] = useState<Zone[]>(() => pref("deck-collapsed", []));
  const [msg, setMsg] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [showIssues, setShowIssues] = useState(false);

  useEffect(() => savePref("deck-view", view), [view]);
  useEffect(() => savePref("deck-card-size", size), [size]);
  useEffect(() => savePref("deck-browser-width", width), [width]);
  useEffect(() => savePref("deck-collapsed", collapsed), [collapsed]);

  const legend = deckLegend(cat, deck);
  const lines = useMemo(() => deckLines(cat, deck, owned), [cat, deck, owned]);
  const sum = useMemo(() => deckSummary(lines), [lines]);
  const cost = useDeckCost(lines, sum.missing);
  const issues = useMemo(() => validateDeck(cat, deck), [cat, deck]);
  const errors = issues.filter((i) => i.level === "error");

  const update = (fn: (z: Deck["zones"]) => void) => { const zones = structuredClone(deck.zones); fn(zones); onSave({ ...deck, zones }); };
  const add = (c: Card, zone?: Zone) => update((z) => {
    const target = zone ?? defaultZone(c, deck, cat);
    if (target === "legend") z.legend = {};
    z[target][c.key] = (z[target][c.key] ?? 0) + 1;
  });
  const setQty = (zone: Zone, key: string, n: number) => update((z) => { if (n > 0) z[zone][key] = n; else delete z[zone][key]; });
  const move = (from: Zone, to: Zone, key: string) => update((z) => {
    const n = z[from][key];
    if (!n) return;
    delete z[from][key];
    if (to === "legend") z.legend = {};
    z[to][key] = (z[to][key] ?? 0) + (to === "legend" || to === "champion" ? 1 : n);
    if ((to === "legend" || to === "champion") && n > 1) z[from][key] = n - 1;
  });
  const onDropZone = (zone: Zone, d: Drag) => {
    const c = cat.byKey.get(d.key);
    if (!c) return;
    if (d.from === "browser") add(c, zone);
    else if (d.from !== zone) move(d.from, zone, d.key);
  };
  const removeDrag = (d: Drag) => { if (d.from !== "browser") setQty(d.from, d.key, (deck.zones[d.from][d.key] ?? 1) - 1); };
  const calcRunes = () => { const r = suggestRunes(cat, deck); if (r) update((z) => { z.runes = r; }); };
  const toggleZone = (z: Zone) => setCollapsed((c) => (c.includes(z) ? c.filter((x) => x !== z) : [...c, z]));

  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2500); };
  const doExport = async (f: (typeof EXPORTS)[number]["f"]) => {
    setMenu(false);
    try {
      const text = f === "ra-link" ? riftAtlasLink(cat, deck) : f === "ta-link" ? tcgArenaLink(cat, deck) : exportDeck(cat, deck, f);
      await navigator.clipboard.writeText(text);
      flash(`Copiado: ${EXPORTS.find((e) => e.f === f)!.label}.`);
    } catch (e) { flash(`No se pudo exportar: ${(e as Error).message}`); }
  };

  // Separador arrastrable entre buscador y mazo
  const dragSplit = (e: React.PointerEvent) => {
    const startX = e.clientX, startW = width;
    const moveFn = (ev: PointerEvent) => setWidth(Math.max(300, Math.min(760, startW + ev.clientX - startX)));
    const up = () => { window.removeEventListener("pointermove", moveFn); window.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); };
    window.addEventListener("pointermove", moveFn);
    window.addEventListener("pointerup", up);
    document.body.classList.add("resizing");
  };

  const art = legend ? cardImage(legend, 700) : null;
  const zoneProps = { deck, lines, view, size, setQty, openCard, collapsed, toggleZone, onDropZone };

  return (
    <div className="page builder" style={{ ["--acc" as string]: legend ? domainColor(legend) : undefined }}>
      <div className="deck-head" style={{ ["--art" as string]: art ? `url("${art}")` : "none" }}>
        <div className="dh-left">
          <button className="btn btn-sm btn-quiet" onClick={onBack}>← Mis mazos</button>
          <div className="row" style={{ width: "100%", flexWrap: "nowrap" }}>
            <input className="deck-name" type="text" value={deck.name} onChange={(e) => onSave({ ...deck, name: e.target.value })} aria-label="Nombre del mazo" />
            <DeckMenu onDuplicate={() => { onDuplicate(); flash("Mazo duplicado: lo tienes en Mis mazos."); }} onDelete={onDelete} />
          </div>
          <span className="row" style={{ gap: 6 }}>{legend ? <><Runes ds={legend.domains} /><span className="muted">{legend.name}</span></> : <span className="muted">Elige una leyenda para empezar</span>}</span>
        </div>
        <div className="dh-right">
          <button className={`legal big ${errors.length ? "no" : "ok"}`} onClick={() => setShowIssues(!showIssues)}>
            {errors.length ? `✕ ${errors.length} ${errors.length === 1 ? "problema" : "problemas"}` : issues.length ? `✓ Legal · ${issues.length} ${issues.length === 1 ? "aviso" : "avisos"}` : "✓ Legal"}
          </button>
          <div className="deck-score"><span className="pct">{sum.pct}<small>%</small></span><span className="muted mono" style={{ fontSize: ".72rem" }}>tienes {sum.have} de {sum.total}</span>{cost.has && <span className="mono" style={{ fontSize: ".72rem" }}>mazo {eur(cost.full)} · te falta {eur(cost.missing)}</span>}</div>
        </div>
      </div>

      {showIssues && issues.length > 0 && (
        <div className="issues">{issues.map((i) => <div key={i.text} className={i.level}>{i.level === "error" ? "✕" : "!"} {i.text}</div>)}</div>
      )}
      {msg && <div className="notice">{msg}</div>}

      <div className="builder-layout" style={{ ["--bw" as string]: `${width}px` }}>
        <CardBrowser cat={cat} deck={deck} legend={legend} owned={owned} onAdd={add} onDropRemove={removeDrag} />
        <div className="splitter" onPointerDown={dragSplit} role="separator" aria-orientation="vertical" aria-label="Cambiar el ancho del buscador" title="Arrastra para cambiar el ancho" />
        <div className="builder-deck" style={{ ["--cs" as string]: `${size}px` }}>
          <div className="builder-bar">
            <div className="zone-counts">
              <ZoneChip label="Leyenda" n={zoneCount(deck, "legend")} t={1} />
              <ZoneChip label="Mazo" n={zoneCount(deck, "main") + zoneCount(deck, "champion")} t={RULES.mainWithChampion} />
              <ZoneChip label="Campos" n={zoneCount(deck, "battlefields")} t={RULES.battlefields} />
              <ZoneChip label="Runas" n={zoneCount(deck, "runes")} t={RULES.runes} />
              <ZoneChip label="Banquillo" n={zoneCount(deck, "side")} t={RULES.sideMax} max />
            </div>
            <div className="row">
              <div className="toggle" role="group" aria-label="Pestaña">
                <button aria-pressed={tab === "deck"} onClick={() => setTab("deck")}>Mazo</button>
                <button aria-pressed={tab === "stats"} onClick={() => setTab("stats")}>Estadísticas</button>
              </div>
              {tab === "deck" && (
                <>
                  <div className="toggle" role="group" aria-label="Vista">
                    <button aria-pressed={view === "grid"} onClick={() => setView("grid")}>Cuadrícula</button>
                    <button aria-pressed={view === "list"} onClick={() => setView("list")}>Lista</button>
                  </div>
                  {view === "grid" && (
                    <label className="size-ctl" title="Tamaño de las cartas">
                      <span aria-hidden="true">▫</span>
                      <input type="range" min={80} max={220} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Tamaño de las cartas" />
                      <span aria-hidden="true">▣</span>
                    </label>
                  )}
                </>
              )}
              <div className="menu-wrap">
                <button className="btn btn-sm" onClick={() => setMenu(!menu)} aria-expanded={menu}>Exportar ▾</button>
                {menu && (
                  <div className="menu" role="menu">
                    {EXPORTS.map((e) => <button key={e.f} role="menuitem" onClick={() => doExport(e.f)}><span>{e.label}</span><small>{e.hint}</small></button>)}
                    <button role="menuitem" onClick={() => { setMenu(false); download(`${deck.name}.txt`, exportDeck(cat, deck, "pa"), "text/plain"); }}><span>Descargar .txt</span><small>Formato Piltover Archive</small></button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {tab === "stats" ? <Stats cat={cat} deck={deck} /> : (
            <>
              {sum.missing.length > 0 && <Missing missing={sum.missing} onCopy={flash} />}
              <div className="zones-top">
                <ZoneBlock title="Leyenda" zone="legend" {...zoneProps} empty="Arrastra aquí una leyenda." />
                <ZoneBlock title="Campeón elegido" zone="champion" {...zoneProps}
                  empty={legend ? `Arrastra un campeón de ${legend.tags[0] ?? legend.name}.` : "Elige antes la leyenda."} />
                <ZoneBlock title="Campos de batalla" zone="battlefields" {...zoneProps} count={`${zoneCount(deck, "battlefields")}/${RULES.battlefields}`} empty="Tres campos distintos." />
              </div>
              <ZoneBlock title="Mazo principal" zone="main" {...zoneProps} grouped
                count={`${zoneCount(deck, "main") + zoneCount(deck, "champion")}/${RULES.mainWithChampion}`} empty="Arrastra cartas aquí o haz clic en ellas en el buscador." />
              <ZoneBlock title="Runas" zone="runes" {...zoneProps} count={`${zoneCount(deck, "runes")}/${RULES.runes}`} empty="12 runas de los dominios de tu leyenda."
                extra={legend && <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); calcRunes(); }} title="Reparte 12 runas según el coste de poder del mazo">Calcular runas</button>} />
              <ZoneBlock title="Banquillo" zone="side" {...zoneProps} count={`${zoneCount(deck, "side")}/${RULES.sideMax}`} empty="Hasta 10 cartas. Arrástralas aquí o usa el botón B." />
              <p className="hint">Arrastra cartas entre zonas para moverlas, o fuera del mazo (al buscador) para quitar una copia. Pulsa el título de una zona para plegarla, y su esquina inferior derecha para cambiar su alto.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ZoneChip({ label, n, t, max }: { label: string; n: number; t: number; max?: boolean }) {
  const ok = max ? n <= t : n === t;
  return <span className={`zc${ok ? " good" : n ? " off" : ""}`}>{label} <b>{n}/{t}</b></span>;
}

function Missing({ missing, onCopy }: { missing: { card: Card; qty: number }[]; onCopy: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const copies = missing.reduce((a, m) => a + m.qty, 0);
  const copy = async () => {
    try { await navigator.clipboard.writeText(missing.map((m) => `${m.qty} ${m.card.name}`).join("\n")); onCopy(`Copiadas las ${missing.length} cartas que te faltan.`); }
    catch { onCopy("No se pudo copiar."); }
  };
  return (
    <div className="missing-box">
      <button className="btn btn-sm btn-quiet" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"} Te faltan {copies} copias de {missing.length} cartas</button>
      <button className="btn btn-sm" onClick={copy}>Copiar lo que falta</button>
      {open && <div className="missing-list">{missing.map((m) => <span key={m.card.key}>{m.qty}× <HoverName card={m.card} /></span>)}</div>}
    </div>
  );
}

function ZoneBlock({ title, zone, lines, view, setQty, openCard, empty, count, grouped, extra, collapsed, toggleZone, onDropZone }: {
  title: string; zone: Zone; deck: Deck; lines: ReturnType<typeof deckLines>; view: "grid" | "list"; size: number;
  setQty: (z: Zone, k: string, n: number) => void; openCard: (c: Card) => void; empty: string; count?: string; grouped?: boolean; extra?: React.ReactNode;
  collapsed: Zone[]; toggleZone: (z: Zone) => void; onDropZone: (z: Zone, d: Drag) => void;
}) {
  const [over, setOver] = useState(false);
  const rows = lines.filter((l) => l.zone === zone).sort((a, b) => (a.card.energy ?? 99) - (b.card.energy ?? 99) || a.card.name.localeCompare(b.card.name));
  const n = rows.reduce((a, r) => a + r.qty, 0);
  const isCollapsed = collapsed.includes(zone);
  const groups = grouped
    ? MAIN_GROUPS.map((g, gi) => ({ g, rows: rows.filter((r) => g.test(r.card) && !MAIN_GROUPS.slice(0, gi).some((p) => p.test(r.card))) })).filter((x) => x.rows.length)
    : [{ g: null, rows }];
  return (
    <section className={`zone dz z-${zone}${over ? " over" : ""}`} aria-label={title}
      onDragOver={(e) => { if (isCardDrag(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); const d = readDrag(e); if (d) onDropZone(zone, d); }}>
      <button className="zone-title" onClick={() => toggleZone(zone)} aria-expanded={!isCollapsed}>
        <span className="lbl">{isCollapsed ? "▸" : "▾"} {title}</span>
        <span className="row" style={{ gap: 8 }}>{extra}<span className="mono muted">{count ?? n}</span></span>
      </button>
      {!isCollapsed && (
        <div className="zone-body">
          {!rows.length && <div className="zone-empty">{empty}</div>}
          {groups.map(({ g, rows: gr }) => (
            <div key={g?.id ?? "all"}>
              {g && <div className="group-title">{g.label} <span className="mono">{gr.reduce((a, r) => a + r.qty, 0)}</span></div>}
              {view === "grid" ? (
                <div className="vis-grid">{gr.map((l) => <DeckCard key={l.card.key} l={l} zone={zone} setQty={setQty} openCard={openCard} />)}</div>
              ) : gr.map((l) => <DeckRow key={l.card.key} l={l} zone={zone} setQty={setQty} openCard={openCard} />)}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type Line = ReturnType<typeof deckLines>[number];
const ownStatus = (l: Line) => (l.owned >= l.qty ? "ok" : l.owned > 0 ? "part" : "no");

function DeckCard({ l, zone, setQty, openCard }: { l: Line; zone: Zone; setQty: (z: Zone, k: string, n: number) => void; openCard: (c: Card) => void }) {
  return (
    <div className={`vis-card own-b-${ownStatus(l)}${l.card.landscape ? " land" : ""}`} draggable onDragStart={(e) => startDrag(e, { key: l.card.key, from: zone })}
      title={`${l.card.name} · tienes ${l.owned}`}>
      <button className="vis-img" onClick={() => openCard(l.card)}><CardFace card={l.card} w={260} /></button>
      <span className="vis-qty">×{l.qty}</span>
      <span className={`vis-own own-${ownStatus(l)}`}>{Math.min(l.owned, l.qty)}/{l.qty}</span>
      <span className="vis-ctl">
        <button onClick={() => setQty(zone, l.card.key, l.qty - 1)} aria-label="Quitar una">−</button>
        <button onClick={() => setQty(zone, l.card.key, l.qty + 1)} aria-label="Añadir una">+</button>
      </span>
    </div>
  );
}

function DeckRow({ l, zone, setQty, openCard }: { l: Line; zone: Zone; setQty: (z: Zone, k: string, n: number) => void; openCard: (c: Card) => void }) {
  const src = useCardSrc(l.card, 160);
  return (
    <div className="dline img-line" draggable onDragStart={(e) => startDrag(e, { key: l.card.key, from: zone })} style={{ ["--c" as string]: domainColor(l.card) }}>
      <span className="thumb-strip" style={{ backgroundImage: src ? `url("${src}")` : undefined }} />
      <span className={`own own-${ownStatus(l)}`} title={`Tienes ${l.owned}`}>{Math.min(l.owned, l.qty)}/{l.qty}</span>
      <span><Energy value={l.card.energy} /></span>
      <span className="nm" onClick={() => openCard(l.card)}><HoverName card={l.card} /></span>
      <Runes ds={l.card.domains} />
      <span className="stepper">
        <button onClick={() => setQty(zone, l.card.key, l.qty - 1)} aria-label="Quitar una">−</button>
        <span>{l.qty}</span>
        <button onClick={() => setQty(zone, l.card.key, l.qty + 1)} aria-label="Añadir una">+</button>
      </span>
    </div>
  );
}

/* ================================================================== */
/* Buscador de cartas (columna izquierda)                             */
/* ================================================================== */

const TYPE_FILTERS = [
  { id: "", label: "Todo" }, { id: "legend", label: "Leyendas" }, { id: "champion", label: "Campeones" }, { id: "unit", label: "Unidades" },
  { id: "spell", label: "Hechizos" }, { id: "gear", label: "Equipo" }, { id: "battlefield", label: "Campos" }, { id: "rune", label: "Runas" },
];

function CardBrowser({ cat, deck, legend, owned, onAdd, onDropRemove }: {
  cat: Catalog; deck: Deck; legend?: Card; owned: Map<string, number>; onAdd: (c: Card, z?: Zone) => void; onDropRemove: (d: Drag) => void;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState(legend ? "" : "legend");
  const [identity, setIdentity] = useState(true);
  const [domains, setDomains] = useState<Set<Domain>>(new Set());
  const [energy, setEnergy] = useState<number | null>(null);
  const [variants, setVariants] = useState(false);
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState(60);
  const [over, setOver] = useState(false);
  useEffect(() => { if (legend && type === "legend") setType(""); }, [legend]); // eslint-disable-line react-hooks/exhaustive-deps

  const inDeck = useMemo(() => {
    const m = new Map<string, number>();
    for (const z of ZONES) for (const [k, v] of Object.entries(deck.zones[z.id])) m.set(k, (m.get(k) ?? 0) + v);
    return m;
  }, [deck]);

  const results = useMemo(() => {
    const id = new Set(legend?.domains ?? []);
    const base = q.trim() ? searchCards(cat, q, 400) : cat.cards;
    const out = base.filter((c) => {
      if (c.variant === "special" || c.token) return false;
      if (!variants && c.variant !== "normal" && c.type !== "rune") return false;
      if (type === "champion" ? !c.champion : type && c.type !== type) return false;
      if (identity && legend && c.type !== "legend" && c.type !== "battlefield" && c.domains.some((d) => !id.has(d))) return false;
      if (domains.size && !c.domains.some((d) => domains.has(d))) return false;
      if (energy != null && (energy === 7 ? (c.energy ?? -1) < 7 : c.energy !== energy)) return false;
      if (mine && !owned.get(norm(c.name))) return false;
      return true;
    });
    const seen = new Set<string>();
    const dedup = out.filter((c) => (c.type === "rune" ? (seen.has(c.name) ? false : (seen.add(c.name), true)) : true));
    return q.trim() ? dedup : dedup.sort((a, b) => (a.energy ?? 99) - (b.energy ?? 99) || a.name.localeCompare(b.name));
  }, [cat, q, type, identity, legend, domains, energy, variants, mine, owned]);

  return (
    <aside className={`browser dz${over ? " over-remove" : ""}`}
      onDragOver={(e) => { if (isCardDrag(e)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); setOver(false); const d = readDrag(e); if (d) onDropRemove(d); }}>
      {over && <div className="drop-remove">Suelta para quitar una copia del mazo</div>}
      <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} placeholder="Buscar carta o código" aria-label="Buscar carta"
        onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { onAdd(results[0]); setQ(""); } }} />
      <div className="chips">
        {TYPE_FILTERS.map((t) => <button key={t.id} aria-pressed={type === t.id} onClick={() => { setType(t.id); setLimit(60); }}>{t.label}</button>)}
      </div>
      <div className="row" style={{ gap: 4 }}>
        {DOMAINS.map((d) => (
          <button key={d} className="rune-btn" style={{ ["--c" as string]: `var(--${d})` }} aria-pressed={domains.has(d)} title={DOMAIN_ES[d]}
            onClick={() => { const n = new Set(domains); n.has(d) ? n.delete(d) : n.add(d); setDomains(n); }}>
            <img className="rune sm" src={`/assets/icons/glyph-rune_${d}.svg`} alt={DOMAIN_ES[d]} />
          </button>
        ))}
      </div>
      <div className="costs">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} aria-pressed={energy === n} onClick={() => setEnergy(energy === n ? null : n)}>{n === 7 ? "7+" : n}</button>)}
      </div>
      <div className="row" style={{ gap: 12, fontSize: ".8rem" }}>
        {legend && <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={identity} onChange={(e) => setIdentity(e.target.checked)} /> Solo identidad</label>}
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Solo las que tengo</label>
        <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={variants} onChange={(e) => setVariants(e.target.checked)} /> Alt arts</label>
      </div>
      <span className="hint">{results.length} cartas · clic o arrastra para añadir · <b>B</b> al banquillo</span>
      <div className="browser-grid">
        {results.slice(0, limit).map((c) => <BrowserCard key={c.key} c={c} n={inDeck.get(c.key) ?? 0} owned={owned.get(norm(c.name)) ?? 0} onAdd={onAdd} />)}
      </div>
      {results.length > limit && <button className="btn btn-sm" onClick={() => setLimit(limit + 60)}>Ver más ({results.length - limit})</button>}
    </aside>
  );
}

function BrowserCard({ c, n, owned, onAdd }: { c: Card; n: number; owned: number; onAdd: (c: Card, z?: Zone) => void }) {
  const src = useCardSrc(c, 220);
  return (
    <div className={`bcard${c.landscape ? " land" : ""}`} style={{ ["--c" as string]: domainColor(c) }} draggable onDragStart={(e) => startDrag(e, { key: c.key, from: "browser" })}>
      <button className="bimg" onClick={() => onAdd(c)} title={`${c.name} · ${c.key}\nTienes ${owned}`}>
        {src ? <img src={src} alt={c.name} loading="lazy" draggable={false} /> : <span className="placeholder-face">{c.name}</span>}
        {n > 0 && <span className="in-deck">{n}</span>}
      </button>
      <div className="bmeta">
        <span className={`own-dot ${owned ? "ok" : ""}`} title={`Tienes ${owned}`}>{owned}</span>
        <span className="bnm">{c.name}</span>
        {c.type !== "legend" && c.type !== "battlefield" && c.type !== "rune" && <button className="side-btn" onClick={() => onAdd(c, "side")} title="Añadir al banquillo">B</button>}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Estadísticas                                                        */
/* ================================================================== */

function Stats({ cat, deck }: { cat: Catalog; deck: Deck }) {
  const s = useMemo(() => deckStats(cat, deck), [cat, deck]);
  const legend = deckLegend(cat, deck);
  const maxCurve = Math.max(1, ...s.curve);
  const total = s.curve.reduce((a, b) => a + b, 0);
  const avg = total ? (s.curve.reduce((a, n, i) => a + n * i, 0) / total).toFixed(2) : "–";
  const doms = (legend?.domains.length ? legend.domains : DOMAINS.filter((d) => s.byDomain[d])) as Domain[];
  const units = Object.entries(deck.zones.main).concat(Object.entries(deck.zones.champion)).map(([k, q]) => ({ c: cat.byKey.get(k), q })).filter((x) => x.c?.might != null);
  const avgMight = units.length ? (units.reduce((a, x) => a + (x.c!.might ?? 0) * x.q, 0) / units.reduce((a, x) => a + x.q, 0)).toFixed(1) : "–";
  return (
    <div className="stats">
      <div className="zone">
        <div className="zone-title"><span className="lbl">Curva de energía</span><span className="mono muted">media {avg}</span></div>
        <div className="curve">
          {s.curve.map((n, i) => (
            <div key={i} className="col">
              <span className="v">{n || ""}</span>
              <i style={{ height: `${(n / maxCurve) * 100}%` }} />
              <span className="x">{i === 8 ? "8+" : i}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="stats-row2">
        <div className="zone">
          <div className="zone-title"><span className="lbl">Tipos</span></div>
          {Object.entries(s.byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
            <div key={t} className="hbar"><span>{({ champion: "Campeones", unit: "Unidades", spell: "Hechizos", gear: "Equipo" } as Record<string, string>)[t] ?? TYPE_ES[t] ?? t}</span><i style={{ width: `${(n / RULES.mainWithChampion) * 100}%` }} /><b>{n}</b></div>
          ))}
          <div className="hbar"><span>Fuerza media</span><span /><b><Might value={null} />{avgMight}</b></div>
        </div>
        <div className="zone">
          <div className="zone-title"><span className="lbl">Dominios: cartas · poder · runas</span></div>
          {doms.map((d) => (
            <div key={d} className="dom-row" style={{ ["--c" as string]: `var(--${d})` }}>
              <img className="rune sm" src={`/assets/icons/glyph-rune_${d}.svg`} alt="" />
              <span>{DOMAIN_ES[d]}</span>
              <span className="mono">{s.byDomain[d] ?? 0} cartas</span>
              <span className="mono">{Math.round(s.power[d] ?? 0)} poder</span>
              <span className="mono">{s.runes[d] ?? 0} runas</span>
            </div>
          ))}
          <span className="hint">El poder es la suma del coste de runa de las cartas de cada dominio. "Calcular runas" reparte las 12 runas en esa proporción.</span>
        </div>
      </div>
    </div>
  );
}
