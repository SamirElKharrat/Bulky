import { useRef } from "react";
import type { SetMeta } from "../core/types";
import { resizeImage } from "../core/exporters";
import { useStore } from "../core/store";
import { eur } from "../core/prices";

/** Tapa de carpeta: arte de la expansión o edición especial, lomo de color y progreso. */
export function Cover({ set, owned, copies, value, onOpen }: { set: SetMeta; owned: number; copies: number; value?: number | null; onOpen: () => void }) {
  const custom = useStore((s) => s.covers[set.id]);
  const setCover = useStore((s) => s.setCover);
  const file = useRef<HTMLInputElement>(null);
  const art = custom ?? set.art;
  const pct = set.base ? Math.min(100, Math.round((owned / set.base) * 100)) : 0;

  const pick = async (f?: File) => {
    if (!f) return;
    try { setCover(set.id, await resizeImage(f)); } catch (e) { alert((e as Error).message); }
  };

  return (
    <div
      className="cover" role="button" tabIndex={0}
      style={{ ["--sc" as string]: set.color, ["--art" as string]: art ? `url("${art}")` : "none" }}
      onClick={onOpen} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
      aria-label={`Abrir ${set.name}`}
    >
      <div className="cover-edit" onClick={(e) => e.stopPropagation()}>
        <span role="button" tabIndex={0} onClick={() => file.current?.click()} onKeyDown={(e) => e.key === "Enter" && file.current?.click()}>Cambiar foto</span>
        {custom && <span role="button" tabIndex={0} onClick={() => setCover(set.id, null)} onKeyDown={(e) => e.key === "Enter" && setCover(set.id, null)}>Original</span>}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div className="body">
        <div className="top">
          <div>
            <div className="nm">{set.name}</div>
            <div className="sub">
              {set.release ? new Date(set.release).toLocaleDateString("es-ES", { month: "short", year: "numeric" }) : ""}
              {set.note ? ` · ${set.note}` : ""}
            </div>
          </div>
          <div className="tape"><b>{set.id}</b><span>{set.number != null ? String(set.number).padStart(2, "0") : "★"}</span></div>
        </div>
        {set.base > 0 && (
          <>
            <div className="pct-row">
              <span className={`pct${pct === 100 ? " full" : ""}`}>{pct}<small>%</small></span>
              <span className="nums-col"><span>{owned} / {set.base} {set.kind === "special" ? "cartas" : "base"}</span><span>{copies} copias</span>{value != null && copies > 0 && <span className="cover-value">{eur(value)}</span>}</span>
            </div>
            <div className="track"><i style={{ width: `${pct}%` }} /></div>
          </>
        )}
      </div>
    </div>
  );
}
