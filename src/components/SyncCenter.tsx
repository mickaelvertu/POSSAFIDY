import { Cloud, CloudOff } from "lucide-react";

export interface SyncAttempt {
  id: string;
  owner: string;
  label: string;
  status: "pending" | "confirmed" | "failed";
}

export default function SyncCenter({ online, attempts, status, errors, onRetry }: {
  online: boolean;
  attempts: SyncAttempt[];
  status: Record<string, string>;
  errors: Record<string, string>;
  onRetry: () => void;
}) {
  const alteredSources = Object.entries(status).filter(([, state]) => state !== "ready");
  const pending = attempts.filter(attempt => attempt.status === "pending");
  const recent = attempts.filter(attempt => attempt.status !== "pending").slice(0, 8);
  const Icon = online ? Cloud : CloudOff;
  return (
    <details className="treasury-shell rounded-[14px] border border-[var(--theme-border)] bg-[var(--theme-panel)] px-4">
      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 py-2 text-sm font-semibold">
        <Icon size={18} aria-hidden="true" /> Centre de synchronisation
        <span className="ml-auto text-xs font-medium text-[var(--theme-muted)]">{online ? "En ligne" : "Hors ligne"}{pending.length ? " · " + pending.length + " en attente" : ""}</span>
      </summary>
      <div className="space-y-3 border-t border-[var(--theme-line)] py-3 text-sm">
        {alteredSources.length > 0 && (
          <ul className="space-y-1">
            {alteredSources.map(([name, state]) => (
              <li key={name}>{name} <span className="text-[var(--theme-muted)]">· {state === "error" ? errors[name] || "Erreur" : state === "cached" ? "En cache" : "En cours"}</span></li>
            ))}
          </ul>
        )}
        <h2 className="font-semibold">Enregistrements de cette session</h2>
        {pending.length + recent.length === 0 ? <p className="text-[var(--theme-muted)]">Aucune vente ni demande de transfert enregistrée depuis l’ouverture de cette page.</p> : (
          <ul className="divide-y divide-[var(--theme-line)]">
            {[...pending, ...recent].map(attempt => (
              <li key={attempt.id} className="flex flex-wrap justify-between gap-1 py-2">
                <span>{attempt.label}</span>
                <span className="font-medium">{attempt.status === "pending" ? "En attente de confirmation" : attempt.status === "confirmed" ? "Confirmé" : "Échec de l’enregistrement"}</span>
              </li>
            ))}
          </ul>
        )}
        {pending.length > 0 && <p className="text-[var(--theme-muted)]">Vérifiez la référence dans le module avant de ressaisir un enregistrement en attente.</p>}
        {online && Object.keys(errors).length > 0 && <button type="button" className="ui-btn ui-btn-ghost min-h-11" onClick={onRetry}>Relancer le chargement des données</button>}
      </div>
    </details>
  );
}
