import { formatSignedQuantity, LedgerBlock } from "../services/stockLedger";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

interface StockLedgerGridProps {
  blocks: LedgerBlock[];
}

const dateTime = (timestamp: number) => new Date(timestamp).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
const day = (timestamp: number) => new Date(timestamp).toLocaleDateString("fr-FR");

export default function StockLedgerGrid({ blocks }: StockLedgerGridProps) {
  const [blockCount, setBlockCount] = useState(10);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  if (blocks.length === 0) {
    return <p className="py-6 text-center text-xs italic text-slate-400">Aucun mouvement pour ces filtres.</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-600 print:hidden">Affichage progressif pour garder la grille fluide. L’export et l’impression incluent toutes les lignes.</p>
      {(printing ? blocks : blocks.slice(0, blockCount)).map(block => (
        <table key={block.key} className="w-full table-fixed border-collapse border border-slate-400 text-xs [break-inside:avoid]">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[14%]" />
            <col className="w-[26%]" />
            <col className="w-[14%]" />
            <col className="w-[24%]" />
          </colgroup>
          <thead>
            <tr className="bg-slate-800 text-white">
              <th colSpan={3} className="border border-slate-400 px-2 py-2 text-left">
                {block.articleName}
                {block.articleCode && <span className="ml-1 font-mono text-[10px] font-normal text-slate-300">[{block.articleCode}]</span>}
                <span className="ml-2 text-[11px] font-normal text-slate-300">· {block.storeName}</span>
              </th>
              <th colSpan={2} className="border border-slate-400 px-2 py-2 text-right font-mono text-[11px] font-semibold">
                {day(block.firstDate) === day(block.lastDate) ? day(block.firstDate) : `${day(block.firstDate)} → ${day(block.lastDate)}`}
              </th>
            </tr>
            <tr className="bg-slate-100 text-slate-700">
              <th className="border border-slate-300 px-2 py-1.5 text-left">Date</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Variation</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left">Opération</th>
              <th className="border border-slate-300 px-2 py-1.5 text-right">Stock</th>
              <th className="border border-slate-300 px-2 py-1.5 text-left">Référence</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-amber-50 font-bold text-slate-900">
              <td className="border border-slate-300 px-2 py-1.5">{dateTime(block.firstDate)}</td>
              <td className="border border-slate-300 px-2 py-1.5" />
              <td className="border border-slate-300 px-2 py-1.5">Stock avant</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right font-mono">{block.before}</td>
              <td className="border border-slate-300 px-2 py-1.5" />
            </tr>
            {(printing ? block.entries : block.entries.slice(0, entryCounts[block.key] || 50)).map(entry => (
              <tr key={entry.id}>
                <td className="border border-slate-300 px-2 py-1.5 text-slate-600">{dateTime(entry.date)}</td>
                <td className={`border border-slate-300 px-2 py-1.5 text-right font-mono font-bold ${entry.change > 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatSignedQuantity(entry.change)}</td>
                <td className="border border-slate-300 px-2 py-1.5">{entry.cause}</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-slate-600">{entry.balanceAfter}</td>
                <td className="truncate border border-slate-300 px-2 py-1.5 font-mono text-[10px] text-slate-500">{entry.reference}</td>
              </tr>
            ))}
            {!printing && block.entries.length > (entryCounts[block.key] || 50) && (
              <tr className="print:hidden"><td colSpan={5} className="p-2">
                <button type="button" onClick={() => setEntryCounts(current => ({ ...current, [block.key]: (current[block.key] || 50) + 100 }))} className="rounded border border-blue-300 bg-blue-50 px-3 py-2 font-bold text-blue-800">
                  Afficher la suite ({entryCounts[block.key] || 50} / {block.entries.length} mouvements)
                </button>
              </td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold text-slate-900">
              <td className="border border-slate-300 px-2 py-1.5">{dateTime(block.lastDate)}</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-[10px]" title="Total des entrées / sorties">
                Σ <span className="text-emerald-700">{formatSignedQuantity(block.totalIn)}</span>{" "}
                <span className="text-rose-700">{formatSignedQuantity(block.totalOut)}</span>
              </td>
              <td className="border border-slate-300 px-2 py-1.5">Stock après</td>
              <td className="border border-slate-300 px-2 py-1.5 text-right font-mono">{block.after}</td>
              <td className="border border-slate-300 px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>
      ))}
      {!printing && blocks.length > blockCount && <button type="button" onClick={() => setBlockCount(count => count + 10)} className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 print:hidden">Afficher les articles suivants ({blockCount} / {blocks.length})</button>}
    </div>
  );
}
