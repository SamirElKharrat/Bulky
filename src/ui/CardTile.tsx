import { memo, useState } from "react";
import type { Card } from "../core/types";
import { cardImage } from "../core/catalog";
import { useStore } from "../core/store";
import { Energy, Rarity, Rune, Runes } from "./icons";
import { eur, usePrice } from "../core/prices";

export const domainColor = (c: Card) => (c.domains[0] ? `var(--${c.domains[0]})` : undefined);

/** Imagen de la carta: la que haya subido el usuario o la oficial. */
export function useCardSrc(card: Card, w = 300): string | null {
  const custom = useStore((s) => s.cardImages[card.key]);
  return custom ?? cardImage(card, w);
}

export function CardFace({ card, w = 300 }: { card: Card; w?: number }) {
  const src = useCardSrc(card, w);
  if (src) return <img src={src} alt={card.name} loading="lazy" decoding="async" />;
  return (
    <div className="placeholder-face">
      {card.domains[0] ? <Rune d={card.domains[0]} size="lg" /> : <span className="tag">{card.set}</span>}
      <span>{card.name}</span>
      {card.player && <span className="mono">{card.player}</span>}
      <span className="hint">Sin imagen · ábrela para subir una</span>
    </div>
  );
}

export const CardTile = memo(function CardTile({ card, qty, onOpen }: { card: Card; qty: number; onOpen: (c: Card) => void }) {
  const price = usePrice(card.key);
  return (
    <button className={`card${qty ? "" : " missing"}${card.landscape ? " land" : ""}`} style={{ ["--c" as string]: domainColor(card) }} onClick={() => onOpen(card)} title={`${card.key} · ${card.name}`}>
      <div className="img">
        <CardFace card={card} w={card.landscape ? 420 : 300} />
        {qty > 0 && <span className="qty">×{qty}</span>}
      </div>
      <div className="info">
        <span className="nm">{card.name}</span>
        <span className="meta">
          <span>{card.key}</span>
          <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}><Runes ds={card.domains} /><Rarity r={card.rarity} /></span>
        </span>
        {price != null && <span className="meta"><span /><span className="price">{eur(price)}</span></span>}
      </div>
    </button>
  );
});

/** Nombre en modo lista: al pasar el ratón muestra la carta. */
export function HoverName({ card }: { card: Card }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const src = useCardSrc(card, 360);
  const move = (e: React.MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
  const w = card.landscape ? 360 : 250;
  const h = card.landscape ? 258 : 349;
  const left = pos ? Math.min(pos.x + 18, window.innerWidth - w - 12) : 0;
  const top = pos ? Math.max(12, Math.min(pos.y - h / 2, window.innerHeight - h - 12)) : 0;
  return (
    <span className="hover-name" onMouseEnter={move} onMouseMove={move} onMouseLeave={() => setPos(null)}>
      {card.name}
      {pos && src && <img className="hover-card" src={src} alt="" style={{ left, top, width: w, height: h }} />}
    </span>
  );
}

export function CardRowCells({ card }: { card: Card }) {
  return (
    <>
      <td className="n">{card.key}</td>
      <td><HoverName card={card} /></td>
      <td><Runes ds={card.domains} /></td>
      <td><Energy value={card.energy} /></td>
      <td className="n">{card.power ?? "–"}</td>
      <td className="n">{card.might ?? "–"}</td>
      <td><Rarity r={card.rarity} /></td>
    </>
  );
}
