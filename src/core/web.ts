/** Web pública de Bulky (Vercel): landing y páginas de listas de venta. */
export const WEB_URL = "https://bulky-rouge.vercel.app";

/** Repositorio de GitHub ("usuario/repositorio"). */
export const GITHUB_REPO = "SamirElKharrat/Bulky";

/** Página de la última versión publicada (instalador de Windows). */
export const DOWNLOAD_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

/** Enlace público de una lista de venta. */
export const shareUrl = (code: string) => `${WEB_URL}/lista#${code}`;

/** ¿Se está usando en un Mac? (para mostrar ⌘ en vez de Ctrl en los atajos). */
export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** Atajo para abrir Buscar, escrito como se ve en el teclado de cada sistema. */
export const SEARCH_SHORTCUT = IS_MAC ? "⌘F" : "Ctrl F";
