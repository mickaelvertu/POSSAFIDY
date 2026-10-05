import assert from "node:assert/strict";
import test from "node:test";
import { AppUser, Article, Store } from "../types";
import { createAuditLog } from "./auditService";
import { validateInitialStockImport } from "./stockImportValidation";

const stores: Store[] = [{
  id: "store-pos-01",
  code: "POS-01",
  name: "Boutique",
  store_type: "POS",
  is_active: true,
  created_at: 1,
  updated_at: 1
}];

const articles: Article[] = [{
  id: "article-01",
  code: "A-001",
  name: "Article",
  category_id: "category-01",
  article_type: "RESALE",
  unit: "Pièce",
  prix_achat: 10,
  prix_normal: 20,
  prix_revendeur: 15,
  is_active: true,
  created_at: 1,
  updated_at: 1
}];

const actor: AppUser = {
  id: "user-01",
  uid: "user-01",
  username: "admin",
  email: "admin@example.test",
  displayName: "Admin",
  role: "ADMIN",
  roleId: "ADMIN",
  firstName: "Admin",
  lastName: "Test",
  storeIds: [],
  permissions: [],
  isActive: true,
  createdAt: 1
};

function stockFile(data: unknown[], ready = true) {
  return { review: { ready_to_apply: ready }, data };
}

test("accepts an approved initial stock file with valid rows", () => {
  const result = validateInitialStockImport(stockFile([
    { store_id: "store-pos-01", article_id: "article-01", quantity: 3 }
  ]), stores, articles, []);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [{
    id: "stock-store-pos-01-article-01",
    store_id: "store-pos-01",
    article_id: "article-01",
    quantity: 3
  }]);
});

test("rejects files that have not been approved", () => {
  const result = validateInitialStockImport(stockFile([
    { store_id: "store-pos-01", article_id: "article-01", quantity: 3 }
  ], false), stores, articles, []);

  assert.equal(result.rows.length, 1);
  assert.match(result.errors[0], /ready_to_apply/);
});

test("rejects duplicate rows and invalid quantities", () => {
  const result = validateInitialStockImport(stockFile([
    { store_id: "store-pos-01", article_id: "article-01", quantity: 3 },
    { store_id: "store-pos-01", article_id: "article-01", quantity: 3 },
    { store_id: "store-pos-01", article_id: "article-01", quantity: -1 }
  ]), stores, articles, []);

  assert.equal(result.errors.length, 2);
  assert.match(result.errors.join(" "), /quantité/);
  assert.match(result.errors.join(" "), /doublon/);
});

test("rejects rows with missing article references", () => {
  const result = validateInitialStockImport(stockFile([
    { store_id: "store-pos-01", article_id: "unknown", quantity: 3 },
    { store_id: "store-pos-01", article_id: "article-01", quantity: 3 }
  ]), stores, articles, []);

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /article absent/);
});

test("rejects raw materials at point-of-sale stores", () => {
  const rawMaterial = { ...articles[0], id: "raw-01", article_type: "RAW_MATERIAL" as const };
  const result = validateInitialStockImport(stockFile([
    { store_id: "store-pos-01", article_id: "raw-01", quantity: 1 }
  ]), stores, [rawMaterial], []);

  assert.match(result.errors.join(" "), /ne peut pas recevoir de matière première/);
});

test("audit entries identify the actor and omit undefined snapshots", () => {
  const entry = createAuditLog(actor, "ARTICLE_UPDATED", "ARTICLE", "article-01", undefined, { name: "Nouveau nom" });

  assert.equal(entry.user_id, actor.uid);
  assert.equal(entry.entity_id, "article-01");
  assert.deepEqual(entry.new_value, { name: "Nouveau nom" });
  assert.equal(Object.hasOwn(entry, "old_value"), false);
});
