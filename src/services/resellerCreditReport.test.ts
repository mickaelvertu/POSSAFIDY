import { test } from "node:test";
import assert from "node:assert/strict";
import { Sale, GeneralFilters } from "../types";
import { buildResellerCreditRows, filterReportData, getReportKpis, ReportData } from "./reportService";

const sale = (overrides: Partial<Sale> = {}): Sale => ({
  id: "s1", sale_number: "VTE-1", store_id: "central", customer_name: "Revendeur A",
  customer_type: "REVENDEUR", credit_customer_id: "a", status: "VALIDATED",
  total: 100, amount_paid: 30, payment_status: "PARTIAL", created_at: new Date("2026-10-10T12:00:00").getTime(),
  lines: [], ...overrides
} as Sale);
const filters: GeneralFilters = { storeIds: [], statuses: [], movementTypes: [], categoryIds: [], resellerPaymentStatus: "ALL" };
const data = (sales: Sale[]): ReportData => ({ articles: [], stores: [], stocks: [], transfers: [], movements: [], sales, productions: [], auditLogs: [] });

test("summary counts cumulative payments once and separates reseller accounts with the same name", () => {
  const rows = buildResellerCreditRows([
    sale({ credit_payments: [{ amount: 30 } as NonNullable<Sale["credit_payments"]>[number]] }),
    sale({ id: "s2", total: 200, amount_paid: 200, payment_status: "PAID", store_id: "shop" }),
    sale({ id: "s3", credit_customer_id: "b", amount_paid: 0 }),
    sale({ id: "cancelled", status: "CANCELLED" }),
    sale({ id: "draft", status: "DRAFT" }),
    sale({ id: "retail", customer_type: "PARTICULIER" })
  ]);
  assert.equal(rows.length, 2);
  const a = rows.find(row => row.id === "a")!;
  assert.deepEqual([a.count, a.total, a.paid, a.balance, a.partialCount], [2, 300, 230, 70, 1]);
  assert.deepEqual(a.storeIds, ["central", "shop"]);
});

test("payment filter selects invoices before grouping and respects store, reseller and dates", () => {
  const source = data([
    sale(), sale({ id: "paid", amount_paid: 100 }), sale({ id: "unpaid", amount_paid: 0 }),
    sale({ id: "elsewhere", store_id: "shop" }),
    sale({ id: "old", created_at: new Date("2026-09-01T12:00:00").getTime() }),
    sale({ id: "other", customer_name: "Autre revendeur" }), sale({ id: "cancelled", status: "CANCELLED" })
  ]);
  const scoped = { ...filters, resellerPaymentStatus: "PARTIAL" as const, storeIds: ["central"], customerName: "Revendeur A", startDate: "2026-10-01", endDate: "2026-10-17" };
  const result = filterReportData(source, scoped);
  assert.deepEqual(result.sales.map(row => row.id), ["s1"]);
  const kpis = getReportKpis("RESELLER_CREDIT", result, [], scoped);
  assert.equal(kpis.find(kpi => kpi.label === "Déjà encaissé")?.value, "30 Ar");
  assert.equal(kpis.find(kpi => kpi.label === "Crédit en cours")?.value, "70 Ar");
  assert.deepEqual(filterReportData(source, { ...filters, resellerPaymentStatus: "PAID" }).sales.map(row => row.id), ["paid"]);
  assert.deepEqual(filterReportData(source, { ...filters, resellerPaymentStatus: "PENDING" }).sales.map(row => row.id), ["unpaid"]);
  assert.equal(buildResellerCreditRows([]).length, 0);
});
