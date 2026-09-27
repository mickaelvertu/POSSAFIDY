import { FormEvent, useState } from "react";
import { Check, Plus, Ruler, X } from "lucide-react";
import { Article, UnitOfMeasure } from "../types";

interface UnitsViewProps {
  units: UnitOfMeasure[];
  articles: Article[];
  onCreateUnit: (unit: UnitOfMeasure) => Promise<void>;
  onToggleUnit: (unit: UnitOfMeasure) => Promise<void>;
}

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

export default function UnitsView({ units, articles, onCreateUnit, onToggleUnit }: UnitsViewProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);

  const handleCreateUnit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (!normalizedName) {
      setError("Le nom de l'unité est requis.");
      return;
    }
    if (units.some(unit => unit.name.toLocaleLowerCase("fr-FR") === normalizedName.toLocaleLowerCase("fr-FR"))) {
      setError("Cette unité existe déjà.");
      return;
    }

    const timestamp = Date.now();
    setSavingName(true);
    setError("");
    try {
      await onCreateUnit({
        id: `unit-${crypto.randomUUID()}`,
        name: normalizedName,
        is_active: true,
        created_at: timestamp,
        updated_at: timestamp
      });
      setName("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Impossible d'enregistrer cette unité.");
    } finally {
      setSavingName(false);
    }
  };

  const handleToggleUnit = async (unit: UnitOfMeasure) => {
    setSavingUnitId(unit.id);
    setError("");
    try {
      await onToggleUnit({ ...unit, is_active: !unit.is_active, updated_at: Date.now() });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Impossible de modifier cette unité.");
    } finally {
      setSavingUnitId(null);
    }
  };

  const activeCount = units.filter(unit => unit.is_active).length;

  return (
    <div className="space-y-5 text-slate-900">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2"><Ruler className="h-5 w-5 text-emerald-700" /><h2 className="text-lg font-bold">Unités de mesure</h2></div>
          <p className="mt-1 text-xs text-slate-500">Référentiel partagé pour les conditionnements et quantités des articles.</p>
        </div>
        <div className="text-xs font-semibold text-slate-600">{activeCount} unité(s) active(s)</div>
      </header>

      <form onSubmit={handleCreateUnit} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1 text-xs font-semibold text-slate-700">Nouvelle unité<input value={name} onChange={event => setName(event.target.value)} placeholder="Ex. Kg, Litre, Carton de 12" className={inputClass} /></label>
        <button disabled={savingName} type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Plus className="h-4 w-4" /> Ajouter</button>
      </form>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3 font-bold">Unité</th><th className="px-4 py-3 font-bold">Articles associés</th><th className="px-4 py-3 font-bold">État</th><th className="px-4 py-3 text-right font-bold">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {units.map(unit => {
                const usageCount = articles.filter(article => article.unit.toLocaleLowerCase("fr-FR") === unit.name.toLocaleLowerCase("fr-FR")).length;
                const isSaving = savingUnitId === unit.id;
                return (
                  <tr key={unit.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">{unit.name}</td>
                    <td className="px-4 py-3 text-slate-600">{usageCount}</td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 font-semibold ${unit.is_active ? "text-emerald-700" : "text-slate-500"}`}>{unit.is_active ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}{unit.is_active ? "Active" : "Inactive"}</span></td>
                    <td className="px-4 py-3 text-right"><button type="button" disabled={isSaving || (unit.is_active && usageCount > 0)} title={unit.is_active && usageCount > 0 ? "Cette unité est utilisée par un article" : undefined} onClick={() => handleToggleUnit(unit)} className="rounded-md border border-slate-300 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">{isSaving ? "..." : unit.is_active ? "Désactiver" : "Réactiver"}</button></td>
                  </tr>
                );
              })}
              {units.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Aucune unité disponible.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}