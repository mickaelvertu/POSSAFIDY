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
  fail: (error: unknown) => void, ready?: (fromCache: boolean) => void,
): () => void {
  return subscribeSources<Query<DocumentData>, T>(queries, (source, next, error) => onSnapshot(source, { includeMetadataChanges: true }, snapshot => {
    next(snapshot.docs.map(document => ({ ...document.data(), id: document.id }) as T), snapshot.metadata.fromCache);
  }, error), receive, fail, ready);
}

export function collectionQuery(name: string, ...constraints: QueryConstraint[]) {
  return query(collection(db, name), ...constraints);
}
