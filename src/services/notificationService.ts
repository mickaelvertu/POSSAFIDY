import { InventoryCount, ResellerOrder, Sale, StockTransfer } from "../types";

export type NotificationModule = "transfers" | "inventory" | "resellerPortal" | "sales";

export interface ActionNotification {
  id: string;
  module: NotificationModule;
  entityId: string;
  title: string;
  detail: string;
  at: number;
}

export interface NotificationContext {
  uid: string;
  storeIds: string[];
  canReceiveTransfers: boolean;
  isAdmin: boolean;
  canReviewInventory: boolean;
  transfers: StockTransfer[];
  inventoryCounts: InventoryCount[];
  resellerOrders: ResellerOrder[];
  sales: Sale[];
  canShipSales: boolean;
  warehouseStoreIds?: string[];
  canApproveTransfer?: (transfer: StockTransfer) => boolean;
}

export function buildActionNotifications(ctx: NotificationContext): ActionNotification[] {
  const items: ActionNotification[] = [];

  for (const t of ctx.transfers) {
    if (t.status === "DRAFT" && (ctx.canApproveTransfer ? ctx.canApproveTransfer(t) : ctx.isAdmin && t.requested_by !== ctx.uid)) {
      items.push({ id: `tr-appr-${t.id}`, module: "transfers", entityId: t.id, title: "Brouillon de transfert à approuver", detail: `${t.transfer_number} · ${t.requested_by_name}`, at: t.created_at });
      continue;
    }
    if (t.type === "DIRECT_DEPOSIT") {
      if (t.status === "APPROVED" && ctx.canReceiveTransfers && ctx.storeIds.includes(t.destination_store_id) && t.approved_by !== ctx.uid) {
        items.push({ id: `tr-deposit-${t.id}`, module: "transfers", entityId: t.id, title: "Dépôt à réceptionner", detail: `${t.transfer_number} approuvé par ${t.approved_by_name || "un admin"}`, at: t.approved_at || t.updated_at });
      }
      continue;
    }
    const at = t.shipped_at || t.approved_at || t.created_at;
    if (t.status === "IN_TRANSIT" && ctx.storeIds.includes(t.destination_store_id)) {
      items.push({ id: `tr-recv-${t.id}`, module: "transfers", entityId: t.id, title: "Transfert à réceptionner", detail: `${t.transfer_number} en route vers votre magasin`, at });
    } else if (t.status === "RECEIVED" && ctx.canReceiveTransfers && ctx.storeIds.includes(t.destination_store_id) && t.received_by !== ctx.uid) {
      items.push({ id: `tr-confirm-${t.id}`, module: "transfers", entityId: t.id, title: "Entrée de stock à confirmer", detail: `${t.transfer_number} saisie par ${t.received_by_name || "un collègue"}`, at: t.received_at || t.updated_at });
    } else if (t.status === "APPROVED" && ctx.storeIds.includes(t.source_store_id)) {
      items.push({ id: `tr-ship-${t.id}`, module: "transfers", entityId: t.id, title: "Transfert à expédier", detail: `${t.transfer_number} approuvé, prêt à partir`, at });
    }
  }

  for (const c of ctx.inventoryCounts) {
    if (c.status === "AWAITING_SIGNATURE" && c.manager_id === ctx.uid) {
      items.push({ id: `ic-sign-${c.id}`, module: "inventory", entityId: c.id, title: "Comptage à signer", detail: `${c.count_number} · ${c.store_name}`, at: c.submitted_at || c.updated_at });
    } else if (c.status === "SUBMITTED" && ctx.canReviewInventory) {
      items.push({ id: `ic-rev-${c.id}`, module: "inventory", entityId: c.id, title: "Comptage à valider", detail: `${c.count_number} · ${c.store_name}`, at: c.submitted_at || c.updated_at });
    }
  }

  for (const s of ctx.sales) {
    if (s.status === "DRAFT" && (ctx.isAdmin || ctx.canShipSales && ctx.storeIds.includes(s.store_id)) && ctx.warehouseStoreIds?.includes(s.store_id)) {
      items.push({ id: `sa-draft-${s.id}`, module: "sales", entityId: s.id, title: "Brouillon de vente entrepôt à contrôler", detail: `${s.sale_number} · ${s.customer_name}`, at: s.created_at });
      continue;
    }
    if (s.customer_type !== "REVENDEUR") continue;
    if (s.status === "VERIFIED" && ctx.isAdmin) {
      items.push({ id: `sa-appr-${s.id}`, module: "sales", entityId: s.id, title: "Vente revendeur à approuver", detail: `${s.sale_number} · ${s.customer_name}`, at: s.verified_at || s.created_at });
    } else if (s.status === "APPROVED" && ctx.canShipSales && ctx.storeIds.includes(s.store_id)) {
      items.push({ id: `sa-ship-${s.id}`, module: "sales", entityId: s.id, title: "Vente revendeur à expédier", detail: `${s.sale_number} · ${s.customer_name} approuvée, prête à partir`, at: s.approved_at || s.created_at });
    }
  }

  if (ctx.isAdmin) {
    for (const o of ctx.resellerOrders) {
      if (o.status === "PENDING") {
        items.push({ id: `ro-${o.id}`, module: "resellerPortal", entityId: o.id, title: "Commande revendeur à valider", detail: `Commande ${o.id}`, at: o.created_at });
      }
    }
  }

  return items.sort((a, b) => b.at - a.at);
}
