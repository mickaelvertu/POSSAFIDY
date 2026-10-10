import assert from "node:assert/strict";
import test from "node:test";
import type { Article, InventoryCount } from "../types";
import { applyDecisions, buildChargesReport, buildCountLine, chargesToCsv, missingReasons, summarizeCount } from "./inventoryControl";

const article = { id: "a1", code: "A-001", name: "Savon", unit: "Pot", prix_achat: 1000, article_type: "RESALE", is_active: true } as Article;

function countWith(lines: ReturnType<typeof buildCountLine>[]): InventoryCount {
  return { id: "c1", lines } as InventoryCount;
}

test("variance and value are computed from system quantity", () => {
  const line = buildCountLine(article, 10, 7, " vol ");
  assert.equal(line.variance, -3);
  assert.equal(line.variance_value, -3000);
  assert.equal(line.reason, "vol");
});

test("anomalies without a proper reason block submission", () => {
  const lines = [buildCountLine(article, 10, 7, "ok"), buildCountLine({ ...article, id: "a2" }, 5, 5)];
  assert.deepEqual(missingReasons(lines).map(line => line.article_id), ["a1"]);
});

test("rejected shortage is charged, accepted or surplus is not", () => {
  const shortage = buildCountLine(article, 10, 7, "motif invalide");
  const surplus = buildCountLine({ ...article, id: "a2" }, 5, 8, "reception tardive");
  const result = applyDecisions(countWith([shortage, surplus]), { a1: "REJECTED", a2: "REJECTED" });
  assert.equal(result.totalCharged, 3000);
  assert.equal(result.lines[1].charged_amount, 0);
  const accepted = applyDecisions(countWith([shortage]), { a1: "ACCEPTED" });
  assert.equal(accepted.totalCharged, 0);
});

test("charges report groups validated withheld amounts by manager and filters by date", () => {
  const charged = applyDecisions(countWith([buildCountLine(article, 10, 7, "motif invalide")]), { a1: "REJECTED" });
  const base = { status: "VALIDATED", store_id: "s1", store_name: "POS", created_by: "u1", created_by_name: "Rina", reviewed_at: new Date("2026-03-10").getTime() } as InventoryCount;
  const counts = [
    { ...base, id: "c1", count_number: "INV-1", lines: charged.lines, total_charged_amount: charged.totalCharged },
    { ...base, id: "c2", count_number: "INV-2", lines: [], total_charged_amount: 0 },
    { ...base, id: "c3", status: "SUBMITTED", count_number: "INV-3", lines: charged.lines, total_charged_amount: 3000 } as InventoryCount
  ];
  const report = buildChargesReport(counts);
  assert.equal(report.total, 3000);
  assert.equal(report.managers.length, 1);
  assert.equal(report.managers[0].details[0].missing_quantity, 3);
  assert.equal(buildChargesReport(counts, { startDate: "2026-04-01" }).total, 0);
  assert.equal(buildChargesReport(counts, { managerId: "u2" }).managers.length, 0);
  assert.ok(chargesToCsv(report.managers).includes("INV-1"));
});

test("csv neutralizes spreadsheet formulas in reasons", () => {
  const csv = chargesToCsv([{ manager_id: "u", manager_name: "A", total: 1, pending_total: 1, settled_total: 0, pending_count_ids: ["c"], counts: 1, details: [{ count_id: "c", count_number: "I", store_name: "S", reviewed_at: 0, reviewed_by_name: "", article_code: "A", article_name: "N", unit: "u", system_quantity: 1, counted_quantity: 0, missing_quantity: 1, unit_cost: 1, amount: 1, reason: "=HYPERLINK(\"x\")", settled: false }] }]);
  assert.ok(csv.includes("'=HYPERLINK"));
});

test("report separates settled and pending charges", () => {
  const line = { ...buildCountLine(article, 10, 7, "x"), charged_amount: 3000 };
  const base = { status: "VALIDATED", created_by: "u1", created_by_name: "Resp", store_id: "s", store_name: "S", total_charged_amount: 3000, reviewed_at: 1, updated_at: 1, lines: [line] };
  const pending = { ...base, id: "p", count_number: "P" } as unknown as InventoryCount;
  const settled = { ...base, id: "d", count_number: "D", charge_settlement: { settled_at: 5, reference: "Paie 2026-03" } } as unknown as InventoryCount;
  const all = buildChargesReport([pending, settled]);
  assert.equal(all.managers[0].pending_total, 3000);
  assert.equal(all.managers[0].settled_total, 3000);
  assert.deepEqual(all.managers[0].pending_count_ids, ["p"]);
  assert.equal(buildChargesReport([pending, settled], { settlement: "SETTLED" }).total, 3000);
  assert.equal(buildChargesReport([pending, settled], { settlement: "PENDING" }).managers[0].details[0].settled, false);
  assert.ok(chargesToCsv(all.managers).includes("Paie 2026-03"));
});

test("summary totals shortage and surplus values", () => {
  const summary = summarizeCount(countWith([buildCountLine(article, 10, 7, "x"), buildCountLine({ ...article, id: "a2" }, 5, 8, "y")]));
  assert.equal(summary.anomalies, 2);
  assert.equal(summary.shortageValue, 3000);
  assert.equal(summary.surplusValue, 3000);
});
