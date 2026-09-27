import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { ReportColumn, sortReportRows } from "../services/reportColumns";

export interface ReportSortState {
  key: string;
  dir: "asc" | "desc";
}

interface ReportDataTableProps<T> {
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  hiddenKeys: Set<string>;
  sort: ReportSortState | null;
  onSort: (key: string) => void;
  emptyLabel?: string;
}

export default function ReportDataTable<T>({
  columns,
  rows,
  rowKey,
  hiddenKeys,
  sort,
  onSort,
  emptyLabel = "Aucune donnée pour ces filtres."
}: ReportDataTableProps<T>) {
  const visibleColumns = columns.filter(col => !hiddenKeys.has(col.key));
  const sortedRows = sortReportRows(rows, columns, sort);

  const footerColumns = visibleColumns.filter(col => col.footer);
  const leadingSpan = visibleColumns.length - footerColumns.length;

  return (
    <table className="w-full text-xs text-left border-collapse">
      <thead>
        <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
          {visibleColumns.map(col => {
            const isSorted = sort?.key === col.key;
            return (
              <th
                key={col.key}
                className={`py-2.5 px-2 font-bold select-none cursor-pointer whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"}`}
                onClick={() => onSort(col.key)}
              >
                <span className={`inline-flex items-center gap-1 ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                  {col.label}
                  {isSorted ? (sort!.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
                </span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {sortedRows.length === 0 && (
          <tr>
            <td colSpan={visibleColumns.length || 1} className="py-6 px-2 text-center text-slate-400 italic">
              {emptyLabel}
            </td>
          </tr>
        )}
        {sortedRows.map((row, index) => (
          <tr key={rowKey(row, index)} className="hover:bg-slate-50">
            {visibleColumns.map(col => (
              <td key={col.key} className={`py-2 px-2 ${col.align === "right" ? "text-right" : "text-left"}`}>
                {col.render ? col.render(row) : String(col.value(row))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footerColumns.length > 0 && (
        <tfoot>
          <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
            {leadingSpan > 0 && (
              <td colSpan={leadingSpan} className="py-3 px-2 text-right">TOTAL CONSOLIDÉ :</td>
            )}
            {footerColumns.map(col => (
              <td key={col.key} className="py-3 px-2 text-right font-mono">
                {col.footer!(rows)}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
