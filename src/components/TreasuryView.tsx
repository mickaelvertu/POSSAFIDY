import { useEffect, useState, type FormEvent } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type { AppUser, TreasuryFund, TreasuryMovement } from "../types";
import { moveTreasuryFunds, receiveTreasuryFunds } from "../services/treasuryService";

const money = (amount: number) => `${amount.toLocaleString("fr-FR")} Ar`;
const sources = { POS: "Remise POS / DEP", BANK: "Retrait bancaire", OTHER: "Autre source", OPENING: "Solde initial vérifié" };
const kinds = { RECEIPT: "Réception", TRANSFER: "Transfert", PURCHASE: "Paiement d'achat", EXPENSE: "Paiement de dépense", EXPENSE_REFUND: "Annulation de dépense / remboursement", DEPOSIT: "Dépôt bancaire" };
const input = "w-full rounded border border-slate-300 bg-white p-2 text-sm text-slate-900";

export default function TreasuryView({ user, funds, movements, ready, error }: {
  user: AppUser; funds: TreasuryFund[]; movements: TreasuryMovement[]; ready: boolean; error: string;
}) {
  const [mode, setMode] = useState<"RECEIPT" | "TRANSFER" | "DEPOSIT">("RECEIPT");
  const [source, setSource] = useState<TreasuryFund["source"]>("BANK");
  const [fundId, setFundId] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [recipients, setRecipients] = useState<AppUser[]>([]);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = funds.filter(fund => fund.owner_id === user.uid && fund.balance > 0);
  useEffect(() => {
    let active = true;
    getDocs(collection(db, "users")).then(snapshot => {
      if (active) setRecipients(snapshot.docs.filter(row => row.data().status === "ACTIVE" && ["ADMIN", "SUPER_ADMIN"].includes(row.data().role) && row.id !== user.uid)
        .map(row => ({ uid: row.id, displayName: row.data().displayName || row.data().email || row.id } as AppUser)));
    }).catch(() => { if (active) setFeedback("Impossible de charger les administrateurs destinataires."); });
    return () => { active = false; };
  }, [user.uid]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setFeedback("");
    try {
      if (mode === "RECEIPT") await receiveTreasuryFunds(user, source, Number(amount), reference);
      else {
        const recipient = recipients.find(item => item.uid === recipientId);
        if (mode === "TRANSFER" && !recipient) throw new Error("Choisissez un destinataire.");
        await moveTreasuryFunds(user, fundId, Number(amount), reference, mode === "TRANSFER" ? recipient : undefined);
      }
      setAmount(""); setReference(""); setFeedback("Opération enregistrée.");
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : "Impossible d'enregistrer l'opération."); }
    finally { setBusy(false); }
  }
  const balances = new Map<string, { name: string; amount: number }>();
  funds.forEach(fund => balances.set(fund.owner_id, { name: fund.owner_name, amount: (balances.get(fund.owner_id)?.amount ?? 0) + fund.balance }));
  return <div className="space-y-5 rounded-xl bg-white p-5 text-slate-900">
    <h2 className="text-xl font-bold">Trésorerie des administrateurs</h2>
    <p className="text-sm text-slate-600">Les nouvelles remises POS / DEP réceptionnées par un administrateur alimentent ses fonds. Pour les anciennes remises encore détenues, utilisez « Reprendre dans la trésorerie » depuis les remises de caisse. Le solde initial vérifié doit exclure ces remises et les fonds déjà enregistrés.</p>
    {(error || !ready) && <p role="alert" className="text-amber-800">{error || "Chargement de la trésorerie depuis le serveur…"}</p>}
    <div className="flex flex-wrap gap-3">{[...balances].map(([id, balance]) => <div key={id} className="rounded-lg bg-emerald-50 p-3"><p>{balance.name}</p><strong>{money(balance.amount)}</strong>{id === user.uid && <span className="ml-2 text-xs">Votre compte</span>}</div>)}</div>
    <form onSubmit={submit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
      <label>Opération<select className={input} value={mode} onChange={event => { setMode(event.target.value as typeof mode); setFundId(""); setFeedback(""); }}><option value="RECEIPT">Recevoir des fonds</option><option value="TRANSFER">Transférer à un administrateur</option><option value="DEPOSIT">Déposer à la banque</option></select></label>
      {mode === "RECEIPT" ? <label>Origine<select className={input} value={source} onChange={event => setSource(event.target.value as typeof source)}>{(["BANK", "OTHER", "OPENING"] as const).map(key => <option key={key} value={key}>{sources[key]}</option>)}</select></label> : <label>Fonds à utiliser<select required className={input} value={fundId} onChange={event => setFundId(event.target.value)}><option value="">Choisir un fonds</option>{mine.filter(fund => mode !== "DEPOSIT" || !fund.handover_id).map(fund => <option key={fund.id} value={fund.id}>{sources[fund.source]} · {fund.source_reference} · {money(fund.balance)}</option>)}</select></label>}
      {mode === "TRANSFER" && <label>Destinataire<select required className={input} value={recipientId} onChange={event => setRecipientId(event.target.value)}><option value="">Choisir un administrateur</option>{recipients.map(item => <option key={item.uid} value={item.uid}>{item.displayName}</option>)}</select></label>}
      <label>Montant (Ar)<input required type="number" min="1" step="1" className={input} value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <label>Référence / justificatif{mode === "DEPOSIT" && " (banque et bordereau)"}<input required className={input} value={reference} onChange={event => setReference(event.target.value)} /></label>
      {mode === "TRANSFER" && <p className="text-sm text-slate-600 sm:col-span-2">Le transfert débite immédiatement votre fonds et crédite le destinataire. L'origine des fonds est conservée.</p>}
      {mode === "DEPOSIT" && <p className="text-sm text-slate-600 sm:col-span-2">Pour un fonds issu directement d'une remise POS, utilisez le bouton de dépôt de cette remise.</p>}
      <button disabled={busy || !ready || !!error} className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Enregistrement…" : "Enregistrer"}</button>
      {feedback && <p role="status">{feedback}</p>}
    </form>
    <h3 className="font-bold">Fonds disponibles par origine</h3>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Administrateur</th><th>Origine</th><th>Référence</th><th>Disponible</th></tr></thead><tbody>{funds.filter(fund => fund.balance > 0).map(fund => <tr key={fund.id} className="border-t"><td className="py-2">{fund.owner_name}</td><td>{sources[fund.source]}</td><td>{fund.source_reference}</td><td>{money(fund.balance)}</td></tr>)}</tbody></table></div>
    <h3 className="font-bold">Historique des mouvements</h3>
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Date</th><th>Opération</th><th>De / vers</th><th>Référence</th><th>Montant</th></tr></thead><tbody>{movements.map(movement => <tr key={movement.id} className="border-t"><td className="py-2">{new Date(movement.created_at).toLocaleString("fr-FR")}</td><td>{kinds[movement.kind]}</td><td>{funds.find(fund => fund.owner_id === movement.from_user)?.owner_name || "Source externe"} → {funds.find(fund => fund.owner_id === movement.to_user)?.owner_name || (movement.kind === "PURCHASE" ? "Fournisseur" : movement.kind === "EXPENSE" ? "Bénéficiaire de la dépense" : "Banque")}</td><td>{movement.reference}</td><td>{money(movement.amount)}</td></tr>)}</tbody></table></div>
  </div>;
}
