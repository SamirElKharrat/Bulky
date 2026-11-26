import { useEffect, useMemo, useState } from "react";
import type { Catalog } from "../core/catalog";
import { norm } from "../core/catalog";
import type { Card, Domain } from "../core/types";
import { DOMAINS } from "../core/types";
import { DOMAIN_ES, RARITY_ES } from "../ui/icons";
import { useStore, type Collection } from "../core/store";
import { collectionRows, download, toCsv, toText } from "../core/exporters";
import { CardTile, HoverName } from "../ui/CardTile";
import { CollectionDialog, binderStyle } from "../ui/CollectionDialog";
import { BackupControls } from "../ui/BackupControls";
import { eur, priceOf, usePriceProfile, usePrices } from "../core/prices";

const ALL = "__all";

export function CollectionView({ cat, openCard }: { cat: Catalog; openCard: (c: Card) => void }) {
  const entries = useStore((s) => s.entries);
  const collections = useStore((s) => s.collections);
  const moveEntries = useStore((s) => s.moveEntries);
  const saleLists = useStore((s) => s.saleLists);
  const saveSaleList = useStore((s) => s.saveSaleList);
  const addToSale = useStore((s) => s.addToSale);
  const [menu, setMenu] = useState<"move" | "sell" | null>(null);
  const deleteEntries = useStore((s) => s.deleteEntries);
  const undoLastBatch = useStore((s) => s.undoLastBatch);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteCollection = useStore((s) => s.deleteCollection);
  const [active, setActive] = useState<string>(ALL);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean; undo?: boolean } | null>(null);
  const [dialog, setDialog] = useState<{ edit?: Collection } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"grid" | "list">(() => { try { return (localStorage.getItem("bs-coll-view") as "grid" | "list") ?? "grid"; } catch { return "grid"; } });
  useEffect(() => { try { localStorage.setItem("bs-coll-view", view); } catch { /* sin almacenamiento */ } }, [view]);
  useEffect(() => { setSel(new Set()); }, [active]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".selbar-menu")) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);
  useEffect(() => { if (active !== ALL && !collections.some((c) => c.id === active)) setActive(ALL); }, [collections, active]);

  const allRows = useMemo(() => collectionRows(cat, entries), [cat, entries]);
  const rows = useMemo(() => (active === ALL ? allRows : allRows.filter((r) => r.coll === active)), [allRows, active]);
  // Filtros
  const [fSet, setFSet] = useState("");
  const [fType, setFType] = useState("");
  const [fRarity, setFRarity] = useState("");
  const [fLang, setFLang] = useState("");
  const [fFoil, setFFoil] = useState<"" | "foil" | "normal">("");
  const [fDoms, setFDoms] = useState<Set<Domain>>(new Set());
  const [sort, setSort] = useState<"code" | "name" | "qty" | "value">("code");
  const priceMap = usePrices((st) => st.map);
  const profile = usePriceProfile();
  const unit = (r: { key: string; foil: boolean }) => priceOf(priceMap.get(r.key), profile, r.foil);
  const nFilters = [fSet, fType, fRarity, fLang, fFoil].filter(Boolean).length + (fDoms.size ? 1 : 0);
  const clearFilters = () => { setFSet(""); setFType(""); setFRarity(""); setFLang(""); setFFoil(""); setFDoms(new Set()); };
  const shown = useMemo(() => {
    const nq = norm(q);
    const out = rows.filter((r) => {
      const c = cat.byKey.get(r.key);
      if (nq && !norm(`${r.key} ${r.name}`).includes(nq)) return false;
      if (fSet && r.set !== fSet) return false;
      if (fLang && r.lang !== fLang) return false;
      if (fFoil === "foil" && !r.foil) return false;
      if (fFoil === "normal" && r.foil) return false;
      if (fType && (fType === "champion" ? !c?.champion : c?.type !== fType)) return false;
      if (fRarity && c?.rarity !== fRarity) return false;
      if (fDoms.size && !c?.domains.some((d) => fDoms.has(d))) return false;
      return true;
    });
    if (sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "value") {
      const tot = new Map<string, number>();
      for (const r of out) tot.set(r.key, (tot.get(r.key) ?? 0) + (unit(r) ?? 0) * r.qty);
      out.sort((a, b) => (tot.get(b.key) ?? 0) - (tot.get(a.key) ?? 0) || a.name.localeCompare(b.name));
    }
    if (sort === "qty") {
      const tot = new Map<string, number>();
      for (const r of out) tot.set(r.key, (tot.get(r.key) ?? 0) + r.qty);
      out.sort((a, b) => (tot.get(b.key) ?? 0) - (tot.get(a.key) ?? 0) || a.name.localeCompare(b.name));
    }
    return out;
  }, [rows, q, cat, fSet, fLang, fFoil, fType, fRarity, fDoms, sort, priceMap, profile]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = shown.reduce((a, r) => a + (unit(r) ?? 0) * r.qty, 0);
  const setsInRows = useMemo(() => [...cat.sets, ...cat.specials].filter((s) => rows.some((r) => r.set === s.id)), [cat, rows]);
  const langsInRows = useMemo(() => [...new Set(rows.map((r) => r.lang))], [rows]);
  /** Una celda por carta, con el desglose por idioma (y foil). */
  const grid = useMemo(() => {
    const m = new Map<string, { card: Card; qty: number; langs: Map<string, number> }>();
    for (const r of shown) {
      const card = cat.byKey.get(r.key);
      if (!card) continue;
      const cur = m.get(r.key) ?? { card, qty: 0, langs: new Map() };
      cur.qty += r.qty;
      const l = r.foil ? `${r.lang}★` : r.lang;
      cur.langs.set(l, (cur.langs.get(l) ?? 0) + r.qty);
      m.set(r.key, cur);
    }
    return [...m.values()].map((x) => ({ ...x, langs: [...x.langs] }));
  }, [shown, cat]);

  const perColl = useMemo(() => {
    const m = new Map<string, { copies: number; cards: Set<string> }>();
    for (const r of allRows) {
      const cur = m.get(r.coll) ?? { copies: 0, cards: new Set() };
      cur.copies += r.qty; cur.cards.add(r.key);
      m.set(r.coll, cur);
    }
    return m;
  }, [allRows]);

  const copies = rows.reduce((a, r) => a + r.qty, 0);
  const distinct = new Set(rows.map((r) => r.key)).size;
  const stamp = new Date().toISOString().slice(0, 10);
  const current = collections.find((c) => c.id === active);
  const title = current?.name ?? "Todas las colecciones";
  const fileName = (current?.name ?? "bulksort").replace(/[^\w-]+/g, "_");

  const copy = async () => {
    try { await navigator.clipboard.writeText(toText(rows)); setMsg({ text: `Copiadas ${rows.length} líneas de ${title}.` }); }
    catch { setMsg({ text: "No se pudo copiar. Usa TXT.", bad: true }); }
  };

  const toggle = (key: string) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const selRows = rows.filter((r) => sel.has(r.key));
  const selCopies = selRows.reduce((a, r) => a + r.qty, 0);
  const selValue = selRows.reduce((a, r) => a + (unit(r) ?? 0) * r.qty, 0);
  const allSelected = grid.length > 0 && grid.every((g) => sel.has(g.card.key));
  const doMove = (to: string) => {
    if (!to || !sel.size) return;
    moveEntries(selRows.map((r) => ({ key: r.entry })), to);
    setMsg({ text: `${selCopies} ${selCopies === 1 ? "copia movida" : "copias movidas"} a ${collections.find((c) => c.id === to)?.name}.` });
    setSel(new Set()); setMenu(null);
  };
  const targets = collections.filter((c) => c.id !== active);
  const doDelete = () => {
    deleteEntries(selRows.map((r) => r.entry));
    setMsg({ text: `Eliminadas ${selCopies} ${selCopies === 1 ? "copia" : "copias"} de ${sel.size} ${sel.size === 1 ? "carta" : "cartas"}${active === ALL ? "" : ` de ${title}`}.`, undo: true });
    setSel(new Set()); setConfirmDelete(false);
  };
  /** Pone a la venta todas las copias de las cartas seleccionadas (de la colección que estás viendo). */
  const doSell = (saleTo: string) => {
    if (!saleTo || !sel.size) return;
    setMenu(null);
    let id = saleTo;
    if (saleTo === "__new") {
      id = crypto.randomUUID();
      saveSaleList({ id, name: `Lista de venta ${saleLists.length + 1}`, round: 0, items: [], createdAt: Date.now(), updatedAt: Date.now() });
    }
    const moves = rows.filter((r) => sel.has(r.key)).map((r) => ({ entry: r.entry, qty: r.qty }));
    addToSale(id, moves);
    const name = saleTo === "__new" ? `Lista de venta ${saleLists.length + 1}` : saleLists.find((l) => l.id === id)?.name;
    setMsg({ text: `${moves.reduce((a, m) => a + m.qty, 0)} copias puestas a la venta en "${name}". Las tienes en Ventas.` });
    setSel(new Set());
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Colecciones</h1><p>Separa tu bulk como lo tienes en la vida real: cajas, carpetas, cartas para cambio. "Todas" suma todo lo que tienes.</p></div>
        <button className="btn btn-primary" onClick={() => setDialog({})}>Nueva colección</button>
      </div>

      <div className="binders">
        <button className={`binder all${active === ALL ? " on" : ""}`} onClick={() => setActive(ALL)}>
          <div className="b"><span className="n">Todas</span><span className="s"><span>{allRows.reduce((a, r) => a + r.qty, 0)} copias</span><span>{new Set(allRows.map((r) => r.key)).size} cartas</span></span></div>
        </button>
        {collections.map((c) => (
          <Binder key={c.id} c={c} on={active === c.id} stats={perColl.get(c.id)} onOpen={() => setActive(c.id)}
            onEdit={() => setDialog({ edit: c })} canDelete={collections.length > 1}
            onDelete={(to) => { deleteCollection(c.id, to); setMsg({ text: `Colección "${c.name}" eliminada; sus cartas están ahora en ${collections.find((x) => x.id === to)?.name}.` }); }}
            others={collections.filter((x) => x.id !== c.id)} />
        ))}
        <button className="binder add" onClick={() => setDialog({})}><div className="b"><b style={{ fontSize: "1.6rem" }}>+</b><span>Nueva colección</span></div></button>
      </div>

      {msg && <div className={`notice${msg.bad ? " bad" : ""}`}>{msg.text}{msg.undo && <button className="btn btn-sm" onClick={() => { undoLastBatch(); setMsg({ text: "Cartas recuperadas." }); }}>Deshacer</button>}</div>}

      <div className="page-head" style={{ alignItems: "center" }}>
        <h2 style={{ ["--acc" as string]: current?.color }}>{title}</h2>
        <div className="row">
          <button className="btn btn-sm" onClick={copy} disabled={!rows.length}>Copiar</button>
          <button className="btn btn-sm" onClick={() => download(`${fileName}-${stamp}.txt`, toText(rows), "text/plain")} disabled={!rows.length}>TXT</button>
          <button className="btn btn-sm" onClick={() => download(`${fileName}-${stamp}.csv`, toCsv(rows), "text/csv")} disabled={!rows.length}>CSV</button>
          <BackupControls small onDone={(text, bad) => setMsg({ text, bad })} />
        </div>
      </div>
      <div className="coll-filters">
        <div className="cf-count"><span className="lbl">Copias</span><b>{copies}</b><span className="lbl">Cartas</span><b>{distinct}</b><span className="lbl">Valor</span><b className="cf-value">{eur(value)}</b></div>
        <div className="field"><label className="lbl" htmlFor="f-set">Expansión</label>
          <select id="f-set" value={fSet} onChange={(e) => setFSet(e.target.value)}><option value="">Todas</option>{setsInRows.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.name}</option>)}</select></div>
        <div className="field"><label className="lbl" htmlFor="f-type">Tipo</label>
          <select id="f-type" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">Todos</option><option value="champion">Campeones</option><option value="unit">Unidades</option><option value="spell">Hechizos</option>
            <option value="gear">Equipo</option><option value="legend">Leyendas</option><option value="battlefield">Campos de batalla</option><option value="rune">Runas</option>
          </select></div>
        <div className="field"><label className="lbl" htmlFor="f-rar">Rareza</label>
          <select id="f-rar" value={fRarity} onChange={(e) => setFRarity(e.target.value)}>
            <option value="">Todas</option>{Object.entries(RARITY_ES).filter(([k]) => k !== "promo").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        <div className="field"><span className="lbl">Runa</span>
          <div className="runes">
            {DOMAINS.map((d) => (
              <button key={d} className="rune-btn" style={{ ["--c" as string]: `var(--${d})` }} aria-pressed={fDoms.has(d)} title={DOMAIN_ES[d]}
                onClick={() => setFDoms((s) => { const n = new Set(s); n.has(d) ? n.delete(d) : n.add(d); return n; })}>
                <img className="rune sm" src={`/assets/icons/glyph-rune_${d}.svg`} alt={DOMAIN_ES[d]} />
              </button>
            ))}
          </div></div>
        <div className="field"><span className="lbl">Idioma</span>
          <div className="chips">
            <button aria-pressed={!fLang} onClick={() => setFLang("")}>Todos</button>
            {langsInRows.map((l) => <button key={l} aria-pressed={fLang === l} onClick={() => setFLang(fLang === l ? "" : l)}>{l}</button>)}
          </div></div>
        <div className="field"><span className="lbl">Acabado</span>
          <div className="chips">
            <button aria-pressed={!fFoil} onClick={() => setFFoil("")}>Todo</button>
            <button aria-pressed={fFoil === "normal"} onClick={() => setFFoil("normal")}>Normal</button>
            <button aria-pressed={fFoil === "foil"} onClick={() => setFFoil("foil")}>Foil</button>
          </div></div>
        <div className="field"><label className="lbl" htmlFor="f-sort">Ordenar</label>
          <select id="f-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="code">Por código</option><option value="name">Por nombre</option><option value="qty">Más copias primero</option><option value="value">Más valiosas primero</option>
          </select></div>
        {nFilters > 0 && <button className="btn btn-sm btn-quiet" onClick={clearFilters}>Quitar filtros ({nFilters})</button>}
      </div>
      <div className="toolbar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o código" aria-label="Buscar" style={{ maxWidth: 360 }} />
        <div className="row">
          <button className={`btn btn-sm${selecting ? " btn-primary" : ""}`} onClick={() => { setSelecting(!selecting); setSel(new Set()); }}>{selecting ? "Terminar selección" : "Seleccionar"}</button>
          <div className="toggle" role="group" aria-label="Vista">
            <button aria-pressed={view === "grid"} onClick={() => setView("grid")}>Cuadrícula</button>
            <button aria-pressed={view === "list"} onClick={() => setView("list")}>Lista</button>
          </div>
        </div>
      </div>

      {!rows.length ? (
        <div className="empty">{active === ALL ? 'Aún no tienes cartas. Ve a "Añadir cartas" y escribe tu primer código, por ejemplo 0704.' : "Esta colección está vacía. Añade cartas eligiéndola al guardar, o mueve aquí cartas de otra colección."}</div>
      ) : view === "grid" ? (
        <div className="grid">
          {grid.map(({ card, qty, langs }) => (
            <div key={card.key} className={`coll-cell${selecting && sel.has(card.key) ? " sel" : ""}`}>
              <CardTile card={card} qty={qty} onOpen={selecting ? () => toggle(card.key) : openCard} />
              {selecting && <span className="sel-chk" aria-hidden="true">{sel.has(card.key) ? "✓" : ""}</span>}
              <span className="coll-langs">{langs.map(([l, n]) => <span key={l} className="lang">{l} {n}</span>)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="tbl">
          <table>
            <thead><tr>{selecting && <th />}<th>Código</th><th>Nombre</th><th>Idioma</th><th>Foil</th>{active === ALL && <th>Colección</th>}<th style={{ textAlign: "right" }}>Copias</th><th style={{ textAlign: "right" }}>Precio</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {shown.map((r) => {
                const coll = collections.find((c) => c.id === r.coll);
                return (
                  <tr key={r.entry} className={selecting && sel.has(r.key) ? "sel" : ""} onClick={() => { if (selecting) toggle(r.key); else { const c = cat.byKey.get(r.key); if (c) openCard(c); } }}>
                    {selecting && <td><input type="checkbox" readOnly checked={sel.has(r.key)} aria-label={`Seleccionar ${r.name}`} /></td>}
                    <td className="n">{r.key}</td>
                    <td>{cat.byKey.get(r.key) ? <HoverName card={cat.byKey.get(r.key)!} /> : r.name}</td>
                    <td><span className="lang">{r.lang}</span></td><td>{r.foil ? "Sí" : ""}</td>
                    {active === ALL && <td><span className="coll-pill" style={{ ["--c" as string]: coll?.color }}>{coll?.name ?? "—"}</span></td>}
                    <td className="n r">{r.qty}</td>
                    <td className="n r">{eur(unit(r))}</td>
                    <td className="n r">{unit(r) != null ? eur((unit(r) ?? 0) * r.qty) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selecting && (
        <div className="selbar" onKeyDown={(e) => { if (e.key === "Escape") { setMenu(null); setConfirmDelete(false); } }}>
          <button className="selbar-x" onClick={() => { setSelecting(false); setSel(new Set()); setConfirmDelete(false); setMenu(null); }} aria-label="Terminar selección" title="Terminar selección">✕</button>
          <div className="selbar-info">
            {sel.size ? (
              <><b>{sel.size} {sel.size === 1 ? "carta" : "cartas"}</b><span className="muted">{selCopies} {selCopies === 1 ? "copia" : "copias"}{selValue > 0 ? ` · ${eur(selValue)}` : ""}</span></>
            ) : <span className="muted">Pulsa las cartas para seleccionarlas</span>}
          </div>
          <button className="selbar-link" onClick={() => { allSelected ? setSel(new Set()) : setSel(new Set(grid.map((g) => g.card.key))); setConfirmDelete(false); }}>
            {allSelected ? "Quitar selección" : `Seleccionar todas (${grid.length})`}
          </button>
          <div className="selbar-actions">
            {confirmDelete ? (
              <>
                <span>¿Eliminar {selCopies} {selCopies === 1 ? "copia" : "copias"}{active === ALL ? "" : ` de ${title}`}?</span>
                <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Cancelar</button>
                <button className="btn btn-sm btn-danger-solid" onClick={doDelete}>Eliminar</button>
              </>
            ) : (
              <>
                <div className="selbar-menu">
                  <button className="btn btn-sm" disabled={!sel.size || !targets.length} aria-expanded={menu === "move"} onClick={() => setMenu(menu === "move" ? null : "move")}>Mover a <span className="caret">▾</span></button>
                  {menu === "move" && (
                    <div className="menu up">
                      {targets.map((c) => (
                        <button key={c.id} onClick={() => doMove(c.id)}><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: c.color }} />{c.name}</span></button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="selbar-menu">
                  <button className="btn btn-sm" disabled={!sel.size} aria-expanded={menu === "sell"} onClick={() => setMenu(menu === "sell" ? null : "sell")}>Vender en <span className="caret">▾</span></button>
                  {menu === "sell" && (
                    <div className="menu up">
                      {saleLists.map((l) => (
                        <button key={l.id} onClick={() => doSell(l.id)}><span>{l.name}</span><small>{l.items.reduce((a, i) => a + i.qty, 0)} copias</small></button>
                      ))}
                      <button onClick={() => doSell("__new")}><span>+ Nueva lista</span></button>
                    </div>
                  )}
                </div>
                <button className="btn btn-sm btn-danger" disabled={!sel.size} onClick={() => { setMenu(null); setConfirmDelete(true); }}>Eliminar</button>
              </>
            )}
          </div>
        </div>
      )}
      {dialog && <CollectionDialog initial={dialog.edit} onClose={() => setDialog(null)} onSaved={(c) => !dialog.edit && setActive(c.id)} />}
    </div>
  );
}

function Binder({ c, on, stats, onOpen, onEdit, onDelete, canDelete, others }: {
  c: Collection; on: boolean; stats?: { copies: number; cards: Set<string> }; onOpen: () => void; onEdit: () => void;
  onDelete: (moveTo: string) => void; canDelete: boolean; others: Collection[];
}) {
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [to, setTo] = useState(others[0]?.id ?? "");
  useEffect(() => {
    if (!menu) return;
    const close = () => { setMenu(false); setConfirm(false); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);
  return (
    <div className={`binder${on ? " on" : ""}${c.image ? "" : " plain"}`} style={binderStyle(c)} role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <span className="menu-wrap bmenu" onClick={(e) => e.stopPropagation()}>
        <button className="dots light" aria-label={`Opciones de ${c.name}`} onClick={() => { setMenu(!menu); setConfirm(false); }}>⋮</button>
        {menu && (
          <div className="menu" role="menu">
            <button role="menuitem" onClick={() => { setMenu(false); onEdit(); }}><span>Editar</span><small>Nombre, color e imagen</small></button>
            {canDelete && (confirm ? (
              <div className="menu-confirm">
                <span className="lbl">Sus cartas pasan a</span>
                <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Colección donde pasar las cartas">
                  {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button className="btn btn-sm btn-danger" onClick={() => { setMenu(false); onDelete(to); }}>Eliminar colección</button>
              </div>
            ) : (
              <button role="menuitem" className="danger" onClick={() => setConfirm(true)}><span>Eliminar</span><small>Tus cartas no se pierden</small></button>
            ))}
          </div>
        )}
      </span>
      <div className="b"><span className="n">{c.name}</span><span className="s"><span>{stats?.copies ?? 0} copias</span><span>{stats?.cards.size ?? 0} cartas</span></span></div>
    </div>
  );
}
