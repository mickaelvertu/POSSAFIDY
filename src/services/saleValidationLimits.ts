import type { Sale, Store } from "../types";

// Two shared rule reads (profile/store) leave 18 article reads in an atomic commit.
export const MAX_SHOP_SALE_ARTICLES = 18;

export function assertSaleValidationSize(sale: Pick<Sale, "lines">, store?: Pick<Store, "store_type">) {
  if (!store || !["POS", "RESELLER"].includes(store.store_type)) return;
  const count = new Set(sale.lines.filter(line => line.line_type !== "SERVICE").map(line => line.article_id)).size;
  if (count > MAX_SHOP_SALE_ARTICLES) {
    throw new Error(`Cette vente contient ${count} articles distincts. La validation en point de vente est limitée à ${MAX_SHOP_SALE_ARTICLES} articles distincts par vente par les limites de sécurité Firestore. Répartissez les articles en plusieurs ventes avant validation ; aucune écriture n’a été effectuée.`);
  }
}
