import { StockTransfer } from "../types";

export function cancellationEffects(transfer: StockTransfer) {
  if (["CANCELLED", "REJECTED"].includes(transfer.status)) throw new Error("Ce transfert est déjà clôturé.");
  if (transfer.purchase_id) throw new Error("Cette livraison est liée à un achat fournisseur : annulez-la depuis le cycle des achats.");
  if (transfer.lines.some(line => line.recycling_decision)) throw new Error("Un recyclage a déjà été décidé. Corrigez d'abord les opérations de production associées.");
  const shipped = ["SHIPPED", "IN_TRANSIT", "RECEIVED", "VALIDATED", "DISCREPANCY"].includes(transfer.status) && transfer.type !== "DIRECT_DEPOSIT";
  const received = ["VALIDATED", "DISCREPANCY"].includes(transfer.status);
  return transfer.lines.flatMap(line => [
    ...(shipped ? [{ storeId: transfer.source_store_id, articleId: line.article_id, quantity: line.quantity_sent, quarantine: transfer.type === "RECYCLING" }] : []),
    ...(received ? [{ storeId: transfer.destination_store_id, articleId: line.article_id, quantity: -line.quantity_accepted, quarantine: ["STORE_RETURN", "RECYCLING"].includes(transfer.type) }] : [])
  ]);
}
