import { FormEvent, useState } from "react";
import { AppUser, Article, CreditCustomer, ResellerNotification, ResellerOrder, SaleLine, Store, StoreStock } from "../types";
import { Bell, CheckCircle2, Clock3, Package, Plus, Send, ShoppingBag, Trash2, XCircle } from "lucide-react";

interface ResellerPortalViewProps {
  user: AppUser;
  isAdmin: boolean;
  orders: ResellerOrder[];
  notifications: ResellerNotification[];
  articles: Article[];
  stores: Store[];
  stocks: StoreStock[];
  creditCustomers: CreditCustomer[];
  onCreateOrder: (order: ResellerOrder) => Promise<boolean>;
  onUpdateOrder: (order: ResellerOrder) => Promise<boolean>;
  onReviewOrder: (order: ResellerOrder, decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED", message: string) => Promise<boolean>;
  onRecordCashPayment: (order: ResellerOrder) => Promise<boolean>;
  onMarkNotificationsRead: () => Promise<void>;
}

export default function ResellerPortalView({
  user,
  isAdmin,
  orders,
  notifications,
  articles,
  stores,
  stocks,
  creditCustomers,
  onCreateOrder,
  onUpdateOrder,
  onReviewOrder,
  onRecordCashPayment,
  onMarkNotificationsRead
}: ResellerPortalViewProps) {
  const creditCustomer = creditCustomers.find(customer => customer.linked_user_id === user.uid);
  const centralStores = stores.filter(store => store.store_type === "CENTRAL_WAREHOUSE" && store.is_active);
  const resaleArticles = articles.filter(article => article.is_active && article.article_type === "RESALE");
  const [storeId, setStoreId] = useState(centralStores[0]?.id || "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [paymentType, setPaymentType] = useState<"CASH" | "CREDIT">("CASH");
  const [notes, setNotes] = useState("");
  const [editingOrder, setEditingOrder] = useState<ResellerOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const creditAvailable = creditCustomer?.is_active
    ? Math.max(0, creditCustomer.credit_limit - creditCustomer.outstanding_balance)
    : 0;
  const lines: SaleLine[] = Object.entries(quantities).flatMap(([articleId, rawQuantity]) => {
    const quantity = Number(rawQuantity);
    const article = resaleArticles.find(item => item.id === articleId);
    if (!article || !Number.isInteger(quantity) || quantity < 1) return [];
    return [{
      id: `order-line-${articleId}`,
      sale_id: editingOrder?.sale_id || "",
      article_id: article.id,
      article_code: article.code,
      article_name: article.name,
      quantity,
      unit_price: article.prix_revendeur,
      discount: 0,
      total: quantity * article.prix_revendeur
    }];
  });
  const total = lines.reduce((sum, line) => sum + line.total, 0);
  const filteredArticles = resaleArticles.filter(article =>
    `${article.name} ${article.code}`.toLocaleLowerCase("fr").includes(search.trim().toLocaleLowerCase("fr"))
  );
  const notificationsUnread = notifications.some(notification => !notification.is_read);
  const storeAvailable = (articleId: string) => stocks.find(stock => stock.store_id === storeId && stock.article_id === articleId)?.quantity || 0;

  const openRevision = (order: ResellerOrder) => {
    setEditingOrder(order);
    setStoreId(order.store_id);
    setPaymentType(order.payment_type);
    setNotes(order.notes || "");
    setQuantities(Object.fromEntries(order.lines.map(line => [line.article_id, line.quantity])));
  };

  const resetForm = () => {
    setEditingOrder(null);
    setQuantities({});
    setPaymentType("CASH");
    setNotes("");
  };

  const submitOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!lines.length || !storeId || saving) return;
    if (paymentType === "CREDIT" && (!creditCustomer?.is_active || creditAvailable < total)) {
      window.alert(creditCustomer?.is_active
        ? `Crédit disponible insuffisant : ${creditAvailable.toLocaleString("fr-FR")} Ar.`
        : "Votre compte n'est pas encore autorisé à commander à crédit.");
      return;
    }
    if (lines.some(line => line.quantity > storeAvailable(line.article_id))) {
      window.alert("Le stock disponible au dépôt choisi a changé. Ajustez les quantités avant d'envoyer la commande.");
      return;
    }
    const timestamp = Date.now();
    const order: ResellerOrder = editingOrder ? {
      ...editingOrder,
      lines,
      total,
      payment_type: paymentType,
      notes: notes.trim() || undefined,
      status: "PENDING",
      admin_message: undefined,
      reviewed_by: undefined,
      reviewed_by_name: undefined,
      reviewed_at: undefined,
      updated_at: timestamp
    } : {
      id: `reseller-order-${crypto.randomUUID()}`,
      order_number: `CMD-${new Date(timestamp).getFullYear()}-${String(timestamp).slice(-6)}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
      reseller_user_id: user.uid,
      business_name: user.businessName || `${user.firstName} ${user.lastName}`,
      customer_name: `${user.firstName} ${user.lastName}`,
      customer_phone: user.phone || "",
      store_id: storeId,
      lines,
      total,
      payment_type: paymentType,
      status: "PENDING",
      notes: notes.trim() || undefined,
      created_at: timestamp,
      updated_at: timestamp
    };
    setSaving(true);
    try {
      const succeeded = editingOrder ? await onUpdateOrder(order) : await onCreateOrder(order);
      if (succeeded) resetForm();
    } finally {
      setSaving(false);
    }
  };

  const review = async (order: ResellerOrder, decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED") => {
    const message = decision === "APPROVED"
      ? ""
      : window.prompt(decision === "REJECTED" ? "Motif du refus (obligatoire) :" : "Modification demandée au revendeur (obligatoire) :")?.trim() || "";
    if (decision !== "APPROVED" && !message) return;
    if (decision === "APPROVED" && !window.confirm(`Approuver ${order.order_number} et débiter le stock du dépôt central ?`)) return;
    setSaving(true);
    try {
      await onReviewOrder(order, decision, message);
    } finally {
      setSaving(false);
    }
  };

  const statusText: Record<ResellerOrder["status"], string> = {
    PENDING: "En attente",
    APPROVED: "Approuvée",
    REJECTED: "Refusée",
    REVISION_REQUESTED: "Modification demandée"
  };

  return (
    <div className="space-y-5">
      {!isAdmin && (
        <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><ShoppingBag className="h-5 w-5 text-orange-600" />Espace commandes revendeur</h2>
              <p className="mt-1 text-sm text-slate-600">{user.businessName || user.displayName} · Commandez les produits disponibles au tarif revendeur.</p>
            </div>
            <button type="button" onClick={() => void onMarkNotificationsRead()} className="relative inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Bell className="h-4 w-4" /> Notifications
              {notificationsUnread && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
            </button>
          </div>
          {notifications.length > 0 && (
            <div className="mt-4 space-y-2">
              {notifications.slice(0, 5).map(notification => (
                <div key={notification.id} className={`rounded-xl border p-3 text-sm ${notification.is_read ? "border-slate-200 bg-slate-50 text-slate-600" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
                  <div className="flex items-center justify-between gap-2"><strong>{notification.title}</strong><span className="text-[10px]">{new Date(notification.created_at).toLocaleString("fr-FR")}</span></div>
                  <p className="mt-1">{notification.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isAdmin ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-black text-slate-900">Commandes revendeurs</h2>
          <div className="space-y-3">
            {orders.length === 0 && <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Aucune commande revendeur pour le moment.</p>}
            {orders.map(order => {
              const linked = creditCustomers.find(customer => customer.linked_user_id === order.reseller_user_id);
              const canApproveCredit = order.payment_type !== "CREDIT" || Boolean(linked?.is_active && linked.credit_limit - linked.outstanding_balance >= order.total);
              return (
                <article key={order.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-slate-900">{order.order_number} · {order.business_name}</h3>
                      <p className="mt-1 text-xs text-slate-500">{new Date(order.created_at).toLocaleString("fr-FR")} · {stores.find(store => store.id === order.store_id)?.name || "Dépôt"} · {order.customer_phone} · {order.payment_type === "CASH" ? "Comptant à régler au retrait/livraison" : "À crédit"}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${order.status === "PENDING" ? "bg-amber-100 text-amber-800" : order.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : order.status === "REJECTED" ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"}`}>{statusText[order.status]}</span>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    {order.lines.map(line => <li key={line.id}>{line.quantity} × {line.article_name} — {(line.total).toLocaleString("fr-FR")} Ar</li>)}
                  </ul>
                  <p className="mt-2 font-mono text-sm font-black text-slate-900">Total : {order.total.toLocaleString("fr-FR")} Ar</p>
                  {order.notes && <p className="mt-1 text-xs text-slate-500">Note : {order.notes}</p>}
                  {order.status === "PENDING" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={saving || !canApproveCredit} onClick={() => void review(order, "APPROVED")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><CheckCircle2 className="h-4 w-4" />Approuver</button>
                      <button type="button" disabled={saving} onClick={() => void review(order, "REVISION_REQUESTED")} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Clock3 className="h-4 w-4" />Demander modification</button>
                      <button type="button" disabled={saving} onClick={() => void review(order, "REJECTED")} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><XCircle className="h-4 w-4" />Refuser</button>
                      {!canApproveCredit && <span className="self-center text-xs font-semibold text-rose-700">Compte/plafond crédit à vérifier.</span>}
                    </div>
                  )}
                  {order.status === "APPROVED" && order.payment_type === "CASH" && (
                    order.cash_paid_at
                      ? <p className="mt-3 text-xs font-bold text-emerald-700">Paiement comptant enregistré le {new Date(order.cash_paid_at).toLocaleString("fr-FR")}.</p>
                      : <button type="button" disabled={saving} onClick={() => void onRecordCashPayment(order)} className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-40">Enregistrer le paiement au retrait/livraison</button>
                  )}
                  {order.admin_message && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-700">Message : {order.admin_message}</p>}
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <>
          {editingOrder && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              L'administration demande une modification pour <strong>{editingOrder.order_number}</strong> : {editingOrder.admin_message}
            </div>
          )}
          <form onSubmit={event => void submitOrder(event)} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-900">{editingOrder ? "Modifier la commande" : "Nouvelle commande"}</h2>
              <label className="text-xs font-bold text-slate-600">Dépôt de préparation
                <select required value={storeId} onChange={event => setStoreId(event.target.value)} className="ml-2 rounded-lg border border-slate-300 bg-white p-2 text-sm">
                  {centralStores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </label>
            </div>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher un produit…" className="mt-4 w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredArticles.map(article => {
                const available = storeAvailable(article.id);
                const quantity = quantities[article.id] || 0;
                return (
                  <div key={article.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <Package className="h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{article.name}</p>
                      <p className="text-xs text-slate-500">{article.prix_revendeur > 0 ? `${article.prix_revendeur.toLocaleString("fr-FR")} Ar` : "Prix non configuré"} · Stock {available}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {quantity > 0 && <button type="button" onClick={() => setQuantities(current => ({ ...current, [article.id]: quantity - 1 }))} aria-label="Retirer un article" className="rounded-lg bg-slate-100 p-1.5 text-slate-700"><Trash2 className="h-4 w-4" /></button>}
                      <button type="button" disabled={quantity >= available || available <= 0 || article.prix_revendeur <= 0} onClick={() => setQuantities(current => ({ ...current, [article.id]: quantity + 1 }))} aria-label="Ajouter un article" className="rounded-lg bg-emerald-50 p-1.5 text-emerald-700 disabled:opacity-30"><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">Mode de règlement
                <select value={paymentType} onChange={event => setPaymentType(event.target.value as "CASH" | "CREDIT")} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm">
                  <option value="CASH">Comptant — régler au retrait/livraison</option>
                  <option value="CREDIT" disabled={!creditCustomer?.is_active}>À crédit — disponible {creditAvailable.toLocaleString("fr-FR")} Ar</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-600">Note de commande (facultatif)
                <input value={notes} onChange={event => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" placeholder="Précisions pour la préparation" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-lg font-black text-slate-900">Total : {total.toLocaleString("fr-FR")} Ar</p>
              <div className="flex gap-2">
                {editingOrder && <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Annuler</button>}
                <button type="submit" disabled={saving || !lines.length || !centralStores.length || paymentType === "CREDIT" && creditAvailable < total} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" />{editingOrder ? "Renvoyer pour validation" : "Envoyer la commande"}</button>
              </div>
            </div>
            {paymentType === "CREDIT" && <p className="mt-2 text-xs text-slate-500">Le crédit ne sera imputé qu'après approbation. Montant et plafond seront revérifiés à ce moment-là.</p>}
          </form>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-black text-slate-900">Mes commandes</h2>
            <div className="space-y-3">
              {orders.length === 0 && <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Vous n'avez pas encore de commande.</p>}
              {orders.map(order => (
                <article key={order.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div><h3 className="font-bold text-slate-900">{order.order_number} · {order.total.toLocaleString("fr-FR")} Ar</h3><p className="text-xs text-slate-500">{new Date(order.created_at).toLocaleString("fr-FR")} · {order.payment_type === "CASH" ? "Comptant" : "Crédit"}</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${order.status === "PENDING" ? "bg-amber-100 text-amber-800" : order.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : order.status === "REJECTED" ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"}`}>{statusText[order.status]}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{order.lines.map(line => `${line.quantity} × ${line.article_name}`).join(" · ")}</p>
                  {order.admin_message && <p className="mt-2 rounded-lg bg-blue-50 p-2 text-xs text-blue-900">{order.admin_message}</p>}
                  {order.cash_paid_at && <p className="mt-2 text-xs font-semibold text-emerald-700">Paiement comptant confirmé le {new Date(order.cash_paid_at).toLocaleString("fr-FR")}.</p>}
                  {order.status === "REVISION_REQUESTED" && <button type="button" onClick={() => openRevision(order)} className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Modifier cette commande</button>}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
