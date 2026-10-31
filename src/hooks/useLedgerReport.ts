import { useEffect, useRef, useState } from "react";
import { getDocs, limit, orderBy, query, startAfter, where, type QueryConstraint, type QueryDocumentSnapshot } from "firebase/firestore";
import type { GeneralFilters, ReportType, StockMovement } from "../types";
import { collectionQuery } from "../services/liveDataService";
import { describeReadError, mergeRecords } from "../services/dataSyncPolicy";
import { withReadDeadline } from "../services/historyPaging";
import { ledgerDateBounds, ledgerStoreScope } from "../services/ledgerLoadPolicy";

export function useLedgerReport(request: { type: ReportType; filters: GeneralFilters } | null, scope: string, allowedStoreIds?: string[]) {
  const key = request?.type === "STOCK_LEDGER" ? JSON.stringify([scope, request.filters]) : "";
  const [state, setState] = useState<{ key: string; rows: StockMovement[]; loading: boolean; error: string | null }>({ key: "", rows: [], loading: false, error: null });
  const [retryVersion, setRetryVersion] = useState(0);
  const loadedRequest = useRef<typeof request>(null);
  useEffect(() => {
    if (!key || !request) return;
    let active = true;
    loadedRequest.current = request;
    setState({ key, rows: [], loading: true, error: null });
    const load = async () => {
      const { start, end } = ledgerDateBounds(request.filters);
      const stores = ledgerStoreScope(request.filters.storeIds, allowedStoreIds);
      let rows: StockMovement[] = [];
      for (const storeId of stores) {
        const constraints: QueryConstraint[] = [];
        if (storeId !== undefined) constraints.push(where("store_id", "==", storeId));
        if (start !== undefined) constraints.push(where("created_at", ">=", start));
        if (end !== undefined) constraints.push(where("created_at", "<=", end));
        const source = collectionQuery("movements", ...constraints, orderBy("created_at", "desc"));
        let cursor: QueryDocumentSnapshot | undefined;
        while (active) {
          const snapshot = await withReadDeadline(getDocs(query(source, ...(cursor ? [startAfter(cursor)] : []), limit(500))));
          if (!active) return;
          if (snapshot.metadata.fromCache) throw Object.assign(new Error("Une connexion au serveur est nécessaire pour une grille complète."), { code: "unavailable" });
          rows = mergeRecords(rows, snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as StockMovement));
          setState({ key, rows, loading: true, error: null });
          if (snapshot.size < 500) break;
          cursor = snapshot.docs.at(-1);
        }
      }
      if (active) setState({ key, rows, loading: false, error: null });
    };
    void load().catch(error => {
      if (active) setState(previous => ({ ...previous, loading: false, error: describeReadError(error) }));
    });
    return () => { active = false; };
  }, [key, retryVersion]);
  return { ...state, ready: !!key && loadedRequest.current === request && state.key === key && !state.loading && !state.error, retry: () => setRetryVersion(value => value + 1) };
}
