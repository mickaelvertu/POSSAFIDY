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
import { AuditLog, CreditCustomer, Production, Sale, StockMovement, StoreStock } from "../types";

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

export async function loadOperationalData(access: { sales: boolean; productions: boolean; audit: boolean; auditUserOnly?: boolean; storeIds?: string[]; userId: string }): Promise<{
  sales: Sale[];
  productions: Production[];
  auditLogs: AuditLog[];
}> {
  const [sales, productions, auditLogs] = await Promise.all([
    loadForStores<Sale>(SALES, "store_id", access.sales, access.storeIds),
    loadForStores<Production>(PRODUCTIONS, "manufacturer_store_id", access.productions, access.storeIds),
    !access.audit
      ? Promise.resolve([])
      : access.auditUserOnly
        ? getDocs(query(collection(db, AUDIT_LOGS), where("user_id", "==", access.userId)))
            .then(snapshot => snapshot.docs.map(item => item.data() as AuditLog))
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

export async function updateDraftSale(
  originalSale: Sale,
  updatedSale: Sale,
  userId: string,
  userName: string
): Promise<{ sale: Sale; auditLog: AuditLog }> {
  if (
    originalSale.status !== "DRAFT" ||
    updatedSale.status !== "DRAFT" ||
    originalSale.seller_id !== userId ||
    updatedSale.id !== originalSale.id ||
    updatedSale.sale_number !== originalSale.sale_number ||
    updatedSale.store_id !== originalSale.store_id ||
    updatedSale.seller_id !== originalSale.seller_id ||
    updatedSale.created_at !== originalSale.created_at ||
    updatedSale.customer_type !== originalSale.customer_type ||
    updatedSale.credit_customer_id !== originalSale.credit_customer_id ||
    updatedSale.amount_paid !== originalSale.amount_paid ||
    updatedSale.payment_method !== originalSale.payment_method
  ) {
    throw new Error("Seul le demandeur peut modifier les informations d'une vente encore en brouillon.");
  }

  const entry = audit("SALE_DRAFT_UPDATED", "SALE", originalSale.id, userId, userName, originalSale.store_id, originalSale, updatedSale);
  await runTransaction(db, async transaction => {
    const saleRef = doc(db, SALES, originalSale.id);
    const snapshot = await transaction.get(saleRef);
    if (!snapshot.exists()) throw new Error("Cette vente n'existe plus.");
    const currentSale = snapshot.data() as Sale;
    if (currentSale.status !== "DRAFT" || currentSale.seller_id !== userId) {
      throw new Error("La vente a déjà été prise en charge et ne peut plus être modifiée.");
    }
    if (
      currentSale.sale_number !== originalSale.sale_number ||
      currentSale.total !== originalSale.total ||
      currentSale.amount_paid !== originalSale.amount_paid ||
      currentSale.customer_name !== originalSale.customer_name ||
      currentSale.customer_phone !== originalSale.customer_phone ||
      currentSale.notes !== originalSale.notes ||
      JSON.stringify(currentSale.lines) !== JSON.stringify(originalSale.lines)
    ) {
      throw new Error("La vente a changé depuis son ouverture. Rechargez les données avant de la modifier.");
    }

    if (originalSale.credit_customer_id) {
      const customerRef = doc(db, "creditCustomers", originalSale.credit_customer_id);
      const customerSnapshot = await transaction.get(customerRef);
      if (!customerSnapshot.exists()) throw new Error("Le compte crédit associé à cette vente est introuvable.");
      const customer = customerSnapshot.data() as CreditCustomer;
      const oldCredit = Math.max(0, originalSale.total - originalSale.amount_paid);
      const newCredit = Math.max(0, updatedSale.total - updatedSale.amount_paid);
      const nextBalance = customer.outstanding_balance + newCredit - oldCredit;
      if (nextBalance < 0) throw new Error("Le solde crédit du revendeur est incohérent. Contactez un administrateur.");
      if (nextBalance > customer.credit_limit) {
        throw new Error(`Plafond dépassé. Crédit disponible : ${Math.max(0, customer.credit_limit - customer.outstanding_balance + oldCredit).toLocaleString("fr-FR")} Ar.`);
      }
      if (newCredit > 0 && !customer.is_active) throw new Error("Le compte crédit de ce revendeur est désactivé.");
      if (nextBalance !== customer.outstanding_balance) {
        transaction.set(customerRef, clean({
          ...customer,
          outstanding_balance: nextBalance,
          last_credit_sale_id: originalSale.id,
          updated_at: Date.now()
        }));
      }
    }

    transaction.set(saleRef, clean(updatedSale));
    transaction.set(doc(db, AUDIT_LOGS, entry.id), clean(entry));
  });
  return { sale: updatedSale, auditLog: entry };
}

export async function deleteDraftSale(sale: Sale, userId: string, auditLog: AuditLog): Promise<CreditCustomer | undefined> {
  if (auditLog.user_id !== userId) throw new Error("L'utilisateur de l'audit ne correspond pas à l'utilisateur connecté.");
  let updatedCustomer: CreditCustomer | undefined;
  await runTransaction(db, async transaction => {
    const saleRef = doc(db, SALES, sale.id);
    const snapshot = await transaction.get(saleRef);
    if (!snapshot.exists() || (snapshot.data() as Sale).status !== "DRAFT") {
      throw new Error("Seul un brouillon de vente peut être supprimé.");
    }
    const current = snapshot.data() as Sale;
    if (
      current.seller_id !== sale.seller_id ||
      current.total !== sale.total ||
      current.amount_paid !== sale.amount_paid ||
      current.credit_customer_id !== sale.credit_customer_id
    ) {
      throw new Error("La vente a changé depuis son ouverture. Rechargez les données avant de la supprimer.");
    }

    const customerRef = current.credit_customer_id
      ? doc(db, "creditCustomers", current.credit_customer_id)
      : undefined;
    const customerSnapshot = customerRef ? await transaction.get(customerRef) : undefined;
    if (customerRef && !customerSnapshot?.exists()) {
      throw new Error("Le compte crédit associé à cette vente est introuvable.");
    }
    if (customerRef && customerSnapshot?.exists()) {
      const customer = customerSnapshot.data() as CreditCustomer;
      const amountReleased = Math.max(0, current.total - current.amount_paid);
      if (customer.last_credit_sale_id !== current.id) {
        throw new Error("Ce brouillon de crédit ne peut pas être supprimé tant qu'il n'est pas le dernier associé au compte.");
      }
      if (customer.outstanding_balance < amountReleased) {
        throw new Error("Le solde crédit associé est incohérent. Contactez un administrateur.");
      }
      updatedCustomer = {
        ...customer,
        outstanding_balance: customer.outstanding_balance - amountReleased,
        updated_at: Date.now()
      };
      transaction.update(customerRef, {
        outstanding_balance: updatedCustomer.outstanding_balance,
        updated_at: updatedCustomer.updated_at
      });
    }

    transaction.delete(saleRef);
    transaction.set(doc(db, AUDIT_LOGS, auditLog.id), clean({
      ...auditLog,
      old_value: current
    }));
  });
  return updatedCustomer;
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
    const customerRef = sale.credit_customer_id ? doc(db, "creditCustomers", sale.credit_customer_id) : null;
    const customerSnapshot = customerRef ? await transaction.get(customerRef) : null;
    const remainingCredit = sale.credit_customer_id ? Math.max(0, sale.total - sale.amount_paid) : 0;
    if (customerRef && customerSnapshot?.exists() && remainingCredit > 0) {
      const customer = customerSnapshot.data() as { outstanding_balance: number; updated_at: number };
      if (customer.outstanding_balance < remainingCredit) {
        throw new Error("Le solde crédit du revendeur est incohérent. Contactez un administrateur.");
      }
      transaction.set(customerRef, clean({
        ...customer,
        outstanding_balance: customer.outstanding_balance - remainingCredit,
        updated_at: Date.now()
      }));
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
  const deltas = new Map<string, { normal: number; recycled: number }>();
  const addDelta = (articleId: string, key: "normal" | "recycled", value: number) => {
    const current = deltas.get(articleId) || { normal: 0, recycled: 0 };
    deltas.set(articleId, { ...current, [key]: current[key] + value });
  };
  production.consumptions.forEach(line => addDelta(line.article_id, line.source === "RECYCLED" ? "recycled" : "normal", -line.quantity));
  production.outputs.forEach(line => addDelta(line.article_id, "normal", line.quantity));
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
      const quarantineBefore = current?.quarantine_quantity || 0;
      if (!Number.isFinite(target.delta.normal) || !Number.isFinite(target.delta.recycled) || before + target.delta.normal < 0) {
        throw new Error(`Stock insuffisant ou quantité invalide pour l'article ${target.articleId}.`);
      }
      if (quarantineBefore + target.delta.recycled < 0) {
        throw new Error(`Stock à recycler insuffisant pour l'article ${target.articleId}. Disponible : ${quarantineBefore}.`);
      }
      const stock: StoreStock = {
        id: current?.id || target.reference.id,
        store_id: production.manufacturer_store_id,
        article_id: target.articleId,
        quantity: before + target.delta.normal,
        ...(current?.quarantine_quantity !== undefined || target.delta.recycled !== 0 ? { quarantine_quantity: quarantineBefore + target.delta.recycled } : {}),
        reserved_quantity: current?.reserved_quantity || 0,
        updated_at: timestamp
      };
      const baseMovement = {
        store_id: production.manufacturer_store_id,
        article_id: target.articleId,
        reference_type: "PRODUCTION" as const,
        reference_id: production.id,
        reference_number: production.production_number,
        created_by: production.created_by,
        created_by_name: production.created_by_name,
        created_at: timestamp
      };
      updatedStocks.push(stock);
      transaction.set(target.reference, clean(stock));
      if (target.delta.normal !== 0) {
        const movement: StockMovement = {
          ...baseMovement,
          id: `movement-${production.id}-${target.articleId}`,
          movement_type: target.delta.normal < 0 ? "CONSUMPTION" : "PRODUCTION",
          quantity: target.delta.normal,
          before_quantity: before,
          after_quantity: stock.quantity
        };
        movements.push(movement);
        transaction.set(doc(db, MOVEMENTS, movement.id), movement);
      }
      if (target.delta.recycled !== 0) {
        const movement: StockMovement = {
          ...baseMovement,
          id: `movement-${production.id}-${target.articleId}-recycled`,
          stock_bucket: "QUARANTINE",
          movement_type: "CONSUMPTION",
          quantity: target.delta.recycled,
          before_quantity: quarantineBefore,
          after_quantity: quarantineBefore + target.delta.recycled,
          notes: "Recyclage : consommé depuis le stock à recycler"
        };
        movements.push(movement);
        transaction.set(doc(db, MOVEMENTS, movement.id), movement);
      }
    });
    transaction.set(productionRef, clean(production));
    transaction.set(doc(db, AUDIT_LOGS, entry.id), entry);
  });
  return { stocks: updatedStocks, movements, auditLog: entry };
}

export async function updateDraftProduction(
  original: Production,
  updated: Production,
  userId: string,
  auditLog: AuditLog
): Promise<Production> {
  if (
    original.status !== "DRAFT" ||
    updated.status !== "DRAFT" ||
    original.created_by !== userId ||
    updated.id !== original.id ||
    updated.production_number !== original.production_number ||
    updated.manufacturer_store_id !== original.manufacturer_store_id ||
    updated.created_by !== original.created_by ||
    updated.created_at !== original.created_at
  ) {
    throw new Error("Seul le créateur peut modifier sa production tant qu'elle est en brouillon.");
  }

  await runTransaction(db, async transaction => {
    const productionRef = doc(db, PRODUCTIONS, original.id);
    const snapshot = await transaction.get(productionRef);
    if (!snapshot.exists()) throw new Error("Cette production n'existe plus.");
    const current = snapshot.data() as Production;
    if (
      current.status !== "DRAFT" ||
      current.created_by !== userId ||
      JSON.stringify(current.consumptions) !== JSON.stringify(original.consumptions) ||
      JSON.stringify(current.outputs) !== JSON.stringify(original.outputs) ||
      current.notes !== original.notes
    ) {
      throw new Error("La production a changé depuis son ouverture. Rechargez les données avant de la modifier.");
    }
    transaction.update(productionRef, clean({
      consumptions: updated.consumptions,
      outputs: updated.outputs,
      notes: updated.notes
    }));
    transaction.set(doc(db, AUDIT_LOGS, auditLog.id), clean({
      ...auditLog,
      old_value: current,
      new_value: updated
    }));
  });
  return updated;
}

export async function deleteDraftProduction(production: Production, auditLog: AuditLog): Promise<void> {
  await runTransaction(db, async transaction => {
    const productionRef = doc(db, PRODUCTIONS, production.id);
    const snapshot = await transaction.get(productionRef);
    if (!snapshot.exists() || (snapshot.data() as Production).status !== "DRAFT") {
      throw new Error("Seule une production en brouillon peut être supprimée.");
    }
    transaction.delete(productionRef);
    transaction.set(doc(db, AUDIT_LOGS, auditLog.id), clean({
      ...auditLog,
      old_value: snapshot.data()
    }));
  });
}

export async function saveAuditLog(entry: AuditLog): Promise<void> {
  await setDoc(doc(db, AUDIT_LOGS, entry.id), clean(entry));
}
