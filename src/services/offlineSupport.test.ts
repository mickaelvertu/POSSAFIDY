import assert from "node:assert/strict";
import test from "node:test";
import { assertOnlineForTransaction } from "./offlineSupport";

test("transaction guard allows an online action", () => {
  assert.doesNotThrow(() => assertOnlineForTransaction(true));
});

test("transaction guard explains why an offline action is blocked", () => {
  assert.throws(
    () => assertOnlineForTransaction(false),
    /nécessite une connexion Internet/
  );
});
