import assert from "node:assert/strict";
import test from "node:test";
import type { CashHandover, GeneralFilters } from "../types";
import { filterReportData, getReportKpis, ReportData } from "./reportService";

const filters: GeneralFilters = { storeIds: [], categoryIds: [], statuses: [], movementTypes: [] };
const row = { id: "r1", store_id: "pos1", business_date: "2026-10-15", declared_at: new Date("2026-10-16T12:00:00").getTime(), status: "PARTIALLY_DEPOSITED", declared_amount: 450000, received_amount: 440000, deposited_amount: 200000, deposits: [{ bank_name: "Bank", reference: "BORD-123" }] } as CashHandover;
const data: ReportData = { articles: [], stores: [], stocks: [], transfers: [], movements: [], sales: [], productions: [], auditLogs: [], cashHandovers: [row] };

test("handover report filters by business day, store, status and bank reference", () => {
  assert.equal(filterReportData(data, { ...filters, startDate: "2026-10-15", endDate: "2026-10-15", storeIds: ["pos1"], statuses: ["PARTIALLY_DEPOSITED"], searchRef: "bord-123" }).cashHandovers?.length, 1);
  for (const change of [{ startDate: "2026-10-16" }, { endDate: "2026-10-14" }, { storeIds: ["other"] }, { statuses: ["DECLARED"] }, { searchRef: "missing" }]) {
    assert.equal(filterReportData(data, { ...filters, ...change }).cashHandovers?.length, 0);
  }
});

test("remaining bank deposit uses received funds and excludes unreceived declarations", () => {
  const result = getReportKpis("CASH_HANDOVERS", { ...data, cashHandovers: [row, { ...row, id: "r2", status: "DECLARED", received_amount: undefined, deposited_amount: 0 }] }, [], filters);
  assert.equal(result.find(kpi => kpi.label === "Reste à déposer")?.value.replace(/\s/g, ""), "240000Ar");
  assert.equal(filterReportData({ ...data, cashHandovers: undefined }, filters).cashHandovers, undefined);
});
