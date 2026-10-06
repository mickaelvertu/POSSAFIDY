import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebase";

const USER_CONNECTIONS = "userConnections";
const HEARTBEAT_INTERVAL_MS = 120_000;

export interface UserConnection {
  id: string;
  user_id: string;
  connected_at: number | Timestamp;
  heartbeat_at: number | Timestamp;
}

export function trackUserPresence(userId: string): () => void {
  const connectionRef = doc(collection(db, USER_CONNECTIONS));
  let isTracking = true;
  let heartbeatId: number | undefined;

  void (async () => {
    try {
      await setDoc(connectionRef, {
        user_id: userId,
        connected_at: serverTimestamp(),
        heartbeat_at: serverTimestamp()
      });
      if (!isTracking) {
        await deleteDoc(connectionRef);
        return;
      }

      heartbeatId = window.setInterval(() => {
        if (!isTracking || document.hidden) return;
        void updateDoc(connectionRef, { heartbeat_at: serverTimestamp() }).catch(error => {
          console.error("Failed to update Firebase user presence heartbeat:", error);
        });
      }, HEARTBEAT_INTERVAL_MS);
    } catch (error) {
      console.error("Failed to create Firebase user presence record:", error);
    }
  })();

  return () => {
    isTracking = false;
    if (heartbeatId !== undefined) window.clearInterval(heartbeatId);
    void deleteDoc(connectionRef).catch(error => {
      console.error("Failed to close Firebase user presence record:", error);
    });
  };
}

export function subscribeUserConnections(
  onConnections: (connections: UserConnection[]) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, USER_CONNECTIONS),
    snapshot => onConnections(snapshot.docs.map(item => ({
      id: item.id,
      ...item.data()
    }) as UserConnection)),
    onError
  );
}
