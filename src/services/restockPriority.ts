import type { StockTransfer, StoreStock, TransferTypeCode } from "../types";

const inboundTypes = new Set<TransferTypeCode>([
  "CENTRAL_TO_POS", "CENTRAL_TO_RESELLER", "STORE_TO_STORE", "MANUFACTURER_TO_STORE", "SUPPLIER_TO_STORE",
]);

export function isInboundRestock(transfer: StockTransfer) {
  return inboundTypes.has(transfer.type);
}

export function restockPriorities(transfers: StockTransfer[], stocks: StoreStock[]) {
  const quantities = new Map(stocks.map(stock => [
    stock.store_id + "/" + stock.article_id,
    stock.quantity - (stock.reserved_quantity ?? 0),
  ]));
  return new Map(transfers.map(transfer => {
    if (!isInboundRestock(transfer) || !["DRAFT", "APPROVED", "SHIPPED", "IN_TRANSIT", "RECEIVED"].includes(transfer.status)) {
      return [transfer.id, 0];
    }
    const urgent = /\b(?:urgent(?:e|es|s)?|maika|vonjy)\b/i.test(transfer.note ?? "");
    const stockout = transfer.lines.some(line =>
      (quantities.get(transfer.destination_store_id + "/" + line.article_id) ?? Infinity) <= 0);
    return [transfer.id, 1 + (urgent ? 2 : 0) + (stockout ? 1 : 0)];
  }));
}
