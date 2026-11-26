import { ArrowRight, Bell, ChevronRight, MapPin, Plus } from "lucide-react";
import type { ActionNotification } from "../services/notificationService";
import { storeLabel } from "../services/storeLabel";
import type { Store } from "../types";

interface MobileStoreHomeProps {
  stores: Store[];
  storeId: string;
  onStoreChange: (storeId: string) => void;
  onStartSale?: () => void;
  notifications: ActionNotification[];
  onOpenTask: (item: ActionNotification) => void;
}

export default function MobileStoreHome({
  stores, storeId, onStoreChange, onStartSale, notifications, onOpenTask,
}: MobileStoreHomeProps) {
  return (
    <section aria-label="Accueil du magasin" className="mobile-surface mb-6 space-y-6 lg:hidden">
      <div className="rounded-2xl bg-emerald-950 p-5 text-emerald-50">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
          <MapPin className="size-4" aria-hidden="true" />
          <label htmlFor={stores.length > 1 ? "mobile-home-store" : undefined}>Magasin</label>
        </div>
        {stores.length > 1 ? (
          <select
            id="mobile-home-store"
            className="ui-select mt-2 min-h-11 w-full border-emerald-700 bg-emerald-900 text-base font-semibold text-emerald-50 focus-visible:outline-emerald-200"
            value={storeId}
            onChange={event => onStoreChange(event.target.value)}
          >
            <option value="">Tous les magasins</option>
            {stores.map(store => <option key={store.id} value={store.id}>{storeLabel(store)}</option>)}
          </select>
        ) : (
          <p className="mt-1 break-words text-xl font-semibold">{stores[0] ? storeLabel(stores[0]) : "Aucun magasin attribué"}</p>
        )}
        {onStartSale && (
          <button type="button" onClick={onStartSale} className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-left text-sm font-semibold text-emerald-950 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200">
            <Plus className="size-5 shrink-0" aria-hidden="true" />
            Nouvelle vente
            <ArrowRight className="ml-auto size-4 shrink-0" aria-hidden="true" />
          </button>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">À traiter</h2>
          {notifications.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900 shrink-0 tabular-nums">{notifications.length} en attente</span>
          )}
        </div>
        {notifications.length ? (
          <ul className="divide-y divide-mobile-border overflow-hidden rounded-xl border border-mobile-border bg-mobile-panel text-mobile-ink">
            {notifications.map(item => (
              <li key={item.id}>
                <button type="button" onClick={() => onOpenTask(item)} className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-mobile-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mobile-accent">
                  <span className="min-w-0 break-words">
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-mobile-ink/75">{item.detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-mobile-ink/65" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 rounded-xl border border-mobile-border bg-mobile-panel px-4 py-3 text-sm text-mobile-ink">
            <Bell className="size-4 shrink-0" aria-hidden="true" />
            Aucune action en attente.
          </p>
        )}
      </div>
    </section>
  );
}
