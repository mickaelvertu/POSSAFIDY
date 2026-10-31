import { mergeRecords } from "./dataSyncPolicy";

export function subscribeSources<Q, T extends { id: string }>(
  sources: Q[], listen: (source: Q, receive: (rows: T[], cached: boolean) => void, fail: (error: unknown) => void) => () => void,
  receive: (rows: T[]) => void, fail: (error: unknown) => void, ready?: (cached: boolean) => void,
) {
  if (!sources.length) { receive([]); ready?.(false); return () => {}; }
  const shards = new Map<number, T[]>();
  const cached = new Map<number, boolean>();
  const failures = new Set<number>();
  let stopped = false;
  const stops = sources.map((source, index) => listen(source, (rows, fromCache) => {
    if (stopped) return;
    shards.set(index, rows); cached.set(index, fromCache);
    receive(mergeRecords(...shards.values()));
    if (shards.size === sources.length && !failures.size) ready?.([...cached.values()].some(Boolean));
  }, error => {
    if (stopped) return;
    failures.add(index); shards.delete(index);
    receive(mergeRecords(...shards.values()));
    fail(error);
  }));
  return () => { stopped = true; stops.forEach(stop => stop()); };
}
