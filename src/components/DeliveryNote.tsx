import { useState } from "react";
import { createPortal } from "react-dom";
import { StockTransfer, Store } from "../types";

export default function DeliveryNote({ transfer, stores, onClose }: {
  transfer: StockTransfer;
  stores: Store[];
  onClose: () => void;
}) {
  const [logoReady, setLogoReady] = useState(false);
  const source = stores.find(store => store.id === transfer.source_store_id);
  const destination = stores.find(store => store.id === transfer.destination_store_id);

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Bon de livraison">
      <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 text-slate-900">
        <div className="mb-6 flex justify-end gap-3 print:hidden">
          <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2">Fermer</button>
          <button type="button" disabled={!logoReady} onClick={() => window.print()} className="rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50">Imprimer / PDF</button>
        </div>
        <article className="printable-document">
          <header className="mb-6 border-b-2 border-emerald-800 pb-4">
            <img src="/branding/gileada-logo.png" alt="GILEADA" onLoad={() => setLogoReady(true)} className="mb-4 h-24 w-52 object-contain" />
            <h1 className="text-xl font-bold">BON DE LIVRAISON</h1>
            <p className="mt-1 font-mono">{transfer.transfer_number}</p>
            <p className="text-sm">Expédié le : {transfer.shipped_at ? new Date(transfer.shipped_at).toLocaleString("fr-FR") : "—"}</p>
          </header>
          <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
            <div><h2 className="font-bold">Expéditeur</h2><p>{source?.name || transfer.source_store_id}</p><p>{transfer.shipped_by_name}</p></div>
            <div><h2 className="font-bold">Destinataire</h2><p>{destination?.name || transfer.destination_store_id}</p></div>
          </div>
          <table className="w-full border-collapse text-left text-sm">
            <thead><tr className="border-b-2 border-slate-300"><th className="py-2 pr-3">Référence</th><th className="py-2 pr-3">Article</th><th className="py-2 pr-3">Unité</th><th className="py-2 text-right">Qté expédiée</th></tr></thead>
            <tbody>{transfer.lines.map(line => <tr key={line.id} className="border-b border-slate-200"><td className="py-3 pr-3">{line.article_code}</td><td className="py-3 pr-3">{line.article_name}</td><td className="py-3 pr-3">{line.unit}</td><td className="py-3 text-right">{line.quantity_sent.toLocaleString("fr-FR")}</td></tr>)}</tbody>
          </table>
          {transfer.note && <p className="mt-6 whitespace-pre-wrap text-sm">Observations : {transfer.note}</p>}
          <div className="mt-12 grid grid-cols-2 gap-8 text-sm"><div className="min-h-24 border-t pt-2">Signature de l'expéditeur</div><div className="min-h-24 border-t pt-2">Date, signature et cachet du destinataire</div></div>
        </article>
      </div>
    </div>, document.body
  );
}
