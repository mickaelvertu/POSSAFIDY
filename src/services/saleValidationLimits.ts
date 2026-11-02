import type { Sale, Store } from "../types";

// Seven catalog reads plus profile/store/sale fit the per-document rules budget.
// Up to 15 shared checks keep a 100-product stock commit within its read budget.
export const SALE_CATALOG_CHECK_SIZE = 7;
export const MAX_SHOP_SALE_ARTICLES = 100;

export function assertSaleValidationSize(sale: Pick<Sale, "lines">, store?: Pick<Store, "store_type">) {
  if (!store || !["POS", "RESELLER"].includes(store.store_type)) return;
  const count = new Set(sale.lines.filter(line => line.line_type !== "SERVICE").map(line => line.article_id)).size;
  if (count > MAX_SHOP_SALE_ARTICLES) {
    throw new Error(`Cette vente contient ${count} articles distincts. Le maximum par vente est de ${MAX_SHOP_SALE_ARTICLES} articles distincts. Répartissez les articles en plusieurs ventes avant validation.`);
  }
}
