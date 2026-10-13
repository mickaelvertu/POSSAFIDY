import { doc } from "firebase/firestore";
import { db, runOnlineTransaction } from "../firebase";

export type SequentialIdPrefix = "ART" | "FOU" | "MAG" | "CAT" | "UTI";

export async function createSequentialId(prefix: SequentialIdPrefix, existingIds: string[]): Promise<string> {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const highestExistingSequence = existingIds.reduce((highest, id) => {
    const match = id.match(pattern);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const sequenceRef = doc(db, "inventoryMetadata", "id-sequences");

  return runOnlineTransaction(async transaction => {
    const snapshot = await transaction.get(sequenceRef);
    const storedSequence = snapshot.exists() ? Number(snapshot.data()[prefix]) || 0 : 0;
    const nextSequence = Math.max(storedSequence, highestExistingSequence, existingIds.length) + 1;
    transaction.set(sequenceRef, { [prefix]: nextSequence }, { merge: true });
    return `${prefix}-${String(nextSequence).padStart(3, "0")}`;
  });
}