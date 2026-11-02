import type { Article, Store, UserProfile } from "../types";

export function canStoreRawMaterials(store: Store | undefined): boolean {
  return store?.store_type === "CENTRAL_WAREHOUSE" || store?.store_type === "MANUFACTURER";
}

export function canConsumeMaterials(user: UserProfile, store: Store): boolean {
  if (!store.is_active || store.store_type !== "MANUFACTURER") return false;
  return user.roleId === "ADMIN" || user.roleId === "SUPER_ADMIN" || (
    user.storeIds.includes(store.id) &&
    (user.permissions.includes("stock.edit") || user.permissions.includes("production.create") || user.permissions.includes("production.validate"))
  );
}

export function validateMaterialConsumption(article: Article | undefined, quantity: number, available: number, reason: string): void {
  if (!article?.is_active || article.article_type !== "RAW_MATERIAL") {
    throw new Error("Sélectionnez une matière première active.");
  }
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("La quantité consommée doit être positive.");
  if (!Number.isFinite(available) || quantity > available) throw new Error("Stock insuffisant pour cette consommation.");
  if (!reason.trim()) throw new Error("Indiquez le motif de la consommation.");
}
