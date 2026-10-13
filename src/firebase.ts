import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getDatabase } from "firebase/database";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, runTransaction, type Firestore, type Transaction } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import { assertOnlineForTransaction } from "./services/offlineSupport";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const realtimeDb = getDatabase(app);
let firestore: Firestore;

try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (error) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "failed-precondition") {
    firestore = getFirestore(app);
  } else {
    throw error;
  }
}

export const db = firestore;
export const database = db;

export function runOnlineTransaction<T>(updateFunction: (transaction: Transaction) => Promise<T>): Promise<T> {
  assertOnlineForTransaction();
  return runTransaction(db, updateFunction);
}

const isLocalDevelopment = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const analyticsPromise = !isLocalDevelopment
  ? isSupported()
      .then(supported => supported ? getAnalytics(app) : null)
      .catch(error => {
        console.warn("Firebase Analytics initialization failed:", error);
        return null;
      })
  : Promise.resolve(null);

// Standard Error Handling conforming to Firebase Skill
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default app;
