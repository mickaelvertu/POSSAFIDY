import { useState } from "react";
import { createPortal } from "react-dom";
import type { Sale, Store } from "../types";

export default function SaleDeliveryNote({ sale, stores, onClose }: {
  sale: Sale;
  stores: Store[];
  onClose: () => void;
}) {
  const [invoice, setInvoice] = useState(true);
  const [delivery, setDelivery] = useState(true);
  const [logoReady, setLogoReady] = useState(false);
  const source = stores.find(store => store.id === sale.store_id);
  const deliveredAt = sale.validated_at || sale.created_at;
  const deliveredBy = sale.validated_by_name || sale.seller_name;
  const documents = [invoice && "INVOICE", delivery && "DELIVERY"].filter(Boolean);
  const money = (value: number) => `${value.toLocaleString("fr-FR")} Ar`;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Facture et bon de livraison">
      <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 text-slate-900">
        <div className="mb-6 space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Documents de vente</h2>
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2">Fermer</button>
          </div>
          <fieldset className="flex flex-wrap gap-5 rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold">Documents à imprimer</legend>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={invoice} onChange={event => setInvoice(event.target.checked)} className="h-4 w-4 accent-emerald-700" />Facture</label>
            <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={delivery} onChange={event => setDelivery(event.target.checked)} className="h-4 w-4 accent-emerald-700" />Bon de livraison</label>
          </fieldset>
          {!documents.length && <p role="status" className="text-sm text-amber-800">Cochez au moins un document à imprimer.</p>}
          <button type="button" disabled={!documents.length || !logoReady} onClick={() => window.print()} className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50">Imprimer / PDF{documents.length === 2 ? " · 2 documents" : ""}</button>
        </div>
        {!!documents.length && <div className="printable-document">
          {documents.map(documentType => {
            const isInvoice = documentType === "INVOICE";
            const lines = isInvoice ? sale.lines : sale.lines.filter(line => line.line_type !== "SERVICE");
            const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
            return <article key={documentType} className="sale-print-document border-t border-slate-200 pt-6 first:border-t-0 first:pt-0">
              <header className="mb-6 border-b-2 border-emerald-800 pb-4">
                <img src="/branding/gileada-logo.png" alt="GILEADA" onLoad={() => setLogoReady(true)} onError={() => setLogoReady(true)} className="mb-4 h-24 w-52 object-contain" />
                <h1 className="text-xl font-bold">{isInvoice ? "FACTURE" : "BON DE LIVRAISON"}</h1>
                <p className="mt-1 font-mono">{isInvoice ? "FAC" : "BL"} / {sale.sale_number}</p>
                <p className="text-sm">{isInvoice ? "Date de la facture" : sale.validated_at ? "Expédié le" : "Date de la vente"} : {new Date(isInvoice ? sale.created_at : deliveredAt).toLocaleString("fr-FR")}</p>
              </header>
              <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
                <div><h2 className="font-bold">{isInvoice ? "Émetteur" : "Expéditeur"}</h2><p>{source?.name || sale.store_id}</p><p>{isInvoice ? sale.seller_name : deliveredBy}</p></div>
                <div><h2 className="font-bold">{isInvoice ? "Client" : "Destinataire"}</h2><p>{sale.customer_name}</p>{sale.customer_phone && <p>{sale.customer_phone}</p>}</div>
              </div>
              <table className="w-full border-collapse text-left text-sm">
                <thead><tr className="border-b-2 border-slate-300">
                  <th className="py-2 pr-3">Référence</th><th className="py-2 pr-3">{isInvoice ? "Article / prestation" : "Article"}</th>
                  <th className="py-2 pr-3 text-right">{isInvoice ? "Qté" : "Qté livrée"}</th>
                  <th className="py-2 pr-3 text-right">Prix unitaire</th><th className="py-2 text-right">Total</th>
                </tr></thead>
                <tbody>{lines.map(line => <tr key={line.id} className="border-b border-slate-200">
                  <td className="py-3 pr-3">{line.article_code}</td><td className="py-3 pr-3">{line.article_name}</td>
                  <td className="py-3 pr-3 text-right">{line.quantity.toLocaleString("fr-FR")}</td>
                  <td className="py-3 pr-3 text-right">{money(line.unit_price)}</td><td className="py-3 text-right">{money(line.total)}</td>
                </tr>)}</tbody>
                {!isInvoice && <tfoot><tr><td colSpan={2} className="pt-3 pr-3 font-bold">Total des articles livrés</td><td className="pt-3 pr-3 text-right font-bold">{totalQuantity.toLocaleString("fr-FR")}</td><td /><td className="pt-3 text-right font-bold">{money(lines.reduce((sum, line) => sum + line.total, 0))}</td></tr></tfoot>}
              </table>
              {isInvoice && <dl className="ml-auto mt-6 grid max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <dt>Sous-total</dt><dd className="text-right">{money(sale.subtotal)}</dd>
                {sale.discount > 0 && <><dt>Remise</dt><dd className="text-right">− {money(sale.discount)}</dd></>}
                {sale.tax > 0 && <><dt>Taxes</dt><dd className="text-right">{money(sale.tax)}</dd></>}
                <dt className="font-bold">Total net</dt><dd className="text-right font-bold">{money(sale.total)}</dd>
                <dt>Règlement ({sale.payment_method})</dt><dd className="text-right">{money(sale.amount_paid)}</dd>
                {sale.change_returned > 0 && <><dt>Monnaie rendue</dt><dd className="text-right">{money(sale.change_returned)}</dd></>}
                <dt>Reste à payer</dt><dd className="text-right font-bold">{money(Math.max(0, sale.total - sale.amount_paid))}</dd>
                {!!sale.credit_due_at && <><dt>Échéance</dt><dd className="text-right">{new Date(sale.credit_due_at).toLocaleDateString("fr-FR")}</dd></>}
              </dl>}
              {sale.notes && <p className="mt-6 whitespace-pre-wrap text-sm">Observations : {sale.notes}</p>}
              <div className="mt-12 grid grid-cols-2 gap-8 text-sm"><div className="min-h-24 border-t pt-2">{isInvoice ? "Signature et cachet" : "Signature de l’expéditeur"}</div><div className="min-h-24 border-t pt-2">Date, signature et cachet du {isInvoice ? "client" : "destinataire"}</div></div>
            </article>;
          })}
        </div>}
      </div>
    </div>, document.body
  );
}
