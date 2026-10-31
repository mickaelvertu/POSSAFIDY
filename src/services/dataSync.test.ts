import { test } from "node:test";
import assert from "node:assert/strict";
import type { User } from "../types/auth";
import { authorizationKey, isRetryableReadError, mergeRecords, sessionReadAccess } from "./dataSyncPolicy";
import { subscribeSources } from "./liveSubscription";
import { readHistoryPage, withReadDeadline, type HistoryShard } from "./historyPaging";
import { reportHistory, reportSources } from "./reportReadiness";

const user: User = { id: "user", firstName: "A", lastName: "B", email: "a@example.test", status: "ACTIVE", role: "VENDEUR", permissions: ["sales.view", "stock.view"], assignedStores: ["store-b", "store-a"], visibleArticleTypes: ["RESALE"], createdAt: "", updatedAt: "" };

test("profile name changes and reordered rights do not reload operational data", () => {
  assert.equal(authorizationKey(user), authorizationKey({ ...user, firstName: "Changed", updatedAt: "later", permissions: [...user.permissions].reverse(), assignedStores: [...user.assignedStores].reverse() }));
  for (const changed of [{ ...user, permissions: [] }, { ...user, assignedStores: [] }, { ...user, visibleArticleTypes: [] }, { ...user, status: "DISABLED" as const }]) assert.notEqual(authorizationKey(user), authorizationKey(changed));
});

test("credit access never broadens stocks or production store access", () => {
  const credit = sessionReadAccess({ ...user, permissions: ["credit.manage"] });
  assert.equal(credit.salesAllowed, true);
  assert.equal(credit.salesStoreIds, undefined);
  assert.deepEqual(credit.storeIds, user.assignedStores);
  assert.equal(credit.permitted("production.view"), false);
  assert.equal(sessionReadAccess({ ...user, permissions: [] }).salesAllowed, false);
  assert.deepEqual(sessionReadAccess({ ...user, status: "DISABLED" }).storeIds, []);
  assert.equal(sessionReadAccess({ ...user, role: "ADMIN", permissions: [] }).permitted("sales.view"), true);
});

test("denied reads and invalid queries are not retried as network failures", () => {
  for (const code of ["permission-denied", "unauthenticated", "failed-precondition", "invalid-argument"]) assert.equal(isRetryableReadError({ code }), false);
  for (const code of ["unavailable", "firestore/deadline-exceeded", "aborted"]) assert.equal(isRetryableReadError({ code }), true);
  assert.equal(isRetryableReadError(new Error("unknown")), false);
});

test("live queries merge overlapping store routes, retain other scopes after deletion, and detach cleanly", () => {
  const callbacks = new Map<string, { next: (rows: { id: string }[], cached: boolean) => void; fail: (error: unknown) => void }>();
  let rows: { id: string }[] = []; const ready: boolean[] = []; let detached = 0; const errors: unknown[] = [];
  const stop = subscribeSources(["source", "destination"], (source, next, fail) => {
    callbacks.set(source, { next, fail }); return () => { detached++; };
  }, next => { rows = next; }, error => errors.push(error), cached => ready.push(cached));
  callbacks.get("source")!.next([{ id: "shared" }, { id: "source-only" }], true);
  assert.deepEqual(ready, []);
  callbacks.get("destination")!.next([{ id: "shared" }, { id: "destination-only" }], false);
  assert.equal(rows.length, 3); assert.deepEqual(ready, [true]);
  callbacks.get("source")!.next([], false);
  assert.deepEqual(rows.map(row => row.id), ["shared", "destination-only"]);
  assert.equal(ready.at(-1), false);
  callbacks.get("source")!.fail({ code: "permission-denied" });
  const readyCount = ready.length;
  callbacks.get("destination")!.next([{ id: "destination-only" }], false);
  assert.equal(ready.length, readyCount); assert.equal(errors.length, 1);
  stop(); callbacks.get("destination")!.next([], false);
  assert.equal(detached, 2); assert.equal(rows.length, 1);
});

test("history failures keep their cursor while successful scopes advance", async () => {
  const shards: HistoryShard<string, string>[] = [{ source: "good", done: false }, { source: "denied", cursor: "old", done: false }];
  const rows: string[] = [];
  const result = await readHistoryPage(shards, async shard => {
    if (shard.source === "denied") throw { code: "permission-denied" };
    return { rows: ["new"], cursor: "next", done: true, fromCache: false };
  }, () => true, page => rows.push(...page));
  assert.equal(result.failures.length, 1); assert.equal(result.hasMore, true);
  assert.deepEqual(rows, ["new"]); assert.equal(shards[0].done, true); assert.equal(shards[1].cursor, "old");
});

test("cached history cannot mark server history complete or advance the cursor", async () => {
  const shards: HistoryShard<string, string>[] = [{ source: "store", cursor: "previous", done: false }];
  const result = await readHistoryPage(shards, async () => ({ rows: [1], cursor: "cached", done: true, fromCache: true }), () => true, () => {});
  assert.equal(result.failures.length, 1); assert.equal(result.hasMore, true); assert.equal(shards[0].cursor, "previous");
});

test("late history responses from a former permission scope are ignored", async () => {
  const shards: HistoryShard<string, string>[] = [{ source: "previous-account", done: false }];
  const rows: number[] = [];
  await readHistoryPage(shards, async () => ({ rows: [1], cursor: "forbidden", done: true, fromCache: false }), () => false, page => rows.push(...page));
  assert.deepEqual(rows, []); assert.equal(shards[0].done, false); assert.equal(shards[0].cursor, undefined);
});

test("history merging deduplicates live inserts overlapping later pages", () => {
  assert.deepEqual(mergeRecords([{ id: "a", value: 1 }], [{ id: "a", value: 2 }, { id: "b", value: 3 }]), [{ id: "a", value: 2 }, { id: "b", value: 3 }]);
});

test("stock and sales reports do not wait for unrelated histories or payroll", () => {
  assert.equal(reportHistory("STOCK_STATUS"), null);
  assert.equal(reportHistory("SALES"), null);
  assert.equal(reportHistory("STOCK_MOVEMENTS"), "movements");
  assert.equal(reportHistory("STOCK_LEDGER"), null);
  assert.equal(reportHistory("AUDIT_LOG"), "audit");
  assert.deepEqual(reportSources("STOCK_STATUS"), ["Magasins", "Articles", "Catégories", "Stocks"]);
  assert.equal(reportSources("STOCK_LEDGER").includes("Stocks"), true);
  assert.equal(reportSources("SALES").includes("Productions"), false);
});

test("a stalled read ends with a retryable deadline and successful reads keep their result", async () => {
  await assert.rejects(withReadDeadline(new Promise(() => {}), 5), { code: "deadline-exceeded" });
  assert.equal(await withReadDeadline(Promise.resolve("loaded"), 100), "loaded");
});
