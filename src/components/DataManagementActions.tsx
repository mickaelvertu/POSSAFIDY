import { ChangeEvent, useRef, useState } from "react";
import { Download, RotateCcw, Upload } from "lucide-react";

interface DataManagementActionsProps<T> {
  data: T;
  isAdmin: boolean;
  label: string;
  onImport: (data: T) => Promise<void>;
  onReset: () => Promise<void>;
}

export default function DataManagementActions<T>({ data, isAdmin, label, onImport, onReset }: DataManagementActionsProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (!isAdmin) return null;

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const importedData = parsed && typeof parsed === "object" && "data" in parsed
        ? (parsed as { data: T }).data
        : parsed as T;
      await onImport(importedData);
      window.alert(`${label} importées avec succès.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : `Impossible d'importer les ${label.toLowerCase()}.`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm(`Réinitialiser les ${label.toLowerCase()} ? Les données historiques seront conservées.`)) return;
    setIsBusy(true);
    try {
      await onReset();
      window.alert(`${label} réinitialisées.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : `Impossible de réinitialiser les ${label.toLowerCase()}.`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={isBusy} onClick={handleExport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
        <Download className="h-4 w-4" /> Exporter
      </button>
      <button type="button" disabled={isBusy} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
        <Upload className="h-4 w-4" /> Importer
      </button>
      <button type="button" disabled={isBusy} onClick={() => void handleReset()} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50">
        <RotateCcw className="h-4 w-4" /> Réinitialiser
      </button>
      <input ref={inputRef} type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
    </div>
  );
}
