import { doc } from 'firebase/firestore';
import { auth, db, runOnlineTransaction } from '../firebase';
import type { AuditLog, CreditCustomer, CreditPaymentReversal, ResellerReceipt, Sale, TreasuryFund, TreasuryMovement } from '../types';
import { applyCreditPaymentReversal } from './creditPaymentReversal';

export async function reverseCreditPayment(saleId: string, paymentId: string, reason: string, audit: AuditLog) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Connectez-vous pour annuler un encaissement.');
  return runOnlineTransaction(async transaction => {
    const saleRef = doc(db, 'sales', saleId);
    const reversalRef = doc(db, 'resellerPaymentReversals', paymentId);
    const receiptRef = doc(db, 'resellerReceipts', paymentId);
    const [profile, snapshot, previous, receiptSnapshot] = await Promise.all([
      transaction.get(doc(db, 'users', uid)), transaction.get(saleRef), transaction.get(reversalRef), transaction.get(receiptRef)
    ]);
    if (profile.data()?.status !== 'ACTIVE' || profile.data()?.role !== 'SUPER_ADMIN') throw new Error('Annulation réservée aux super administrateurs.');
    if (!snapshot.exists() || previous.exists()) throw new Error('Vente introuvable ou paiement déjà annulé.');
    const sale = snapshot.data() as Sale;
    const payment = sale.credit_payments?.find(item => item.id === paymentId);
    if (!payment) throw new Error('Paiement introuvable.');
    const receipt = receiptSnapshot.data() as ResellerReceipt | undefined;
    if (receipt?.handover_id) throw new Error('Cet encaissement est déjà intégré à une remise de caisse. Corrigez la remise avant de réessayer.');
    if (payment.cash_destination && !receipt) throw new Error('Le justificatif de cet encaissement est introuvable.');
    if (!receipt && payment.method === 'CASH') throw new Error('Cet ancien paiement en espèces ne possède pas de justificatif permettant de vérifier les remises de caisse.');
    if (receipt?.method === 'CASH' && receipt.destination === 'HANDOVER') {
      const dailyHandover = await transaction.get(doc(db, 'cashHandovers', `cash-handover-${encodeURIComponent(receipt.store_id)}-${receipt.business_date}`));
      if (dailyHandover.exists()) throw new Error('La caisse de cette journée a déjà été remise. Régularisez la remise avant l’annulation.');
    }
    const customerRef = sale.credit_customer_id ? doc(db, 'creditCustomers', sale.credit_customer_id) : null;
    const customerSnapshot = customerRef ? await transaction.get(customerRef) : null;
    if (customerRef && !customerSnapshot?.exists()) throw new Error('Compte revendeur introuvable.');
    const fundRef = receipt?.destination === 'TREASURY' ? doc(db, 'treasuryFunds', `reseller-${paymentId}`) : null;
    const fund = fundRef ? (await transaction.get(fundRef)).data() as TreasuryFund | undefined : undefined;
    if (fundRef && (!fund || fund.balance !== payment.amount || fund.initial_amount !== payment.amount || fund.last_movement_id !== `receipt-reseller-${paymentId}`)) {
      throw new Error('Les fonds de cet encaissement ont déjà été utilisés ou transférés. Régularisez ces opérations avant l’annulation.');
    }
    const timestamp = Date.now();
    const reversal: CreditPaymentReversal = { id: paymentId, sale_id: saleId, payment, reason: reason.trim(), reversed_at: timestamp,
      reversed_by: uid, reversed_by_name: profile.data()?.displayName || uid, audit_id: audit.id };
    const updated = applyCreditPaymentReversal(sale, reversal);
    transaction.set(reversalRef, reversal);
    transaction.set(saleRef, updated);
    if (customerRef && customerSnapshot) {
      const customer = customerSnapshot.data() as CreditCustomer;
      transaction.update(customerRef, { outstanding_balance: customer.outstanding_balance + payment.amount, last_payment_sale_id: saleId, updated_at: timestamp });
    }
    if (receipt) transaction.update(receiptRef, { reversal_id: paymentId });
    if (fundRef && fund) {
      const id = `reversal-${paymentId}`;
      const movement: TreasuryMovement = { id, kind: 'RECEIPT_REVERSAL', fund_id: fund.id, destination_fund_id: '', from_user: fund.owner_id,
        to_user: '', amount: payment.amount, reference: `Annulation ${sale.sale_number} / ${paymentId}`, purchase_id: '', created_by: uid, created_at: timestamp };
      transaction.update(fundRef, { balance: 0, last_movement_id: id });
      transaction.set(doc(db, 'treasuryMovements', id), movement);
    }
    transaction.set(doc(db, 'auditLogs', audit.id), { ...audit, action: 'CREDIT_PAYMENT_REVERSED', entity_type: 'SALE', entity_id: saleId,
      user_id: uid, created_at: timestamp, new_value: reversal });
    return updated;
  });
}
