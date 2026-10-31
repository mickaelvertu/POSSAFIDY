import assert from "node:assert/strict";
import test from "node:test";
import { saleLinesEqual, firestoreValuesEqual } from "./saleComparison";

const line = { id: "line-1", article_id: "soap", quantity: 1, unit_price: 500, discount: 0, total: 500 };

test("draft lines survive Firestore map key reordering and omitted undefined fields", () => {
  const stored = Object.fromEntries(Object.entries(line).reverse());
  assert.equal(saleLinesEqual([stored], [{ ...line, price_reason: undefined }]), true);
});

test("real edits to any stored line field remain conflicts", () => {
  for (const [key, value] of Object.entries(line)) {
    const changed = typeof value === "number" ? value + 1 : `${value}-changed`;
    assert.equal(saleLinesEqual([line], [{ ...line, [key]: changed }]), false, key);
  }
});

test("added, removed, and reordered lines remain conflicts", () => {
  const second = { ...line, id: "line-2" };
  assert.equal(saleLinesEqual([line], [line, second]), false);
  assert.equal(saleLinesEqual([line], []), false);
  assert.equal(saleLinesEqual([line, second], [second, line]), false);
});

test("production draft comparison ignores Firestore map order but detects edits", () => {
  const draft = { id: "prod-1", status: "DRAFT", notes: "1399", consumptions: [{ article_id: "PCA3", quantity: 100 }], outputs: [{ article_id: "MP-PCI-013", quantity: 100 }] };
  const stored = { outputs: [{ quantity: 100, article_id: "MP-PCI-013" }], consumptions: [{ quantity: 100, article_id: "PCA3" }], notes: "1399", status: "DRAFT", id: "prod-1" };
  assert.equal(firestoreValuesEqual(stored, { ...draft, validated_by: undefined }), true);
  assert.equal(firestoreValuesEqual(stored, { ...draft, notes: "changed" }), false);
  assert.equal(firestoreValuesEqual(stored, { ...draft, status: "COMPLETED" }), false);
  assert.equal(firestoreValuesEqual(stored, { ...draft, outputs: [{ article_id: "MP-PCI-013", quantity: 101 }] }), false);
});
