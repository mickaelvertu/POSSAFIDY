import { test } from "node:test";
import assert from "node:assert/strict";
import { buildArticleStockRows } from "./stockByArticle";
import { filterReportData, type ReportData } from "./reportService";
import { reportSources, reportHistory } from "./reportReadiness";
import type { Article, GeneralFilters, StoreStock } from "../types";

const article = { id: "a", code: "A", name: "Article", unit: "Pot", category_id: "c" } as Article;
const stock = (id: string, store: string, quantity: number, reserved = 0) => ({ id, store_id: store, article_id: "a", quantity, reserved_quantity: reserved, quarantine_quantity: 40, updated_at: 1 }) as StoreStock;

test("one article is consolidated across stores, without adding quarantine", () => {
  const [row] = buildArticleStockRows([stock("1", "one", 10, 2), stock("2", "two", 8, 3)], () => article);
  assert.equal(row.quantity, 18);
  assert.equal(row.reserved, 5);
  assert.equal(row.available, 13);
  assert.deepEqual(row.storeIds, ["one", "two"]);
});
test("over-reservation in one store does not reduce another store's available stock", () => {
  const [row] = buildArticleStockRows([stock("1", "one", 1, 4), stock("2", "two", 8)], () => article);
  assert.equal(row.available, 8);
});
test("store filtering happens before consolidation", () => {
  const data = { articles: [article], stocks: [stock("1", "one", 10, 2), stock("2", "two", 8, 3)], stores: [], transfers: [], movements: [], sales: [], productions: [], auditLogs: [] } as ReportData;
  const filters = { storeIds: ["two"], categoryIds: [], statuses: [], movementTypes: [] } as GeneralFilters;
  const filtered = filterReportData(data, filters);
  const [row] = buildArticleStockRows(filtered.stocks, () => article);
  assert.equal(row.available, 5);
  assert.deepEqual(row.storeIds, ["two"]);
});
test("unknown and inaccessible articles do not produce report rows", () => {
  assert.deepEqual(buildArticleStockRows([stock("1", "one", 10)], () => undefined), []);
  assert.deepEqual(buildArticleStockRows([], () => article), []);
});
test("report 18 waits for stocks but never needs movement history", () => {
  assert.ok(reportSources("STOCK_BY_ARTICLE").includes("Stocks"));
  assert.equal(reportHistory("STOCK_BY_ARTICLE"), null);
});
