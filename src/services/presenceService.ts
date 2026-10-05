import {
  onDisconnect,
  onValue,
  push,
  ref,
  serverTimestamp,
  set
} from "firebase/database";
import { realtimeDb } from "../firebase";

export function trackUserPresence(userId: string): () => void {
  const connectedRef = ref(realtimeDb, ".info/connected");
  let activeConnectionRef: ReturnType<typeof push> | null = null;
  let isConnected = false;
  let isTracking = true;

  const unsubscribe = onValue(connectedRef, snapshot => {
    if (!isTracking) return;

    const connected = snapshot.val() === true;
    if (!connected) {
      isConnected = false;
      activeConnectionRef = null;
      return;
    }

    if (isConnected) return;
    isConnected = true;

    const connectionRef = push(ref(realtimeDb, `presence/${userId}/connections`));
    activeConnectionRef = connectionRef;

    void (async () => {
      try {
        await onDisconnect(connectionRef).set({
          online: false,
          disconnectedAt: serverTimestamp()
        });
        if (!isTracking || activeConnectionRef !== connectionRef) return;

        await set(connectionRef, {
          online: true,
          connectedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Failed to update Firebase user presence:", error);
      }
    })();
  }, error => {
    console.error("Failed to observe Firebase Realtime Database connection:", error);
  });

  return () => {
    isTracking = false;
    unsubscribe();

    if (activeConnectionRef) {
      const connectionRef = activeConnectionRef;
      activeConnectionRef = null;
      void (async () => {
        try {
          await onDisconnect(connectionRef).cancel();
          await set(connectionRef, {
            online: false,
            disconnectedAt: serverTimestamp()
          });
        } catch (error) {
          console.error("Failed to close Firebase user presence record:", error);
        }
      })();
    }
  };
}
