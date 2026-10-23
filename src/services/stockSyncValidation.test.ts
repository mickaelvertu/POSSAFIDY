import assert from "node:assert/strict";
import test from "node:test";
import { Article, Store, StoreStock } from "../types";
import { buildStockExportRecords, parseCsv, parseStockSyncFile, toStockCsv, validateStockSync } from "./stockSyncValidation";

const stores = [
  { id: "s1", code: "POS-01", name: "Boutique; A", store_type: "POS", is_active: true, created_at: 1, updated_at: 1 }
] as Store[];
const articles = [
  { id: "a1", code: "A-1", name: "Article", article_type: "RESALE", unit: "Piece", is_active: true },
  { id: "a2", code: "R-1", name: "Matière", article_type: "RAW_MATERIAL", unit: "kg", is_active: true }
] as Article[];
const stocks = [{ id: "stock-s1-a1", store_id: "s1", article_id: "a1", quantity: 5, reserved_quantity: 0, updated_at: 1 }] as StoreStock[];

test("export excludes raw materials for POS and round-trips through CSV", () => {
  const records = buildStockExportRecords(stores, articles, stocks);
  assert.equal(records.length, 1);
  const parsed = parseCsv(toStockCsv(records));
  assert.equal(parsed[0].store_name, "Boutique; A");
  const result = validateStockSync(parsed, stores, articles, stocks);
  assert.deepEqual(result.errors, []);
  assert.equal(result.unchanged, 1);
});

test("changed quantity yields a row with before/after", () => {
  const result = validateStockSync([{ store_code: "pos-01", article_code: "a-1", quantity: "7,5" }], stores, articles, stocks);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0].before, 5);
  assert.equal(result.rows[0].quantity, 7.5);
});

test("rejects duplicates, raw materials in POS, negatives and unknown stores", () => {
  const result = validateStockSync([
    { store_id: "s1", article_id: "a1", quantity: 1 },
    { store_id: "s1", article_id: "a1", quantity: 2 },
    { store_id: "s1", article_id: "a2", quantity: 2 },
    { store_id: "s1", article_id: "a1", quantity: -1 },
    { store_id: "nope", article_id: "a1", quantity: 1 }
  ], stores, articles, stocks);
  assert.equal(result.errors.length, 4);
});

test("raw materials remain available for depot and production", () => {
  for (const store_type of ["CENTRAL_WAREHOUSE", "MANUFACTURER"] as const) {
    const sites = [{ ...stores[0], store_type }];
    assert.equal(buildStockExportRecords(sites, articles, stocks).length, 2);
    assert.deepEqual(validateStockSync([{ store_id: "s1", article_id: "a2", quantity: 2 }], sites, articles, stocks).errors, []);
  }
});

test("JSON file accepts data array", () => {
  const rows = parseStockSyncFile("x.json", JSON.stringify({ data: [{ store_id: "s1", article_id: "a1", quantity: 9 }] }));
  assert.equal(validateStockSync(rows, stores, articles, stocks).rows[0].quantity, 9);
});
