import { useState, FormEvent } from "react";
import { Store, StoreTypeCode, UserProfile } from "../types";
import { 
  Building2, 
  Plus, 
  Edit, 
  MapPin, 
  User, 
  CheckCircle2, 
  X, 
  PowerOff,
  Boxes,
  ShoppingCart,
  Factory,
  Store as StoreIcon
} from "lucide-react";

interface StoresViewProps {
  stores: Store[];
  currentUser: UserProfile;
  onCreateStore: (store: Store) => void;
  onUpdateStore: (store: Store) => void;
  onToggleStoreStatus: (storeId: string) => void;
}

export default function StoresView({
  stores,
  currentUser,
  onCreateStore,
  onUpdateStore,
  onToggleStoreStatus
}: StoresViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [storeType, setStoreType] = useState<StoreTypeCode>("POS");
  const [location, setLocation] = useState("");
  const [managerName, setManagerName] = useState("");

  const handleOpenNew = () => {
    setEditingStore(null);
    setCode("");
    setName("");
    setStoreType("POS");
    setLocation("");
    setManagerName("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (store: Store) => {
    setEditingStore(store);
    setCode(store.code);
    setName(store.name);
    setStoreType(store.store_type);
    setLocation(store.location || "");
    setManagerName(store.manager_name || "");
    setIsModalOpen(true);
  };

  const handleSaveStore = (e: FormEvent) => {
    e.preventDefault();
    if (!code || !name) return;

    if (editingStore) {
      const updated: Store = {
        ...editingStore,
        code,
        name,
        store_type: storeType,
        location,
        manager_name: managerName,
        updated_at: Date.now()
      };
      onUpdateStore(updated);
    } else {
      const newStore: Store = {
        id: `store-${Date.now()}`,
        code,
        name,
        store_type: storeType,
        location,
        manager_name: managerName,
        is_active: true,
        created_at: Date.now(),
        updated_at: Date.now()
      };
      onCreateStore(newStore);
    }

    setIsModalOpen(false);
  };

  const getTypeBadge = (type: StoreTypeCode) => {
    switch (type) {
      case "CENTRAL_WAREHOUSE":
        return <span className="bg-blue-100 text-blue-800 border border-blue-300 px-2 py-0.5 rounded text-[10px] font-bold">DÉPÔT CENTRAL</span>;
      case "POS":
        return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded text-[10px] font-bold">POINT DE VENTE NORMAL</span>;
      case "RESELLER":
        return <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-bold">MAGASIN REVENDEUR</span>;
      case "MANUFACTURER":
        return <span className="bg-purple-100 text-purple-800 border border-purple-300 px-2 py-0.5 rounded text-[10px] font-bold">MAGASIN PRODUCTION</span>;
    }
  };

  const getTypeIcon = (type: StoreTypeCode) => {
    switch (type) {
      case "CENTRAL_WAREHOUSE": return <Boxes className="h-5 w-5 text-blue-600" />;
      case "POS": return <StoreIcon className="h-5 w-5 text-emerald-600" />;
      case "RESELLER": return <ShoppingCart className="h-5 w-5 text-amber-600" />;
      case "MANUFACTURER": return <Factory className="h-5 w-5 text-purple-600" />;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header Banner */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 font-serif">
              Magasins, Dépôts & Entrepôts GILEADA
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Section 2 : Administration des 4 types de magasins. Codes métiers éditables par l'administrateur avec conservation historique.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenNew}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouveau Magasin / Site
        </button>
      </div>

      {/* Stores Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {stores.map((store) => (
          <div 
            key={store.id} 
            className={`bg-white rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition hover:shadow-md ${
              !store.is_active ? "opacity-60 bg-slate-50" : "border-slate-200"
            }`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {store.code}
                </span>
                {getTypeBadge(store.store_type)}
              </div>

              <div className="flex items-center gap-3 mt-3">
                <div className="p-2.5 bg-slate-100 rounded-xl">
                  {getTypeIcon(store.store_type)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{store.name}</h3>
                  <div className="text-[10px] text-slate-400 font-mono">ID: {store.id}</div>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>{store.location || "Adresse non spécifiée"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>Responsable : <strong>{store.manager_name || "Non assigné"}</strong></span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                store.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
              }`}>
                {store.is_active ? "Opérationnel" : "Désactivé"}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(store)}
                  className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Edit className="h-3 w-3" />
                  Modifier
                </button>
                <button
                  type="button"
                  onClick={() => onToggleStoreStatus(store.id)}
                  className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                    store.is_active ? "text-amber-700 hover:bg-amber-50" : "text-emerald-700 hover:bg-emerald-50"
                  }`}
                >
                  {store.is_active ? "Désactiver" : "Activer"}
                </button>
              </div>
            </div>

          </div>
        ))}
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">
                {editingStore ? `Modifier le Magasin [${editingStore.code}]` : "Créer un Nouveau Site"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStore} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Code Métier :</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ex: POS-03, REV-TAM..."
                    className="w-full font-mono font-bold bg-white border border-slate-300 rounded-lg p-2"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Type de Magasin :</label>
                  <select
                    value={storeType}
                    onChange={(e) => setStoreType(e.target.value as StoreTypeCode)}
                    className="w-full font-bold bg-white border border-slate-300 rounded-lg p-2"
                  >
                    <option value="CENTRAL_WAREHOUSE">Dépôt Central</option>
                    <option value="POS">Point de Vente Normal (POS)</option>
                    <option value="RESELLER">Magasin Revendeur</option>
                    <option value="MANUFACTURER">Atelier Production</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom du Site / Magasin :</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Boutique Gileada Tamatave..."
                  className="w-full font-medium bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Emplacement / Adresse :</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Bazar Be, Toamasina..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Nom du Responsable / Gérant :</label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  placeholder="Ex: Rasoa Hanta..."
                  className="w-full bg-white border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs cursor-pointer"
                >
                  Enregistrer le Magasin
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
