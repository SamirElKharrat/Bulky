import { useEffect, useRef, useState } from "react";
import { resizeImage } from "../core/exporters";
import type { Card, Lang } from "../core/types";
import { LANGS } from "../core/types";
import { cardImage } from "../core/catalog";
import { entryKey, parseEntryKey, useStore } from "../core/store";
import { PROFILES, eur, priceOf, usePriceProfile, usePrices } from "../core/prices";
import { CardFace, domainColor } from "./CardTile";
import { CardText, DOMAIN_ES, Energy, Might, Power, Rarity, Runes, TYPE_ES, VARIANT_ES, RARITY_ES } from "./icons";

export function CardDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const entries = useStore((s) => s.entries);
  const setQty = useStore((s) => s.setQty);
  const custom = useStore((s) => s.cardImages[card.key]);
  const setCardImage = useStore((s) => s.setCardImage);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const collections = useStore((s) => s.collections);
  const lastCollection = useStore((s) => s.lastCollection);
  const moveEntries = useStore((s) => s.moveEntries);
  const [addLang, setAddLang] = useState<Lang>("EN");
  const [addFoil, setAddFoil] = useState(false);
  const [addColl, setAddColl] = useState(collections.some((c) => c.id === lastCollection) ? lastCollection : collections[0]?.id);
  // Copias de esta carta, una línea por colección + idioma + foil
  const mine = Object.entries(entries)
    .map(([k, q]) => ({ k, q, ...parseEntryKey(k) }))
    .filter((e) => e.cardKey === card.key && e.q > 0)
    .sort((a, b) => collections.findIndex((c) => c.id === a.coll) - collections.findIndex((c) => c.id === b.coll) || a.lang.localeCompare(b.lang));
  const total = mine.reduce((a, e) => a + e.q, 0);
  const price = usePrices((s) => s.map.get(card.key));
  const profile = usePriceProfile();
  const myValue = mine.reduce((a, e) => a + (priceOf(price, profile, e.foil) ?? 0) * e.q, 0);
  const addOne = () => { const k = entryKey(card.key, addLang, addFoil, addColl); setQty(k, (entries[k] ?? 0) + 1); };

  const big = custom ?? cardImage(card, 600);
  const pickImage = async (f?: File) => {
    if (!f) return;
    try { setCardImage(card.key, await resizeImage(f, 900)); } catch (e) { alert((e as Error).message); }
  };
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className={`dialog${card.landscape ? " land" : ""}`} role="dialog" aria-modal="true" aria-label={card.name} style={{ ["--c" as string]: domainColor(card) }} onClick={(e) => e.stopPropagation()}>
        <div className="pic">
          {big ? <img src={big} alt={card.name} /> : <CardFace card={card} />}
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn btn-sm" onClick={() => file.current?.click()}>{big ? "Cambiar imagen" : "Subir imagen"}</button>
            {custom && <button className="btn btn-sm btn-quiet" onClick={() => setCardImage(card.key, null)}>Quitar la mía</button>}
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
        <div className="body">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span className="lbl">{card.key}{card.variant !== "normal" ? ` · ${VARIANT_ES[card.variant] ?? card.variant}` : ""}</span>
              <h2 style={{ marginTop: 4 }}>{card.name}</h2>
            </div>
            <button className="btn btn-quiet btn-sm" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
          <dl className="facts">
            <div><dt>Tipo</dt><dd>{card.supertype === "champion" ? "Campeón · " : ""}{TYPE_ES[card.type] ?? card.type}</dd></div>
            {card.energy != null && <div><dt>Coste</dt><dd><Energy value={card.energy} />{card.power ? <Power value={card.power} d={card.domains[0]} /> : null}</dd></div>}
            {card.might != null && <div><dt>Fuerza</dt><dd><Might value={card.might} /></dd></div>}
            {card.domains.length > 0 && <div><dt>Dominio</dt><dd><Runes ds={card.domains} size="" /><span>{card.domains.map((d) => DOMAIN_ES[d]).join(" · ")}</span></dd></div>}
            {card.rarity && RARITY_ES[card.rarity] && <div><dt>Rareza</dt><dd><Rarity r={card.rarity} />{RARITY_ES[card.rarity]}</dd></div>}
            {card.player && <div><dt>Jugador</dt><dd>{card.player}</dd></div>}
          </dl>
          {card.text && <div className="text"><CardText text={card.text} /></div>}
          <div className="field">
            <span className="lbl">Cardmarket</span>
            {price ? (
              <div className="price-grid">
                <span />{PROFILES.map((p) => <span key={p.id} className={`h${p.id === profile ? " on" : ""}`}>{p.label}</span>)}
                <span className="muted">Normal</span>{PROFILES.map((p) => <span key={p.id} className={`mono${p.id === profile ? " on" : ""}`}>{eur(price[p.id] || null)}</span>)}
                <span className="muted">Foil</span>{PROFILES.map((p) => <span key={p.id} className={`mono${p.id === profile ? " on" : ""}`}>{eur(price[`${p.id}F` as const] || null)}</span>)}
              </div>
            ) : <span className="muted">Sin precio en Cardmarket.</span>}
            {total > 0 && price && <span className="hint">Tus {total} {total === 1 ? "copia vale" : "copias valen"} {eur(myValue)}.</span>}
          </div>
          <div className="field">
            <span className="lbl">Mis copias · {total}</span>
            {!mine.length && <span className="muted">Aún no la tienes.</span>}
            <div className="copies4">
              {mine.map((e) => {
                const coll = collections.find((c) => c.id === e.coll);
                return (
                  <div key={e.k} style={{ display: "contents" }}>
                    <span className="coll-pill" style={{ ["--c" as string]: coll?.color }}>{coll?.name ?? "—"}</span>
                    <span className="row" style={{ gap: 6 }}><span className="lang">{e.lang}</span>{e.foil && <span className="tag">foil</span>}</span>
                    <select value={e.coll} onChange={(ev) => moveEntries([{ key: e.k }], ev.target.value)} aria-label="Mover a otra colección" title="Mover a otra colección">
                      {collections.map((c) => <option key={c.id} value={c.id}>{c.id === e.coll ? "Mover a…" : c.name}</option>)}
                    </select>
                    <span className="stepper">
                      <button onClick={() => setQty(e.k, e.q - 1)} aria-label={`Quitar una copia ${e.lang}`}>−</button>
                      <span>{e.q}</span>
                      <button onClick={() => setQty(e.k, e.q + 1)} aria-label={`Añadir una copia ${e.lang}`}>+</button>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="add-copy">
              <span className="lbl">Añadir copia</span>
              <select value={addLang} onChange={(e) => setAddLang(e.target.value as Lang)} aria-label="Idioma">{LANGS.map((l) => <option key={l}>{l}</option>)}</select>
              <label className="row" style={{ gap: 4, fontSize: ".84rem" }}><input type="checkbox" checked={addFoil} onChange={(e) => setAddFoil(e.target.checked)} /> Foil</label>
              <select value={addColl} onChange={(e) => setAddColl(e.target.value)} aria-label="Colección">{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <button className="btn btn-sm btn-primary" onClick={addOne}>+ 1</button>
            </div>
          </div>
          {card.artist && <span className="hint">Ilustración: {card.artist}</span>}
        </div>
      </div>
    </div>
  );
}
