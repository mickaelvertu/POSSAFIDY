import { test } from "node:test";
import assert from "node:assert/strict";
import { presentationScore, validateFindings, type Finding } from "./employeePresentation";
const finding = (result: Finding["result"], note = ""): Finding => ({ result, note, photo: "" });
test("non applicable criteria are excluded and anomalies earn no points", () => {
  const findings = [finding("OK"), finding("NA"), finding("ISSUE", "Badge oublié"), finding("OK")];
  validateFindings(findings);
  assert.deepEqual(presentationScore(findings), { points: 10, maximum: 15 });
});
test("submission requires an applicable criterion and a reason for each anomaly", () => {
  assert.throws(() => validateFindings(Array.from({ length: 4 }, () => finding("NA"))));
  assert.throws(() => validateFindings([finding("ISSUE", "  "), finding("OK"), finding("OK"), finding("OK")]));
  assert.throws(() => validateFindings([finding("OK")]));
});
test("photo links cannot execute javascript", () => {
  assert.throws(() => validateFindings([{ ...finding("OK"), photo: "javascript:alert(1)" }, finding("OK"), finding("OK"), finding("OK")]));
});
