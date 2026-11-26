import { useEffect, useMemo, useState } from "react";
import { SOURCES, openExternal, useNews, type NewsItem, type SourceId } from "../core/news";

const ago = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "hace un momento";
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
};

export function NewsView() {
  const { items, fetchedAt, errors, loading, read, load, refresh, markRead } = useNews();
  const [sources, setSources] = useState<Set<SourceId>>(new Set());
  const [onlyUnread, setOnlyUnread] = useState(false);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const m = new Map<SourceId, number>();
    for (const i of items) m.set(i.source, (m.get(i.source) ?? 0) + 1);
    return m;
  }, [items]);
  const shown = items.filter((i) => (!sources.size || sources.has(i.source)) && (!onlyUnread || !read.has(i.id)));
  const unread = items.filter((i) => !read.has(i.id)).length;

  const open = (i: NewsItem) => { markRead([i.id]); openExternal(i.url).catch(() => undefined); };
  const toggle = (s: SourceId) => setSources((cur) => { const n = new Set(cur); n.has(s) ? n.delete(s) : n.add(s); return n; });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Noticias</h1>
          <p>Lo último de la web oficial de Riftbound.</p>
        </div>
        <div className="row">
          {unread > 0 && <button className="btn btn-sm btn-quiet" onClick={() => markRead(items.map((i) => i.id))}>Marcar todo como leído</button>}
          <button className="btn btn-primary" onClick={refresh} disabled={loading}>{loading ? "Buscando…" : "Actualizar"}</button>
        </div>
      </div>

      <div className="news-bar">
        {SOURCES.length > 1 ? (
        <div className="chips">
          <button aria-pressed={!sources.size} onClick={() => setSources(new Set())}>Todas</button>
          {SOURCES.map((s) => (
            <button key={s.id} aria-pressed={sources.has(s.id)} onClick={() => toggle(s.id)} title={errors[s.id] ? `No se pudo actualizar: ${errors[s.id]}` : s.site}>
              <span className="src-dot" style={{ background: s.color }} />{s.label} <span className="mono muted">{counts.get(s.id) ?? 0}</span>{errors[s.id] && <span className="src-err" aria-label="con error">!</span>}
            </button>
          ))}
        </div>
        ) : <span />}
        <label className="row" style={{ gap: 6, fontSize: ".84rem" }}><input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Solo sin leer ({unread})</label>
      </div>
      {fetchedAt && <span className="hint">Actualizado {ago(new Date(fetchedAt).toISOString())}{Object.keys(errors).length ? ` · ${Object.keys(errors).length} fuente(s) no respondieron; pasa el ratón por la marca ! para ver por qué` : ""}</span>}

      {!shown.length ? (
        <div className="empty">{loading ? "Buscando noticias…" : items.length ? "No hay noticias con estos filtros." : "No hay noticias todavía. Pulsa Actualizar."}</div>
      ) : (
        <div className="news-list">
          {shown.map((i) => {
            const src = SOURCES.find((s) => s.id === i.source)!;
            const isRead = read.has(i.id);
            return (
              <button key={i.id} className={`news-item${isRead ? " read" : ""}`} onClick={() => open(i)} style={{ ["--sc" as string]: src.color }}>
                <span className="news-img">{i.image ? <img src={i.image} alt="" loading="lazy" /> : <span className="news-noimg">{src.label}</span>}</span>
                <span className="news-body">
                  <span className="news-meta"><span className="src-dot" style={{ background: src.color }} />{src.label}{i.topic ? ` · ${i.topic}` : ""} · {ago(i.date)}</span>
                  <span className="news-title">{i.title}</span>
                  {i.summary && <span className="news-sum">{i.summary}</span>}
                </span>
                {!isRead && <span className="news-new" aria-label="Sin leer" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
