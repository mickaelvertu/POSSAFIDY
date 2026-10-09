import { collection, doc, getDocs, query, runTransaction, setDoc, deleteDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import type { AuditLog, InventoryChargeSettlement, InventoryCount, InventoryReasonDecision, StockMovement, StoreStock } from "../types";
import { applyDecisions } from "./inventoryControl";

const COUNTS_COLLECTION = "inventoryCounts";
const STOCKS_COLLECTION = "stocks";
const MOVEMENTS_COLLECTION = "movements";

function omitUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => omitUndefined(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([, field]) => field !== undefined).map(([key, field]) => [key, omitUndefined(field)])
    ) as T;
  }
  return value;
}

export async function loadInventoryCounts(storeIds?: string[]): Promise<InventoryCount[]> {
  if (storeIds === undefined) {
    return (await getDocs(collection(db, COUNTS_COLLECTION))).docs.map(item => item.data() as InventoryCount);
  }
  if (storeIds.length === 0) return [];
  const snapshots = await Promise.all(storeIds.map(storeId =>
    getDocs(query(collection(db, COUNTS_COLLECTION), where("store_id", "==", storeId)))
  ));
  return snapshots.flatMap(snapshot => snapshot.docs.map(item => item.data() as InventoryCount));
}

export async function saveInventoryCount(count: InventoryCount, auditLog?: AuditLog): Promise<void> {
  await setDoc(doc(db, COUNTS_COLLECTION, count.id), omitUndefined(count));
  if (auditLog) await setDoc(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
}

export async function deleteInventoryCountDraft(count: InventoryCount): Promise<void> {
  if (count.status !== "DRAFT") throw new Error("Seul un brouillon peut être supprimé.");
  await deleteDoc(doc(db, COUNTS_COLLECTION, count.id));
}

// Marks validated counts as deducted (payslip, advance or other). Refuses counts that are already settled.
export async function settleInventoryCharges(
  counts: InventoryCount[],
  settlement: InventoryChargeSettlement,
  auditLog: AuditLog
): Promise<InventoryCount[]> {
  if (counts.length === 0) throw new Error("Aucun inventaire à régler.");
  if (!settlement.reference.trim()) throw new Error("Indiquez une référence (fiche de paie, avance, quittance…).");
  const now = Date.now();
  await runTransaction(db, async transaction => {
    const references = counts.map(count => doc(db, COUNTS_COLLECTION, count.id));
    const snapshots = await Promise.all(references.map(reference => transaction.get(reference)));
    snapshots.forEach(snapshot => {
      const live = snapshot.data() as InventoryCount | undefined;
      if (!live || live.status !== "VALIDATED" || (live.total_charged_amount || 0) <= 0) throw new Error("Un inventaire n'a pas de retenue à déduire.");
      if (live.charge_settlement) throw new Error(`La retenue de ${live.count_number} est déjà déduite.`);
    });
    references.forEach(reference => transaction.update(reference, omitUndefined({ charge_settlement: settlement, updated_at: now })));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
  return counts.map(count => ({ ...count, charge_settlement: settlement, updated_at: now }));
}

export async function signInventoryCount(
  count: InventoryCount,
  manager: { id: string; name: string },
  auditLog: AuditLog
): Promise<InventoryCount> {
  if (count.manager_id !== manager.id) throw new Error("Seul le responsable désigné peut signer ce comptage.");
  const now = Date.now();
  const signed: InventoryCount = {
    ...count,
    status: "SUBMITTED",
    manager_signed_at: now,
    manager_signed_by: manager.id,
    manager_signed_by_name: manager.name,
    submitted_at: now,
    updated_at: now
  };
  await runTransaction(db, async transaction => {
    const reference = doc(db, COUNTS_COLLECTION, count.id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || (snapshot.data() as InventoryCount).status !== "AWAITING_SIGNATURE") {
      throw new Error("Ce comptage n'attend plus de signature.");
    }
    transaction.set(reference, omitUndefined(signed));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
  return signed;
}

export async function refuseInventorySignature(
  count: InventoryCount,
  manager: { id: string; name: string },
  note: string,
  auditLog: AuditLog
): Promise<InventoryCount> {
  if (count.manager_id !== manager.id) throw new Error("Seul le responsable désigné peut refuser ce comptage.");
  const now = Date.now();
  const refused: InventoryCount = {
    ...count,
    status: "REJECTED",
    reviewed_by: manager.id,
    reviewed_by_name: manager.name,
    reviewed_at: now,
    review_note: `Signature refusée : ${note}`,
    updated_at: now
  };
  await runTransaction(db, async transaction => {
    const reference = doc(db, COUNTS_COLLECTION, count.id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || (snapshot.data() as InventoryCount).status !== "AWAITING_SIGNATURE") {
      throw new Error("Ce comptage n'attend plus de signature.");
    }
    transaction.set(reference, omitUndefined(refused));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
  return refused;
}

export async function rejectInventoryCount(
  count: InventoryCount,
  reviewer: { id: string; name: string },
  note: string,
  auditLog: AuditLog
): Promise<InventoryCount> {
  const rejected: InventoryCount = {
    ...count,
    status: "REJECTED",
    reviewed_by: reviewer.id,
    reviewed_by_name: reviewer.name,
    reviewed_at: Date.now(),
    review_note: note,
    updated_at: Date.now()
  };
  await runTransaction(db, async transaction => {
    const reference = doc(db, COUNTS_COLLECTION, count.id);
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists() || (snapshot.data() as InventoryCount).status !== "SUBMITTED") {
      throw new Error("Cet inventaire n'est plus en attente de contrôle.");
    }
    transaction.set(reference, omitUndefined(rejected));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
  return rejected;
}

// Validates a submitted count: stock is aligned on the counted quantity (applied as a delta on the live stock),
// and shortages whose reason is rejected are charged to the manager who made the count.
export async function validateInventoryCount(
  count: InventoryCount,
  decisions: Record<string, InventoryReasonDecision>,
  reviewer: { id: string; name: string },
  note: string | undefined,
  knownStocks: StoreStock[],
  auditLog: (validated: InventoryCount) => AuditLog
): Promise<{ count: InventoryCount; stocks: StoreStock[]; movements: StockMovement[] }> {
  const { lines, totalCharged } = applyDecisions(count, decisions);
  const now = Date.now();
  const validated: InventoryCount = {
    ...count,
    lines,
    status: "VALIDATED",
    reviewed_by: reviewer.id,
    reviewed_by_name: reviewer.name,
    reviewed_at: now,
    review_note: note?.trim() || undefined,
    updated_at: now,
    ...(totalCharged > 0 ? { charged_to: count.manager_signed_by || count.created_by, charged_to_name: count.manager_signed_by_name || count.created_by_name } : {}),
    total_charged_amount: totalCharged
  };
  const stocks: StoreStock[] = [];
  const movements: StockMovement[] = [];

  await runTransaction(db, async transaction => {
    const countRef = doc(db, COUNTS_COLLECTION, count.id);
    const countSnapshot = await transaction.get(countRef);
    if (!countSnapshot.exists() || (countSnapshot.data() as InventoryCount).status !== "SUBMITTED") {
      throw new Error("Cet inventaire n'est plus en attente de contrôle.");
    }
    const live = countSnapshot.data() as InventoryCount;
    if (!live.manager_signed_at) throw new Error("Le responsable du magasin n'a pas signé ce comptage.");
    if (live.created_by === reviewer.id) throw new Error("Vous ne pouvez pas approuver un comptage que vous avez réalisé.");
    const adjusted = lines.filter(line => line.variance !== 0);
    const targets = adjusted.map(line => {
      const known = knownStocks.find(stock => stock.store_id === count.store_id && stock.article_id === line.article_id);
      return { line, reference: doc(db, STOCKS_COLLECTION, known?.id || `stock-${count.store_id}-${line.article_id}`) };
    });
    const snapshots = await Promise.all(targets.map(target => transaction.get(target.reference)));

    targets.forEach((target, index) => {
      const current = snapshots[index].exists() ? snapshots[index].data() as StoreStock : undefined;
      const before = current?.quantity || 0;
      const after = Math.max(0, before + target.line.variance);
      const stock: StoreStock = {
        id: current?.id || target.reference.id,
        store_id: count.store_id,
        article_id: target.line.article_id,
        quantity: after,
        reserved_quantity: current?.reserved_quantity || 0,
        updated_at: now
      };
      const movementId = `movement-${crypto.randomUUID()}`;
      const movement: StockMovement = {
        id: movementId,
        store_id: count.store_id,
        article_id: target.line.article_id,
        movement_type: "INVENTORY_ADJUSTMENT",
        quantity: after - before,
        reference_type: "INVENTORY_COUNT",
        reference_id: count.id,
        reference_number: count.count_number,
        before_quantity: before,
        after_quantity: after,
        created_by: reviewer.id,
        created_by_name: reviewer.name,
        notes: `${target.line.reason || "Inventaire"} (${target.line.decision === "REJECTED" ? "motif refusé" : "motif accepté"})`,
        created_at: now
      };
      stocks.push(stock);
      movements.push(movement);
      transaction.set(target.reference, omitUndefined(stock));
      transaction.set(doc(db, MOVEMENTS_COLLECTION, movement.id), omitUndefined(movement));
    });

    transaction.set(countRef, omitUndefined(validated));
    const audit = auditLog(validated);
    transaction.set(doc(db, "auditLogs", audit.id), omitUndefined(audit));
  });
  return { count: validated, stocks, movements };
}
