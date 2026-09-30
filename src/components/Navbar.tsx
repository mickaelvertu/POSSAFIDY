import { UserProfile, UserRole } from "../types";
import { DEMO_USERS } from "../data/initialData";
import { 
  Building2, 
  User, 
  ShieldCheck, 
  Store as StoreIcon, 
  RefreshCw,
  LogOut
} from "lucide-react";

interface NavbarProps {
  currentUser: UserProfile;
  onSelectUser: (user: UserProfile) => void;
  onResetData: () => void;
  onSignOut?: () => void;
}

export default function Navbar({
  currentUser,
  onSelectUser,
  onResetData,
  onSignOut
}: NavbarProps) {
  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case "admin": return "Super Administrateur";
      case "storekeeper_central": return "Magasinier Dépôt Central";
      case "pos_seller": return "Responsable POS Analakely";
      case "reseller_manager": return "Gérant Revendeur Majunga";
      case "manufacturer_manager": return "Chef Atelier Production";
      default: return role;
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case "admin": return "bg-purple-100 text-purple-800 border-purple-300";
      case "storekeeper_central": return "bg-blue-100 text-blue-800 border-blue-300";
      case "pos_seller": return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "reseller_manager": return "bg-amber-100 text-amber-800 border-amber-300";
      case "manufacturer_manager": return "bg-indigo-100 text-indigo-800 border-indigo-300";
      default: return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand */}
          <div className="flex items-center gap-3">
            <img src="/branding/gileada-icon.png" alt="" className="h-10 w-10 rounded-lg bg-white p-1 object-contain" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-slate-900 tracking-tight font-serif">GILEADA</span>
              </div>
            </div>
          </div>

          {/* User & Role Switcher */}
          <div className="flex items-center gap-3">
            {/* Quick Role Switcher for seamless testing */}
            <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
              <div className="flex items-center gap-1.5 px-2 text-xs font-semibold text-slate-600">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <span className="hidden md:inline">Rôle actif :</span>
              </div>
              <select
                value={currentUser.uid}
                onChange={(e) => {
                  const target = DEMO_USERS.find(u => u.uid === e.target.value);
                  if (target) onSelectUser(target);
                }}
                className="text-xs font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs cursor-pointer"
              >
                {DEMO_USERS.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.displayName} ({getRoleLabel(u.role)})
                  </option>
                ))}
              </select>
            </div>

            {/* Current user badge */}
            <div className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${getRoleBadgeColor(currentUser.role)}`}>
              <User className="h-3.5 w-3.5" />
              <span>{currentUser.role.toUpperCase()}</span>
            </div>

            {/* Reset / Fixture re-sync */}
            <button
              type="button"
              onClick={onResetData}
              title="Réinitialiser les données de démonstration"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                title="Déconnexion"
                className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
