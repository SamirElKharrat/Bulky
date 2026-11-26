import type { Domain } from "../core/types";

export const DOMAIN_ES: Record<Domain, string> = { fury: "Furia", calm: "Calma", mind: "Mente", body: "Cuerpo", chaos: "Caos", order: "Orden" };
export const TYPE_ES: Record<string, string> = { unit: "Unidad", spell: "Hechizo", gear: "Equipo", legend: "Leyenda", battlefield: "Campo de batalla", rune: "Runa", token: "Ficha" };
export const RARITY_ES: Record<string, string> = { common: "Común", uncommon: "Infrecuente", rare: "Rara", epic: "Épica", showcase: "Showcase", promo: "Promo" };
export const VARIANT_ES: Record<string, string> = { normal: "Normal", alt: "Alt art", overnumbered: "Overnumbered", signature: "Firmada", showcase: "Showcase", rune: "Runa", special: "Especial" };

export function Rune({ d, size = "" }: { d: Domain; size?: "" | "sm" | "lg" }) {
  return <img className={`rune ${size}`} src={`/assets/icons/glyph-rune_${d}.svg`} alt={DOMAIN_ES[d]} title={DOMAIN_ES[d]} />;
}

export function Runes({ ds, size = "sm" }: { ds: Domain[]; size?: "" | "sm" | "lg" }) {
  return <span className="row" style={{ gap: 2, flexWrap: "nowrap" }}>{ds.map((d) => <Rune key={d} d={d} size={size} />)}</span>;
}

export function Might({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <span className="row" style={{ gap: 3, flexWrap: "nowrap" }} title="Fuerza">
      <span className="mi" style={{ ["--m" as string]: "url(/assets/icons/glyph-might.svg)" }} />{value}
    </span>
  );
}

export function Energy({ value }: { value: number | null }) {
  return value == null ? null : <span className="energy" title="Energía">{value}</span>;
}

export function Power({ value, d }: { value: number | null; d?: Domain }) {
  if (!value || !d) return null;
  return <span className="row" style={{ gap: 1, flexWrap: "nowrap" }} title="Poder">{Array.from({ length: value }, (_, i) => <Rune key={i} d={d} size="sm" />)}</span>;
}

export function Rarity({ r }: { r: string | null }) {
  if (!r || !RARITY_ES[r] || r === "promo") return null;
  return <img className="rar" src={`/assets/icons/rarity-${r}.png`} alt={RARITY_ES[r]} title={RARITY_ES[r]} />;
}

const decode = (s: string) => s.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

/** Pinta un trozo de texto cambiando los símbolos del juego por iconos. */
function inline(s: string, k: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /:rb_energy_(\d+):|:rb_rune_(\w+?):|:rb_might:|:rb_exhaust:|\[(>>?)\]|\[([^\]]+)\]/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    const key = `${k}-${i++}`;
    if (m[1] != null) out.push(<span key={key} className="ct-energy" title="Energía">{m[1]}</span>);
    else if (m[2] != null) out.push(<img key={key} className="ct-rune" src={`/assets/icons/glyph-rune_${m[2]}.svg`} alt={m[2] === "rainbow" ? "Runa cualquiera" : DOMAIN_ES[m[2] as Domain] ?? m[2]} title={m[2] === "rainbow" ? "Runa de cualquier dominio" : DOMAIN_ES[m[2] as Domain] ?? m[2]} />);
    else if (m[0] === ":rb_might:") out.push(<span key={key} className="mi ct-ico" style={{ ["--m" as string]: "url(/assets/icons/glyph-might.svg)" }} title="Fuerza" />);
    else if (m[0] === ":rb_exhaust:") out.push(<span key={key} className="mi ct-ico" style={{ ["--m" as string]: "url(/assets/icons/glyph-exhaust.svg)" }} title="Agotar" />);
    else if (m[3]) out.push(<span key={key} className="ct-arrow">{m[3] === ">" ? "→" : "⇒"}</span>);
    else if (m[4] && m[4] !== "NO TEXT") out.push(<span key={key} className="ct-kw">{m[4]}</span>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Texto de reglas de una carta con iconos de energía, runas, fuerza y palabras clave. El texto entre paréntesis va en cursiva. */
export function CardText({ text }: { text: string }) {
  const lines = decode(text).split(/\n+/).filter((l) => l.trim());
  return (
    <div className="ct">
      {lines.map((line, li) => (
        <p key={li}>
          {line.split(/(\([^)]*\))/g).filter(Boolean).map((part, pi) =>
            part.startsWith("(") ? <i key={pi} className="ct-rem">{inline(part, `${li}-${pi}`)}</i> : <span key={pi}>{inline(part, `${li}-${pi}`)}</span>)}
        </p>
      ))}
    </div>
  );
}

/** Logo de Bulky (Gromp). Toma el color del texto, así sirve en tema claro y oscuro. */
export function BulkyLogo({ size = 26 }: { size?: number }) {
  return (
    <svg className="bulky-logo" width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      <g fill="currentColor">
        <path d="M26 164C26 112 70 98 128 98s102 14 102 66c0 42-40 60-102 60S26 206 26 164Z" />
        <circle cx="80" cy="96" r="38" /><circle cx="176" cy="96" r="38" />
        <path d="M40 214c4-14 30-18 46-8l6 14H34Z" /><path d="M216 214c-4-14-30-18-46-8l-6 14h58Z" />
      </g>
      <g fill="var(--surface)">
        <circle cx="80" cy="94" r="22" /><circle cx="176" cy="94" r="22" />
      </g>
      <circle cx="84" cy="96" r="10" fill="currentColor" /><circle cx="172" cy="96" r="10" fill="currentColor" />
      <circle cx="88" cy="92" r="3.2" fill="var(--surface)" /><circle cx="176" cy="92" r="3.2" fill="var(--surface)" />
      <path d="M46 156q8 6 16 4q66 34 132 0q8 2 16-4" fill="none" stroke="var(--surface)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
