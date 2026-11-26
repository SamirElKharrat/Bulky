import { useEffect, useMemo, useRef, useState } from "react";
import type { Catalog } from "../core/catalog";
import { cardImage } from "../core/catalog";
import { parseList, searchCards, splitQty } from "../core/codes";
import type { Card } from "../core/types";
import { LANGS } from "../core/types";
import { useStore } from "../core/store";
import { saveAddList, useAddList } from "../core/addList";
import { domainColor, CardFace } from "../ui/CardTile";
import { DestinationDialog } from "../ui/CollectionDialog";
import { Energy, Might, Power, Rarity, Runes, TYPE_ES, VARIANT_ES } from "../ui/icons";


/** Escribir código → ver la carta → Intro la pasa a la lista → añadir toda la lista. */
export function AddView({ cat }: { cat: Catalog }) {
  const undo = useStore((s) => s.undoLastBatch);
  const lastLang = useStore((s) => s.lastLang);
  const setLastLang = useStore((s) => s.setLastLang);
  const [text, setText] = useState("");
  const [sel, setSel] = useState(0);
  const [foil, setFoil] = useState(false);
  const list = useAddList((s) => s.list);
  const setList = useAddList((s) => s.setList);
  const [done, setDone] = useState<string | null>(null);
  const [mode, setMode] = useState<"one" | "paste">("one");
  const [paste, setPaste] = useState("");
  const [picks, setPicks] = useState<Record<number, number>>({});
  const input = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseList(cat, paste), [cat, paste]);
  const ready = parsed.filter((p) => p.card);
  const missing = parsed.filter((p) => !p.card);

  /** Pasa las líneas reconocidas a la lista y deja en el cuadro solo las que no se encontraron. */
  const takePasted = () => {
    setList((l) => {
      let out = [...l];
      parsed.forEach((p, i) => {
        if (!p.card) return;
        const c = p.options[picks[i] ?? 0] ?? p.card;
        const lang = p.lang ?? lastLang;
        const f = p.foil || foil;
        const j = out.findIndex((x) => x.card.key === c.key && x.lang === lang && x.foil === f);
        if (j >= 0) out[j] = { ...out[j], qty: out[j].qty + p.qty };
        else out = [...out, { card: c, lang, foil: f, qty: p.qty }];
      });
      return out;
    });
    setPaste(missing.map((m) => m.line).join("\n"));
    setPicks({}); setDone(null);
  };

  useEffect(() => input.current?.focus(), []);
  const { text: query, qty } = splitQty(text);
  const hits = useMemo(() => searchCards(cat, query), [cat, query]);
  const card = hits[Math.min(sel, hits.length - 1)];
  const setMeta = (c: Card) => [...cat.sets, ...cat.specials].find((s) => s.id === c.set);

  const push = () => {
    if (!card) return;
    setList((l) => {
      const i = l.findIndex((x) => x.card.key === card.key && x.lang === lastLang && x.foil === foil);
      if (i < 0) return [{ card, lang: lastLang, foil, qty }, ...l];
      const it = { ...l[i], qty: l[i].qty + qty };
      return [it, ...l.filter((_, j) => j !== i)];
    });
    setText(""); setSel(0); setDone(null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); push(); }
    else if (e.key === "Escape") setText("");
    else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && hits.length > 1) {
      e.preventDefault();
      setSel((s) => (s + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length);
    } else if (e.altKey && /^Digit[1-4]$/.test(e.code)) {
      e.preventDefault(); setLastLang(LANGS[Number(e.code.slice(-1)) - 1]);
    }
  };

  const total = list.reduce((a, it) => a + it.qty, 0);
  const [choosing, setChoosing] = useState(false);
  /** Al pulsar "Añadir" se pregunta en qué colección guardar. */
  const commit = () => setChoosing(true);
  const saveTo = (coll: string) => {
    setDone(saveAddList(coll));
    setChoosing(false); input.current?.focus();
  };
  const bump = (i: number, d: number) => setList((l) => l.flatMap((it, j) => (j !== i ? [it] : it.qty + d > 0 ? [{ ...it, qty: it.qty + d }] : [])));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Añadir cartas</h1>
          <p>Escribe el código de la carta, comprueba que es la correcta y pulsa Intro. Cuando acabes el montón, añade toda la lista de una vez.</p>
        </div>
        <div className="toggle" role="group" aria-label="Modo">
          <button aria-pressed={mode === "one"} onClick={() => setMode("one")}>Una a una</button>
          <button aria-pressed={mode === "paste"} onClick={() => setMode("paste")}>Pegar lista</button>
        </div>
      </div>
      <div className="qa">
        {mode === "paste" && (
          <div className="paste">
            <div className="field">
              <label className="lbl" htmlFor="paste">Una carta por línea</label>
              <textarea id="paste" value={paste} spellCheck={false} onChange={(e) => { setPaste(e.target.value); setPicks({}); }}
                placeholder={"3x Evelynn, Entrancing\nBrutal Hunter x2\n0704 x1\nVEN-070 2 KO\n1x T1S-003"} />
              <span className="hint">Formatos: <code>3x Nombre completo</code> · <code>Nombre x3</code> · <code>0704 x2</code> · <code>VEN-070 2</code>. Idioma opcional al final (<code>KO</code>). También acepta el texto de "Copiar bulk".</span>
            </div>
            <div className="paste-res">
              <div className="qa-head">
                <span className="lbl">Resultado</span>
                <span className="muted mono" style={{ fontSize: ".78rem" }}>{parsed.length ? `${ready.length - parsed.filter((p) => p.guess).length} exactas · ${parsed.filter((p) => p.guess).length} por elegir · ${missing.length} sin encontrar` : ""}</span>
              </div>
              {!parsed.length && <div className="empty" style={{ padding: 12 }}>Pega tu lista a la izquierda.</div>}
              <div className="paste-lines">
                {parsed.map((p, i) => (
                  <div key={i} className={`pline${p.card ? (p.guess ? " guess" : "") : " bad"}`} title={p.guess ? `"${p.line}" no es un nombre exacto: elige la carta` : undefined}>
                    <span className="mono">{p.qty}×</span>
                    {p.card ? (
                      p.options.length > 1 || p.guess ? (
                        <select value={picks[i] ?? 0} onChange={(e) => setPicks({ ...picks, [i]: Number(e.target.value) })} aria-label={`Elegir carta para ${p.line}`}>
                          {p.options.map((o, j) => <option key={o.key} value={j}>{o.key} · {o.name}</option>)}
                        </select>
                      ) : (
                        <span className="nm"><span className="mono">{p.card.key}</span> {p.card.name}</span>
                      )
                    ) : (
                      <span className="nm">No encontrada: <span className="mono">{p.line}</span></span>
                    )}
                    <span className="lang">{p.lang ?? lastLang}</span>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" disabled={!ready.length} onClick={takePasted}>
                {ready.length ? `Pasar ${ready.length} cartas a la lista` : "Pasar a la lista"}
              </button>
            </div>
          </div>
        )}
        {mode === "one" && (<>
        <div className="qa-top">
          <input ref={input} className="quick" type="text" value={text} placeholder="0704" autoComplete="off" spellCheck={false}
            aria-label="Código o nombre de la carta" onChange={(e) => { setText(e.target.value); setSel(0); }} onKeyDown={onKey} />
          <div className="toggle" role="group" aria-label="Idioma">
            {LANGS.map((l) => <button key={l} aria-pressed={lastLang === l} onClick={() => { setLastLang(l); input.current?.focus(); }}>{l}</button>)}
          </div>
          <div className="toggle"><button aria-pressed={foil} onClick={() => { setFoil(!foil); input.current?.focus(); }}>Foil</button></div>
        </div>
        <div className="qa-prev" aria-live="polite">
          {!query ? (
            <span className="muted">Escribe un código: la carta aparecerá aquí. Por ejemplo <span className="mono">0704</span> es la carta 070 de la expansión 4.</span>
          ) : !card ? (
            <span className="muted">No hay ninguna carta con ese código. Usa número de 3 cifras + expansión (<span className="mono">0704</span>), <span className="mono">VEN-070</span> o parte del nombre.</span>
          ) : (
            <>
              <div className="hit" style={{ ["--c" as string]: domainColor(card) }}>
                <div className="thumb">{cardImage(card, 200) ? <img src={cardImage(card, 200)!} alt="" /> : <CardFace card={card} />}</div>
                <div className="info">
                  <span className="nm">{card.name}</span>
                  <span className="meta">
                    <span className="mono" style={{ color: "var(--ink)" }}>{card.key}</span>
                    <span>{setMeta(card)?.name}</span>
                    <span>{TYPE_ES[card.type] ?? card.type}</span>
                    <Energy value={card.energy} /><Power value={card.power} d={card.domains[0]} /><Might value={card.might} />
                    <Runes ds={card.domains} /><Rarity r={card.rarity} />
                    {card.variant !== "normal" && <span className="tag">{VARIANT_ES[card.variant]}</span>}
                  </span>
                  <span className="meta"><span className="lang">{lastLang}</span>{foil && <span className="tag">foil</span>}{qty > 1 && <span className="mono">×{qty}</span>}</span>
                </div>
                <span className="enter">Intro ↵</span>
              </div>
              {hits.length > 1 && (
                <div className="alts">
                  {hits.map((h, i) => (
                    <button key={h.key} aria-pressed={h === card} onClick={() => { setSel(i); input.current?.focus(); }}>
                      {h.key} · {h.name}{h.variant !== "normal" && h.variant !== "special" ? ` · ${VARIANT_ES[h.variant]}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        </>)}
        <div className="qa-list">
          <div className="qa-head qa-head-actions">
            <span className="row" style={{ gap: 10 }}><span className="lbl">Lista para añadir</span><span className="muted mono" style={{ fontSize: ".78rem" }}>{list.length ? `${list.length} cartas · ${total} copias` : ""}</span></span>
            <div className="row">
              <button className="btn btn-sm" onClick={() => setList([])} disabled={!list.length}>Vaciar</button>
              <button className="btn btn-primary" onClick={commit} disabled={!list.length}>{list.length ? `Añadir ${total} ${total === 1 ? "copia" : "copias"}…` : "Añadir…"}</button>
              {choosing && <DestinationDialog copies={total} onPick={saveTo} onClose={() => { setChoosing(false); input.current?.focus(); }} />}
            </div>
          </div>
          {done && <div className="notice">{done}<button className="btn btn-sm" onClick={() => { undo(); setDone("Lote deshecho."); }}>Deshacer</button></div>}
          {!list.length && <div className="empty" style={{ padding: 16 }}>La lista está vacía. Escribe un código arriba y pulsa Intro.</div>}
          {list.map((it, i) => (
            <div className="qrow" key={`${it.card.key}|${it.lang}|${it.foil}`}>
              <Runes ds={it.card.domains.slice(0, 1)} />
              <span className="mono">{it.card.key}</span>
              <span className="nm">{it.card.name}</span>
              <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}><span className="lang">{it.lang}</span>{it.foil && <span className="tag">foil</span>}</span>
              <span className="stepper"><button onClick={() => bump(i, -1)} aria-label="Quitar una copia">−</button><span>{it.qty}</span><button onClick={() => bump(i, 1)} aria-label="Añadir una copia">+</button></span>
              <button className="btn btn-quiet btn-sm" onClick={() => bump(i, -it.qty)} aria-label="Quitar de la lista">✕</button>
            </div>
          ))}
        </div>
      </div>
      <p className="hint">Intro añade · <code>x3</code> al final añade 3 copias · ↑ ↓ elige entre variantes · Alt + 1–4 cambia el idioma · Esc borra</p>
    </div>
  );
}
