import { useId, useState } from "react";
import type { Store } from "../types";
import { storeLabel } from "../services/storeLabel";

function readRecent(key: string): string[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(values) ? values.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

export default function ShopSwitcher({ stores, userId, storeId, onChange }: {
  stores: Store[];
  userId: string;
  storeId: string;
  onChange: (id: string) => void;
}) {
  const key = "possafidy-recent-stores:" + userId;
  const id = useId();
  const [localRecent, setLocalRecent] = useState<{ key: string; ids: string[] }>();
  const recent = localRecent?.key === key ? localRecent.ids : readRecent(key);
  const recentStores = recent.flatMap(id => stores.filter(store => store.id === id));
  const remaining = stores.filter(store => !recent.includes(store.id));
  const options = (items: Store[]) => items.map(store => <option key={store.id} value={store.id}>{storeLabel(store)}</option>);

  function select(next: string) {
    if (next) {
      const ids = [next, ...recent.filter(item => item !== next)].slice(0, 3);
      setLocalRecent({ key, ids });
      try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Keep this session's choices. */ }
    }
    onChange(next);
  }

  return (
    <label htmlFor={id} className="grid w-full gap-1.5 text-sm font-medium sm:w-auto">
      Magasin
      <select id={id} className="ui-select min-h-11 w-full rounded-[10px] sm:min-w-56" value={storeId} onChange={event => select(event.target.value)}>
        <option value="">Tous les magasins accessibles</option>
        {recentStores.length > 0 && <optgroup label="Magasins récents">{options(recentStores)}</optgroup>}
        {remaining.length > 0 && <optgroup label={recentStores.length ? "Autres magasins" : "Magasins"}>{options(remaining)}</optgroup>}
      </select>
    </label>
  );
}
