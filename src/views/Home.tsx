import { useMemo } from "react";
import type { Catalog } from "../core/catalog";
import { ownedByCard, parseEntryKey, useStore } from "../core/store";
import { priceOf, usePriceProfile, usePrices } from "../core/prices";
import { Cover } from "../ui/Cover";

export function Home({ cat, openSet }: { cat: Catalog; openSet: (id: string) => void }) {
  const entries = useStore((s) => s.entries);
  const priceMap = usePrices((s) => s.map);
  const profile = usePriceProfile();
  /** Valor de lo que tienes de cada expansión. */
  const values = useMemo(() => {
    const m = new Map<string, number>();
    for (const [k, q] of Object.entries(entries)) {
      const { cardKey, foil } = parseEntryKey(k);
      const c = cat.byKey.get(cardKey);
      if (c) m.set(c.set, (m.get(c.set) ?? 0) + (priceOf(priceMap.get(cardKey), profile, foil) ?? 0) * q);
    }
    return m;
  }, [entries, cat, priceMap, profile]);
  const progress = useMemo(() => {
    const owned = ownedByCard(entries);
    const res = new Map<string, { distinct: number; copies: number }>();
    for (const [set, cards] of cat.bySet) {
      let distinct = 0, copies = 0;
      for (const c of cards) {
        const q = owned.get(c.key) ?? 0;
        copies += q;
        if (q && (c.variant === "normal" || c.variant === "special")) distinct++;
      }
      res.set(set, { distinct, copies });
    }
    return res;
  }, [cat, entries]);

  const cover = (s: (typeof cat.sets)[number]) => {
    const p = progress.get(s.id) ?? { distinct: 0, copies: 0 };
    return <Cover key={s.id} set={s} owned={p.distinct} copies={p.copies} value={priceMap.size ? values.get(s.id) ?? 0 : null} onOpen={() => openSet(s.id)} />;
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Expansiones</h1>
          <p>Abre una carpeta para ver sus cartas. Pasa el ratón por una tapa y pulsa "Cambiar foto" para poner tu propia imagen.</p>
        </div>
      </div>
      <div className="covers">{cat.sets.map(cover)}</div>
      <h2>Ediciones especiales</h2>
      <div className="covers">{cat.specials.map(cover)}</div>
    </div>
  );
}
