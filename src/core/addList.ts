import { create } from "zustand";
import type { Card, Lang } from "./types";
import { entryKey, useStore } from "./store";

/** Lista de "Añadir cartas" que aún no se ha guardado en ninguna colección. */
export interface AddItem { card: Card; lang: Lang; foil: boolean; qty: number }

interface AddListState {
  list: AddItem[];
  setList: (f: AddItem[] | ((l: AddItem[]) => AddItem[])) => void;
}

export const useAddList = create<AddListState>()((set) => ({
  list: [],
  setList: (f) => set((s) => ({ list: typeof f === "function" ? f(s.list) : f })),
}));

/** Guarda toda la lista en una colección y la vacía. Devuelve el texto del aviso. */
export function saveAddList(coll: string): string {
  const { list } = useAddList.getState();
  const st = useStore.getState();
  const total = list.reduce((a, it) => a + it.qty, 0);
  st.addMany(list.map((it) => ({ key: entryKey(it.card.key, it.lang, it.foil, coll), qty: it.qty })));
  st.setLastCollection(coll);
  useAddList.setState({ list: [] });
  const name = st.collections.find((c) => c.id === coll)?.name ?? "tu colección";
  return `${total === 1 ? "Añadida 1 copia" : `Añadidas ${total} copias`} de ${list.length === 1 ? "1 carta" : `${list.length} cartas`} a ${name}.`;
}
