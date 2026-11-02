export interface HistoryShard<Q, C> { source: Q; cursor?: C; done: boolean }
export interface HistoryPage<T, C> { rows: T[]; cursor?: C; done: boolean; fromCache: boolean }

export async function withReadDeadline<T>(operation: Promise<T>, milliseconds = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Le serveur met trop de temps à répondre."), { code: "deadline-exceeded" })), milliseconds);
      }),
    ]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

/** Successful scopes progress independently; failed scopes keep their old cursor for retry. */
export async function readHistoryPage<Q, C, T>(
  shards: HistoryShard<Q, C>[], fetch: (shard: HistoryShard<Q, C>) => Promise<HistoryPage<T, C>>,
  current: () => boolean, receive: (rows: T[]) => void,
) {
  const results = await Promise.allSettled(shards.filter(shard => !shard.done).map(async shard => {
    const page = await fetch(shard);
    if (!current()) return;
    receive(page.rows);
    if (page.fromCache) throw Object.assign(new Error("La suite de l’historique nécessite une connexion au serveur."), { code: "unavailable" });
    shard.cursor = page.cursor ?? shard.cursor;
    shard.done = page.done;
  }));
  return {
    hasMore: shards.some(shard => !shard.done),
    failures: results.flatMap(result => result.status === "rejected" ? [result.reason] : []),
  };
}
