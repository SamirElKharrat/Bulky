// Compila la web pública para Vercel (carpeta dist-web):
//   /        landing
//   /lista   página de las listas de venta (share.html)
// La app de escritorio no se publica en la web.
// Uso: npm run build:web
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

run("node scripts/web-cards.mjs");
run("npx tsc --noEmit");
run("npx vite build --config vite.web.config.ts");
