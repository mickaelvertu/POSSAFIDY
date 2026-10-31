import type { Article, StoreStock } from "../types";

export interface ArticleStockRow {
  article: Article;
  quantity: number;
  reserved: number;
  available: number;
  storeIds: string[];
}

/** Consolidate only the stock rows already restricted to the selected, authorized stores. */
export function buildArticleStockRows(stocks: StoreStock[], getArticle: (id: string) => Article | undefined): ArticleStockRow[] {
  const groups = new Map<string, ArticleStockRow>();
  for (const stock of stocks) {
    const article = getArticle(stock.article_id);
    if (!article) continue;
    const row = groups.get(article.id) ?? { article, quantity: 0, reserved: 0, available: 0, storeIds: [] };
    row.quantity += stock.quantity;
    row.reserved += stock.reserved_quantity || 0;
    // Reservations belong to their store: a shortage there cannot consume another store's availability.
    row.available += Math.max(0, stock.quantity - (stock.reserved_quantity || 0));
    if (!row.storeIds.includes(stock.store_id)) row.storeIds.push(stock.store_id);
    groups.set(article.id, row);
  }
  return [...groups.values()].sort((a, b) => a.article.name.localeCompare(b.article.name, "fr") || a.article.code.localeCompare(b.article.code, "fr"));
}
