import type { GeneralFilters } from "../types";

export function ledgerStoreScope(selected: string[], allowed?: string[]): (string | undefined)[] {
  if (allowed === undefined) return selected.length ? [...new Set(selected)] : [undefined];
  if (selected.some(id => !allowed.includes(id))) throw Object.assign(new Error("Magasin non autorisé."), { code: "permission-denied" });
  return [...new Set(selected.length ? selected : allowed)];
}

export function ledgerDateBounds(filters: Pick<GeneralFilters, "startDate" | "endDate">) {
  const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).getTime() : undefined;
  const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59.999`).getTime() : undefined;
  if ((start !== undefined && !Number.isFinite(start)) || (end !== undefined && !Number.isFinite(end)) || (start !== undefined && end !== undefined && start > end)) {
    throw Object.assign(new Error("La période choisie est invalide."), { code: "invalid-argument" });
  }
  return { start, end };
}
