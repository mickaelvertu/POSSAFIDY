import { AlertCircle, CheckCircle2, Inbox, LoaderCircle, ShieldAlert, WifiOff, Clock3 } from "lucide-react";
type Kind = "empty" | "loading" | "error" | "offline" | "slow" | "denied" | "success";
const icons = { empty: Inbox, loading: LoaderCircle, error: AlertCircle, offline: WifiOff, slow: Clock3, denied: ShieldAlert, success: CheckCircle2 };
export default function FeedbackState({ kind, title, description, onRetry }: { kind: Kind; title: string; description?: string; onRetry?: () => void }) {
 const Icon = icons[kind];
 return <div role={kind === "error" || kind === "denied" ? "alert" : "status"} className="rounded-xl border border-slate-400/30 bg-slate-500/10 p-4 text-sm">
 <div className="flex items-center gap-2 font-semibold"><Icon aria-hidden="true" className={kind === "loading" ? "h-5 w-5 animate-spin motion-reduce:animate-none" : "h-5 w-5"} />{title}</div>
 {description && <p className="mt-2">{description}</p>}
 {onRetry && <button type="button" onClick={onRetry} className="mt-3 rounded-lg border border-current px-3 py-2">Réessayer</button>}
 </div>;
}
