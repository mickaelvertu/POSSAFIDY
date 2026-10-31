import type { User } from "../types/auth";

export function authorizationKey(user: User | null): string {
  return JSON.stringify(user ? {
    id: user.id, role: user.role, status: user.status,
    permissions: [...user.permissions].sort(), assignedStores: [...user.assignedStores].sort(),
    visibleArticleTypes: user.visibleArticleTypes ? [...user.visibleArticleTypes].sort() : undefined,
  } : null);
}

export function isRetryableReadError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code).replace(/^firestore\//, "") : "";
  return ["unavailable", "deadline-exceeded", "aborted", "resource-exhausted"].includes(code);
}

export function describeReadError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (code.endsWith("permission-denied")) return "Accès refusé. Faites vérifier vos droits et vos magasins attribués.";
  if (code.endsWith("unauthenticated")) return "Session non reconnue. Reconnectez-vous.";
  if (code.endsWith("failed-precondition")) return "Cette requête nécessite une configuration de la base. Contactez un administrateur.";
  return "Chargement interrompu. Vérifiez la connexion puis réessayez.";
}

export function mergeRecords<T extends { id: string }>(...groups: T[][]): T[] {
  return [...new Map(groups.flat().map(item => [item.id, item])).values()];
}

export function sessionReadAccess(user: User) {
  const admin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const permitted = (permission: string) => user.status === "ACTIVE" && (admin || user.permissions.includes(permission));
  const storeIds = admin && user.status === "ACTIVE" ? undefined : user.status === "ACTIVE" ? user.assignedStores : [];
  return {
    admin, permitted, storeIds,
    salesAllowed: permitted("sales.view") || permitted("credit.manage"),
    salesStoreIds: permitted("credit.manage") ? undefined : storeIds,
  };
}
