import type { Article, GeneralFilters, Sale, Store } from "../types";

export interface SalesStoreRow {
  article: Article;
  quantities: Record<string, number>;
  total: number;
}

/** Sales have already been filtered by period; catalogs belong to the caller's authorized scope. */
export function buildSalesStoreMatrix(
  data: { articles: Article[]; stores: Store[]; sales: Sale[] }, filters: GeneralFilters
): { stores: Store[]; rows: SalesStoreRow[]; total: number } {
  const stores = data.stores.filter(store => !filters.storeIds.length || filters.storeIds.includes(store.id))
    .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, "fr-FR", { numeric: true }));
  const storeIds = new Set(stores.map(store => store.id));
  const rows: SalesStoreRow[] = data.articles.filter(article =>
    (!filters.articleId || article.id === filters.articleId) &&
    (!filters.articleIds?.length || filters.articleIds.includes(article.id)) &&
    (!filters.categoryIds.length || filters.categoryIds.includes(article.category_id)) &&
    (!filters.articleType || filters.articleType === "ALL" || article.article_type === filters.articleType)
  ).sort((a, b) => a.name.localeCompare(b.name, "fr-FR")).map(article => ({
    article, quantities: Object.fromEntries(stores.map(store => [store.id, 0])), total: 0
  }));
  const byArticle = new Map(rows.map(row => [row.article.id, row]));
  for (const sale of data.sales) {
    if (sale.status !== "VALIDATED" || !storeIds.has(sale.store_id)) continue;
    for (const line of sale.lines) {
      const row = byArticle.get(line.article_id);
      if (!row || !Number.isFinite(line.quantity)) continue;
      row.quantities[sale.store_id] += line.quantity;
      row.total += line.quantity;
    }
  }
  return { stores, rows, total: rows.reduce((sum, row) => sum + row.total, 0) };
}
