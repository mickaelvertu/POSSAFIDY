import type { ResellerReceipt } from "../types";
export const resellerBusinessDate = (timestamp: number) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Nairobi", year: "numeric", month: "2-digit", day: "2-digit"
}).format(timestamp);

export function pendingResellerReceipts(receipts: ResellerReceipt[], storeId: string, day: string, collector: string) {
  return receipts.filter(receipt => receipt.store_id === storeId && receipt.business_date === day &&
    resellerBusinessDate(receipt.paid_at) === day && receipt.collected_by === collector &&
    receipt.method === "CASH" && receipt.destination === "HANDOVER" && !receipt.handover_id);
}

export function resellerReceiptTotal(receipts: ResellerReceipt[]) {
  return receipts.reduce((sum, receipt) => sum + receipt.amount, 0);
}
