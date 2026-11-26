import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import pkg from "./package.json";

// Web pública (Vercel): solo la landing (index.html) y la página de listas de venta (share.html).
// La app de escritorio no se incluye aquí.
export default defineConfig({
  root: resolve(__dirname, "web"),
  publicDir: resolve(__dirname, "web/public"),
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { port: 5174, strictPort: true },
  build: {
    outDir: resolve(__dirname, "dist-web"),
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(__dirname, "web/index.html"), share: resolve(__dirname, "web/share.html") } },
  },
});
