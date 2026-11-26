import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";

// Puerto fijo para que Tauri sepa dónde encontrar la interfaz en desarrollo.
export default defineConfig({
  plugins: [react()],
  // Versión de la app (sale en Ajustes y sirve para buscar actualizaciones).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  // Solo la app de escritorio. La web pública (landing y listas de venta) se compila con vite.web.config.ts.
});
