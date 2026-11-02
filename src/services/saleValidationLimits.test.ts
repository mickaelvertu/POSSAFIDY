import { test } from "node:test";
import assert from "node:assert/strict";
import type { SaleLine } from "../types";
import { assertSaleValidationSize } from "./saleValidationLimits";

const lines = (count: number) => Array.from({ length: count }, (_, index) => ({ article_id: `article-${index}` })) as SaleLine[];
test("shops support more than 30 articles, up to 100 distinct products", () => {
  assert.doesNotThrow(() => assertSaleValidationSize({ lines: lines(18) }, { store_type: "POS" }));
  for (const count of [19, 31, 50, 100]) assert.doesNotThrow(() => assertSaleValidationSize({ lines: lines(count) }, { store_type: "POS" }));
  assert.doesNotThrow(() => assertSaleValidationSize({ lines: lines(100) }, { store_type: "RESELLER" }));
  assert.throws(() => assertSaleValidationSize({ lines: lines(101) }, { store_type: "POS" }), /100 articles/);
  assert.doesNotThrow(() => assertSaleValidationSize({ lines: lines(50) }, { store_type: "CENTRAL_WAREHOUSE" }));
});
test("duplicate product lines and services do not consume additional catalog checks", () => {
  const sale = { lines: [...lines(100), ...lines(100), ...Array.from({ length: 20 }, () => ({ article_id: "service", line_type: "SERVICE" } as SaleLine))] };
  assert.doesNotThrow(() => assertSaleValidationSize(sale, { store_type: "POS" }));
});
