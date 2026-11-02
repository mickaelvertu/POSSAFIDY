import { useCallback, useEffect, useRef, useState } from "react";
import { getDocs, limit, onSnapshot, orderBy, query, startAfter, type DocumentData, type Query, type QueryDocumentSnapshot } from "firebase/firestore";
import { describeReadError, isRetryableReadError, mergeRecords } from "../services/dataSyncPolicy";
import { readHistoryPage, withReadDeadline } from "../services/historyPaging";

const PAGE_SIZE = 50;
interface Shard { source: Query<DocumentData>; cursor?: QueryDocumentSnapshot; done: boolean }
export interface HistoryControls {
  hasMore: boolean; loading: boolean; error: string | null; loadMore: () => Promise<void>;
  loadedCount?: number;
}

/** History is append-only; immutable cursors keep equal timestamps and live inserts safe. */
export function useHistoryPages<T extends { id: string; created_at: number }>(
  scope: string, sources: () => Query<DocumentData>[],
  setRows: (update: (previous: T[]) => T[]) => void,
) {
  const generation = useRef(0);
  const pager = useRef<{ shards: Shard[]; busy: boolean }>({ shards: [], busy: false });
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restartVersion, setRestartVersion] = useState(0);
  const retryOnReconnect = useRef(false);
  const listenerFailed = useRef(false);
  const loadedIds = useRef(new Set<string>());
  const [loadedCount, setLoadedCount] = useState(0);
  const merge = (rows: T[]) => {
    rows.forEach(row => loadedIds.current.add(row.id));
    setLoadedCount(loadedIds.current.size);
    setRows(previous => mergeRecords(previous, rows).sort((a, b) => b.created_at - a.created_at));
  };

  const fetchPage = useCallback(async (all: boolean) => {
    const version = generation.current;
    const state: { shards: Shard[]; busy: boolean } = pager.current;
    if (state.busy) return;
    state.busy = true;
    setLoading(true);
    setError(null);
    retryOnReconnect.current = false;
    const started = Date.now();
    try {
      do {
        const result = await readHistoryPage<Query<DocumentData>, QueryDocumentSnapshot, T>(state.shards, async shard => {
          const snapshot = await withReadDeadline(getDocs(query(shard.source, orderBy("created_at", "desc"), ...(shard.cursor ? [startAfter(shard.cursor)] : []), limit(PAGE_SIZE))));
          return {
            rows: snapshot.docs.map(document => ({ ...(document.data() as DocumentData), id: document.id }) as T),
            cursor: snapshot.docs.at(-1), done: snapshot.size < PAGE_SIZE, fromCache: snapshot.metadata.fromCache,
          };
        }, () => generation.current === version, merge);
        if (generation.current !== version) return;
        if (result.failures.length) throw result.failures[0];
        setHasMore(result.hasMore);
        if (all && result.hasMore && Date.now() - started > 20000) {
          throw Object.assign(new Error("Historique volumineux : reprenez le chargement pour continuer."), { code: "deadline-exceeded" });
        }
      } while (all && state.shards.some(shard => !shard.done));
      if (generation.current === version) setHasMore(state.shards.some(shard => !shard.done));
    } catch (failure) {
      if (generation.current === version) {
        retryOnReconnect.current = isRetryableReadError(failure);
        setError(describeReadError(failure));
      }
    } finally {
      state.busy = false;
      if (generation.current === version) setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    generation.current++;
    const version = generation.current;
    const queries = sources();
    listenerFailed.current = false;
    loadedIds.current = new Set();
    setLoadedCount(0);
    pager.current = { shards: queries.map(source => ({ source, done: false })), busy: false };
    setHasMore(queries.length > 0);
    setRows(() => []);
    const stops = queries.map(source => onSnapshot(query(source, orderBy("created_at", "desc"), limit(PAGE_SIZE)), snapshot => {
      if (generation.current === version) merge(snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as T));
    }, failure => {
      if (generation.current === version) { listenerFailed.current = true; setError(describeReadError(failure)); }
    }));
    void fetchPage(false);
    return () => { generation.current++; stops.forEach(stop => stop()); };
  }, [scope, fetchPage, restartVersion]);

  useEffect(() => {
    const online = () => { if (retryOnReconnect.current) setRestartVersion(version => version + 1); };
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, []);

  return { hasMore, loading, error, loadedCount, loadMore: async () => {
    if (listenerFailed.current) setRestartVersion(version => version + 1);
    else await fetchPage(false);
  }, loadAll: () => fetchPage(true) };
}
