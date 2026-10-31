import { test } from "node:test";
import assert from "node:assert/strict";
import type { SaleLine } from "../types";
import { assertSaleValidationSize } from "./saleValidationLimits";

const lines = (count: number) => Array.from({ length: count }, (_, index) => ({ article_id: `article-${index}` })) as SaleLine[];
test("shop validation respects the Firestore article-read budget", () => {
  assert.doesNotThrow(() => assertSaleValidationSize({ lines: lines(18) }, { store_type: "POS" }));
  assert.throws(() => assertSaleValidationSize({ lines: lines(19) }, { store_type: "POS" }), /19 articles distincts/);
  assert.throws(() => assertSaleValidationSize({ lines: lines(21) }, { store_type: "RESELLER" }), /18 articles/);
  assert.doesNotThrow(() => assertSaleValidationSize({ lines: lines(50) }, { store_type: "CENTRAL_WAREHOUSE" }));
});
test("duplicate product lines and services do not consume additional article-rule reads", () => {
  const sale = { lines: [...lines(18), ...lines(18), ...Array.from({ length: 20 }, () => ({ article_id: "service", line_type: "SERVICE" } as SaleLine))] };
  assert.doesNotThrow(() => assertSaleValidationSize(sale, { store_type: "POS" }));
});
