import type { HistoryControls } from "../hooks/useHistoryPages";

export default function HistoryPaging({ hasMore, loading, error, loadMore, loadedCount = 0, label = "Historique" }: HistoryControls & { label?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-600 bg-slate-800 p-3 text-xs text-slate-100" role="status">
      <span>{label} · {loadedCount} lignes chargées. {error || (loading ? "Chargement en cours…" : hasMore ? "Les filtres et exports portent sur les lignes chargées." : "Chargement complet.")}</span>
      {!loading && (hasMore || error) && <button type="button" onClick={() => void loadMore()} className="rounded-lg bg-blue-600 px-3 py-2 font-bold text-white">{error ? "Réessayer" : "Charger la suite"}</button>}
    </div>
  );
}
