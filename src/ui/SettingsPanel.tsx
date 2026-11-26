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

  return (
    <div className="overlay" onClick={onClose} role="presentation">
    <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-t" onClick={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <h2 id="settings-t">Ajustes</h2>
        <button className="btn btn-quiet btn-sm close-x" onClick={onClose} aria-label="Cerrar ajustes">✕</button>
      </div>
      <div className="set-row">
        <span className="lbl">Tema</span>
        <div className="toggle" role="group" aria-label="Tema">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t === "system" ? "Auto" : t === "light" ? "Claro" : "Oscuro"}</button>
          ))}
        </div>
      </div>
      <div className="set-row">
        <span className="lbl">Color de la app</span>
        <div className="swatches" role="radiogroup" aria-label="Color de la app">
          {COLL_COLORS.map((c) => <button key={c} role="radio" aria-checked={accent === c} className={`sw${accent === c ? " on" : ""}`} style={{ background: c }} onClick={() => setAccent(c)} aria-label={`Color ${c}`} />)}
        </div>
      </div>
      <div className="set-row">
        <span className="lbl">Tamaño del texto</span>
        <div className="toggle" role="group" aria-label="Tamaño del texto">
          {TEXT_SIZES.map((s) => <button key={s.id} aria-pressed={textSize === s.id} onClick={() => setTextSize(s.id)}>{s.label}</button>)}
        </div>
      </div>
      <div className="set-row">
        <span className="lbl">Precio de Cardmarket</span>
        <div className="toggle" role="group" aria-label="Precio de Cardmarket">
          {PROFILES.map((p) => <button key={p.id} aria-pressed={profile === p.id} onClick={() => setProfile(p.id)}>{p.label}</button>)}
        </div>
      </div>
      <div className="set-row">
        <span className="lbl">Precios</span>
        <span className="hint">
          {createdAt ? `Del ${new Date(createdAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : status === "loading" ? "Cargando…" : "Sin descargar"}
          {map.size ? ` · ${map.size} cartas con precio` : ""}
        </span>
        {canRefreshPrices() ? (
          <button className="btn btn-sm btn-primary" disabled={status === "updating" || !cat} onClick={() => cat && refresh(cat)}>
            {status === "updating" ? "Descargando…" : "Actualizar precios"}
          </button>
        ) : <span className="hint">Para actualizarlos aquí, usa la app de escritorio.</span>}
        {error && <span className="hint" style={{ color: "var(--bad)" }}>{error}</span>}
      </div>
      {cat && <span className="hint">Catálogo: {cat.cards.length} cartas · {new Date(cat.fetchedAt).toLocaleDateString("es-ES")}</span>}
      <DataSection />
      <UpdatesSection />
    </div>
    </div>
  );
}

/** Versión instalada, buscar una nueva y lista de cambios. */
function UpdatesSection() {
  const { status, info, error, check } = useUpdates();
  const [showAll, setShowAll] = useState(false);
  const log = showAll ? CHANGELOG : CHANGELOG.slice(0, 1);
  return (
    <div className="set-row set-updates">
      <span className="lbl">Actualizaciones</span>
      <div className="upd-head">
        <span>Tienes la versión <b className="mono">{APP_VERSION}</b></span>
        <button className="btn btn-sm" onClick={check} disabled={status === "checking"}>{status === "checking" ? "Buscando…" : "Buscar actualizaciones"}</button>
      </div>
      {status === "latest" && <span className="hint upd-ok">Tienes la última versión.</span>}
      {status === "error" && error && <span className="hint">{error}</span>}
      {status === "available" && info && (
        <div className="upd-new">
          <b>Nueva versión {info.version} disponible</b>
          {info.notes && <span className="upd-notes">{info.notes.replace(/[#*`]/g, "").trim()}</span>}
          <button className="btn btn-sm btn-primary" onClick={() => openExternal(info.url).catch(() => undefined)}>Descargar</button>
        </div>
      )}
      <div className="upd-log">
        {log.map((v) => (
          <div key={v.version}>
            <span className="upd-v">Novedades de la {v.version}{v.version === APP_VERSION ? " · la tuya" : ""}</span>
            <ul>{v.items.map((it) => <li key={it}>{it}</li>)}</ul>
          </div>
        ))}
        {CHANGELOG.length > 1 && <button className="s-link" onClick={() => setShowAll(!showAll)}>{showAll ? "Ver menos" : "Ver versiones anteriores"}</button>}
      </div>
    </div>
  );
}

/** Copia de seguridad completa: cartas, colecciones, mazos, listas de venta, fotos y ajustes. */
function DataSection() {
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  return (
    <div className="set-row set-updates">
      <span className="lbl">Tus datos</span>
      <span className="hint">La copia lo guarda todo: cartas, colecciones, mazos, listas de venta, tus fotos y tus ajustes. Al hacerla eliges dónde guardarla.</span>
      <div className="row"><BackupControls small onDone={(text, bad) => setMsg({ text, bad })} /></div>
      {msg && <span className="hint" style={{ color: msg.bad ? "var(--bad)" : "var(--ok)" }}>{msg.text}</span>}
    </div>
  );
}
