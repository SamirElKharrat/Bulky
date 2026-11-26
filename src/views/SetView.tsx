import { useCallback, useMemo, useState } from "react";
import type { Catalog } from "../core/catalog";
import { norm } from "../core/catalog";
import type { Card, Domain } from "../core/types";
import { DOMAINS } from "../core/types";
import { ownedByCard, useStore } from "../core/store";
import { CardRowCells, CardTile, domainColor } from "../ui/CardTile";
import { DOMAIN_ES, TYPE_ES } from "../ui/icons";

type Show = "all" | "owned" | "missing";
const COSTS = ["0", "1", "2", "3", "4", "5", "6+"];

export function SetView({ cat, setId, openSet, openCard }: { cat: Catalog; setId: string; openSet: (id: string) => void; openCard: (c: Card) => void }) {
  const entries = useStore((s) => s.entries);
  const custom = useStore((s) => s.covers[setId]);
  const owned = useMemo(() => ownedByCard(entries), [entries]);
  const meta = [...cat.sets, ...cat.specials].find((s) => s.id === setId)!;
  const all = cat.bySet.get(setId) ?? [];

  const [q, setQ] = useState("");
  const [runes, setRunes] = useState<Set<Domain>>(new Set());
  const [costs, setCosts] = useState<Set<string>>(new Set());
  const [type, setType] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const toggle = <T,>(s: Set<T>, v: T, set: (n: Set<T>) => void) => {
    const n = new Set(s);
    n.has(v) ? n.delete(v) : n.add(v);
    set(n);
  };

  const types = useMemo(() => [...new Set(all.map((c) => c.type))].filter(Boolean), [all]);
  const list = useMemo(() => {
    const nq = norm(q);
    return all.filter((c) => {
      if (runes.size && !c.domains.some((d) => runes.has(d))) return false;
      if (costs.size) {
        const k = c.energy == null ? null : c.energy >= 6 ? "6+" : String(c.energy);
        if (!k || !costs.has(k)) return false;
      }
      if (type && c.type !== type) return false;
      const n = owned.get(c.key) ?? 0;
      if (show === "owned" && !n) return false;
      if (show === "missing" && n) return false;
      if (nq && !c.search.includes(nq)) return false;
      return true;
    });
  }, [all, q, runes, costs, type, show, owned]);

  const ownedCount = list.filter((c) => owned.get(c.key)).length;
  const art = custom ?? meta.art;
  const onOpen = useCallback((c: Card) => openCard(c), [openCard]);
  const dividers = [...cat.sets, ...cat.specials];

  return (
    <div className="page" style={{ ["--acc" as string]: meta.color }}>
      <div className="dividers" role="tablist" aria-label="Expansiones">
        {dividers.map((s, i) => (
          <span key={s.id} style={{ display: "contents" }}>
            {i === cat.sets.length && <span className="sep" />}
            <button role="tab" aria-selected={s.id === setId} style={{ ["--sc" as string]: s.color }} onClick={() => openSet(s.id)}>
              <b>{s.id}</b><span>{s.number ?? "★"}</span>
            </button>
          </span>
        ))}
      </div>

      <div className="banner" style={{ ["--art" as string]: art ? `url("${art}")` : "none" }}>
        <div className="meta">
          <span className="lbl">{meta.kind === "special" ? "Edición especial" : `Expansión ${meta.number ?? ""}`}</span>
          <h1>{meta.name}</h1>
          <span className="muted mono">{all.filter((c) => owned.get(c.key)).length} de {all.length} impresiones en tu colección</span>
        </div>
      </div>

      <div className="set-layout">
        <aside className="filters">
          <div className="field"><label className="lbl" htmlFor="f-q">Buscar</label><input id="f-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o código" /></div>
          {meta.kind === "expansion" && (
            <>
              <div className="field"><span className="lbl">Runa</span>
                <div className="runes">
                  {DOMAINS.map((d) => (
                    <button key={d} className="rune-btn" style={{ ["--c" as string]: `var(--${d})` }} aria-pressed={runes.has(d)} aria-label={DOMAIN_ES[d]} title={DOMAIN_ES[d]} onClick={() => toggle(runes, d, setRunes)}>
                      <img className="rune" src={`/assets/icons/glyph-rune_${d}.svg`} alt="" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="field"><span className="lbl">Energía</span>
                <div className="costs">{COSTS.map((c) => <button key={c} aria-pressed={costs.has(c)} onClick={() => toggle(costs, c, setCosts)}>{c}</button>)}</div>
              </div>
              <div className="field"><label className="lbl" htmlFor="f-type">Tipo</label>
                <select id="f-type" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">Todos</option>
                  {types.map((t) => <option key={t} value={t}>{TYPE_ES[t] ?? t}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="field"><label className="lbl" htmlFor="f-show">Mostrar</label>
            <select id="f-show" value={show} onChange={(e) => setShow(e.target.value as Show)}>
              <option value="all">Todas</option><option value="owned">Solo las que tengo</option><option value="missing">Solo las que me faltan</option>
            </select>
          </div>
        </aside>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <div className="toolbar">
            <span className="muted mono" style={{ fontSize: ".8rem" }}>{list.length} cartas · {ownedCount} en tu colección</span>
            <div className="toggle" role="group" aria-label="Vista">
              <button aria-pressed={view === "grid"} onClick={() => setView("grid")}>Cuadrícula</button>
              <button aria-pressed={view === "list"} onClick={() => setView("list")}>Lista</button>
            </div>
          </div>
          {!list.length ? (
            <div className="empty">{all.length ? "Ninguna carta coincide con los filtros." : meta.note ?? "Todavía no hay cartas registradas en esta edición."}</div>
          ) : view === "grid" ? (
            <div className="grid">{list.map((c) => <CardTile key={c.key} card={c} qty={owned.get(c.key) ?? 0} onOpen={onOpen} />)}</div>
          ) : (
            <div className="tbl">
              <table>
                <thead><tr><th>Código</th><th>Nombre</th><th>Runa</th><th>Energía</th><th>Poder</th><th>Fuerza</th><th>Rareza</th><th style={{ textAlign: "right" }}>Copias</th></tr></thead>
                <tbody>
                  {list.map((c) => {
                    const n = owned.get(c.key) ?? 0;
                    return (
                      <tr key={c.key} className={n ? "" : "missing"} onClick={() => openCard(c)} style={{ ["--c" as string]: domainColor(c) }}>
                        <CardRowCells card={c} /><td className="n r">{n || "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
