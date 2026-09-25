import { useState } from "react";
import { AuditLog, Store } from "../types";
import { 
  ShieldCheck, 
  Search, 
  Clock, 
  User, 
  Laptop, 
  Building2, 
  Terminal, 
  FileCode,
  ShieldAlert
} from "lucide-react";

interface AuditViewProps {
  auditLogs: AuditLog[];
  stores: Store[];
}

export default function AuditView({
  auditLogs,
  stores
}: AuditViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<string>("ALL");

  const getStoreName = (id?: string) => {
    if (!id) return "Système Global";
    return stores.find(s => s.id === id)?.name || id;
  };

  const filteredLogs = auditLogs.filter((log) => {
    if (selectedEntity !== "ALL" && log.entity_type !== selectedEntity) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchAct = log.action.toLowerCase().includes(q);
      const matchUsr = log.user_name.toLowerCase().includes(q);
      const matchEnt = log.entity_id.toLowerCase().includes(q);
      if (!matchAct && !matchUsr && !matchEnt) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-slate-800" />
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              Journal d'Audit Immuable & Sécurité
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Section 11 : Traçabilité des actions sensibles (utilisateur, magasin, appareil, horodatage, état avant et après).
          </p>
        </div>

        <div className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
          {auditLogs.length} Événements audités
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600">Entité :</label>
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Toutes les Entités</option>
            <option value="STOCK_TRANSFER">Transferts de Stock</option>
            <option value="SALE">Ventes Caisse</option>
            <option value="PRODUCTION">Ordres de Production</option>
            <option value="INVENTORY">Ajustements d'Inventaire</option>
            <option value="ARTICLE">Articles & Prix</option>
            <option value="STORE">Magasins</option>
            <option value="SYSTEM">Système</option>
          </select>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Rechercher action, utilisateur, ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-3">Horodatage</th>
                <th className="py-3 px-3">Utilisateur</th>
                <th className="py-3 px-3">Site / Magasin</th>
                <th className="py-3 px-3">Action Métier</th>
                <th className="py-3 px-3">Entité & ID</th>
                <th className="py-3 px-3">Appareil (Device)</th>
                <th className="py-3 px-3">État Avant</th>
                <th className="py-3 px-3">État Après</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                    {new Date(log.created_at).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">
                    {log.user_name}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">
                    {getStoreName(log.store_id)}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px]">
                    <span className="text-slate-500">{log.entity_type}</span>
                    <div className="text-slate-900 font-bold">{log.entity_id}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">
                    {log.device_id}
                  </td>
                  <td className="py-2.5 px-3 max-w-xs truncate font-mono text-[10px] text-rose-700">
                    {log.old_value ? JSON.stringify(log.old_value) : "-"}
                  </td>
                  <td className="py-2.5 px-3 max-w-xs truncate font-mono text-[10px] text-emerald-700">
                    {log.new_value ? JSON.stringify(log.new_value) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
