import { collection, doc, getDocs, query, where } from "firebase/firestore";
import { db, runOnlineTransaction } from "../firebase";
import { AuditLog, CashHandover, CashHandoverDeposit } from "../types";

const COLLECTION = "cashHandovers";

function omitUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(omitUndefined) as T;
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([key, fieldValue]) => [key, omitUndefined(fieldValue)])
  ) as T;
}

export async function loadCashHandovers(storeIds?: string[]): Promise<CashHandover[]> {
  const rows = storeIds === undefined
    ? (await getDocs(collection(db, COLLECTION))).docs.map(item => item.data() as CashHandover)
    : storeIds.length === 0
      ? []
      : (await Promise.all(storeIds.map(storeId =>
          getDocs(query(collection(db, COLLECTION), where("store_id", "==", storeId)))
        ))).flatMap(snapshot => snapshot.docs.map(item => item.data() as CashHandover));
  return [...new Map(rows.map(item => [item.id, item])).values()]
    .sort((left, right) => right.business_date.localeCompare(left.business_date) || right.declared_at - left.declared_at);
}

export async function createCashHandover(handover: CashHandover, auditLog: AuditLog): Promise<void> {
  if (
    !handover.store_id ||
    !/^\d{4}-\d{2}-\d{2}$/.test(handover.business_date) ||
    !Number.isInteger(handover.declared_amount) ||
    handover.declared_amount < 0 ||
    !Number.isFinite(handover.expected_cash_sales) ||
    handover.expected_cash_sales < 0 ||
    handover.deposited_amount !== 0 ||
    handover.deposits.length !== 0
  ) {
    throw new Error("Vérifiez la date et les montants de la déclaration.");
  }

  await runOnlineTransaction(async transaction => {
    const ref = doc(db, COLLECTION, handover.id);
    if ((await transaction.get(ref)).exists()) {
      throw new Error("Une remise est déjà déclarée pour ce point de vente et cette journée.");
    }
    transaction.set(ref, omitUndefined(handover));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined(auditLog));
  });
}

export async function confirmCashHandoverReceipt(
  handover: CashHandover,
  receivedAmount: number,
  discrepancyNote: string,
  userId: string,
  userName: string,
  auditLog: AuditLog
): Promise<CashHandover> {
  if (!Number.isInteger(receivedAmount) || receivedAmount < 0) {
    throw new Error("Le montant reçu doit être un nombre positif ou nul.");
  }
  if (userId === handover.declared_by) {
    throw new Error("La réception doit être confirmée par une personne différente de l'auteur de la déclaration.");
  }

  return runOnlineTransaction(async transaction => {
    const ref = doc(db, COLLECTION, handover.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.data().status !== "DECLARED") {
      throw new Error("Cette remise n'est plus en attente de réception.");
    }
    const current = snapshot.data() as CashHandover;
    if (current.declared_by !== handover.declared_by) {
      throw new Error("La déclaration a changé. Rechargez la liste avant de confirmer la réception.");
    }
    const receivedAt = Date.now();
    const updated: CashHandover = {
      ...current,
      status: receivedAmount === current.declared_amount ? "RECEIVED" : "DISCREPANCY",
      received_amount: receivedAmount,
      received_by: userId,
      received_by_name: userName,
      received_at: receivedAt,
      discrepancy_note: receivedAmount === current.declared_amount ? undefined : discrepancyNote.trim()
    };
    transaction.update(ref, omitUndefined({
      status: updated.status,
      received_amount: receivedAmount,
      received_by: userId,
      received_by_name: userName,
      received_at: receivedAt,
      discrepancy_note: updated.discrepancy_note
    }));
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({
      ...auditLog,
      old_value: current,
      new_value: updated
    }));
    return updated;
  });
}

export async function recordCashHandoverDeposit(
  handover: CashHandover,
  deposit: CashHandoverDeposit,
  userId: string,
  auditLog: AuditLog
): Promise<CashHandover> {
  if (
    !Number.isInteger(deposit.amount) ||
    deposit.amount <= 0 ||
    !deposit.bank_name.trim() ||
    !deposit.reference.trim()
  ) {
    throw new Error("Saisissez un montant positif, la banque et la référence du bordereau.");
  }

  return runOnlineTransaction(async transaction => {
    const ref = doc(db, COLLECTION, handover.id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Cette remise n'existe plus.");
    const current = snapshot.data() as CashHandover;
    if (!["RECEIVED", "DISCREPANCY", "PARTIALLY_DEPOSITED"].includes(current.status)) {
      throw new Error("La remise doit d'abord être réceptionnée avant son dépôt bancaire.");
    }
    if (deposit.deposited_by !== userId) throw new Error("L'utilisateur du dépôt ne correspond pas à la session active.");
    const remaining = (current.received_amount || 0) - current.deposited_amount;
    if (deposit.amount > remaining) {
      throw new Error(`Le dépôt dépasse le montant encore disponible (${remaining.toLocaleString("fr-FR")} Ar).`);
    }
    const deposits = [...current.deposits, deposit];
    const depositedAmount = current.deposited_amount + deposit.amount;
    const updated: CashHandover = {
      ...current,
      deposits,
      deposited_amount: depositedAmount,
      status: depositedAmount === current.received_amount ? "DEPOSITED" : "PARTIALLY_DEPOSITED"
    };
    transaction.update(ref, {
      deposits: omitUndefined(deposits),
      deposited_amount: depositedAmount,
      status: updated.status
    });
    transaction.set(doc(db, "auditLogs", auditLog.id), omitUndefined({
      ...auditLog,
      old_value: current,
      new_value: updated
    }));
    return updated;
  });
}
