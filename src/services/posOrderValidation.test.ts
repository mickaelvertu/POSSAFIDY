import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePosLines } from './posOrderValidation';
const line = { article_id: 'a', article_code: 'A', article_name: 'Article', unit: 'kg', quantity: 1.5 };
test('accepte les quantités positives décimales', () => assert.doesNotThrow(() => validatePosLines([line])));
test('refuse les listes vides, doublons et quantités invalides', () => {
  assert.throws(() => validatePosLines([]));
  assert.throws(() => validatePosLines([line, line]));
  for (const quantity of [0, -1, NaN, Infinity]) assert.throws(() => validatePosLines([{ ...line, quantity }]));
  assert.throws(() => validatePosLines(Array.from({ length: 101 }, (_, i) => ({ ...line, article_id: String(i) }))));
});
