import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog } from "../core/catalog";
import type { Card, Lang } from "../core/types";
import { parseList, searchCards } from "../core/codes";
import { parseEntryKey, useStore, type Collection } from "../core/store";
import { eur, priceOf, usePriceProfile, usePrices } from "../core/prices";
import { CardFace, domainColor } from "../ui/CardTile";
import { TYPE_ES, VARIANT_ES } from "../ui/icons";
import { SEARCH_SHORTCUT } from "../core/web";

const ALL = "__all";
interface Copy { entry: string; coll: string; lang: Lang; foil: boolean; qty: number }

/** Copias que tienes de cada carta, dentro de la colección elegida (o de todas). */
function useOwned(scope: string) {
  const entries = useStore((s) => s.entries);
  return useMemo(() => {
    const m = new Map<string, Copy[]>();
    for (const [entry, qty] of Object.entries(entries)) {
      if (!(qty > 0)) continue;
      const p = parseEntryKey(entry);
      if (scope !== ALL && p.coll !== scope) continue;
      const list = m.get(p.cardKey) ?? [];
      list.push({ entry, coll: p.coll, lang: p.lang, foil: p.foil, qty });
      m.set(p.cardKey, list);
    }
    return m;
  }, [entries, scope]);
}

function Where({ copies, collections, taking }: { copies: Copy[]; collections: Collection[]; taking?: Record<string, number> }) {
  const order = (c: Copy) => collections.findIndex((x) => x.id === c.coll);
  return (
    <span className="where">
      {[...copies].sort((a, b) => order(a) - order(b) || a.lang.localeCompare(b.lang)).map((c) => {
        const coll = collections.find((x) => x.id === c.coll);
        return (
          <span key={c.entry} className={`where-pill${taking?.[c.entry] ? " taking" : ""}`} style={{ ["--cc" as string]: coll?.color }} title={taking?.[c.entry] ? `Se quitan ${taking[c.entry]} de estas ${c.qty}` : undefined}>
            {coll?.name ?? "—"} <span className="lang">{c.lang}</span>{c.foil && <span className="foil-tag">foil</span>} <b>×{c.qty}</b>
            {!!taking?.[c.entry] && <span className="take-n">−{taking[c.entry]}</span>}
          </span>
        );
      })}
    </span>
  );
}

function Thumb({ card }: { card: Card }) {
  return <span className={`s-thumb${card.landscape ? " land" : ""}`}><CardFace card={card} w={120} /></span>;
}

export function SearchView({ cat, openCard, focusKey }: { cat: Catalog; openCard: (c: Card) => void; focusKey: number }) {
  const collections = useStore((s) => s.collections);
  const priceMap = usePrices((s) => s.map);
  const profile = usePriceProfile();
  const [mode, setMode] = useState<"one" | "list">(() => { try { return localStorage.getItem("bs-search-mode") === "list" ? "list" : "one"; } catch { return "one"; } });
  useEffect(() => { try { localStorage.setItem("bs-search-mode", mode); } catch { /* sin almacenamiento */ } }, [mode]);
  const [scope, setScope] = useState(ALL);
  useEffect(() => { if (scope !== ALL && !collections.some((c) => c.id === scope)) setScope(ALL); }, [collections, scope]);
  const owned = useOwned(scope);
  const total = (key: string) => (owned.get(key) ?? []).reduce((a, c) => a + c.qty, 0);

  // Ctrl F: enfoca el cuadro de búsqueda del modo abierto.
  const qRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { (mode === "one" ? qRef.current : listRef.current)?.focus(); (mode === "one" ? qRef.current : null)?.select(); }, [focusKey, mode]);

  const scopeSelect = (id: string) => (
    <label className="row s-scope" htmlFor={id}>
      Buscar en
      <select id={id} value={scope} onChange={(e) => setScope(e.target.value)}>
        <option value={ALL}>Todas las colecciones</option>
        {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Buscar</h1>
          <p>Encuentra cartas en tus colecciones: una suelta o una lista entera pegada. <span className="mono">{SEARCH_SHORTCUT}</span> te trae aquí desde cualquier pantalla.</p>
        </div>
        <div className="toggle" role="group" aria-label="Modo">
          <button aria-pressed={mode === "one"} onClick={() => setMode("one")}>Una carta</button>
          <button aria-pressed={mode === "list"} onClick={() => setMode("list")}>Lista</button>
        </div>
      </div>
      {mode === "one"
        ? <OneCard cat={cat} qRef={qRef} owned={owned} total={total} inColl={scope === ALL ? null : collections.find((c) => c.id === scope)?.name ?? null} collections={collections} openCard={openCard} scopeSelect={scopeSelect("s-scope1")} price={(c) => priceOf(priceMap.get(c.key), profile)} />
        : <ListSearch cat={cat} listRef={listRef} owned={owned} collections={collections} openCard={openCard} scopeSelect={scopeSelect("s-scope2")} price={(c, foil) => priceOf(priceMap.get(c.key), profile, foil)} />}
    </div>
  );
}

/* ------------------------------ Una carta ------------------------------ */
function OneCard({ cat, qRef, owned, total, inColl, collections, openCard, scopeSelect, price }: {
  cat: Catalog; qRef: React.RefObject<HTMLInputElement>; owned: Map<string, Copy[]>; total: (k: string) => number; inColl: string | null;
  collections: Collection[]; openCard: (c: Card) => void; scopeSelect: React.ReactNode; price: (c: Card) => number | null;
}) {
  const [q, setQ] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const hits = useMemo(() => searchCards(cat, q, 60), [cat, q]);
  // Las que tienes, primero; el resto en el orden de la búsqueda.
  const shown = (onlyMine ? hits.filter((c) => total(c.key) > 0) : hits).map((c, i) => ({ c, i, t: total(c.key) > 0 ? 0 : 1 })).sort((a, b) => a.t - b.t || a.i - b.i).map((x) => x.c);
  const setName = (c: Card) => [...cat.sets, ...cat.specials].find((s) => s.id === c.set)?.name;

  return (
    <>
      <div className="toolbar s-bar">
        <input ref={qRef} className="quick s-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o código, por ejemplo jinx o 0704" aria-label="Buscar carta" autoComplete="off" spellCheck={false} />
        {scopeSelect}
        <label className="row s-check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Solo las que tengo</label>
      </div>
      {!q.trim() ? (
        <div className="empty">Escribe un nombre o un código. Verás cada versión de la carta y dónde tienes sus copias.</div>
      ) : !shown.length ? (
        <div className="empty">{hits.length ? "No tienes ninguna de estas cartas aquí." : "No hay ninguna carta con ese nombre o código."}</div>
      ) : (
        <div className="s-hits">
          {shown.map((c) => {
            const t = total(c.key);
            const copies = owned.get(c.key) ?? [];
            return (
              <button key={c.key} className={`s-hit${t ? "" : " none"}`} style={{ ["--c" as string]: domainColor(c) }} onClick={() => openCard(c)}>
                <Thumb card={c} />
                <span className="s-body">
                  <span className="s-nm">{c.name}</span>
                  <span className="s-sub mono">{c.key} · {setName(c)} · {TYPE_ES[c.type] ?? c.type}{c.variant !== "normal" && c.variant !== "special" ? ` · ${VARIANT_ES[c.variant]}` : ""} · {eur(price(c))}</span>
                  {t ? <Where copies={copies} collections={collections} /> : <span className="muted s-none">{inColl ? `No la tienes en ${inColl}.` : "No la tienes."}</span>}
                </span>
                <span className={`s-total mono${t ? "" : " zero"}`}>{t} {t === 1 ? "copia" : "copias"}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/* -------------------------------- Lista -------------------------------- */
interface Line { id: string; card: Card | null; text: string; want: number; lang: Lang | null; foil: boolean; options: Card[]; guess: boolean; index: number }
/** Lo que decides en cada línea: dejarla, cuántas quitar, o qué copias exactas. */
interface Choice { keep?: boolean; take?: number; custom?: Record<string, number> }

/**
 * Qué copias se cogen primero: normales antes que foil, luego el idioma del que tengas más
 * y luego el orden de tus colecciones.
 */
function allocate(copies: Copy[], n: number, collections: Collection[]): Record<string, number> {
  const byLang = new Map<string, number>();
  copies.forEach((c) => byLang.set(c.lang, (byLang.get(c.lang) ?? 0) + c.qty));
  const ci = (c: Copy) => collections.findIndex((x) => x.id === c.coll);
  const sorted = [...copies].sort((a, b) => Number(a.foil) - Number(b.foil) || (byLang.get(b.lang) ?? 0) - (byLang.get(a.lang) ?? 0) || ci(a) - ci(b));
  const out: Record<string, number> = {};
  let left = n;
  for (const c of sorted) {
    if (left <= 0) break;
    const k = Math.min(left, c.qty);
    out[c.entry] = k; left -= k;
  }
  return out;
}

function ListSearch({ cat, listRef, owned, collections, openCard, scopeSelect, price }: {
  cat: Catalog; listRef: React.RefObject<HTMLTextAreaElement>; owned: Map<string, Copy[]>;
  collections: Collection[]; openCard: (c: Card) => void; scopeSelect: React.ReactNode; price: (c: Card, foil: boolean) => number | null;
}) {
  const [text, setText] = useState(() => { try { return sessionStorage.getItem("bs-search-list") ?? ""; } catch { return ""; } });
  useEffect(() => { try { sessionStorage.setItem("bs-search-list", text); } catch { /* sin almacenamiento */ } }, [text]);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [filter, setFilter] = useState<"all" | "have" | "miss">("all");
  const [msg, setMsg] = useState<{ text: string; undo?: boolean; bad?: boolean } | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<"move" | "sell" | "copy" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saleLists = useStore((s) => s.saleLists);
  const removeCopies = useStore((s) => s.removeCopies);
  const moveEntries = useStore((s) => s.moveEntries);
  const addToSale = useStore((s) => s.addToSale);
  const saveSaleList = useStore((s) => s.saveSaleList);
  const undo = useStore((s) => s.undoLastBatch);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".selbar-menu")) setMenu(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  /** Una línea por carta: si la misma carta sale varias veces se suman las copias. Se ignoran títulos tipo "MainDeck:". */
  const lines = useMemo(() => {
    const parsed = parseList(cat, text.split(/\r?\n/).filter((l) => !/^\s*[\p{L} ]+:\s*$/u.test(l)).join("\n"));
    const out: Line[] = [];
    const byId = new Map<string, Line>();
    parsed.forEach((p, i) => {
      const card = p.card ? (p.options[picks[i] ?? 0] ?? p.card) : null;
      const id = card ? `${card.key}|${p.lang ?? ""}|${p.foil ? 1 : 0}` : `?${i}`;
      const cur = byId.get(id);
      if (cur) { cur.want += p.qty; return; }
      const l: Line = { id, card, text: p.line, want: p.qty, lang: p.lang, foil: p.foil, options: p.options, guess: p.guess, index: i };
      byId.set(id, l); out.push(l);
    });
    return out;
  }, [cat, text, picks]);

  /** Copias que valen para una línea: si la lista pide un idioma o foil, solo esas. */
  const copiesFor = (l: Line) => (l.card ? (owned.get(l.card.key) ?? []).filter((c) => (!l.lang || c.lang === l.lang) && (!l.foil || c.foil)) : []);
  const rows = lines.map((l) => {
    const copies = copiesFor(l);
    const have = copies.reduce((a, c) => a + c.qty, 0);
    const state = !l.card ? "unknown" : have >= l.want ? "ok" : have > 0 ? "warn" : "bad";
    const ch = choices[l.id] ?? {};
    const keep = !!ch.keep || !have;
    let alloc: Record<string, number> = {};
    if (!keep) {
      if (ch.custom) for (const c of copies) { const n = Math.min(c.qty, ch.custom[c.entry] ?? 0); if (n > 0) alloc[c.entry] = n; }
      else alloc = allocate(copies, Math.max(0, Math.min(have, ch.take ?? Math.min(l.want, have))), collections);
    }
    const take = Object.values(alloc).reduce((a, n) => a + n, 0);
    return { l, copies, have, state, keep, alloc, take };
  });
  const found = rows.filter((r) => r.l.card);
  const count = (s: string) => rows.filter((r) => r.state === s).length;
  const missingCopies = found.reduce((a, r) => a + Math.max(0, r.l.want - r.have), 0);
  const haveCopies = found.reduce((a, r) => a + Math.min(r.l.want, r.have), 0);
  const haveValue = found.reduce((a, r) => a + (price(r.l.card!, r.l.foil) ?? 0) * Math.min(r.l.want, r.have), 0);
  const shown = rows.filter((r) => filter === "all" || (filter === "have" ? r.have > 0 : r.have < r.l.want));

  // Lo marcado para quitar
  const moves = rows.flatMap((r) => Object.entries(r.alloc).map(([entry, qty]) => ({ entry, qty })));
  const takeCopies = moves.reduce((a, m) => a + m.qty, 0);
  const takeCards = rows.filter((r) => r.take > 0).length;
  const takeValue = rows.reduce((a, r) => a + Object.entries(r.alloc).reduce((b, [entry, n]) => b + (price(r.l.card!, parseEntryKey(entry).foil) ?? 0) * n, 0), 0);

  const setChoice = (id: string, c: Choice) => { setChoices((cur) => ({ ...cur, [id]: c })); setConfirmDelete(false); };
  const setAll = (keep: boolean) => { setChoices(Object.fromEntries(rows.map((r) => [r.l.id, { keep }]))); setOpen(new Set()); setConfirmDelete(false); };
  const afterAction = (m: typeof msg) => { setMsg(m); setChoices({}); setOpen(new Set()); setMenu(null); setConfirmDelete(false); };
  const copiesWord = (n: number) => `${n} ${n === 1 ? "copia" : "copias"}`;

  const doDelete = () => { removeCopies(moves); afterAction({ text: `${takeCopies === 1 ? "Eliminada" : "Eliminadas"} ${copiesWord(takeCopies)} de tus colecciones.`, undo: true }); };
  const doMove = (to: string) => {
    const real = moves.filter((m) => parseEntryKey(m.entry).coll !== to);
    const n = real.reduce((a, m) => a + m.qty, 0);
    const name = collections.find((c) => c.id === to)?.name;
    if (!n) { setMenu(null); setMsg({ text: `Esas copias ya están en ${name}.` }); return; }
    moveEntries(real.map((m) => ({ key: m.entry, qty: m.qty })), to);
    afterAction({ text: `${copiesWord(n)} ${n === 1 ? "movida" : "movidas"} a ${name}${n < takeCopies ? ` (${takeCopies - n} ya estaban allí)` : ""}.`, undo: true });
  };
  const doSell = (to: string) => {
    let id = to;
    const name = to === "__new" ? `Lista de venta ${saleLists.length + 1}` : saleLists.find((l) => l.id === to)?.name;
    if (to === "__new") { id = crypto.randomUUID(); saveSaleList({ id, name: name!, round: 0, items: [], createdAt: Date.now(), updatedAt: Date.now() }); }
    addToSale(id, moves);
    afterAction({ text: `${copiesWord(takeCopies)} ${takeCopies === 1 ? "puesta" : "puestas"} a la venta en "${name}". Las tienes en Ventas.` });
  };

  const lineText = (card: Card, n: number, l: Line) => `${n}x ${card.name} (${card.key})${l.lang ? ` ${l.lang}` : ""}${l.foil ? " foil" : ""}`;
  const copy = async (what: "have" | "miss" | "take") => {
    const out = found
      .map((r) => ({ r, n: what === "have" ? Math.min(r.l.want, r.have) : what === "take" ? r.take : Math.max(0, r.l.want - r.have) }))
      .filter((x) => x.n > 0).map((x) => lineText(x.r.l.card!, x.n, x.r.l));
    if (what === "miss") rows.filter((r) => !r.l.card).forEach((r) => out.push(r.l.text));
    setMenu(null);
    const label = what === "have" ? "lo que tienes" : what === "take" ? "lo marcado para quitar" : "lo que te falta";
    try { await navigator.clipboard.writeText(out.join("\n")); setMsg({ text: `Copiado ${label} (${out.length} líneas).` }); }
    catch { setMsg({ text: "No se pudo copiar.", bad: true }); }
  };

  return (
    <div className="s-split">
      <div className="s-paste">
        <label className="lbl" htmlFor="s-list">Pega la lista</label>
        <textarea id="s-list" ref={listRef} value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); setPicks({}); setMsg(null); setConfirmDelete(false); }}
          placeholder={"3x Blazing Scorcher\n2x Brutal Hunter\n0704 x2\nVEN-070 2 KO"} />
        {scopeSelect}
        {text && <button className="btn btn-sm btn-quiet" style={{ alignSelf: "flex-start" }} onClick={() => { setText(""); setPicks({}); setChoices({}); setMsg(null); listRef.current?.focus(); }}>Borrar la lista</button>}
      </div>

      <div className="s-res">
        {msg && <div className={`notice${msg.bad ? " bad" : ""}`}>{msg.text}{msg.undo && <button className="btn btn-sm" onClick={() => { undo(); setMsg({ text: "Hecho: las copias han vuelto a su sitio." }); }}>Deshacer</button>}</div>}
        {!rows.length ? (
          <div className="empty">Pega una lista a la izquierda: la de un amigo, la de un mazo o la de una venta. Verás qué tienes, dónde está, y podrás quitar o dejar cada carta.</div>
        ) : (<>
          <div className="s-sum">
            <div><span className="lbl">Cartas</span><b>{rows.length}</b></div>
            <div className="ok" title="Cartas de las que tienes todas las copias que pide"><span className="lbl">Completas</span><b>{count("ok")}</b></div>
            <div className="warn" title="Tienes alguna copia, pero no todas"><span className="lbl">A medias</span><b>{count("warn")}</b></div>
            <div className="bad" title="No tienes ninguna copia"><span className="lbl">No tienes</span><b>{count("bad") + count("unknown")}</b></div>
            <div><span className="lbl">Tienes</span><b>{haveCopies}</b><small className="mono">copias · {eur(haveValue)}</small></div>
            <div><span className="lbl">Faltan</span><b>{missingCopies}</b><small className="mono">copias</small></div>
          </div>
          <div className="toolbar">
            <div className="chips" role="group" aria-label="Filtrar">
              <button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>Todas</button>
              <button aria-pressed={filter === "have"} onClick={() => setFilter("have")}>Las tengo</button>
              <button aria-pressed={filter === "miss"} onClick={() => setFilter("miss")}>Me faltan</button>
            </div>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setAll(false)} disabled={!found.some((r) => r.have)}>Quitar todas</button>
              <button className="btn btn-sm" onClick={() => setAll(true)} disabled={!found.some((r) => r.have)}>Dejar todas</button>
            </div>
          </div>
          <div className="s-rows">
            {!shown.length && <div className="empty" style={{ padding: 14 }}>Nada con este filtro.</div>}
            {shown.map(({ l, copies, have, state, keep, alloc, take }) => {
              const ch = choices[l.id] ?? {};
              const isOpen = open.has(l.id) && !keep;
              return (
                <div key={l.id} className={`s-row ${state}${keep && have ? " kept" : ""}`} style={{ ["--c" as string]: l.card ? domainColor(l.card) : undefined }}>
                  <span className="s-st" />
                  {l.card ? <button className="s-thumb-btn" onClick={() => openCard(l.card!)} aria-label={`Ver ${l.card.name}`}><Thumb card={l.card} /></button> : <span className="s-thumb empty-thumb">?</span>}
                  <span className="s-body">
                    {l.card ? (
                      l.options.length > 1 || l.guess ? (
                        <select className="s-pick" value={picks[l.index] ?? 0} onChange={(e) => setPicks({ ...picks, [l.index]: Number(e.target.value) })} aria-label={`Elegir carta para ${l.text}`} title={l.guess ? `"${l.text}" no es un nombre exacto: elige la carta` : "Hay varias versiones: elige la que buscas"}>
                          {l.options.map((o, j) => <option key={o.key} value={j}>{o.key} · {o.name}{o.variant !== "normal" && o.variant !== "special" ? ` · ${VARIANT_ES[o.variant]}` : ""}</option>)}
                        </select>
                      ) : <span className="s-nm">{l.card.name}</span>
                    ) : <span className="s-nm">No encontrada</span>}
                    <span className="s-sub mono">
                      {l.card ? `${l.card.key} · ${eur(price(l.card, l.foil))}` : l.text}
                      {l.lang && <> · solo <span className="lang">{l.lang}</span></>}{l.foil && <> · solo foil</>}
                    </span>
                    {copies.length > 0 && !isOpen && <Where copies={copies} collections={collections} taking={alloc} />}
                    {isOpen && (
                      <span className="s-pickcopies">
                        {copies.map((c) => {
                          const coll = collections.find((x) => x.id === c.coll);
                          const n = alloc[c.entry] ?? 0;
                          const set = (v: number) => setChoice(l.id, { custom: { ...alloc, [c.entry]: Math.max(0, Math.min(c.qty, v)) } });
                          return (
                            <span key={c.entry} className="s-pc" style={{ ["--cc" as string]: coll?.color }}>
                              <span className="s-pc-name">{coll?.name ?? "—"} <span className="lang">{c.lang}</span>{c.foil && <span className="foil-tag">foil</span>} <span className="muted mono">de {c.qty}</span></span>
                              <span className="stepper"><button onClick={() => set(n - 1)} aria-label="Una menos">−</button><span>{n}</span><button onClick={() => set(n + 1)} aria-label="Una más">+</button></span>
                            </span>
                          );
                        })}
                      </span>
                    )}
                  </span>
                  <span className="s-status">
                    <span className="lbl">Pide {l.want}</span>
                    <b>{state === "unknown" ? "Revisa la línea" : state === "bad" ? "No la tienes" : `Tienes ${have} de ${l.want}`}</b>
                    {have > 0 && (
                      <span className="s-acts">
                        <span className="toggle sm" role="group" aria-label={`Quitar o dejar ${l.card?.name}`}>
                          <button aria-pressed={!keep} onClick={() => setChoice(l.id, { ...ch, keep: false })}>Quitar</button>
                          <button aria-pressed={keep} onClick={() => setChoice(l.id, { ...ch, keep: true })}>Dejar</button>
                        </span>
                        {!keep && (
                          <span className="stepper" title="Copias que quitas">
                            <button onClick={() => setChoice(l.id, { take: Math.max(0, take - 1) })} aria-label="Quitar una menos">−</button>
                            <span>{take}</span>
                            <button onClick={() => setChoice(l.id, { take: Math.min(have, take + 1) })} aria-label="Quitar una más">+</button>
                          </span>
                        )}
                      </span>
                    )}
                    {have > 0 && !keep && copies.length > 1 && (
                      <button className="s-link" onClick={() => setOpen((cur) => { const n = new Set(cur); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })}>
                        {isOpen ? "Listo" : "Elegir copias"}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="selbar s-dock" onKeyDown={(e) => { if (e.key === "Escape") { setMenu(null); setConfirmDelete(false); } }}>
            <div className="selbar-info">
              {takeCopies ? <><b>Quitar {copiesWord(takeCopies)}</b><span className="muted">{takeCards} {takeCards === 1 ? "carta" : "cartas"}{takeValue > 0 ? ` · ${eur(takeValue)}` : ""}</span></>
                : <span className="muted">Nada marcado para quitar</span>}
            </div>
            <div className="selbar-actions">
              {confirmDelete ? (
                <>
                  <span>¿Eliminar {copiesWord(takeCopies)} de tus colecciones?</span>
                  <button className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Cancelar</button>
                  <button className="btn btn-sm btn-danger-solid" onClick={doDelete}>Eliminar</button>
                </>
              ) : (
                <>
                  <div className="selbar-menu">
                    <button className="btn btn-sm" aria-expanded={menu === "copy"} onClick={() => setMenu(menu === "copy" ? null : "copy")}>Copiar <span className="caret">▾</span></button>
                    {menu === "copy" && (
                      <div className="menu up">
                        <button onClick={() => copy("have")} disabled={!haveCopies}><span>Lo que tengo</span><small>{haveCopies} copias</small></button>
                        <button onClick={() => copy("miss")} disabled={!missingCopies && !count("unknown")}><span>Lo que me falta</span><small>{missingCopies} copias</small></button>
                        <button onClick={() => copy("take")} disabled={!takeCopies}><span>Lo marcado para quitar</span><small>{takeCopies} copias</small></button>
                      </div>
                    )}
                  </div>
                  <div className="selbar-menu">
                    <button className="btn btn-sm" disabled={!takeCopies} aria-expanded={menu === "move"} onClick={() => setMenu(menu === "move" ? null : "move")}>Mover a <span className="caret">▾</span></button>
                    {menu === "move" && (
                      <div className="menu up">
                        {collections.map((c) => (
                          <button key={c.id} onClick={() => doMove(c.id)}><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: c.color }} />{c.name}</span></button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="selbar-menu">
                    <button className="btn btn-sm" disabled={!takeCopies} aria-expanded={menu === "sell"} onClick={() => setMenu(menu === "sell" ? null : "sell")}>Vender en <span className="caret">▾</span></button>
                    {menu === "sell" && (
                      <div className="menu up">
                        {saleLists.map((sl) => <button key={sl.id} onClick={() => doSell(sl.id)}><span>{sl.name}</span><small>{sl.items.reduce((a, i) => a + i.qty, 0)} copias</small></button>)}
                        <button onClick={() => doSell("__new")}><span>+ Nueva lista</span></button>
                      </div>
                    )}
                  </div>
                  <button className="btn btn-sm btn-danger" disabled={!takeCopies} onClick={() => { setMenu(null); setConfirmDelete(true); }}>Eliminar</button>
                </>
              )}
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}
