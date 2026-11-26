import { useEffect, useMemo, useState } from "react";
import type { Catalog } from "../core/catalog";
import { norm } from "../core/catalog";
import type { Card } from "../core/types";
import { parseEntryKey, useStore } from "../core/store";
import { eur, priceOf, usePriceProfile, usePrices } from "../core/prices";
import { encodeShare, imageId, roundUp, type SaleItem, type SaleList, type SharePayload } from "../core/sales";
import { HoverName, useCardSrc } from "../ui/CardTile";
import { SharePage } from "../ui/SharePage";

const newList = (n: number): SaleList => ({ id: crypto.randomUUID(), name: `Lista de venta ${n}`, round: 0, items: [], createdAt: Date.now(), updatedAt: Date.now() });

/** Precio final de una copia: el tuyo o el de Cardmarket, redondeado según la lista. */
export function useSalePricing() {
  const map = usePrices((s) => s.map);
  const profile = usePriceProfile();
  const market = (it: SaleItem) => priceOf(map.get(it.cardKey), profile, it.foil);
  const final = (it: SaleItem, round: number) => roundUp(it.price ?? market(it) ?? 0, round);
  return { market, final };
}

export function SalesView({ cat, openCard }: { cat: Catalog; openCard: (c: Card) => void }) {
  const lists = useStore((s) => s.saleLists);
  const saveSaleList = useStore((s) => s.saveSaleList);
  const [openId, setOpenId] = useState<string | null>(null);
  const { final } = useSalePricing();
  const list = lists.find((l) => l.id === openId);

  if (list) return <SaleEditor key={list.id} cat={cat} list={list} openCard={openCard} onBack={() => setOpenId(null)} />;

  const create = () => { const l = newList(lists.length + 1); saveSaleList(l); setOpenId(l.id); };
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Ventas</h1><p>Crea listas con las cartas que quieres vender, ponles precio y comparte un enlace. Mientras están en una lista, esas copias no cuentan en tus colecciones.</p></div>
        <button className="btn btn-primary" onClick={create}>Nueva lista</button>
      </div>
      {!lists.length && <div className="empty">Aún no tienes listas. Crea una, o selecciona cartas en Colecciones y pulsa "Añadir a una lista de venta".</div>}
      <div className="sale-lists">
        {lists.map((l) => {
          const total = l.items.reduce((a, it) => a + final(it, l.round) * it.qty, 0);
          const copies = l.items.reduce((a, it) => a + it.qty, 0);
          const first = l.items.map((it) => cat.byKey.get(it.cardKey)).find(Boolean);
          return (
            <button key={l.id} className="sale-tile" onClick={() => setOpenId(l.id)}>
              <span className="st-thumbs">{l.items.slice(0, 4).map((it) => <Thumb key={it.id} card={cat.byKey.get(it.cardKey)} />)}{!first && <span className="muted">Vacía</span>}</span>
              <span className="st-body">
                <b>{l.name}</b>
                <span className="muted mono">{copies} {copies === 1 ? "carta" : "cartas"} · {new Date(l.updatedAt).toLocaleDateString("es-ES")}</span>
              </span>
              <span className="st-total">{eur(total)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Thumb({ card }: { card?: Card }) {
  return card ? <ThumbImg card={card} /> : null;
}
function ThumbImg({ card }: { card: Card }) {
  const src = useCardSrc(card, 160);
  return src ? <img src={src} alt="" /> : null;
}

function SaleEditor({ cat, list, openCard, onBack }: { cat: Catalog; list: SaleList; openCard: (c: Card) => void; onBack: () => void }) {
  const saveSaleList = useStore((s) => s.saveSaleList);
  const deleteSaleList = useStore((s) => s.deleteSaleList);
  const removeFromSale = useStore((s) => s.removeFromSale);
  const setSaleQty = useStore((s) => s.setSaleQty);
  const collections = useStore((s) => s.collections);
  const shareBase = useStore((s) => s.shareBase);
  const setShareBase = useStore((s) => s.setShareBase);
  const { market, final } = useSalePricing();
  const [adding, setAdding] = useState(false);
  const [preview, setPreview] = useState<SharePayload | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [base, setBase] = useState(shareBase);

  const total = list.items.reduce((a, it) => a + final(it, list.round) * it.qty, 0);
  const copies = list.items.reduce((a, it) => a + it.qty, 0);
  const setItem = (id: string, patch: Partial<SaleItem>) => saveSaleList({ ...list, items: list.items.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3000); };

  const payload = async (): Promise<SharePayload> => ({
    v: 1, n: list.name, d: new Date().toISOString(),
    r: list.items.map((it) => {
      const c = cat.byKey.get(it.cardKey);
      return [it.cardKey, c?.name ?? it.cardKey, imageId(c?.image ?? null), it.lang, it.foil ? 1 : 0, it.qty, final(it, list.round)];
    }),
  });
  // El enlace se regenera cuando cambia la lista: siempre comparte la versión actual.
  useEffect(() => {
    let alive = true;
    if (!shareBase || !list.items.length) { setLink(null); return; }
    payload().then(encodeShare).then((code) => { if (alive) setLink(`${shareBase.replace(/\/?(share\.html)?$/, "")}/share.html#${code}`); });
    return () => { alive = false; };
  }, [list, shareBase]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyLink = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); flash("Enlace copiado. Quien lo abra verá la lista tal y como está ahora."); }
    catch { flash("No se pudo copiar el enlace."); }
  };

  return (
    <div className="page">
      <div className="sale-head">
        <button className="btn btn-sm btn-quiet" onClick={onBack}>← Mis listas</button>
        <input className="deck-name" value={list.name} onChange={(e) => saveSaleList({ ...list, name: e.target.value })} aria-label="Nombre de la lista" />
        <span className="muted mono">{copies} {copies === 1 ? "carta" : "cartas"}</span>
        <span style={{ marginLeft: "auto" }} className="row">
          {confirmDel
            ? <><span className="muted">Las cartas vuelven a su colección.</span><button className="btn btn-sm btn-danger" onClick={() => { deleteSaleList(list.id); onBack(); }}>Eliminar lista</button><button className="btn btn-sm" onClick={() => setConfirmDel(false)}>No</button></>
            : <button className="btn btn-sm btn-quiet" onClick={() => setConfirmDel(true)}>Eliminar lista</button>}
        </span>
      </div>
      {msg && <div className="notice">{msg}</div>}

      <div className="sale-layout">
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>+ Añadir cartas de mis colecciones</button>
          </div>
          {!list.items.length ? <div className="empty">La lista está vacía. Añade cartas de tus colecciones.</div> : (
            <div className="sale-rows">
              {list.items.map((it) => {
                const c = cat.byKey.get(it.cardKey);
                const coll = collections.find((x) => x.id === it.fromColl);
                const m = market(it);
                return (
                  <div key={it.id} className="sale-row">
                    {c ? <SaleThumb card={c} /> : <span className="sale-thumb" />}
                    <div className="sr-main">
                      <span className="sr-name" onClick={() => c && openCard(c)}>{c ? <HoverName card={c} /> : it.cardKey}</span>
                      <span className="sr-sub">{it.cardKey} · {it.lang}{it.foil ? " · foil" : ""} · <span style={{ color: coll?.color }}>●</span> {coll?.name ?? "—"}</span>
                    </div>
                    <div className="sr-qty" aria-label="Copias">
                      <button onClick={() => setSaleQty(list.id, it.id, it.qty - 1)} disabled={it.qty <= 1} aria-label="Una copia menos">−</button>
                      <span>{it.qty}</span>
                      <button onClick={() => setSaleQty(list.id, it.id, it.qty + 1)} aria-label="Una copia más">+</button>
                    </div>
                    <div className="sr-price">
                      <PriceInput value={it.price} auto={m ?? 0} round={list.round} onChange={(v) => setItem(it.id, { price: v })} />
                      <span className="sr-hint">{it.price != null ? `Cardmarket ${eur(m)}` : "Cardmarket"}</span>
                    </div>
                    <div className="sr-actions">
                      <button className="sr-sold" title="Quita la carta de la lista y de tu colección" onClick={() => { removeFromSale(list.id, it.id, "sold"); flash(`${c?.name ?? it.cardKey} marcada como vendida.`); }}>Vendida</button>
                      <button className="sr-x" title="Quitar de la lista y devolver a su colección" aria-label="Quitar de la lista" onClick={() => removeFromSale(list.id, it.id, "return")}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="panel-box sale-panel">
          <div className="field">
            <span className="lbl">Precios</span>
            <button className="btn btn-sm" onClick={() => saveSaleList({ ...list, items: list.items.map((x) => ({ ...x, price: null })) })}>Volver a precios de Cardmarket</button>
            <span className="hint">Escribe tu precio en cualquier carta; si lo borras vuelve al de Cardmarket.</span>
          </div>
          <div className="field">
            <span className="lbl">Redondear precios</span>
            <div className="toggle" role="group" aria-label="Redondear precios">
              <button aria-pressed={!list.round} onClick={() => saveSaleList({ ...list, round: 0 })}>No</button>
              <button aria-pressed={!!list.round} onClick={() => saveSaleList({ ...list, round: 1 })}>Sí</button>
            </div>
          </div>
          <div className="field"><span className="lbl">Total</span><span className="sale-total">{eur(total)}</span></div>
          <div className="field">
            <span className="lbl">Enlace para compartir</span>
            {shareBase ? (
              link ? <><div className="link-box">{link.length > 90 ? `${link.slice(0, 60)}…${link.slice(-20)}` : link}</div><button className="btn btn-sm btn-primary" onClick={copyLink}>Copiar enlace</button></>
                : <span className="hint">Añade cartas para crear el enlace.</span>
            ) : (
              <>
                <span className="hint">Falta publicar la página pública (gratis, una sola vez). Pega aquí su dirección cuando la tengas:</span>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input type="text" value={base} onChange={(e) => setBase(e.target.value)} placeholder="https://tu-bulksort.pages.dev" aria-label="Dirección de la página pública" />
                  <button className="btn btn-sm" disabled={!/^https:\/\/\S+$/.test(base.trim())} onClick={() => setShareBase(base.trim())}>Guardar</button>
                </div>
              </>
            )}
            <button className="btn btn-sm" disabled={!list.items.length} onClick={async () => setPreview(await payload())}>Ver como el comprador</button>
          </div>
        </aside>
      </div>

      {adding && <AddFromCollection cat={cat} listId={list.id} onClose={() => setAdding(false)} />}
      {preview && (
        <div className="overlay" onClick={() => setPreview(null)} role="presentation">
          <div className="preview-wrap" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head" style={{ marginBottom: 8 }}><span className="lbl" style={{ color: "#fff" }}>Vista previa del enlace</span><button className="btn btn-sm" onClick={() => setPreview(null)} aria-label="Cerrar vista previa">✕</button></div>
            <SharePage data={preview} />
          </div>
        </div>
      )}
    </div>
  );
}

function SaleThumb({ card }: { card: Card }) {
  const src = useCardSrc(card, 120);
  return <span className="sale-thumb">{src && <img src={src} alt="" />}</span>;
}

/** Campo de precio: vacío = precio de Cardmarket (se muestra en gris). */
function PriceInput({ value, auto, round, onChange }: { value: number | null; auto: number; round: number; onChange: (v: number | null) => void }) {
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  // Sin editar se ve el precio final (ya redondeado); al editar, el que escribiste.
  const shown = value != null ? fmt(roundUp(value, round)) : "";
  const commit = () => {
    setEditing(false);
    const t = text.trim().replace(",", ".");
    if (!t) { onChange(null); return; }
    const v = Number(t);
    if (Number.isFinite(v) && v >= 0) onChange(Math.round(v * 100) / 100);
  };
  return (
    <input className={`price-in${value != null ? " custom" : ""}`} value={editing ? text : shown} placeholder={fmt(roundUp(auto, round))} inputMode="decimal"
      onFocus={() => { setEditing(true); setText(value != null ? fmt(value) : ""); }}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Tu precio" />
  );
}

/** Ventana para elegir cartas de tus colecciones y pasarlas a la lista. */
export function AddFromCollection({ cat, listId, onClose, preselect }: { cat: Catalog; listId: string; onClose: () => void; preselect?: { entry: string; qty: number }[] }) {
  const entries = useStore((s) => s.entries);
  const collections = useStore((s) => s.collections);
  const addToSale = useStore((s) => s.addToSale);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, number>>(() => Object.fromEntries((preselect ?? []).map((p) => [p.entry, p.qty])));
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const rows = useMemo(() => {
    const nq = norm(q);
    return Object.entries(entries)
      .map(([entry, qty]) => ({ entry, qty, ...parseEntryKey(entry), card: cat.byKey.get(parseEntryKey(entry).cardKey) }))
      .filter((r) => r.card && (!nq || norm(`${r.card.name} ${r.cardKey}`).includes(nq)))
      .sort((a, b) => a.card!.name.localeCompare(b.card!.name))
      .slice(0, 200);
  }, [entries, q, cat]);
  const n = Object.values(picked).reduce((a, b) => a + b, 0);
  const confirm = () => { addToSale(listId, Object.entries(picked).filter(([, v]) => v > 0).map(([entry, qty]) => ({ entry, qty }))); onClose(); };

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="modal" style={{ width: "min(720px, 100%)" }} role="dialog" aria-modal="true" aria-labelledby="afc-t" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2 id="afc-t">Añadir a la lista</h2><button className="btn btn-quiet btn-sm close-x" onClick={onClose} aria-label="Cerrar">✕</button></div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en tus colecciones" aria-label="Buscar en tus colecciones" autoFocus />
        <div className="afc-list">
          {!rows.length && <div className="empty" style={{ padding: 12 }}>No hay cartas que coincidan.</div>}
          {rows.map((r) => {
            const coll = collections.find((c) => c.id === r.coll);
            const v = picked[r.entry] ?? 0;
            return (
              <div key={r.entry} className={`afc-row${v ? " on" : ""}`} role="checkbox" aria-checked={v > 0} tabIndex={0}
                onClick={() => setPicked((p) => ({ ...p, [r.entry]: v ? 0 : r.qty }))}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setPicked((p) => ({ ...p, [r.entry]: v ? 0 : r.qty })); } }}>
                <span className="afc-check" aria-hidden="true">{v ? "✓" : ""}</span>
                <span className="afc-main">
                  <span className="nm">{r.card!.name}</span>
                  <span className="afc-sub">{r.cardKey} · {r.lang}{r.foil ? " · foil" : ""} · <span style={{ color: coll?.color }}>●</span> {coll?.name}</span>
                </span>
                {v ? (
                  <span className="afc-qty" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setPicked((p) => ({ ...p, [r.entry]: Math.max(0, v - 1) }))} aria-label="Una menos">−</button>
                    <span>{v} de {r.qty}</span>
                    <button onClick={() => setPicked((p) => ({ ...p, [r.entry]: Math.min(r.qty, v + 1) }))} disabled={v >= r.qty} aria-label="Una más">+</button>
                  </span>
                ) : <span className="afc-have">{r.qty} {r.qty === 1 ? "copia" : "copias"}</span>}
              </div>
            );
          })}
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!n} onClick={confirm}>Añadir {n} {n === 1 ? "copia" : "copias"}</button>
        </div>
      </div>
    </div>
  );
}
