import { useEffect, useState } from "react";
import type { Catalog } from "../core/catalog";
import { useStore, type Theme } from "../core/store";
import { PROFILES, canRefreshPrices, usePrices, useProfileStore } from "../core/prices";
import { COLL_COLORS } from "./CollectionDialog";
import { APP_VERSION, CHANGELOG, useUpdates } from "../core/updates";
import { openExternal } from "../core/news";
import { BackupControls } from "./BackupControls";

export type TextSize = "normal" | "large" | "xlarge";
export const TEXT_SIZES: { id: TextSize; label: string; zoom: number }[] = [
  { id: "normal", label: "Normal", zoom: 1 },
  { id: "large", label: "Grande", zoom: 1.12 },
  { id: "xlarge", label: "Muy grande", zoom: 1.25 },
];

/** Panel de ajustes que se abre desde la parte de abajo del menú. */
export function SettingsPanel({ cat, onClose }: { cat: Catalog | null; onClose: () => void }) {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const textSize = useStore((s) => s.textSize);
  const accent = useStore((s) => s.accent);
  const setAccent = useStore((s) => s.setAccent);
  const setTextSize = useStore((s) => s.setTextSize);
  const profile = useProfileStore((s) => s.profile);
  const setProfile = useProfileStore((s) => s.setProfile);
  const { createdAt, status, error, refresh, map } = usePrices();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [showLog, setShowLog] = useState(false);
  const [dataMsg, setDataMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const upd = useUpdates();
  const fmt = (d: string | number) => new Date(d).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="overlay" onClick={onClose} role="presentation">
    <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-t" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <h2 id="settings-t">Ajustes</h2>
        <button className="btn btn-quiet btn-sm close-x" onClick={onClose} aria-label="Cerrar ajustes">✕</button>
      </div>

      <section className="set-sec">
        <h3 className="lbl">Apariencia</h3>
        <div className="set-box">
          <div className="set-line">
            <span className="set-name">Tema</span>
            <div className="toggle" role="group" aria-label="Tema">
              {(["system", "light", "dark"] as Theme[]).map((t) => (
                <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t === "system" ? "Auto" : t === "light" ? "Claro" : "Oscuro"}</button>
              ))}
            </div>
          </div>
          <div className="set-line">
            <span className="set-name">Color</span>
            <div className="swatches sm" role="radiogroup" aria-label="Color de la app">
              {COLL_COLORS.map((c) => <button key={c} role="radio" aria-checked={accent === c} className={`sw${accent === c ? " on" : ""}`} style={{ background: c }} onClick={() => setAccent(c)} aria-label={`Color ${c}`} />)}
            </div>
          </div>
          <div className="set-line">
            <span className="set-name">Tamaño del texto</span>
            <div className="toggle" role="group" aria-label="Tamaño del texto">
              {TEXT_SIZES.map((t) => <button key={t.id} aria-pressed={textSize === t.id} onClick={() => setTextSize(t.id)}>{t.label}</button>)}
            </div>
          </div>
        </div>
      </section>

      <section className="set-sec">
        <h3 className="lbl">Precios de Cardmarket</h3>
        <div className="set-box">
          <div className="set-line">
            <span className="set-name">Precio que se muestra</span>
            <div className="toggle" role="group" aria-label="Precio de Cardmarket">
              {PROFILES.map((pr) => <button key={pr.id} aria-pressed={profile === pr.id} onClick={() => setProfile(pr.id)}>{pr.label}</button>)}
            </div>
          </div>
          <div className="set-line">
            <span className="set-name">Actualizados<small>{createdAt ? `${fmt(createdAt)} · ${map.size} cartas` : status === "loading" ? "Cargando…" : "Sin descargar"}</small></span>
            {canRefreshPrices()
              ? <button className="btn btn-sm" disabled={status === "updating" || !cat} onClick={() => cat && refresh(cat)}>{status === "updating" ? "Descargando…" : "Actualizar"}</button>
              : <small className="muted">Solo en la app de escritorio</small>}
          </div>
          {error && <p className="set-msg bad">{error}</p>}
        </div>
      </section>

      <section className="set-sec">
        <h3 className="lbl">Tus datos</h3>
        <div className="set-box">
          <div className="set-line">
            <span className="set-name">Copia de seguridad<small>Cartas, mazos, ventas, fotos y ajustes</small></span>
            <div className="row" style={{ gap: 6 }}><BackupControls small onDone={(text, bad) => setDataMsg({ text, bad })} /></div>
          </div>
          {dataMsg && <p className={`set-msg${dataMsg.bad ? " bad" : " ok"}`}>{dataMsg.text}</p>}
        </div>
      </section>

      <section className="set-sec">
        <h3 className="lbl">Acerca de</h3>
        <div className="set-box">
          <div className="set-line">
            <span className="set-name">Bulky {APP_VERSION}<small>{cat ? `Catálogo de ${cat.cards.length} cartas · ${new Date(cat.fetchedAt).toLocaleDateString("es-ES")}` : ""}</small></span>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={() => setShowLog(true)}>Novedades</button>
              <button className="btn btn-sm" onClick={upd.check} disabled={upd.status === "checking"}>{upd.status === "checking" ? "Buscando…" : "Buscar actualizaciones"}</button>
            </div>
          </div>
          {upd.status === "latest" && <p className="set-msg ok">Tienes la última versión.</p>}
          {upd.status === "error" && upd.error && <p className="set-msg">{upd.error}</p>}
          {upd.status === "available" && upd.info && (
            <div className="set-line set-new">
              <span className="set-name">Hay una versión nueva: {upd.info.version}</span>
              <button className="btn btn-sm btn-primary" onClick={() => openExternal(upd.info!.url).catch(() => undefined)}>Descargar</button>
            </div>
          )}
        </div>
      </section>
      {showLog && <ChangelogDialog onClose={() => setShowLog(false)} />}
    </div>
    </div>
  );
}

/** Ventana con la lista de cambios de cada versión. */
function ChangelogDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="confirm changelog" role="dialog" aria-modal="true" aria-labelledby="log-t" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="log-t">Novedades</h2>
          <button className="btn btn-quiet btn-sm close-x" onClick={onClose} aria-label="Cerrar novedades">✕</button>
        </div>
        {CHANGELOG.map((v) => (
          <div key={v.version} className="log-ver">
            <span className="log-tag mono">{v.version}{v.version === APP_VERSION ? " · tu versión" : ""}</span>
            <ul>{v.items.map((it) => <li key={it}>{it}</li>)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}
