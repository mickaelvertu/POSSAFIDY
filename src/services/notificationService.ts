import { InventoryCount, ResellerOrder, StockTransfer } from "../types";

export type NotificationModule = "transfers" | "inventory" | "resellerPortal";

export interface ActionNotification {
  id: string;
  module: NotificationModule;
  title: string;
  detail: string;
  at: number;
}

export interface NotificationContext {
  uid: string;
  storeIds: string[];
  isAdmin: boolean;
  canReviewInventory: boolean;
  transfers: StockTransfer[];
  inventoryCounts: InventoryCount[];
  resellerOrders: ResellerOrder[];
}

export function buildActionNotifications(ctx: NotificationContext): ActionNotification[] {
  const items: ActionNotification[] = [];

  for (const t of ctx.transfers) {
    const at = t.shipped_at || t.approved_at || t.created_at;
    if (t.status === "IN_TRANSIT" && ctx.storeIds.includes(t.destination_store_id)) {
      items.push({ id: `tr-recv-${t.id}`, module: "transfers", title: "Transfert à réceptionner", detail: `${t.transfer_number} en route vers votre magasin`, at });
    } else if (t.status === "APPROVED" && ctx.storeIds.includes(t.source_store_id)) {
      items.push({ id: `tr-ship-${t.id}`, module: "transfers", title: "Transfert à expédier", detail: `${t.transfer_number} approuvé, prêt à partir`, at });
    } else if (t.status === "DRAFT" && ctx.isAdmin && t.requested_by !== ctx.uid) {
      items.push({ id: `tr-appr-${t.id}`, module: "transfers", title: "Transfert à valider", detail: `${t.transfer_number} demandé par ${t.requested_by_name}`, at });
    }
  }

  for (const c of ctx.inventoryCounts) {
    if (c.status === "AWAITING_SIGNATURE" && c.manager_id === ctx.uid) {
      items.push({ id: `ic-sign-${c.id}`, module: "inventory", title: "Comptage à signer", detail: `${c.count_number} · ${c.store_name}`, at: c.submitted_at || c.updated_at });
    } else if (c.status === "SUBMITTED" && ctx.canReviewInventory) {
      items.push({ id: `ic-rev-${c.id}`, module: "inventory", title: "Comptage à valider", detail: `${c.count_number} · ${c.store_name}`, at: c.submitted_at || c.updated_at });
    }
  }

  if (ctx.isAdmin) {
    for (const o of ctx.resellerOrders) {
      if (o.status === "PENDING") {
        items.push({ id: `ro-${o.id}`, module: "resellerPortal", title: "Commande revendeur à valider", detail: `Commande ${o.id}`, at: o.created_at });
      }
    }
  }

  return items.sort((a, b) => b.at - a.at);
}
