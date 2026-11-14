import { doc, type Transaction } from 'firebase/firestore';
import { auth, db, runOnlineTransaction } from '../firebase';
import type { CreditCustomer, CreditPayment } from '../types';
import { validateManualDebt, validateManualPayment, type ManualCreditDebt } from './manualCreditCalculation';
import { treasuryReceipt } from './treasuryService';

async function actor(tx: Transaction) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Reconnectez-vous pour continuer.');
  const profile = (await tx.get(doc(db, 'users', uid))).data();
  const admin = ['ADMIN','SUPER_ADMIN'].includes(profile?.role);
  if (profile?.status !== 'ACTIVE' || (!admin && !profile?.permissions?.includes('credit.manage'))) throw new Error('Accès réservé à la gestion des crédits.');
  return { uid, admin, name: profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.name || uid };
}
export async function createManualCreditDebt(customerId: string, amount: number, dueAt: number, reference: string, note: string) {
  const key = JSON.stringify([customerId,reference.normalize('NFKC').trim().toLocaleLowerCase('fr-FR')]);
  const hash = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
  const id = 'manual-' + Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
  const ref=doc(db,'manualCreditDebts',id);
  await runOnlineTransaction(async tx => {
    const who = await actor(tx);
    const customerRef=doc(db,'creditCustomers',customerId);
    const [existing,snapshot] = await Promise.all([tx.get(ref),tx.get(customerRef)]);
    if(existing.exists()) throw new Error('Cette référence est déjà enregistrée pour ce revendeur.');
    if(!snapshot.exists()) throw new Error('Revendeur introuvable.');
    const customer=snapshot.data() as CreditCustomer;
    validateManualDebt(customer,amount,dueAt,reference);
    if(note.trim().length>2000) throw new Error('La note est limitée à 2 000 caractères.');
    const now=Date.now(), auditId=crypto.randomUUID();
    const debt: ManualCreditDebt={id,customer_id:customerId,customer_name:customer.name,reference:reference.trim(),note:note.trim(),amount,amount_paid:0,due_at:dueAt,created_at:now,updated_at:now,created_by:who.uid,created_by_name:who.name,payments:[],last_audit_id:auditId};
    tx.set(ref,debt);
    tx.update(customerRef,{outstanding_balance:customer.outstanding_balance+amount,updated_at:now,last_manual_debt_id:id});
    tx.set(doc(db,'auditLogs',auditId),{id:auditId,user_id:who.uid,user_name:who.name,action:'MANUAL_CREDIT_CREATED',entity_type:'CREDIT_CUSTOMER',entity_id:customerId,new_value:debt,created_at:now});
  });
}
export async function payManualCreditDebt(id: string, paymentId: string, amount: number, method: CreditPayment['method'], reference: string) {
  await runOnlineTransaction(async tx=>{
    const who=await actor(tx);
    if(!['CASH','MVOLA','AIRTEL_MONEY','ORANGE_MONEY','BANK_TRANSFER','CHECK'].includes(method)) throw new Error('Mode de paiement invalide.');
    if(reference.trim().length>150) throw new Error('La référence est limitée à 150 caractères.');
    if(method==='CASH'&&!who.admin) throw new Error('Les espèces doivent être encaissées par un administrateur.');
    const ref=doc(db,'manualCreditDebts',id), snapshot=await tx.get(ref);
    if(!snapshot.exists()) throw new Error('Dette introuvable.');
    const debt=snapshot.data() as ManualCreditDebt;
    if(debt.payments.some(p=>p.id===paymentId)) throw new Error('Ce paiement est déjà enregistré.');
    validateManualPayment(debt,amount);
    const customerRef=doc(db,'creditCustomers',debt.customer_id), customer=await tx.get(customerRef);
    if(!customer.exists() || customer.data().outstanding_balance<amount) throw new Error('L’encours du revendeur est incohérent.');
    const now=Date.now(), auditId=crypto.randomUUID();
    const payment: CreditPayment={id:paymentId,amount,method,reference:reference.trim(),paid_at:now,collected_by:who.uid,collected_by_name:who.name,recorded_by:who.uid,recorded_by_name:who.name};
    tx.update(ref,{amount_paid:debt.amount_paid+amount,payments:[...debt.payments,payment],updated_at:now,last_audit_id:auditId});
    tx.update(customerRef,{outstanding_balance:customer.data().outstanding_balance-amount,updated_at:now,last_manual_debt_id:id});
    tx.set(doc(db,'auditLogs',auditId),{id:auditId,user_id:who.uid,user_name:who.name,action:'MANUAL_CREDIT_PAYMENT',entity_type:'CREDIT_CUSTOMER',entity_id:debt.customer_id,new_value:{debt_id:id,...payment},created_at:now});
    if(method==='CASH'){
      const fundId='manual-credit-'+paymentId;
      treasuryReceipt(tx,{id:fundId,owner_id:who.uid,owner_name:who.name,source:'OTHER',source_reference:`Règlement dette manuelle ${debt.reference} · ${paymentId}`,handover_id:'',initial_amount:amount,balance:amount,created_at:now,last_movement_id:'receipt-'+fundId});
    }
  });
}
