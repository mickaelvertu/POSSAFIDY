import { collection, doc, type Transaction } from "firebase/firestore";
import { auth, db, runOnlineTransaction } from "../firebase";
import type { AppUser, CashHandover, Expense, TreasuryFund, TreasuryMovement } from "../types";
import { assertFundDebit, handoverAvailable } from "./treasuryCalculation";

export function treasuryReceipt(transaction: Transaction, fund: TreasuryFund) {
  transaction.set(doc(db, "treasuryFunds", fund.id), fund);
  transaction.set(doc(db, "treasuryMovements", fund.last_movement_id), {
    id: fund.last_movement_id, kind: "RECEIPT", fund_id: "", destination_fund_id: fund.id,
    from_user: "", to_user: fund.owner_id, amount: fund.initial_amount,
    reference: fund.source_reference, purchase_id: "", created_by: auth.currentUser!.uid, created_at: fund.created_at
  } satisfies TreasuryMovement);
}

// Read every dependent document before writing, as required by Firestore transactions.
export async function prepareFundDebit(transaction: Transaction, fundId: string, owner: string, amount: number) {
  const ref = doc(db, "treasuryFunds", fundId);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists()) throw new Error("Fonds introuvable.");
  const fund = snapshot.data() as TreasuryFund;
  assertFundDebit(fund, owner, amount);
  const handoverRef = fund.handover_id ? doc(db, "cashHandovers", fund.handover_id) : null;
  const handover = handoverRef ? await transaction.get(handoverRef) : null;
  if (handoverRef && (!handover?.exists() || handoverAvailable(handover.data() as CashHandover) < amount)) {
    throw new Error("La remise ne dispose plus de ce montant.");
  }
  return { fund, apply(movement: TreasuryMovement) {
    transaction.update(ref, { balance: fund.balance - amount, last_movement_id: movement.id });
    transaction.set(doc(db, "treasuryMovements", movement.id), movement);
    if (handoverRef && handover && movement.kind !== "DEPOSIT") transaction.update(handoverRef, {
      allocated_amount: (handover.data()!.allocated_amount ?? 0) + amount,
      treasury_movement_id: movement.id
    });
  } };
}

export async function prepareExpenseRefund(transaction: Transaction, expense: Expense) {
  const fundRef = doc(db, "treasuryFunds", expense.treasury_fund_id!);
  const movementRef = doc(db, "treasuryMovements", expense.treasury_movement_id!);
  const [snapshot, originalSnapshot] = await Promise.all([transaction.get(fundRef), transaction.get(movementRef)]);
  if (!snapshot.exists() || !originalSnapshot.exists()) throw new Error("Le fonds ou le paiement d'origine est introuvable.");
  const fund = snapshot.data() as TreasuryFund;
  const original = originalSnapshot.data() as TreasuryMovement;
  if (original.kind !== "EXPENSE" || original.expense_id !== expense.id || original.fund_id !== fund.id ||
    original.amount !== expense.amount || original.from_user !== fund.owner_id) throw new Error("Le paiement d'origine ne correspond pas à cette dépense.");
  const handoverRef = fund.handover_id ? doc(db, "cashHandovers", fund.handover_id) : null;
  const handover = handoverRef ? await transaction.get(handoverRef) : null;
  if (handoverRef && (!handover?.exists() || (handover.data().allocated_amount ?? 0) < expense.amount)) {
    throw new Error("Le montant utilisé de la remise est incohérent.");
  }
  return { fund, apply(movement: TreasuryMovement) {
    transaction.update(fundRef, { balance: fund.balance + expense.amount, last_movement_id: movement.id });
    transaction.set(doc(db, "treasuryMovements", movement.id), movement);
    if (handoverRef && handover) transaction.update(handoverRef, {
      allocated_amount: handover.data()!.allocated_amount - expense.amount, treasury_movement_id: movement.id
    });
  } };
}

export async function receiveTreasuryFunds(user: AppUser, source: TreasuryFund["source"], amount: number, reference: string) {
  if (source === "POS") throw new Error("Utilisez la réception d'une remise POS.");
  if (!Number.isSafeInteger(amount) || amount <= 0 || !reference.trim()) throw new Error("Indiquez un montant positif et une référence.");
  const id = doc(collection(db, "treasuryFunds")).id;
  const movementId = `receipt-${id}`;
  await runOnlineTransaction(async transaction => {
    treasuryReceipt(transaction, { id, owner_id: user.uid, owner_name: user.displayName, source,
      source_reference: reference.trim(), handover_id: "", initial_amount: amount, balance: amount,
      created_at: Date.now(), last_movement_id: movementId });
  });
}

export async function adoptHistoricalHandover(user: AppUser, handoverId: string) {
  await runOnlineTransaction(async transaction => {
    const ref = doc(db, "cashHandovers", handoverId);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error("Remise introuvable.");
    const handover = snapshot.data() as CashHandover;
    const amount = handoverAvailable(handover);
    if (handover.treasury_fund_id || handover.received_by !== user.uid || !["RECEIVED", "DISCREPANCY", "PARTIALLY_DEPOSITED"].includes(handover.status) || amount <= 0) {
      throw new Error("Cette remise ne peut pas être reprise dans votre trésorerie.");
    }
    const id = `pos-${handoverId}`;
    transaction.update(ref, { treasury_fund_id: id, allocated_amount: 0 });
    treasuryReceipt(transaction, { id, owner_id: user.uid, owner_name: user.displayName, source: "POS",
      source_reference: handover.handover_number, handover_id: handoverId, initial_amount: amount,
      balance: amount, created_at: Date.now(), last_movement_id: `receipt-${id}` });
  });
}

export async function moveTreasuryFunds(user: AppUser, fundId: string, amount: number, reference: string, recipient?: AppUser) {
  if (!reference.trim()) throw new Error("Une référence est obligatoire.");
  if (recipient?.uid === user.uid) throw new Error("Choisissez un autre administrateur.");
  const id = doc(collection(db, "treasuryMovements")).id;
  const destinationId = recipient ? `transfer-${id}` : "";
  await runOnlineTransaction(async transaction => {
    const debit = await prepareFundDebit(transaction, fundId, user.uid, amount);
    if (!recipient && debit.fund.handover_id) throw new Error("Enregistrez ce dépôt depuis la remise de caisse correspondante.");
    if (recipient) {
      const profile = await transaction.get(doc(db, "users", recipient.uid));
      if (!profile.exists() || profile.data().status !== "ACTIVE" || !["ADMIN", "SUPER_ADMIN"].includes(profile.data().role)) {
        throw new Error("Le destinataire doit être un administrateur actif.");
      }
    }
    const now = Date.now();
    debit.apply({ id, kind: recipient ? "TRANSFER" : "DEPOSIT", fund_id: fundId,
      destination_fund_id: destinationId, from_user: user.uid, to_user: recipient?.uid ?? "",
      amount, reference: reference.trim(), purchase_id: "", created_by: user.uid, created_at: now });
    if (recipient) transaction.set(doc(db, "treasuryFunds", destinationId), {
      ...debit.fund, id: destinationId, owner_id: recipient.uid, owner_name: recipient.displayName,
      handover_id: "", initial_amount: amount, balance: amount, created_at: now, last_movement_id: id
    } satisfies TreasuryFund);
  });
}
