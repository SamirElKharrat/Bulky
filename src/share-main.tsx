// Página pública de una lista de venta. Se publica sola (share.html) en cualquier alojamiento estático gratuito.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { decodeShare, type SharePayload } from "./core/sales";
import { SharePage } from "./ui/SharePage";
import "./styles.css";

function ShareApp() {
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const code = location.hash.replace(/^#/, "");
      if (!code) { setError("Este enlace no contiene ninguna lista."); return; }
      decodeShare(code).then((d) => { setData(d); document.title = `${d.n} · Lista de venta`; }).catch(() => setError("No se pudo leer la lista. Comprueba que el enlace está completo."));
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return (
    <div className="share-shell">
      {error ? <div className="notice bad">{error}</div> : data ? <SharePage data={data} /> : <span className="muted">Cargando lista…</span>}
      <p className="share-credit">Hecho con Bulky · proyecto de fans, sin relación con Riot Games</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><ShareApp /></StrictMode>);
