export const SESSION_DURATION_MS = 4 * 60 * 60 * 1000;

export function sessionExpiry(lastSignInTime?: string): number {
  const signedInAt = Date.parse(lastSignInTime || '');
  return Number.isFinite(signedInAt) ? signedInAt + SESSION_DURATION_MS : 0;
}

interface ExpirationEnvironment {
  now: () => number;
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
  onResume: (callback: () => void) => () => void;
}

/** Absolute deadline: activity and token refresh never extend authentication. */
export function watchSessionExpiration(expiresAt: number, expire: () => void, env: ExpirationEnvironment): () => void {
  let stopped = false;
  let timer: unknown;
  let stopResume = () => {};
  const check = () => {
    if (stopped) return;
    if (timer !== undefined) env.cancel(timer);
    const remaining = expiresAt - env.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      stopped = true;
      stopResume();
      expire();
    } else {
      timer = env.schedule(check, Math.min(remaining, SESSION_DURATION_MS));
    }
  };
  stopResume = env.onResume(check);
  check();
  return () => { stopped = true; if (timer !== undefined) env.cancel(timer); stopResume(); };
}
