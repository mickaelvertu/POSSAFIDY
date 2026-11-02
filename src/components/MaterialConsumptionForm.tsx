import { useState, type FormEvent } from "react";
import type { Article, Store, StoreStock, UserProfile } from "../types";
import { canConsumeMaterials, validateMaterialConsumption } from "../services/materialConsumption";
import { getArticleStock } from "../services/stockService";

export default function MaterialConsumptionForm({ stores, articles, stocks, user, onConsume }: {
  stores: Store[]; articles: Article[]; stocks: StoreStock[]; user: UserProfile;
  onConsume: (storeId: string, articleId: string, quantity: number, reason: string) => Promise<void>;
}) {
  const eligibleStores = stores.filter(store => canConsumeMaterials(user, store));
  const [storeId, setStoreId] = useState("");
  const [articleId, setArticleId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!eligibleStores.length) return null;
  const available = getArticleStock(stocks, storeId, articleId);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setMessage("");
    try {
      if (!eligibleStores.some(store => store.id === storeId)) throw new Error("Sélectionnez un magasin autorisé.");
      validateMaterialConsumption(articles.find(article => article.id === articleId), Number(quantity), available, reason);
      setBusy(true);
      await onConsume(storeId, articleId, Number(quantity), reason);
      setQuantity(""); setReason(""); setMessage("Consommation enregistrée et stock débité.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d'enregistrer la consommation.");
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-rose-200 bg-white p-5 text-sm text-slate-900">
      <h3 className="font-bold">Consommer une matière première</h3>
      <p className="text-xs text-slate-600">Consommation réservée aux sites de fabrication. Les dépôts peuvent stocker et transférer les matières premières.</p>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
        <label>Magasin
          <select required value={storeId} onChange={event => { setStoreId(event.target.value); setArticleId(""); }} className="mt-1 w-full rounded border p-2">
            <option value="">Choisir un magasin</option>
            {eligibleStores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        <label>Matière première
          <select required value={articleId} onChange={event => setArticleId(event.target.value)} className="mt-1 w-full rounded border p-2">
            <option value="">Choisir une matière première</option>
            {articles.filter(article => article.is_active && article.article_type === "RAW_MATERIAL" && getArticleStock(stocks, storeId, article.id) > 0).map(article => <option key={article.id} value={article.id}>{article.code} — {article.name} ({article.unit})</option>)}
          </select>
        </label>
        <label>Quantité consommée (disponible : {available})
          <input required type="number" min="0" step="any" max={available} value={quantity} onChange={event => setQuantity(event.target.value)} className="mt-1 w-full rounded border p-2" />
        </label>
        <label>Motif / utilisation
          <input required value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded border p-2" />
        </label>
        <button type="submit" disabled={!articleId} className="rounded-lg bg-rose-700 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? "Enregistrement…" : "Enregistrer la consommation"}</button>
      </fieldset>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  );
}
