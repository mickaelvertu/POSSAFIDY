import assert from "node:assert/strict";
import test from "node:test";
import { transferLineDataEqual } from "./transferLineEquality";

test("confirmation accepts reordered map keys and omitted optional fields", () => {
  assert.equal(transferLineDataEqual(
    [{ id: "a", quantity_accepted: 3, details: { note: "ok", count: 3 } }],
    [{ details: { count: 3, note: "ok" }, quantity_accepted: 3, id: "a", note: undefined }]
  ), true);
});

test("confirmation rejects changed quantities, fields, and line order", () => {
  const lines = [{ id: "a", quantity_accepted: 3 }, { id: "b", quantity_accepted: 2 }];
  assert.equal(transferLineDataEqual(lines, [{ ...lines[0], quantity_accepted: 4 }, lines[1]]), false);
  assert.equal(transferLineDataEqual(lines, [{ ...lines[0], note: "changed" }, lines[1]]), false);
  assert.equal(transferLineDataEqual(lines, [lines[1], lines[0]]), false);
  assert.equal(transferLineDataEqual(lines, [lines[0]]), false);
  assert.equal(transferLineDataEqual(null, {}), false);
});
