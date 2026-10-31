import type { ReportType } from "../types";

export function reportHistory(type: ReportType): "movements" | "audit" | null {
  if (type === "STOCK_MOVEMENTS") return "movements";
  return type === "AUDIT_LOG" ? "audit" : null;
}

export function reportSources(type: ReportType): string[] {
  const base = ["Magasins", "Articles", "Catégories"];
  if (type === "STOCK_BY_ARTICLE" || type === "STOCK_STATUS" || type === "STOCK_LEDGER") return [...base, "Stocks"];
  if (type.startsWith("SALES") || type === "RESELLER_CREDIT") return [...base, "Ventes"];
  if (["TRANSFERS", "RECEIPTS", "DISCREPANCIES", "RETURNS"].includes(type)) return [...base, "Transferts"];
  if (type === "PRODUCTION" || type === "RAW_MATERIAL_CONSUMPTION") return [...base, "Productions"];
  if (type === "EXPENSES") return [...base, "Dépenses"];
  return base;
}
