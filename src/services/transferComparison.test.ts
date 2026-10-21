import test from "node:test";
import assert from "node:assert/strict";
import { transferLinesEqual } from "./transferComparison";

test("receipt comparison accepts Firestore key ordering and omitted undefined fields", () => {
  const local = [{ id: "line-1", quantity_accepted: 4, note: undefined, extra: { b: 2, a: 1 } }];
  const stored = [{ extra: { a: 1, b: 2 }, quantity_accepted: 4, id: "line-1" }];
  assert.equal(transferLinesEqual(stored, local), true);
});

test("receipt comparison rejects changes to quantities, identities and line order", () => {
  const lines = [{ id: "a", quantity_accepted: 4 }, { id: "b", quantity_accepted: 2 }];
  assert.equal(transferLinesEqual(lines, [{ ...lines[0], quantity_accepted: 5 }, lines[1]]), false);
  assert.equal(transferLinesEqual(lines, [{ ...lines[0], id: "c" }, lines[1]]), false);
  assert.equal(transferLinesEqual(lines, [...lines].reverse()), false);
  assert.equal(transferLinesEqual(lines, [lines[0]]), false);
});
