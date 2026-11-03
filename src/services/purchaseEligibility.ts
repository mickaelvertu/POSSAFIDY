import type { Article, Store } from "../types";

export function canPurchaseArticle(store: Pick<Store, "store_type" | "is_active">, article: Pick<Article, "article_type" | "is_active">): boolean {
  if (!store.is_active || !article.is_active) return false;
  return store.store_type === "CENTRAL_WAREHOUSE"
    ? ["RAW_MATERIAL", "RESALE"].includes(article.article_type)
    : store.store_type === "MANUFACTURER" && article.article_type === "RAW_MATERIAL";
}
