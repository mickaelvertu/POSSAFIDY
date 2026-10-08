import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface StoreDropdownOption {
  id: string;
  name: string;
  store_type: string;
}

interface StoreDropdownProps {
  value: string;
  stores: StoreDropdownOption[];
  onChange: (storeId: string) => void;
}

// Custom dropdown instead of a native <select>: the native popup is dismissed by the browser
// whenever the page re-renders or re-lays out (data refresh, auth sync), which made it unusable at random.
export default function StoreDropdown({ value, stores, onChange }: StoreDropdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = stores.find(store => store.id === value);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [isOpen]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return stores;
    return stores.filter(store => `${store.name} ${store.store_type}`.toLowerCase().includes(normalized));
  }, [stores, query]);

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };

  const choose = (storeId: string) => {
    onChange(storeId);
    close();
  };

  return (
    <div
      ref={containerRef}
      className="relative mt-1.5"
      onKeyDown={event => {
        if (event.key === "Escape") close();
      }}
    >
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white p-3 text-left text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500"
      >
        <span className="truncate">{selected ? `${selected.name} (${selected.store_type})` : "Choisir un magasin"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (filtered[0]) choose(filtered[0].id);
                }
              }}
              placeholder="Rechercher un magasin..."
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              aria-label="Rechercher un magasin"
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {filtered.map(store => (
              <li key={store.id} role="option" aria-selected={store.id === value}>
                <button
                  type="button"
                  onClick={() => choose(store.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50 ${store.id === value ? "bg-emerald-50 font-bold text-emerald-700" : "font-semibold text-slate-800"}`}
                >
                  <span className="truncate">{store.name} <span className="text-[10px] font-medium text-slate-400">({store.store_type})</span></span>
                  {store.id === value && <Check className="h-4 w-4 shrink-0" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-xs italic text-slate-400">Aucun magasin trouvé</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
