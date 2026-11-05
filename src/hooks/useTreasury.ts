import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import type { AppUser, TreasuryFund, TreasuryMovement } from "../types";

export function useTreasury(user: AppUser | null) {
  const [funds, setFunds] = useState<TreasuryFund[]>([]);
  const [movements, setMovements] = useState<TreasuryMovement[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const uid = user?.uid;
  const enabled = !!user?.isActive && ["ADMIN", "SUPER_ADMIN"].includes(user.roleId);
  useEffect(() => {
    setFunds([]); setMovements([]); setError(""); setReady(false);
    if (!enabled) return;
    const loaded = new Set<string>();
    const onError = () => { setReady(false); setError("Impossible de charger la trésorerie. Vérifiez la connexion et les droits d'accès."); };
    const stops = [
      onSnapshot(collection(db, "treasuryFunds"), { includeMetadataChanges: true }, snapshot => {
        setFunds(snapshot.docs.map(row => row.data() as TreasuryFund));
        if (!snapshot.metadata.fromCache) loaded.add("funds"); else loaded.delete("funds");
        setReady(loaded.size === 2);
      }, onError),
      onSnapshot(collection(db, "treasuryMovements"), { includeMetadataChanges: true }, snapshot => {
        setMovements(snapshot.docs.map(row => row.data() as TreasuryMovement).sort((a, b) => b.created_at - a.created_at));
        if (!snapshot.metadata.fromCache) loaded.add("movements"); else loaded.delete("movements");
        setReady(loaded.size === 2);
      }, onError)
    ];
    return () => stops.forEach(stop => stop());
  }, [uid, enabled]);
  return { funds, movements, error, ready, enabled };
}
