import { useEffect, useRef, useState } from "react";
import { applyBackup, backupFileName, makeBackup, parseBackup, type BackupSummary, type FullBackup } from "../core/backup";
import { download } from "../core/exporters";

const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;

/** Botones "Hacer copia de seguridad" y "Restaurar copia", con la ventana para elegir cómo restaurar. */
export function BackupControls({ onDone, small }: { onDone?: (msg: string, bad?: boolean) => void; small?: boolean }) {
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: FullBackup; summary: BackupSummary; name: string } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const [saving, setSaving] = useState(false);
  /** En la app de escritorio se abre "Guardar como" para elegir carpeta y nombre; en el navegador va a Descargas. */
  const save = async () => {
    const text = JSON.stringify(makeBackup());
    if (!("__TAURI_INTERNALS__" in window)) {
      download(backupFileName(), text, "application/json");
      onDone?.("Copia de seguridad guardada en tu carpeta de Descargas.");
      return;
    }
    setSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string | null>("save_file", { name: backupFileName(), content: text });
      if (path) onDone?.(`Copia de seguridad guardada en ${path}`);
    } catch (e) {
      onDone?.(`No se pudo guardar la copia: ${String((e as Error)?.message ?? e)}`, true);
    } finally { setSaving(false); }
  };
  const pick = async (f?: File) => {
    if (!f) return;
    try { setPending({ ...parseBackup(await f.text()), name: f.name }); setConfirmReplace(false); }
    catch (e) { onDone?.((e as Error).message, true); }
  };
  const apply = (mode: "replace" | "merge") => {
    if (!pending) return;
    applyBackup(pending.backup, mode);
    onDone?.(mode === "replace" ? "Copia restaurada: la app está como en la copia." : "Copia sumada a lo que ya tenías.");
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setPending(null); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [pending]);

  const s = pending?.summary;
  return (
    <>
      <button className={`btn${small ? " btn-sm" : ""}`} onClick={save} disabled={saving}>{saving ? "Guardando…" : "Hacer copia de seguridad"}</button>
      <button className={`btn${small ? " btn-sm" : ""}`} onClick={() => file.current?.click()}>Restaurar copia</button>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      {pending && s && (
        <div className="overlay" onClick={() => setPending(null)} role="presentation">
          <div className="confirm" role="dialog" aria-modal="true" aria-labelledby="bk-t" onClick={(e) => e.stopPropagation()}>
            <h2 id="bk-t">Restaurar copia</h2>
            <p className="mono bk-file">{pending.name}{s.exportedAt ? ` · ${new Date(s.exportedAt).toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
            <ul className="bk-list">
              <li>{n(s.copies, "copia", "copias")} en {n(s.collections, "colección", "colecciones")}</li>
              {s.full ? (
                <>
                  <li>{n(s.decks, "mazo", "mazos")}</li>
                  <li>{n(s.saleLists, "lista de venta", "listas de venta")}{s.onSale ? ` (${n(s.onSale, "copia", "copias")})` : ""}</li>
                  <li>{n(s.images, "foto tuya", "fotos tuyas")} y tus ajustes</li>
                </>
              ) : <li className="muted">Copia antigua: solo trae cartas y colecciones.</li>}
            </ul>
            {confirmReplace ? (
              <>
                <p className="bk-warn">Todo lo que tienes ahora en la app se cambiará por lo de la copia. Lo que no esté en la copia se perderá.</p>
                <div className="confirm-actions">
                  <span style={{ flex: 1 }} />
                  <button className="btn" onClick={() => setConfirmReplace(false)}>Volver</button>
                  <button className="btn btn-danger-solid" onClick={() => apply("replace")}>Sí, reemplazar todo</button>
                </div>
              </>
            ) : (
              <>
                <p>¿Cómo la quieres restaurar?</p>
                <div className="bk-opts">
                  <button className="bk-opt" onClick={() => setConfirmReplace(true)}>
                    <b>Reemplazar todo</b><span>La app queda exactamente como en la copia. Úsalo al pasar a un PC nuevo o a una instalación nueva.</span>
                  </button>
                  <button className="bk-opt" onClick={() => apply("merge")}>
                    <b>Sumar a lo que tengo</b><span>Suma las cartas y añade colecciones, mazos, listas y fotos que no tengas. No cambia tus ajustes.</span>
                  </button>
                </div>
                <div className="confirm-actions"><span style={{ flex: 1 }} /><button className="btn" onClick={() => setPending(null)}>Cancelar</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
