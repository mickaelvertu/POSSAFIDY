import { useMemo } from "react";
import { ArrowRight, BarChart3, Boxes, Truck } from "lucide-react";
import type { Article, Sale, StockTransfer, Store, StoreStock } from "../types";
import { isInboundRestock } from "../services/restockPriority";
import ShopSwitcher from "./ShopSwitcher";
import { storeLabel } from "../services/storeLabel";

interface OverviewProps {
  stores: Store[];
  sales: Sale[];
  stocks: StoreStock[];
  articles: Article[];
  transfers: StockTransfer[];
  userId: string;
  selection: string;
  onShopChange: (id: string) => void;
  serverDocuments: number;
  onOpen: (module: "sales" | "stocks" | "transfers") => void;
}

const dayMs = 86_400_000;
const businessOffsetMs = 3 * 60 * 60 * 1000;
const businessDay = (timestamp: number) => Math.floor((timestamp + businessOffsetMs) / dayMs);
const dayLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric" });
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const stages = [
  { label: "À approuver", statuses: ["DRAFT"] },
  { label: "À expédier", statuses: ["APPROVED"] },
  { label: "En acheminement", statuses: ["SHIPPED", "IN_TRANSIT"] },
  { label: "À valider", statuses: ["RECEIVED"] },
  { label: "Avec écart", statuses: ["DISCREPANCY"] },
];

export default function OverviewView({ stores, sales, stocks, articles, transfers, userId, selection, onShopChange, serverDocuments, onOpen }: OverviewProps) {
  const sortedStores = useMemo(() => [...stores].sort((a, b) => a.name.localeCompare(b.name, "fr")), [stores]);
  const storeId = sortedStores.some(store => store.id === selection) ? selection : "";
  const today = businessDay(Date.now());

  const { days, bestProducts, alerts, pipeline } = useMemo(() => {
    const firstDay = today - 6;
    const days = Array.from({ length: 7 }, (_, index) => {
      const key = firstDay + index;
      return { key, label: dayLabel.format(key * dayMs - businessOffsetMs), total: 0, count: 0 };
    });
    const products = new Map<string, { id: string; name: string; quantity: number }>();
    for (const sale of sales) {
      if (sale.status !== "VALIDATED" || (storeId && sale.store_id !== storeId) || !Number.isFinite(sale.created_at)) continue;
      const day = days[businessDay(sale.created_at) - firstDay];
      if (!day) continue;
      day.total += sale.total;
      day.count++;
      for (const line of sale.lines) {
        if (line.line_type === "SERVICE") continue;
        const product = products.get(line.article_id) ?? { id: line.article_id, name: line.article_name, quantity: 0 };
        product.quantity += line.quantity;
        products.set(product.id, product);
      }
    }

    const activeArticles = new Map(articles.filter(article => article.is_active).map(article => [article.id, article]));
    const activeStores = new Map(stores.filter(store => store.is_active).map(store => [store.id, store]));
    const alerts = stocks.flatMap(stock => {
      const article = activeArticles.get(stock.article_id);
      const store = activeStores.get(stock.store_id);
      if (!article || !store || (storeId && stock.store_id !== storeId)) return [];
      const quantity = Math.max(0, stock.quantity - (stock.reserved_quantity ?? 0));
      const threshold = article.min_alert_stock ?? 10;
      return quantity <= 0 || quantity <= threshold ? [{ id: stock.id, article, store, quantity }] : [];
    }).sort((a, b) => a.quantity - b.quantity || a.article.name.localeCompare(b.article.name, "fr"));

    const transferCounts = new Map<string, number>();
    for (const transfer of transfers) {
      if (storeId && transfer.destination_store_id !== storeId) continue;
      if (!isInboundRestock(transfer)) continue;
      if (transfer.status === "DISCREPANCY" && transfer.discrepancy_resolved) continue;
      transferCounts.set(transfer.status, (transferCounts.get(transfer.status) ?? 0) + 1);
    }

    return {
      days,
      alerts,
      bestProducts: [...products.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "fr")).slice(0, 5),
      pipeline: stages.map(stage => ({
        label: stage.label,
        count: stage.statuses.reduce((sum, status) => sum + (transferCounts.get(status) ?? 0), 0),
      })),
    };
  }, [articles, sales, stocks, storeId, stores, today, transfers]);

  const weekTotal = days.reduce((sum, day) => sum + day.total, 0);
  const weekCount = days.reduce((sum, day) => sum + day.count, 0);
  const largestDay = Math.max(1, ...days.map(day => day.total));
  const panel = "rounded-[14px] border border-[var(--theme-border)] bg-[var(--theme-panel)] p-4 sm:p-5";

  return (
    <section aria-labelledby="overview-title" className="treasury-shell space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="overview-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Vue d’ensemble</h1>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">Ventes, stocks et réapprovisionnements par magasin.</p>
        </div>
        <ShopSwitcher stores={sortedStores} userId={userId} storeId={storeId} onChange={onShopChange} />
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={panel}>
          <h2 className="flex items-center gap-2 font-semibold"><BarChart3 size={18} aria-hidden="true" /> Ventes validées</h2>
          <p className="mt-2 text-2xl font-bold tabular-nums">{number.format(weekTotal)} Ar</p>
          <p className="mb-4 text-sm text-[var(--theme-muted)]">{number.format(weekCount)} vente(s) sur les 7 derniers jours</p>
          <ul className="space-y-2.5 text-sm tabular-nums">
            {days.map(day => (
              <li key={day.key} className="grid grid-cols-[4rem_minmax(0,1fr)_8rem] items-center gap-2">
                <span className="text-[var(--theme-muted)]">{day.label}</span>
                <span aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[var(--theme-hover)]">
                  <span className="block h-full rounded-full bg-[var(--theme-accent)]" style={{ width: Math.max(0, day.total) / largestDay * 100 + "%" }} />
                </span>
                <span className="text-right">{number.format(day.total)} Ar</span>
              </li>
            ))}
          </ul>
          <button type="button" className="ui-btn ui-btn-ghost mt-4 min-h-11 gap-2" onClick={() => onOpen("sales")}>Ouvrir les ventes <ArrowRight size={16} aria-hidden="true" /></button>
        </section>

        <section className={panel}>
          <h2 className="font-semibold">Produits les plus vendus</h2>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">Quantités sur les 7 derniers jours</p>
          {bestProducts.length ? (
            <ol className="mt-3 divide-y divide-[var(--theme-line)] text-sm">
              {bestProducts.map(product => (
                <li key={product.id} className="flex justify-between gap-3 py-2.5">
                  <span className="min-w-0 break-words">{product.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{number.format(product.quantity)}</span>
                </li>
              ))}
            </ol>
          ) : <p className="mt-4 text-sm text-[var(--theme-muted)]">Aucun produit vendu sur cette période.</p>}
        </section>

        <section className={panel}>
          <h2 className="flex items-center gap-2 font-semibold"><Boxes size={18} aria-hidden="true" /> Alertes de stock</h2>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">{number.format(alerts.length)} alerte(s) sur le stock disponible enregistré{alerts.length > 6 ? " · 6 affichées" : ""}</p>
          {alerts.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--theme-line)] text-sm">
              {alerts.slice(0, 6).map(({ id, article, store, quantity }) => (
                <li key={id} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0 break-words font-medium">{article.name}<span className="block text-xs font-normal text-[var(--theme-muted)]">{storeLabel(store)}</span></span>
                  <span className="shrink-0 text-right tabular-nums">{quantity <= 0 ? "Rupture" : number.format(quantity) + " " + article.unit}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="ui-btn ui-btn-ghost mt-4 min-h-11 gap-2" onClick={() => onOpen("stocks")}>Ouvrir les stocks <ArrowRight size={16} aria-hidden="true" /></button>
        </section>

        <section className={panel}>
          <h2 className="flex items-center gap-2 font-semibold"><Truck size={18} aria-hidden="true" /> Réapprovisionnements</h2>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">Transferts entrants ouverts par étape</p>
          <dl className="mt-3 divide-y divide-[var(--theme-line)] text-sm">
            {pipeline.map(stage => <div key={stage.label} className="flex justify-between gap-3 py-2.5"><dt>{stage.label}</dt><dd className="font-semibold tabular-nums">{stage.count}</dd></div>)}
          </dl>
          <button type="button" className="ui-btn ui-btn-ghost mt-4 min-h-11 gap-2" onClick={() => onOpen("transfers")}>Ouvrir les transferts <ArrowRight size={16} aria-hidden="true" /></button>
        </section>
      </div>
      <details className="text-sm text-[var(--theme-muted)]">
        <summary className="cursor-pointer">Mesure des lectures</summary>
        <p className="mt-2">{number.format(serverDocuments)} document(s) reçus ou modifiés dans les instantanés serveur des cinq sources depuis la connexion. Ce compteur ne correspond pas à la facturation Firestore.</p>
        <p className="mt-1">Ouvrir cette page ou changer de magasin ne lance aucune requête supplémentaire.</p>
      </details>
    </section>
  );
}
