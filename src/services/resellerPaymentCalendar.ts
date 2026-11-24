import type { CreditCustomer, Sale } from '../types';
import type { ManualCreditDebt } from './manualCreditCalculation';
import type { CalendarPaymentEntry } from './supplierPaymentCalendar';

export interface ResellerCalendarEntry extends CalendarPaymentEntry { sale?: Sale; debt?: ManualCreditDebt }

export function resellerCalendarEntries(sales: Sale[], debts: ManualCreditDebt[], customers: CreditCustomer[]): ResellerCalendarEntry[] {
  const names = new Map(customers.map(customer => [customer.id, customer.name]));
  return [
    ...sales.filter(sale => sale.customer_type === 'REVENDEUR' && sale.status === 'VALIDATED' && Number.isFinite(sale.credit_due_at) && sale.credit_due_at! > 0)
      .map(sale => ({ id: `sale:${sale.id}`, supplier_id: sale.credit_customer_id ? `id:${sale.credit_customer_id}` : `legacy:${JSON.stringify([sale.customer_name.trim().toLocaleLowerCase('fr-FR'), sale.customer_phone || ''])}`,
        supplier_name: names.get(sale.credit_customer_id || '') || sale.customer_name, purchase_number: sale.sale_number,
        status: 'RECEIVED' as const, payment_status: sale.payment_status === 'PAID' ? 'PAID' as const : 'PARTIAL' as const,
        expected_payment_at: sale.credit_due_at!, total: sale.total, amount_paid: Math.max(0, sale.amount_paid - (sale.change_returned || 0)), sale })),
    ...debts.map(debt => ({ id: `debt:${debt.id}`, supplier_id: `id:${debt.customer_id}`, supplier_name: names.get(debt.customer_id) || debt.customer_name,
      purchase_number: `Dette manuelle · ${debt.reference}`, status: 'RECEIVED' as const, payment_status: debt.amount_paid >= debt.amount ? 'PAID' as const : 'PARTIAL' as const,
      expected_payment_at: debt.due_at, total: debt.amount, amount_paid: debt.amount_paid, debt }))
  ];
}
