import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where
} from "firebase/firestore";
import { db } from "../firebase";
import { AuditLog, Production, Sale, StockMovement, StoreStock } from "../types";

const SALES = "sales";
const PRODUCTIONS = "productions";
const STOCKS = "stocks";
const MOVEMENTS = "movements";
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

function audit(
  action: string,
  entityType: string,
  entityId: string,
  userId: string,
  userName: string,
  storeId?: string,
  oldValue?: unknown,
  newValue?: unknown
): AuditLog {
  return clean({
    id: `audit-${crypto.randomUUID()}`,
    user_id: userId,
    user_name: userName,
    store_id: storeId,
    device_id: "POS-WEB-CLIENT",
    action,
    entity_type: entityType,
    entity_id: entityId,
    old_value: oldValue,
    new_value: newValue,
    created_at: Date.now()
  });
}

async function loadForStores<T>(collectionName: string, storeField: string, allowed: boolean, storeIds?: string[]): Promise<T[]> {
  if (!allowed) return [];
  if (storeIds === undefined) {
    return (await getDocs(collection(db, collectionName))).docs.map(item => item.data() as T);
  }
  if (storeIds.length === 0) return [];
  const snapshots = await Promise.all(storeIds.map(storeId =>
    getDocs(query(collection(db, collectionName), where(storeField, "==", storeId)))
  ));
  return [...new Map(snapshots.flatMap(snapshot => snapshot.docs)
    .map(item => [item.id, item.data() as T])).values()];
}

export async function loadOperationalData(access: { sales: boolean; productions: boolean; audit: boolean; storeIds?: string[]; userId: string }): Promise<{
  sales: Sale[];
  productions: Production[];
  auditLogs: AuditLog[];
}> {
  const [sales, productions, auditLogs] = await Promise.all([
    loadForStores<Sale>(SALES, "store_id", access.sales, access.storeIds),
    loadForStores<Production>(PRODUCTIONS, "manufacturer_store_id", access.productions, access.storeIds),
    !access.audit
      ? Promise.resolve([])
      : access.storeIds === undefined
        ? getDocs(collection(db, AUDIT_LOGS)).then(snapshot => snapshot.docs.map(item => item.data() as AuditLog))
        : getDocs(query(collection(db, AUDIT_LOGS), where("user_id", "==", access.userId)))
            .then(snapshot => snapshot.docs.map(item => item.data() as AuditLog))
  ]);
  const newestFirst = <T extends { created_at: number }>(rows: T[]) => rows.sort((a, b) => b.created_at - a.created_at);
  return {
    sales: newestFirst(sales),
    productions: newestFirst(productions),
    auditLogs: newestFirst(auditLogs)
  };
}

export async function createSale(sale: Sale): Promise<AuditLog> {
  const entry = audit("SALE_CREATED", "SALE", sale.id, sale.seller_id, sale.seller_name, sale.store_id, undefined, sale);
  await runTransaction(db, async transaction => {
    const saleRef = doc(db, SALES, sale.id);
    if ((await transaction.get(saleRef)).exists()) throw new Error("Cette vente existe déjà.");
    transaction.set(saleRef, clean(sale));
    transaction.set(doc(db, AUDIT_LOGS, entry.id), entry);
  });
  return entry;
}

export async function advanceSale(
  sale: Sale,
  nextStatus: "CHECKING" | "VERIFIED",
  userId: string,
  userName: string
): Promise<{ sale: Sale; auditLog: AuditLog }> {
  const allowed = sale.status === "DRAFT" && nextStatus === "CHECKING"
    || sale.status === "CHECKING" && nextStatus === "VERIFIED";
  if (!allowed) throw new Error("Cette transition de vente n'est plus autorisée.");
  const updated: Sale = clean({
    ...sale,
    status: nextStatus,
    ...(nextStatus === "VERIFIED" ? { verified_by: userId, verified_by_name: userName, verified_at: Date.now() } : {})
  });
  const entry = audit(`SALE_${nextStatus}`, "SALE", sale.id, userId, userName, sale.store_id, sale, updated);
  await runTransaction(db, async transaction => {
    const saleRef = doc(db, SALES, sale.id);
    const snapshot = await transaction.get(saleRef);
    if (!snapshot.exists() || (snapshot.data() as Sale).status !== sale.status) {
      throw new Error("Le statut de la vente a changé. Rechargez les données.");
    }
    transaction.set(saleRef, updated);
    transaction.set(doc(db, AUDIT_LOGS, entry.id), entry);
  });
  return { sale: updated, auditLog: entry };
}

export async function cancelSale(
  sale: Sale,
  userId: string,
  userName: string
): Promise<{ sale: Sale; auditLog: AuditLog }> {
  if (["VALIDATED", "CANCELLED", "REFUNDED"].includes(sale.status)) {
    throw new Error("Une vente validée doit passer par une procédure de remboursement.");
  }
  const updated: Sale = { ...sale, status: "CANCELLED" };
  const entry = audit("SALE_CANCELLED", "SALE", sale.id, userId, userName, sale.store_id, sale, updated);
  await runTransaction(db, async transaction => {
    const saleRef = doc(db, SALES, sale.id);
    const snapshot = await transaction.get(saleRef);
    if (!snapshot.exists() || (snapshot.data() as Sale).status !== sale.status) {
      throw new Error("Le statut de la vente a changé. Rechargez les données.");
    }
    transaction.set(saleRef, clean(updated));
    transaction.set(doc(db, AUDIT_LOGS, entry.id), entry);
  });
  return { sale: updated, auditLog: entry };
}

function stockReference(stocks: StoreStock[], storeId: string, articleId: string) {
  const existing = stocks.find(stock => stock.store_id === storeId && stock.article_id === articleId);
  return {
    reference: doc(db, STOCKS, existing?.id || `stock-${storeId}-${articleId}`),
    fallback: existing
  };
}

export async function validateSale(
  sale: Sale,
  knownStocks: StoreStock[],
  userId: string,
  userName: string
): Promise<{ sale: Sale; stocks: StoreStock[]; movements: StockMovement[]; auditLog: AuditLog }> {
  const quantities = new Map<string, number>();
  sale.lines.filter(line => line.line_type !== "SERVICE").forEach(line => quantities.set(line.article_id, (quantities.get(line.article_id) || 0) + line.quantity));
  const stockTargets = [...quantities].map(([articleId, quantity]) => ({ articleId, quantity, ...stockReference(knownStocks, sale.store_id, articleId) }));
  const saleRef = doc(db, SALES, sale.id);
  const timestamp = Date.now();
  const updatedSale: Sale = { ...sale, status: "VALIDATED", validated_by: userId, validated_by_name: userName, validated_at: timestamp };
  const entry = audit("SALE_VALIDATED", "SALE", sale.id, userId, userName, sale.store_id, sale, updatedSale);
  const updatedStocks: StoreStock[] = [];
  const movements: StockMovement[] = [];

  await runTransaction(db, async transaction => {
    const saleSnapshot = await transaction.get(saleRef);
    if (!saleSnapshot.exists() || (saleSnapshot.data() as Sale).status !== "VERIFIED") {
      throw new Error("La vente doit être vérifiée avant validation.");
    }
    const snapshots = await Promise.all(stockTargets.map(target => transaction.get(target.reference)));
    stockTargets.forEach((target, index) => {
      const current = snapshots[index].exists() ? snapshots[index].data() as StoreStock : target.fallback;
      const before = current?.quantity || 0;
      if (target.quantity <= 0 || before < target.quantity) {
        throw new Error(`Stock insuffisant pour l'article ${target.articleId}. Disponible : ${before}.`);
      }
      const stock: StoreStock = {
        id: current?.id || target.reference.id,
        store_id: sale.store_id,
        article_id: target.articleId,
        quantity: before - target.quantity,
        reserved_quantity: current?.reserved_quantity || 0,
        updated_at: timestamp
      };
      const movement: StockMovement = {
        id: `movement-${sale.id}-${target.articleId}`,
        store_id: sale.store_id,
        article_id: target.articleId,
        movement_type: "SALE",
        quantity: -target.quantity,
        reference_type: "SALE",
        reference_id: sale.id,
        reference_number: sale.sale_number,
        before_quantity: before,
        after_quantity: stock.quantity,
        created_by: userId,
        created_by_name: userName,
        created_at: timestamp
      };
      updatedStocks.push(stock);
      movements.push(movement);
      transaction.set(target.reference, stock);
      transaction.set(doc(db, MOVEMENTS, movement.id), movement);
    });
    transaction.set(saleRef, clean(updatedSale));
    transaction.set(doc(db, AUDIT_LOGS, entry.id), entry);
  });
  return { sale: updatedSale, stocks: updatedStocks, movements, auditLog: entry };
}

export async function createProduction(
  production: Production,
  knownStocks: StoreStock[]
): Promise<{ stocks: StoreStock[]; movements: StockMovement[]; auditLog: AuditLog }> {
  const deltas = new Map<string, number>();
  production.consumptions.forEach(line => deltas.set(line.article_id, (deltas.get(line.article_id) || 0) - line.quantity));
  production.outputs.forEach(line => deltas.set(line.article_id, (deltas.get(line.article_id) || 0) + line.quantity));
  const targets = [...deltas].map(([articleId, delta]) => ({ articleId, delta, ...stockReference(knownStocks, production.manufacturer_store_id, articleId) }));
  const timestamp = Date.now();
  const entry = audit("PRODUCTION_COMPLETED", "PRODUCTION", production.id, production.created_by, production.created_by_name, production.manufacturer_store_id, undefined, production);
  const updatedStocks: StoreStock[] = [];
  const movements: StockMovement[] = [];

  await runTransaction(db, async transaction => {
    const productionRef = doc(db, PRODUCTIONS, production.id);
    const productionSnapshot = await transaction.get(productionRef);
    if (productionSnapshot.exists()) throw new Error("Cette production existe déjà.");
    const snapshots = await Promise.all(targets.map(target => transaction.get(target.reference)));
    targets.forEach((target, index) => {
      const current = snapshots[index].exists() ? snapshots[index].data() as StoreStock : target.fallback;
      const before = current?.quantity || 0;
      if (!Number.isFinite(target.delta) || target.delta === 0 || before + target.delta < 0) {
        throw new Error(`Stock insuffisant ou quantité invalide pour l'article ${target.articleId}.`);
      }
      const stock: StoreStock = {
        id: current?.id || target.reference.id,
        store_id: production.manufacturer_store_id,
        article_id: target.articleId,
        quantity: before + target.delta,
        reserved_quantity: current?.reserved_quantity || 0,
        updated_at: timestamp
      };
      const movement: StockMovement = {
        id: `movement-${production.id}-${target.articleId}`,
        store_id: production.manufacturer_store_id,
        article_id: target.articleId,
        movement_type: target.delta < 0 ? "CONSUMPTION" : "PRODUCTION",
        quantity: target.delta,
        reference_type: "PRODUCTION",
        reference_id: production.id,
        reference_number: production.production_number,
        before_quantity: before,
        after_quantity: stock.quantity,
        created_by: production.created_by,
        created_by_name: production.created_by_name,
        created_at: timestamp
      };
      updatedStocks.push(stock);
      movements.push(movement);
      transaction.set(target.reference, stock);
      transaction.set(doc(db, MOVEMENTS, movement.id), movement);
    });
    transaction.set(productionRef, clean(production));
    transaction.set(doc(db, AUDIT_LOGS, entry.id), entry);
  });
  return { stocks: updatedStocks, movements, auditLog: entry };
}

export async function saveAuditLog(entry: AuditLog): Promise<void> {
  await setDoc(doc(db, AUDIT_LOGS, entry.id), clean(entry));
}
