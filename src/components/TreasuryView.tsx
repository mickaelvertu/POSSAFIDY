import TreasuryTracking from './TreasuryTracking';
import { useEffect, useState, type FormEvent } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type { AppUser, Expense, Purchase, TreasuryFund, TreasuryMovement } from "../types";
import { moveTreasuryFunds, receiveTreasuryFunds } from "../services/treasuryService";

const money = (amount: number) => `${amount.toLocaleString("fr-FR")} Ar`;
const sources = { POS: "Remise POS / DEP", BANK: "Retrait bancaire", OTHER: "Autre source", OPENING: "Solde initial vérifié" };
const input = "input w-full";

export default function TreasuryView({ user, funds, movements, ready, error, purchases = [], expenses = [] }: {
  purchases?: Purchase[]; expenses?: Expense[]; user: AppUser; funds: TreasuryFund[]; movements: TreasuryMovement[]; ready: boolean; error: string;
}) {
  const [operationOpen, setOperationOpen] = useState(false);
  const [mode, setMode] = useState<"RECEIPT" | "TRANSFER" | "DEPOSIT">("RECEIPT");
  const [source, setSource] = useState<TreasuryFund["source"]>("BANK");
  const [fundId, setFundId] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [recipients, setRecipients] = useState<AppUser[]>([]);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const isSuperAdmin = user.roleId === "SUPER_ADMIN";
  const mine = funds.filter(fund => fund.owner_id === user.uid && fund.balance > 0);
  const transferableFunds = mode === "TRANSFER" && isSuperAdmin ? funds.filter(fund => fund.balance > 0) : mine;
  const selectedFund = funds.find(fund => fund.id === fundId);
  const eligibleRecipients = recipients.filter(recipient => recipient.uid !== selectedFund?.owner_id);
  useEffect(() => {
    let active = true;
    getDocs(collection(db, "users")).then(snapshot => {
      if (active) setRecipients(snapshot.docs.filter(row => row.data().status === "ACTIVE" && ["ADMIN", "SUPER_ADMIN"].includes(row.data().role) && (isSuperAdmin || row.id !== user.uid))
        .map(row => ({ uid: row.id, displayName: row.data().displayName || row.data().email || row.id } as AppUser)));
    }).catch(() => { if (active) setFeedback("Impossible de charger les administrateurs destinataires."); });
    return () => { active = false; };
  }, [user.uid, isSuperAdmin]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy || error) return;
    setBusy(true); setFeedback("");
    try {
      if (mode === "RECEIPT") await receiveTreasuryFunds(user, source, Number(amount), reference);
      else {
        const recipient = eligibleRecipients.find(item => item.uid === recipientId);
        if (mode === "TRANSFER" && !recipient) throw new Error("Choisissez un destinataire.");
        await moveTreasuryFunds(user, fundId, Number(amount), reference, mode === "TRANSFER" ? recipient : undefined);
      }
      setAmount(""); setReference(""); setFeedback("Opération enregistrée.");
    } catch (cause) { setFeedback(cause instanceof Error ? cause.message : "Impossible d'enregistrer l'opération."); }
    finally { setBusy(false); }
  }
  return <div className="treasury-shell space-y-6 rounded-xl bg-white p-4 text-slate-900 sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Trésorerie</h2><p className="mt-1 text-sm text-slate-500">Les fonds détenus par les administrateurs.</p></div><button type="button" className="ui-btn" aria-expanded={operationOpen} aria-controls="treasury-operation" onClick={() => setOperationOpen(open => !open)}>{operationOpen ? 'Fermer le formulaire' : 'Nouvelle opération'}</button></header>

    {(error || !ready) && <p role="alert" className="text-amber-800">{error || "Chargement de la trésorerie depuis le serveur…"}</p>}
    {operationOpen && <div id="treasury-operation" className="border-y border-slate-200 py-4"><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label>Opération<select className="select w-full" value={mode} onChange={event => { setMode(event.target.value as typeof mode); setFundId(""); setFeedback(""); }}><option value="RECEIPT">Recevoir des fonds</option><option value="TRANSFER">Transférer à un administrateur</option><option value="DEPOSIT">Déposer à la banque</option></select></label>
      {mode === "RECEIPT" ? <label>Origine<select className="select w-full" value={source} onChange={event => setSource(event.target.value as typeof source)}>{(["BANK", "OTHER", "OPENING"] as const).map(key => <option key={key} value={key}>{sources[key]}</option>)}</select></label> : <label>Fonds à utiliser<select required className="select w-full" value={fundId} onChange={event => { setFundId(event.target.value); setRecipientId(""); }}><option value="">Choisir un fonds</option>{transferableFunds.filter(fund => mode !== "DEPOSIT" || !fund.handover_id).map(fund => <option key={fund.id} value={fund.id}>{mode === "TRANSFER" && isSuperAdmin ? fund.owner_name + " - " : ""}{sources[fund.source]} · {fund.source_reference} · {money(fund.balance)}</option>)}</select></label>}
      {mode === "TRANSFER" && <label>Destinataire<select required className="select w-full" value={recipientId} onChange={event => setRecipientId(event.target.value)}><option value="">Choisir un administrateur</option>{eligibleRecipients.map(item => <option key={item.uid} value={item.uid}>{item.displayName}</option>)}</select></label>}
      <label>Montant (Ar)<input required type="number" min="1" step="1" className={input} value={amount} onChange={event => setAmount(event.target.value)} /></label>
      <label>Référence / justificatif{mode === "DEPOSIT" && " (banque et bordereau)"}<input required className={input} value={reference} onChange={event => setReference(event.target.value)} /></label>
      {mode === "TRANSFER" && <p className="text-sm text-slate-600 sm:col-span-2">Le transfert débite immédiatement le fonds choisi et crédite le destinataire. L'origine des fonds est conservée.{isSuperAdmin && " Vous pouvez transférer les fonds d'un autre détenteur sans sa confirmation ; votre identité reste enregistrée."}</p>}
      {mode === "DEPOSIT" && <p className="text-sm text-slate-600 sm:col-span-2">Pour un fonds issu directement d'une remise POS, utilisez le bouton de dépôt de cette remise.</p>}
      <button disabled={busy || !ready || !!error} className="rounded bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? "Enregistrement…" : "Enregistrer"}</button>
    </form><details className="mt-4 text-sm"><summary className="cursor-pointer text-slate-600">Comprendre les origines des fonds</summary>    <p className="text-sm text-slate-600">Les nouvelles remises POS / DEP réceptionnées par un administrateur alimentent ses fonds. Pour les anciennes remises encore détenues, utilisez « Reprendre dans la trésorerie » depuis les remises de caisse. Le solde initial vérifié doit exclure ces remises et les fonds déjà enregistrés.</p></details></div>}
    {feedback && <p role="status" className="text-sm">{feedback}</p>}
    <TreasuryTracking purchases={purchases} expenses={expenses} user={user} funds={funds} movements={movements} ready={ready && !error} />
  </div>;
}
