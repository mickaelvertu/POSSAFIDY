import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db, runOnlineTransaction } from "../firebase";
import { AuditLog, CreditCustomer, CreditFollowUp, CreditPayment, Sale } from "../types";

const CUSTOMERS = "creditCustomers";
const SALES = "sales";
const AUDIT_LOGS = "auditLogs";

function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, clean(item)])) as T;
  }
  return value;
}

export async function loadCreditCustomers(): Promise<CreditCustomer[]> {
  const snapshot = await getDocs(collection(db, CUSTOMERS));
  return snapshot.docs.map(item => item.data() as CreditCustomer);
}

export async function loadCreditCustomerForUser(userId: string): Promise<CreditCustomer | undefined> {
  const snapshot = await getDocs(query(collection(db, CUSTOMERS), where("linked_user_id", "==", userId)));
  if (snapshot.size > 1) throw new Error("Plusieurs comptes crédit sont liés à votre profil. Contactez le gestionnaire crédit.");
  return snapshot.docs[0]?.data() as CreditCustomer | undefined;
}

export async function saveCreditCustomer(customer: CreditCustomer, auditLog: AuditLog): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, CUSTOMERS, customer.id), clean(customer));
  batch.set(doc(db, AUDIT_LOGS, auditLog.id), clean(auditLog));
  await batch.commit();
}

export async function recordCreditPayment(
  sale: Sale,
  payment: CreditPayment,
  auditLog: AuditLog
): Promise<Sale> {
  const saleRef = doc(db, SALES, sale.id);
  const customerRef = doc(db, CUSTOMERS, sale.credit_customer_id || "");
  let updatedSale: Sale | undefined;
  await runOnlineTransaction(async transaction => {
    const [saleSnapshot, customerSnapshot] = await Promise.all([
      transaction.get(saleRef),
      transaction.get(customerRef)
    ]);
    if (!saleSnapshot.exists() || !customerSnapshot.exists()) throw new Error("Vente ou compte revendeur introuvable.");
    const current = saleSnapshot.data() as Sale;
    const customer = customerSnapshot.data() as CreditCustomer;
    if (current.status !== "VALIDATED" || current.payment_status === "PAID" || payment.amount <= 0 || payment.amount > current.total - current.amount_paid) {
      throw new Error("Le montant du règlement dépasse le solde restant ou la vente est déjà soldée.");
    }
    if (customer.outstanding_balance < payment.amount) throw new Error("Le solde crédit du revendeur est incohérent. Contactez un administrateur.");
    const amountPaid = current.amount_paid + payment.amount;
    const timestamp = payment.paid_at;
    updatedSale = clean({
      ...current,
      amount_paid: amountPaid,
      payment_status: amountPaid >= current.total ? "PAID" : "PARTIAL",
      credit_payments: [...(current.credit_payments || []), payment]
    });
    const updatedCustomer = {
      ...customer,
      outstanding_balance: Math.max(0, customer.outstanding_balance - payment.amount),
      updated_at: timestamp
    };
    transaction.set(saleRef, updatedSale);
    transaction.set(customerRef, clean(updatedCustomer));
    transaction.set(doc(db, AUDIT_LOGS, auditLog.id), clean(auditLog));
  });
  if (!updatedSale) throw new Error("Le règlement n'a pas été enregistré.");
  return updatedSale;
}

export async function recordCreditFollowUp(
  sale: Sale,
  followUp: CreditFollowUp,
  auditLog: AuditLog
): Promise<Sale> {
  const saleRef = doc(db, SALES, sale.id);
  let updatedSale: Sale | undefined;
  await runOnlineTransaction(async transaction => {
    const snapshot = await transaction.get(saleRef);
    if (!snapshot.exists()) throw new Error("Vente introuvable.");
    const current = snapshot.data() as Sale;
    if (current.payment_status === "PAID" || current.status !== "VALIDATED") {
      throw new Error("Seules les ventes validées et encore dues peuvent faire l'objet d'une relance.");
    }
    updatedSale = clean({
      ...current,
      credit_followups: [...(current.credit_followups || []), followUp]
    });
    transaction.set(saleRef, updatedSale);
    transaction.set(doc(db, AUDIT_LOGS, auditLog.id), clean(auditLog));
  });
  if (!updatedSale) throw new Error("La relance n'a pas été enregistrée.");
  return updatedSale;
}

export async function createCreditSale(
  sale: Sale,
  auditLog: AuditLog
): Promise<void> {
  if (!Number.isFinite(sale.total) || !Number.isFinite(sale.amount_paid) || sale.amount_paid < 0) {
    throw new Error("Les montants de la vente sont invalides.");
  }
  if (sale.credit_customer_id && sale.customer_type !== "REVENDEUR") {
    throw new Error("Un compte de crédit ne peut être associé qu'à une vente revendeur.");
  }
  const saleRef = doc(db, SALES, sale.id);
  if (typeof navigator !== "undefined" && !navigator.onLine && sale.status === "DRAFT" && !sale.credit_customer_id) {
    const batch = writeBatch(db);
    batch.set(saleRef, clean(sale));
    batch.set(doc(db, AUDIT_LOGS, auditLog.id), clean(auditLog));
    await batch.commit();
    return;
  }
  await runOnlineTransaction(async transaction => {
    if ((await transaction.get(saleRef)).exists()) throw new Error("Cette vente existe déjà.");
    if (sale.credit_customer_id && sale.payment_status !== "PAID") {
      const customerRef = doc(db, CUSTOMERS, sale.credit_customer_id);
      const customerSnapshot = await transaction.get(customerRef);
      if (!customerSnapshot.exists()) throw new Error("Revendeur crédit introuvable.");
      const customer = customerSnapshot.data() as CreditCustomer;
      if (!customer.is_active) throw new Error("Le compte de ce revendeur est désactivé.");
      const creditAmount = Math.max(0, sale.total - sale.amount_paid);
      if (customer.outstanding_balance + creditAmount > customer.credit_limit) {
        throw new Error(`Plafond dépassé. Crédit disponible : ${Math.max(0, customer.credit_limit - customer.outstanding_balance).toLocaleString("fr-FR")} Ar.`);
      }
      transaction.set(customerRef, clean({
        ...customer,
        outstanding_balance: customer.outstanding_balance + creditAmount,
        last_credit_sale_id: sale.id,
        updated_at: sale.created_at
      }));
    }
    transaction.set(saleRef, clean(sale));
    transaction.set(doc(db, AUDIT_LOGS, auditLog.id), clean(auditLog));
  });
}
