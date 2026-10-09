import { Article, MovementDirection, Sale, StockMovement, StockTransfer, Store } from "../types";

export interface LedgerEntry {
  id: string;
  date: number;
  change: number;
  cause: string;
  reference: string;
  operator: string;
  balanceAfter: number;
}

export interface LedgerBlock {
  key: string;
  articleName: string;
  articleCode: string;
  unit: string;
  storeName: string;
  before: number;
  after: number;
  totalIn: number;
  totalOut: number;
  firstDate: number;
  lastDate: number;
  entries: LedgerEntry[];
}

export interface LedgerLookups {
  getArticle: (id: string) => Article | undefined;
  getStore: (id: string) => Store | undefined;
  transfers: StockTransfer[];
  sales: Sale[];
}

export function describeMovementCause(movement: StockMovement, lookups: LedgerLookups): string {
  const isEntry = movement.quantity > 0;
  const storeLabel = (storeId: string) => {
    const store = lookups.getStore(storeId);
    return store ? store.name + " (" + store.store_type + ")" : storeId;
  };
  switch (movement.reference_type) {
    case "TRANSFER": {
      const transfer = lookups.transfers.find(item => item.id === movement.reference_id);
      if (!transfer) return isEntry ? "Transfert reçu" : "Transfert envoyé";
      return isEntry
        ? "Transfert reçu de " + storeLabel(transfer.source_store_id)
        : "Transfert envoyé à " + storeLabel(transfer.destination_store_id);
    }
    case "SALE": {
      const customer = lookups.sales.find(item => item.id === movement.reference_id)?.customer_name;
      const label = isEntry ? "Annulation de vente" : "Vente";
      return customer ? label + " · " + customer : label;
    }
    case "PRODUCTION":
      return isEntry ? "Production" : "Consommation";
    case "PURCHASE":
    case "RECEPTION_FOURNISSEUR":
      return "Achat fournisseur";
    case "STOCK_DEPOSIT":
      return "Dépôt de stock";
    case "INITIAL_STOCK_IMPORT":
      return "Stock initial";
    case "INVENTORY_ADJUSTMENT":
      return isEntry ? "Ajustement (+)" : "Ajustement (−)";
    default:
      return movement.movement_type;
  }
}

// One block per store/article: opening balance, every change in chronological order, closing balance.
// `movements` must not be pre-filtered by direction, otherwise the opening/closing balances would be wrong.
export function buildStockLedger(
  movements: StockMovement[],
  lookups: LedgerLookups,
  direction: MovementDirection = "ALL"
): LedgerBlock[] {
  const groups = new Map<string, StockMovement[]>();
  [...movements]
    .sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id))
    .forEach(movement => {
      const key = `${movement.store_id}::${movement.article_id}`;
      const group = groups.get(key);
      if (group) group.push(movement); else groups.set(key, [movement]);
    });

  const blocks: LedgerBlock[] = [];
  groups.forEach((group, key) => {
    const article = lookups.getArticle(group[0].article_id);
    const visible = group.filter(movement =>
      direction === "ALL" || (direction === "IN" ? movement.quantity > 0 : movement.quantity < 0));
    if (visible.length === 0) return;
    blocks.push({
      key,
      articleName: article?.name || group[0].article_id,
      articleCode: article?.code || "",
      unit: article?.unit || "",
      storeName: lookups.getStore(group[0].store_id)?.name || group[0].store_id,
      before: group[0].before_quantity,
      after: group[group.length - 1].after_quantity,
      totalIn: visible.filter(movement => movement.quantity > 0).reduce((total, movement) => total + movement.quantity, 0),
      totalOut: visible.filter(movement => movement.quantity < 0).reduce((total, movement) => total + movement.quantity, 0),
      firstDate: group[0].created_at,
      lastDate: group[group.length - 1].created_at,
      entries: visible.map(movement => ({
        id: movement.id,
        date: movement.created_at,
        change: movement.quantity,
        cause: describeMovementCause(movement, lookups),
        reference: movement.reference_number,
        operator: movement.created_by_name,
        balanceAfter: movement.after_quantity
      }))
    });
  });

  return blocks.sort((a, b) => a.articleName.localeCompare(b.articleName, "fr-FR") || a.storeName.localeCompare(b.storeName, "fr-FR"));
}

export const formatSignedQuantity = (quantity: number) => quantity > 0 ? `+${quantity}` : String(quantity);
