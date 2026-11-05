import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSalesStoreMatrix } from "./salesStoreMatrix";
import { filterReportData, type ReportData } from "./reportService";
import { getReportTableConfig } from "./reportColumns";
import { reportSources } from "./reportReadiness";
import type { Article, Store, Sale, GeneralFilters } from "../types";
const articles = [
  { id: "a", code: "A", name: "Aloe", category_id: "c", unit: "Flacon" },
  { id: "b", code: "B", name: "Baume", category_id: "c", unit: "Pot" }
] as Article[];
const stores = [{ id: "one", name: "Mahamasina", code: "POS-04" }, { id: "two", name: "Mahamasina", code: "DEP-01" }] as Store[];
const filters = { storeIds: [], categoryIds: [], statuses: [], movementTypes: [] } as GeneralFilters;
const sale = (id: string, store: string, quantity: number, status = "VALIDATED", date = "2026-11-04T12:00:00") => ({
  id, store_id: store, status, created_at: new Date(date).getTime(), lines: [{ article_id: "a", quantity }]
}) as Sale;
const data = (sales: Sale[]) => ({ articles, stores, sales, stocks: [], movements: [], transfers: [], productions: [], auditLogs: [] }) as ReportData;

test("aggregates validated quantities by article and store, preserving zero rows and distinct stores", () => {
  const result = buildSalesStoreMatrix(data([
    sale("1", "one", 2), sale("2", "one", 3), sale("3", "two", 1.5),
    sale("4", "one", 100, "CANCELLED"), sale("5", "one", 100, "DRAFT"),
    sale("6", "other", 100), { ...sale("7", "one", 100), lines: [{ article_id: "unknown", quantity: 100 }] } as Sale
  ]), filters);
  assert.deepEqual(result.rows[0].quantities, { one: 5, two: 1.5 });
  assert.equal(result.rows[0].total, 6.5);
  assert.equal(result.rows[1].total, 0);
  assert.equal(result.total, 6.5);
  assert.equal(result.stores.length, 2);
});
test("period boundaries, store and article filters apply before aggregation", () => {
  const selection = { ...filters, startDate: "2026-11-04", endDate: "2026-11-04", storeIds: ["two"], articleIds: ["a"] };
  const source = data([
    sale("1", "two", 2, "VALIDATED", "2026-11-04T00:00:00"),
    sale("2", "two", 3, "VALIDATED", "2026-11-04T23:59:59.999"),
    sale("3", "two", 100, "VALIDATED", "2026-11-03T23:59:59.999"),
    sale("4", "two", 100, "VALIDATED", "2026-11-05T00:00:00"), sale("5", "one", 100)
  ]);
  const matrix = buildSalesStoreMatrix(filterReportData(source, selection), selection);
  assert.equal(matrix.total, 5);
  assert.equal(matrix.rows.length, 1);
  assert.deepEqual(matrix.stores.map(store => store.id), ["two"]);
});
test("dynamic table has numeric quantities and consistent column and grand totals", () => {
  const matrix = buildSalesStoreMatrix(data([sale("1", "one", 2), sale("2", "two", 3)]), filters);
  const table = getReportTableConfig("SALES_BY_STORE_ARTICLE", {
    salesStoreMatrix: matrix, getStoreName: (id: string) => stores.find(store => store.id === id)!.code
  } as any);
  const column = table.columns.find(column => column.key === "store:one")!;
  assert.equal(column.label, "POS-04");
  assert.equal(column.value(table.rows[0]), 2);
  assert.equal(column.footer!(table.rows), 2);
  assert.equal(table.columns.at(-1)!.footer!(table.rows), 5);
  assert.ok(reportSources("SALES_BY_STORE_ARTICLE").includes("Ventes"));
});
