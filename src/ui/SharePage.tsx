import { useState } from "react";
import { imageFromId, type SharePayload } from "../core/sales";

const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Lo que ve quien abre el enlace de una lista de venta. Sin cuenta y sin instalar nada. */
export function SharePage({ data }: { data: SharePayload }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const total = data.r.reduce((a, r) => a + r[6] * r[5], 0);
  const copies = data.r.reduce((a, r) => a + r[5], 0);
  const chosen = data.r.filter((_, i) => sel.has(i));
  const chosenTotal = chosen.reduce((a, r) => a + r[6] * r[5], 0);
  const hero = data.r.map((r) => r[2]).find(Boolean);

  const copy = async () => {
    const text = chosen.map((r) => `${r[5]} ${r[1]} (${r[0]}, ${r[3]}${r[4] ? ", foil" : ""}) - ${eur(r[6])}`).join("\n") + `\nTotal: ${eur(chosenTotal)}`;
    try { await navigator.clipboard.writeText(text); setCopied("Copiado. Pégalo en tu mensaje al vendedor."); }
    catch { setCopied("No se pudo copiar."); }
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="public">
      <div className="ph" style={{ ["--hero" as string]: hero ? `url("${imageFromId(hero, 900)}")` : "none" }}>
        <div>
          <span className="ph-k">Lista de venta · Riftbound</span>
          <h1>{data.n}</h1>
          <span className="ph-by">Actualizada el {new Date(data.d).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
        <div className="ph-tot"><b>{eur(total)}</b><span className="ph-by">{copies} {copies === 1 ? "carta" : "cartas"}</span></div>
      </div>
      <div className="pgrid">
        {data.r.map((r, i) => {
          const src = imageFromId(r[2], 300);
          return (
            <button key={i} className={`pcard${sel.has(i) ? " on" : ""}`} onClick={() => setSel((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} aria-pressed={sel.has(i)}>
              <span className="pimg">{src ? <img src={src} alt={r[1]} loading="lazy" /> : <span className="pph">{r[1]}</span>}{r[5] > 1 && <span className="pq">×{r[5]}</span>}{sel.has(i) && <span className="pchk">✓</span>}</span>
              <span className="pnm">{r[1]}</span>
              <span className="pm"><span>{r[0]} · {r[3]}{r[4] ? " · foil" : ""}</span><b>{eur(r[6])}</b></span>
            </button>
          );
        })}
      </div>
      <div className="pfoot">
        <span>{chosen.length ? `${chosen.length} ${chosen.length === 1 ? "carta marcada" : "cartas marcadas"} · ${eur(chosenTotal)}` : "Marca las cartas que te interesan y copia la lista para enviársela al vendedor."}</span>
        <span className="pfoot-r">{copied && <span>{copied}</span>}<button className="btn btn-primary" disabled={!chosen.length} onClick={copy}>Copiar mi selección</button></span>
      </div>
    </div>
  );
}
