import test from "node:test";
import assert from "node:assert/strict";
import { assertPaymentClock, PaymentAccessError, paymentClockHint, withPaymentAccess } from "./paymentAccess";

test("permission diagnostics preserve the failing read instead of naming the outer transaction", async () => {
  await assert.rejects(withPaymentAccess("transaction", () => withPaymentAccess("lecture de la facture", async () => {
    throw { code: "permission-denied" };
  })), error => error instanceof PaymentAccessError && error.stage === "lecture de la facture");
  const original = new Error("Paiement déjà enregistré");
  await assert.rejects(withPaymentAccess("transaction", async () => { throw original; }), error => error === original);
});

test("clock diagnostics distinguish actual clock drift from cached response dates and network failure", async t => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout, clearTimeout } });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  globalThis.fetch = async () => new Response(null, { headers: { Date: new Date(Date.now() - 90000).toUTCString(), Age: "90" } });
  assert.equal(await paymentClockHint(), "");
  await assert.doesNotReject(assertPaymentClock);
  globalThis.fetch = async () => new Response(null, { headers: { Date: new Date(Date.now() - 180000).toUTCString() } });
  assert.match(await paymentClockHint(), /horloge/);
  await assert.rejects(assertPaymentClock, /horloge/);
  globalThis.fetch = async () => new Response(null, { headers: { Date: new Date(Date.now() + 420000).toUTCString() } });
  assert.match(await paymentClockHint(), /horloge/);
  globalThis.fetch = async () => { throw new Error("offline"); };
  assert.equal(await paymentClockHint(), "");
  await assert.doesNotReject(assertPaymentClock);
});
