import { doc, type Transaction } from "firebase/firestore";
import { auth, db } from "../firebase";
import type { CreditPayment, ResellerReceipt, Sale } from "../types";
import { resellerBusinessDate } from "./resellerReceiptCalculation";
import { treasuryReceipt } from "./treasuryService";
import { withPaymentAccess } from "./paymentAccess";

// Call before any transaction writes. The authenticated user must be the
// collector; names and treasury routing come from their server profile.
export async function prepareResellerReceipt(transaction: Transaction, sale: Sale, payment: CreditPayment) {
  if (!payment.collected_by || !payment.collected_by_name) throw new Error("Indiquez la personne qui a réellement reçu le paiement.");
  if (!Number.isSafeInteger(payment.amount) || payment.amount <= 0) throw new Error("Montant invalide.");
  const collector = await withPaymentAccess("vérification du profil de l'encaisseur", () => transaction.get(doc(db, "users", payment.collected_by!)));
  const profile = collector.data();
  const admin = ["ADMIN", "SUPER_ADMIN"].includes(profile?.role);
  if (profile?.status !== "ACTIVE" || (!admin && !(profile?.assignedStores || []).includes(sale.store_id))) {
    throw new Error("L'encaisseur doit être actif et affecté au magasin, ou administrateur.");
  }
  const recorder = await withPaymentAccess("vérification de la session connectée", () => transaction.get(doc(db, "users", auth.currentUser!.uid)));
  if (recorder.data()?.status !== "ACTIVE" || payment.collected_by !== auth.currentUser!.uid) {
    throw new Error("Chaque personne doit enregistrer uniquement les paiements qu'elle a personnellement reçus.");
  }
  const store = await withPaymentAccess("lecture du magasin de la vente", () => transaction.get(doc(db, "stores", sale.store_id)));
  if (store.data()?.store_type === "CENTRAL_WAREHOUSE" && payment.method === "CASH" && !admin && profile?.role !== "RESPONSABLE_MAGASIN") {
    throw new Error("Les espèces DEP doivent être reçues et enregistrées par un responsable du dépôt ou un administrateur.");
  }
  const ref = doc(db, "resellerReceipts", payment.id);
  if ((await withPaymentAccess("vérification de l'unicité du paiement", () => transaction.get(ref))).exists()) throw new Error("Ce paiement a déjà été enregistré.");
  const name = profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || profile?.name || payment.collected_by;
  const receipt: ResellerReceipt = {
    id: payment.id, sale_id: sale.id, store_id: sale.store_id, amount: payment.amount,
    method: payment.method, paid_at: payment.paid_at, business_date: resellerBusinessDate(payment.paid_at),
    collected_by: payment.collected_by, collected_by_name: name,
    recorded_by: auth.currentUser!.uid, recorded_by_name: name,
    destination: admin && payment.method === "CASH" ? "TREASURY" : "HANDOVER", handover_id: ""
  };
  return { receipt, apply() {
    transaction.set(ref, receipt);
    if (receipt.destination === "TREASURY") {
      const id = `reseller-${receipt.id}`;
      treasuryReceipt(transaction, { id, owner_id: receipt.collected_by, owner_name: name,
        source: "OTHER", source_reference: `Règlement revendeur ${sale.sale_number} · ${receipt.id}`,
        handover_id: "", initial_amount: receipt.amount, balance: receipt.amount,
        created_at: receipt.paid_at, last_movement_id: `receipt-${id}` });
    }
  } };
}
