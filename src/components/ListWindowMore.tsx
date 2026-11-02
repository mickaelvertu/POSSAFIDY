export default function ListWindowMore({ count, total, onMore }: { count: number; total: number; onMore: () => void }) {
  if (total <= count) return null;
  return <button type="button" onClick={onMore} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-bold text-blue-900">Afficher la suite ({Math.min(count, total)} / {total})</button>;
}
