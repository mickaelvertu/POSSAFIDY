import { collection, doc, getDocs, onSnapshot, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { db, runOnlineTransaction } from "../firebase";
import { Article, CreditCustomer, ResellerNotification, ResellerOrder, Sale, StockMovement, Store, StoreStock } from "../types";

const ORDERS = "resellerOrders";
const NOTIFICATIONS = "resellerNotifications";

export async function loadResellerStocks(stores: Store[], articles: Article[]): Promise<StoreStock[]> {
  const targets = stores.filter(store => store.is_active && store.store_type === "CENTRAL_WAREHOUSE")
    .flatMap(store => articles.filter(article => article.is_active && article.article_type === "RESALE")
      .map(article => ({ store, article })));
  const snapshots = await Promise.all(targets.map(({ store, article }) =>
    getDocs(query(
      collection(db, "stocks"),
      where("store_id", "==", store.id),
      where("article_id", "==", article.id)
    ))
  ));
  return snapshots.flatMap(snapshot => snapshot.docs.map(item => item.data() as StoreStock));
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, withoutUndefined(item)])) as T;
  }
  return value;
}

export async function loadResellerOrders(userId: string, isAdmin: boolean): Promise<ResellerOrder[]> {
  const snapshot = isAdmin
    ? await getDocs(collection(db, ORDERS))
    : await getDocs(query(collection(db, ORDERS), where("reseller_user_id", "==", userId)));
  return snapshot.docs.map(item => item.data() as ResellerOrder)
    .sort((left, right) => right.created_at - left.created_at);
}

export async function loadResellerNotifications(userId: string): Promise<ResellerNotification[]> {
  const snapshot = await getDocs(query(collection(db, NOTIFICATIONS), where("user_id", "==", userId)));
  return snapshot.docs.map(item => item.data() as ResellerNotification)
    .sort((left, right) => right.created_at - left.created_at);
}

export function subscribeResellerOrders(
  userId: string,
  isAdmin: boolean,
  onOrders: (orders: ResellerOrder[]) => void,
  onError: (error: Error) => void
): () => void {
  const source = isAdmin
    ? collection(db, ORDERS)
    : query(collection(db, ORDERS), where("reseller_user_id", "==", userId));
  return onSnapshot(source, snapshot => {
    onOrders(snapshot.docs.map(item => item.data() as ResellerOrder)
      .sort((left, right) => right.created_at - left.created_at));
  }, error => onError(error));
}

export function subscribeResellerNotifications(
  userId: string,
  onNotifications: (notifications: ResellerNotification[]) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(query(collection(db, NOTIFICATIONS), where("user_id", "==", userId)), snapshot => {
    onNotifications(snapshot.docs.map(item => item.data() as ResellerNotification)
      .sort((left, right) => right.created_at - left.created_at));
  }, error => onError(error));
}

export async function createResellerOrder(order: ResellerOrder): Promise<void> {
  await setDoc(doc(db, ORDERS, order.id), withoutUndefined(order));
}

export async function updateResellerOrder(order: ResellerOrder): Promise<void> {
  await updateDoc(doc(db, ORDERS, order.id), {
    lines: order.lines,
    total: order.total,
    payment_type: order.payment_type,
    notes: order.notes ?? null,
    status: order.status,
    updated_at: order.updated_at,
    admin_message: order.admin_message ?? null,
    reviewed_by: order.reviewed_by ?? null,
    reviewed_by_name: order.reviewed_by_name ?? null,
    reviewed_at: order.reviewed_at ?? null
  });
}

export async function markResellerNotificationsRead(notifications: ResellerNotification[]): Promise<void> {
  const batch = writeBatch(db);
  notifications.filter(notification => !notification.is_read).forEach(notification => {
    batch.update(doc(db, NOTIFICATIONS, notification.id), { is_read: true });
  });
  await batch.commit();
}

export async function recordResellerCashPayment(
  order: ResellerOrder,
  reviewerId: string,
  reviewerName: string
): Promise<{ order: ResellerOrder; sale: Sale; notification: ResellerNotification }> {
  const orderRef = doc(db, ORDERS, order.id);
  const saleRef = doc(db, "sales", order.sale_id || `sale-${order.id}`);
  const timestamp = Date.now();
  let result: { order: ResellerOrder; sale: Sale; notification: ResellerNotification } | undefined;
  await runOnlineTransaction(async transaction => {
    const [orderSnapshot, saleSnapshot] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(saleRef)
    ]);
    if (!orderSnapshot.exists() || !saleSnapshot.exists()) throw new Error("Commande approuvée ou vente introuvable.");
    const currentOrder = orderSnapshot.data() as ResellerOrder;
    const currentSale = saleSnapshot.data() as Sale;
    if (currentOrder.status !== "APPROVED" || currentOrder.payment_type !== "CASH" || currentOrder.cash_paid_at ||
      currentSale.payment_status === "PAID" || currentSale.status !== "VALIDATED") {
      throw new Error("Cette commande comptant est déjà réglée ou n'est pas encore approuvée.");
    }
    const updatedSale: Sale = { ...currentSale, amount_paid: currentSale.total, payment_status: "PAID" };
    const updatedOrder: ResellerOrder = {
      ...currentOrder,
      cash_paid_at: timestamp,
      cash_paid_by: reviewerId,
      cash_paid_by_name: reviewerName,
      updated_at: timestamp
    };
    const notification: ResellerNotification = {
      id: `reseller-notification-${crypto.randomUUID()}`,
      user_id: currentOrder.reseller_user_id,
      order_id: currentOrder.id,
      title: "Paiement comptant confirmé",
      message: `Le paiement de votre commande ${currentOrder.order_number} a été enregistré.`,
      status: "APPROVED",
      is_read: false,
      created_at: timestamp
    };
    transaction.set(orderRef, withoutUndefined(updatedOrder));
    transaction.set(saleRef, withoutUndefined(updatedSale));
    transaction.set(doc(db, NOTIFICATIONS, notification.id), notification);
    result = { order: updatedOrder, sale: updatedSale, notification };
  });
  if (!result) throw new Error("Le paiement n'a pas été enregistré.");
  return result;
}

export async function reviewResellerOrder(
  order: ResellerOrder,
  decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED",
  message: string,
  reviewerId: string,
  reviewerName: string,
  knownStocks: StoreStock[],
  articles: Article[],
  linkedCreditCustomer?: CreditCustomer
): Promise<{ order: ResellerOrder; stocks: StoreStock[]; movements: StockMovement[]; sale?: Sale; customer?: CreditCustomer; notification: ResellerNotification }> {
  const orderRef = doc(db, ORDERS, order.id);
  const timestamp = Date.now();
  const saleId = `sale-${order.id}`;
  const saleRef = doc(db, "sales", saleId);
  const storeRef = doc(db, "stores", order.store_id);
  const stockTargets = order.lines.map(line => {
    const known = knownStocks.find(stock => stock.store_id === order.store_id && stock.article_id === line.article_id);
    const stockId = known?.id || `stock-${order.store_id}-${line.article_id}`;
    return { line, reference: doc(db, "stocks", stockId), fallback: known };
  });

  let result: { order: ResellerOrder; stocks: StoreStock[]; movements: StockMovement[]; sale?: Sale; customer?: CreditCustomer; notification: ResellerNotification } | undefined;
  await runOnlineTransaction(async transaction => {
    const currentOrderSnapshot = await transaction.get(orderRef);
    if (!currentOrderSnapshot.exists()) throw new Error("Commande introuvable.");
    const currentOrder = currentOrderSnapshot.data() as ResellerOrder;
    if (currentOrder.status !== "PENDING") throw new Error("Cette commande a déjà été traitée. Rechargez la page.");

    const approvedLines = decision === "APPROVED"
      ? currentOrder.lines.map(line => {
          const article = articles.find(item => item.id === line.article_id && item.is_active && item.article_type === "RESALE");
          if (!article || !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(article.prix_revendeur) || article.prix_revendeur <= 0) {
            throw new Error(`L'article ${line.article_name} n'est plus disponible à la revente.`);
          }
          return {
            ...line,
            sale_id: saleId,
            article_code: article.code,
            article_name: article.name,
            unit_price: article.prix_revendeur,
            discount: 0,
            total: line.quantity * article.prix_revendeur
          };
        })
      : currentOrder.lines;
    if (approvedLines.length === 0) throw new Error("La commande doit contenir au moins un produit.");
    const approvedTotal = approvedLines.reduce((sum, line) => sum + line.total, 0);

    const storeSnapshot = decision === "APPROVED" ? await transaction.get(storeRef) : null;
    if (decision === "APPROVED" && (!storeSnapshot?.exists() || storeSnapshot.data().store_type !== "CENTRAL_WAREHOUSE" || !storeSnapshot.data().is_active)) {
      throw new Error("Le dépôt central de cette commande n'est plus disponible.");
    }

    let customer: CreditCustomer | undefined;
    if (decision === "APPROVED" && currentOrder.payment_type === "CREDIT") {
      if (!linkedCreditCustomer || linkedCreditCustomer.linked_user_id !== currentOrder.reseller_user_id) {
        throw new Error("Aucun compte de crédit actif n'est associé à ce revendeur.");
      }
      const customerRef = doc(db, "creditCustomers", linkedCreditCustomer.id);
      const customerSnapshot = await transaction.get(customerRef);
      if (!customerSnapshot.exists()) throw new Error("Compte de crédit revendeur introuvable.");
      customer = customerSnapshot.data() as CreditCustomer;
      if (!customer.is_active || customer.linked_user_id !== currentOrder.reseller_user_id) {
        throw new Error("Le compte de crédit lié à ce revendeur est désactivé ou incorrect.");
      }
      if (customer.outstanding_balance + approvedTotal > customer.credit_limit) {
        throw new Error(`Plafond de crédit dépassé. Disponible : ${Math.max(0, customer.credit_limit - customer.outstanding_balance).toLocaleString("fr-FR")} Ar.`);
      }
    }

    const stockSnapshots = decision === "APPROVED"
      ? await Promise.all(stockTargets.map(target => transaction.get(target.reference)))
      : [];
    const updatedStocks: StoreStock[] = [];
    const movements: StockMovement[] = [];
    let sale: Sale | undefined;

    if (decision === "APPROVED") {
      const stockByArticle = new Map<string, StoreStock>();
      const beforeByArticle = new Map<string, number>();
      approvedLines.forEach((line, index) => {
        if (line.line_type === "SERVICE") throw new Error("Les commandes revendeur ne peuvent contenir que des produits.");
        const article = articles.find(item => item.id === line.article_id && item.is_active && item.article_type === "RESALE");
        if (!article) throw new Error(`L'article ${line.article_name} n'est plus disponible à la revente.`);
        const stockSnapshot = stockSnapshots[index];
        const current = stockSnapshot.exists() ? stockSnapshot.data() as StoreStock : stockTargets[index].fallback;
        const before = current?.quantity || 0;
        if (!Number.isInteger(line.quantity) || line.quantity < 1 || before < line.quantity) {
          throw new Error(`Stock insuffisant pour ${line.article_name}. Disponible : ${before}.`);
        }
        const previousTarget = stockByArticle.get(line.article_id);
        const available = previousTarget?.quantity ?? before;
        if (available < line.quantity) throw new Error(`Stock insuffisant pour ${line.article_name}. Disponible : ${available}.`);
        const updatedStock: StoreStock = {
          id: current?.id || stockTargets[index].reference.id,
          store_id: currentOrder.store_id,
          article_id: line.article_id,
          quantity: available - line.quantity,
          reserved_quantity: current?.reserved_quantity || 0,
          updated_at: timestamp
        };
        stockByArticle.set(line.article_id, updatedStock);
        beforeByArticle.set(line.article_id, beforeByArticle.get(line.article_id) ?? before);
      });
      updatedStocks.push(...stockByArticle.values());

      sale = {
        id: saleId,
        sale_number: currentOrder.order_number.replace(/^CMD/, "VTE"),
        store_id: currentOrder.store_id,
        customer_name: currentOrder.business_name,
        customer_phone: currentOrder.customer_phone,
        customer_type: "REVENDEUR",
        credit_customer_id: currentOrder.payment_type === "CREDIT" ? customer?.id : undefined,
        credit_due_at: customer ? timestamp + customer.payment_term_days * 24 * 60 * 60 * 1000 : undefined,
        status: "VALIDATED",
        seller_id: reviewerId,
        seller_name: reviewerName,
        validated_by: reviewerId,
        validated_by_name: reviewerName,
        validated_at: timestamp,
        lines: approvedLines,
        subtotal: approvedTotal,
        discount: 0,
        tax: 0,
        total: approvedTotal,
        payment_method: "CASH",
        payment_status: "PENDING",
        amount_paid: 0,
        change_returned: 0,
        notes: `Commande revendeur ${currentOrder.order_number} · ${currentOrder.payment_type === "CASH" ? "Comptant à régler au retrait/livraison" : "À crédit"}${currentOrder.notes ? ` · ${currentOrder.notes}` : ""}`,
        device_id: "POS-WEB-CLIENT",
        created_at: timestamp
      };

      const finalStockMap = new Map(updatedStocks.map(stock => [stock.article_id, stock]));
      new Set(stockTargets.map(target => target.line.article_id)).forEach(articleId => {
        const line = stockTargets.find(target => target.line.article_id === articleId)!.line;
        const finalStock = finalStockMap.get(line.article_id)!;
        const before = beforeByArticle.get(line.article_id) || 0;
        const movement: StockMovement = {
          id: `movement-${saleId}-${line.article_id}`,
          store_id: currentOrder.store_id,
          article_id: line.article_id,
          movement_type: "SALE",
          quantity: -(before - finalStock.quantity),
          reference_type: "SALE",
          reference_id: saleId,
          reference_number: sale.sale_number,
          before_quantity: before,
          after_quantity: finalStock.quantity,
          created_by: reviewerId,
          created_by_name: reviewerName,
          notes: `Commande revendeur ${currentOrder.order_number}`,
          created_at: timestamp
        };
        if (!movements.some(item => item.article_id === movement.article_id)) movements.push(movement);
      });

      updatedStocks.forEach(stock => transaction.set(doc(db, "stocks", stock.id), stock));
      movements.forEach(movement => transaction.set(doc(db, "movements", movement.id), movement));
      transaction.set(saleRef, withoutUndefined(sale));
      if (customer) {
        const customerRef = doc(db, "creditCustomers", customer.id);
        customer = { ...customer, outstanding_balance: customer.outstanding_balance + approvedTotal, last_credit_sale_id: saleId, updated_at: timestamp };
        transaction.set(customerRef, withoutUndefined(customer));
      }
    }

    const updatedOrder: ResellerOrder = {
      ...currentOrder,
      lines: decision === "APPROVED" ? approvedLines : currentOrder.lines,
      total: decision === "APPROVED" ? approvedTotal : currentOrder.total,
      status: decision,
      admin_message: message.trim() || undefined,
      reviewed_by: reviewerId,
      reviewed_by_name: reviewerName,
      reviewed_at: timestamp,
      updated_at: timestamp,
      sale_id: sale?.id
    };
    const notification: ResellerNotification = {
      id: `reseller-notification-${crypto.randomUUID()}`,
      user_id: currentOrder.reseller_user_id,
      order_id: currentOrder.id,
      title: decision === "APPROVED" ? "Commande approuvée" : decision === "REJECTED" ? "Commande refusée" : "Modification demandée",
      message: decision === "APPROVED"
        ? `Votre commande ${currentOrder.order_number} est approuvée pour ${approvedTotal.toLocaleString("fr-FR")} Ar.${currentOrder.payment_type === "CASH" ? " Le paiement comptant sera réglé au retrait ou à la livraison." : " Le crédit a été imputé à votre compte."}`
        : message.trim(),
      status: decision,
      is_read: false,
      created_at: timestamp
    };
    transaction.set(orderRef, withoutUndefined(updatedOrder));
    transaction.set(doc(db, NOTIFICATIONS, notification.id), notification);
    result = { order: updatedOrder, stocks: updatedStocks, movements, sale, customer, notification };
  });

  if (!result) throw new Error("La décision n'a pas été enregistrée.");
  return result;
}
