import { useEffect, useRef, useState } from "react";
import { resizeImage } from "../core/exporters";
import { useStore, type Collection } from "../core/store";

export const COLL_COLORS = ["#C8324A", "#E8761C", "#C99A00", "#2D7A4B", "#127F78", "#2C72D6", "#4558C9", "#8445D6", "#B83C74", "#5F636B"];

/** Ventana para crear o editar una colección: nombre, color e imagen opcional. */
export function CollectionDialog({ initial, onClose, onSaved }: { initial?: Collection; onClose: () => void; onSaved?: (c: Collection) => void }) {
  const saveCollection = useStore((s) => s.saveCollection);
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? COLL_COLORS[6]);
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const save = () => {
    if (!name.trim()) { setError("Ponle un nombre a la colección."); return; }
    const c: Collection = { id: initial?.id ?? crypto.randomUUID(), name: name.trim(), color, image, createdAt: initial?.createdAt ?? Date.now() };
    saveCollection(c);
    onSaved?.(c);
    onClose();
  };
  const pick = async (f?: File) => {
    if (!f) return;
    try { setImage(await resizeImage(f, 900)); } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="coll-dlg-t" onClick={(e) => e.stopPropagation()} style={{ ["--acc" as string]: color }}>
        <h2 id="coll-dlg-t">{initial ? "Editar colección" : "Nueva colección"}</h2>
        <div className="field">
          <label className="lbl" htmlFor="coll-name">Nombre</label>
          <input ref={input} id="coll-name" type="text" value={name} placeholder="Caja bulk 1, Carpeta Rares…" onChange={(e) => { setName(e.target.value); setError(null); }}
            onKeyDown={(e) => e.key === "Enter" && save()} />
        </div>
        <div className="field">
          <span className="lbl">Color</span>
          <div className="swatches">
            {COLL_COLORS.map((c) => <button key={c} className={`sw${c === color ? " on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Color ${c}`} aria-pressed={c === color} />)}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Imagen (opcional)</span>
          <div className="row">
            <button className="btn btn-sm" onClick={() => file.current?.click()}>{image ? "Cambiar imagen" : "Subir imagen"}</button>
            {image && <button className="btn btn-sm btn-quiet" onClick={() => setImage(null)}>Quitar imagen</button>}
            <span className="hint">{image ? "" : "Sin imagen se usa solo el color."}</span>
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
        <div className="field">
          <span className="lbl">Vista previa</span>
          <div className="binder static" style={binderStyle({ color, image })}>
            <div className="b"><span className="n">{name || "Sin nombre"}</span><span className="s">0 copias</span></div>
          </div>
        </div>
        {error && <div className="notice bad">{error}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>{initial ? "Guardar" : "Crear colección"}</button>
        </div>
      </div>
    </div>
  );
}

export const binderStyle = (c: { color: string; image?: string | null }) =>
  ({ ["--c" as string]: c.color, ["--art" as string]: c.image ? `url("${c.image}")` : "none" }) as React.CSSProperties;

/** Ventana para elegir en qué colección se guarda lo que vas a añadir. */
export function DestinationDialog({ copies, onPick, onClose }: { copies: number; onPick: (id: string) => void; onClose: () => void }) {
  const collections = useStore((s) => s.collections);
  const entries = useStore((s) => s.entries);
  const last = useStore((s) => s.lastCollection);
  const [sel, setSel] = useState(collections.some((c) => c.id === last) ? last : collections[0]?.id);
  const [creating, setCreating] = useState(false);
  const counts = new Map<string, number>();
  for (const [k, v] of Object.entries(entries)) { const c = k.split("|")[3]; counts.set(c, (counts.get(c) ?? 0) + v); }
  const chosen = collections.find((c) => c.id === sel);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (creating) return; if (e.key === "Escape") onClose(); if (e.key === "Enter" && sel) onPick(sel); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [creating, sel, onClose, onPick]);

  if (creating) return <CollectionDialog onClose={() => setCreating(false)} onSaved={(c) => setSel(c.id)} />;
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dest-t" onClick={(e) => e.stopPropagation()} style={{ ["--acc" as string]: chosen?.color }}>
        <h2 id="dest-t">¿Dónde guardas {copies === 1 ? "esta copia" : `estas ${copies} copias`}?</h2>
        <div className="dest-list" role="radiogroup">
          {collections.map((c) => (
            <button key={c.id} role="radio" aria-checked={c.id === sel} className={`dest-opt${c.id === sel ? " on" : ""}`} style={{ ["--c" as string]: c.color }}
              onClick={() => setSel(c.id)} onDoubleClick={() => onPick(c.id)}>
              <span className="dot" />
              <span><b>{c.name}</b><small>{counts.get(c.id) ?? 0} copias{c.id === last ? " · usada la última vez" : ""}</small></span>
            </button>
          ))}
        </div>
        <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setCreating(true)}>+ Nueva colección</button>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!sel} onClick={() => sel && onPick(sel)}>Guardar en {chosen?.name ?? "…"}</button>
        </div>
      </div>
    </div>
  );
}
