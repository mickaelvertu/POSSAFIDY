import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_DURATION_MS, sessionExpiry, watchSessionExpiration } from './sessionExpiration';

function clock(start: number) {
  let now = start;
  let scheduled: (() => void) | undefined;
  let resume: (() => void) | undefined;
  let delay = 0;
  const env = {
    now: () => now,
    schedule: (callback: () => void, ms: number) => { scheduled = callback; delay = ms; return 1; },
    cancel: () => { scheduled = undefined; },
    onResume: (callback: () => void) => { resume = callback; return () => { resume = undefined; }; }
  };
  return { env, advance: (ms: number) => { now += ms; }, tick: () => scheduled?.(), resume: () => resume?.(), delay: () => delay };
}

test('deadline remains four hours from the original sign-in across reloads', () => {
  const signIn = '2026-11-14T08:00:00.000Z';
  const expires = sessionExpiry(signIn);
  assert.equal(expires, Date.parse('2026-11-14T12:00:00.000Z'));
  const c = clock(Date.parse('2026-11-14T11:00:00.000Z'));
  let count = 0;
  watchSessionExpiration(expires, () => count++, c.env);
  assert.equal(c.delay(), 60 * 60 * 1000);
  c.advance(60 * 60 * 1000 - 1); c.resume(); assert.equal(count, 0);
  c.advance(1); c.tick(); assert.equal(count, 1);
  c.resume(); c.tick(); assert.equal(count, 1);
});
test('returning from sleep expires immediately even when timers were suspended', () => {
  const c = clock(1000);
  let expired = false;
  watchSessionExpiration(1000 + SESSION_DURATION_MS, () => { expired = true; }, c.env);
  c.advance(SESSION_DURATION_MS + 10000);
  c.resume(); assert.equal(expired, true);
});
test('expired or missing authentication timestamps cannot restore a session', () => {
  for (const timestamp of [undefined, 'invalid', '2026-11-13T08:00:00Z']) {
    const c = clock(Date.parse('2026-11-14T08:00:00Z'));
    let count = 0;
    watchSessionExpiration(sessionExpiry(timestamp), () => count++, c.env);
    assert.equal(count, 1);
  }
});
test('cleanup prevents a previous account deadline from expiring the new session', () => {
  const c = clock(1000);
  let count = 0;
  const stop = watchSessionExpiration(1000 + SESSION_DURATION_MS, () => count++, c.env);
  stop(); c.advance(SESSION_DURATION_MS); c.tick(); c.resume();
  assert.equal(count, 0);
});
