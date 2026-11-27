import { collection, onSnapshot, query, where, type QueryConstraint, type Query, type DocumentData } from "firebase/firestore";
import { db } from "../firebase";
import { subscribeSources } from "./liveSubscription";

/** Separate equality queries follow the same store boundaries as the security rules. */
export function scopedQueries(collectionName: string, fields: string[], storeIds?: string[]): Query<DocumentData>[] {
  const base = collection(db, collectionName);
  if (storeIds === undefined) return [query(base)];
  return fields.flatMap(field => [...new Set(storeIds)].map(id => query(base, where(field, "==", id))));
}

export function subscribeRows<T extends { id: string }>(
  queries: Query<DocumentData>[], receive: (rows: T[]) => void,
  fail: (error: unknown) => void, ready?: (fromCache: boolean) => void, observeServerDocuments?: (count: number) => void,
): () => void {
  return subscribeSources<Query<DocumentData>, T>(queries, (source, next, error) => {
    let firstServerSnapshot = true;
    return onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
      if (observeServerDocuments && !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
        const count = firstServerSnapshot ? snapshot.size
          : snapshot.docChanges().filter(change => change.type !== "removed").length;
        firstServerSnapshot = false;
        if (count) observeServerDocuments(count);
      }
      next(snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as T), snapshot.metadata.fromCache);
    }, error);
  }, receive, fail, ready);
}

export function collectionQuery(name: string, ...constraints: QueryConstraint[]) {
  return query(collection(db, name), ...constraints);
}
