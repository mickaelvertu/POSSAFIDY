import { useState, useMemo } from "react";
import { 
  AppUser, 
  AppRoleId, 
  AppPermission, 
  Store, 
  ALL_PERMISSIONS 
} from "../types";
import { 
  ROLE_DEFINITIONS, 
  DEFAULT_ROLE_PERMISSIONS, 
  PERMISSION_GROUPS, 
  hasPermission,
  syncUserToFirestore
} from "../services/authService";
import { 
  Users, 
  ShieldCheck, 
  Key, 
  Building2, 
  Search, 
  Plus, 
  Check, 
  X, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Sliders, 
  Save, 
  Trash2,
  Lock,
  Eye,
  AlertCircle
} from "lucide-react";

interface UsersViewProps {
  currentUser: AppUser;
  users: AppUser[];
  stores: Store[];
  onUpdateUser: (updatedUser: AppUser) => void;
  onCreateUser: (newUser: AppUser) => void;
  onDeleteUser: (userId: string) => void;
}

export default function UsersView({
  currentUser,
  users,
  stores,
  onUpdateUser,
  onCreateUser,
  onDeleteUser
}: UsersViewProps) {
  const [activeTab, setActiveTab] = useState<"users" | "roles">("users");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("ALL");
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>("ALL");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("ALL");

  // Edit / Create Modal State
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [modalTab, setModalTab] = useState<"general" | "stores" | "permissions">("general");
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Form fields for editing
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRoleId, setFormRoleId] = useState<AppRoleId>("VENDEUR");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formStoreIds, setFormStoreIds] = useState<string[]>([]);
  const [formPermissions, setFormPermissions] = useState<AppPermission[]>([]);

  // Permissions of current user
  const canCreate = hasPermission(currentUser, "users.create");
  const canEdit = hasPermission(currentUser, "users.edit");
  const canDelete = hasPermission(currentUser, "users.delete");
  const canManagePerms = hasPermission(currentUser, "users.permissions");

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
        const username = user.username.toLowerCase();
        const email = (user.email || "").toLowerCase();
        if (!fullName.includes(q) && !username.includes(q) && !email.includes(q)) {
          return false;
        }
      }

      // Role filter
      if (selectedRoleFilter !== "ALL" && user.roleId !== selectedRoleFilter) {
        return false;
      }

      // Store filter
      if (selectedStoreFilter !== "ALL") {
        if (!user.storeIds.includes(selectedStoreFilter)) {
          return false;
        }
      }

      // Status filter
      if (selectedStatusFilter === "ACTIVE" && !user.isActive) return false;
      if (selectedStatusFilter === "INACTIVE" && user.isActive) return false;

      return true;
    });
  }, [users, searchQuery, selectedRoleFilter, selectedStoreFilter, selectedStatusFilter]);

  // Open modal for editing
  const handleStartEdit = (user: AppUser) => {
    setEditingUser(user);
    setIsCreating(false);
    setFormFirstName(user.firstName);
    setFormLastName(user.lastName);
    setFormUsername(user.username);
    setFormEmail(user.email || "");
    setFormRoleId(user.roleId);
    setFormIsActive(user.isActive);
    setFormStoreIds([...(user.storeIds || [])]);
    setFormPermissions([...(user.permissions || [])]);
    setModalTab("general");
  };

  // Open modal for new user
  const handleStartCreate = () => {
    setEditingUser(null);
    setIsCreating(true);
    setFormFirstName("");
    setFormLastName("");
    setFormUsername("");
    setFormEmail("");
    setFormRoleId("VENDEUR");
    setFormIsActive(true);
    setFormStoreIds([]);
    setFormPermissions([...DEFAULT_ROLE_PERMISSIONS.VENDEUR]);
    setModalTab("general");
  };

  // Quick toggle active state in list
  const handleQuickToggleActive = (user: AppUser) => {
    if (!canEdit) return;
    if (user.id === currentUser.id && user.isActive) {
      alert("Vous ne pouvez pas désactiver votre propre compte actuellement connecté.");
      return;
    }
    const updated: AppUser = {
      ...user,
      isActive: !user.isActive,
      updatedAt: Date.now()
    };
    onUpdateUser(updated);
    syncUserToFirestore(updated);
  };

  // Save Modal
  const handleSaveModal = () => {
    if (!formUsername.trim()) {
      alert("L'identifiant / nom d'utilisateur est obligatoire.");
      return;
    }
    if (!formFirstName.trim() || !formLastName.trim()) {
      alert("Le nom et le prénom sont obligatoires.");
      return;
    }

    if (isCreating) {
      const newUser: AppUser = {
        id: `user-${Date.now()}`,
        username: formUsername.trim().toLowerCase(),
        email: formEmail.trim() || undefined,
        firstName: formFirstName.trim(),
        lastName: formLastName.trim(),
        roleId: formRoleId,
        isActive: formIsActive,
        storeIds: formStoreIds,
        permissions: formPermissions,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      onCreateUser(newUser);
      syncUserToFirestore(newUser);
    } else if (editingUser) {
      const updated: AppUser = {
        ...editingUser,
        username: formUsername.trim().toLowerCase(),
        email: formEmail.trim() || undefined,
        firstName: formFirstName.trim(),
        lastName: formLastName.trim(),
        roleId: formRoleId,
        isActive: formIsActive,
        storeIds: formStoreIds,
        permissions: formPermissions,
        updatedAt: Date.now()
      };
      onUpdateUser(updated);
      syncUserToFirestore(updated);
    }

    setSaveSuccessMsg("Compte utilisateur et permissions enregistrés avec succès !");
    setTimeout(() => {
      setSaveSuccessMsg(null);
      setEditingUser(null);
      setIsCreating(false);
    }, 900);
  };

  // Role changed in form -> ask or offer to apply default permissions
  const handleRoleChange = (newRole: AppRoleId) => {
    setFormRoleId(newRole);
    // Apply role default permissions
    setFormPermissions([...DEFAULT_ROLE_PERMISSIONS[newRole]]);
  };

  // Toggle single permission ON/OFF
  const handleTogglePermission = (perm: AppPermission) => {
    if (formPermissions.includes(perm)) {
      setFormPermissions(formPermissions.filter(p => p !== perm));
    } else {
      setFormPermissions([...formPermissions, perm]);
    }
  };

  // Toggle whole permission group ON/OFF
  const handleToggleGroup = (groupPerms: AppPermission[], enableAll: boolean) => {
    if (enableAll) {
      const newPerms = new Set([...formPermissions, ...groupPerms]);
      setFormPermissions(Array.from(newPerms));
    } else {
      setFormPermissions(formPermissions.filter(p => !groupPerms.includes(p)));
    }
  };

  // Reset to role defaults
  const handleResetToRoleDefaults = () => {
    setFormPermissions([...DEFAULT_ROLE_PERMISSIONS[formRoleId]]);
  };

  // Enable / Disable all
  const handleEnableAllPermissions = () => {
    setFormPermissions([...ALL_PERMISSIONS]);
  };

  const handleDisableAllPermissions = () => {
    setFormPermissions([]);
  };

  // Store selection toggle
  const handleToggleStore = (storeId: string) => {
    if (formStoreIds.includes(storeId)) {
      setFormStoreIds(formStoreIds.filter(id => id !== storeId));
    } else {
      setFormStoreIds([...formStoreIds, storeId]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Gestion des Utilisateurs, Rôles & Accès
              </h1>
              <p className="text-sm text-slate-500">
                Contrôle d'accès granulaire RBAC, affectation par magasin/PV et activation ON/OFF
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              onClick={() => setActiveTab("users")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "users" 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Comptes ({users.length})
            </button>
            <button
              onClick={() => setActiveTab("roles")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "roles" 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Matrice des 8 Rôles
            </button>
          </div>

          {canCreate && (
            <button
              onClick={handleStartCreate}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Nouvel Utilisateur
            </button>
          )}
        </div>
      </div>

      {/* Notice info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900 space-y-1">
          <span className="font-semibold text-blue-950">Règle de sécurité GILEADA (Role ≠ Permission) :</span>
          <p>
            Le rôle attribue un profil initial de permissions. L'administrateur peut ensuite activer ou désactiver 
            individuellement n'importe quelle permission avec des boutons <strong>ON/OFF</strong>. De plus, 
            les utilisateurs de type vendeur ne peuvent accéder qu'au magasin qui leur est expressément attribué.
          </p>
        </div>
      </div>

      {activeTab === "users" ? (
        <>
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher nom, login, email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Role Filter */}
            <div>
              <select
                value={selectedRoleFilter}
                onChange={e => setSelectedRoleFilter(e.target.value)}
                className="w-full py-2 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="ALL">Tous les Rôles ({users.length})</option>
                {Object.values(ROLE_DEFINITIONS).map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Store Filter */}
            <div>
              <select
                value={selectedStoreFilter}
                onChange={e => setSelectedStoreFilter(e.target.value)}
                className="w-full py-2 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="ALL">Tous les Magasins / PV</option>
                {stores.map(st => (
                  <option key={st.id} value={st.id}>{st.name} ({st.code})</option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={selectedStatusFilter}
                onChange={e => setSelectedStatusFilter(e.target.value)}
                className="w-full py-2 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="ACTIVE">Comptes Actifs uniquement</option>
                <option value="INACTIVE">Comptes Bloqués / Inactifs</option>
              </select>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3.5">Utilisateur</th>
                    <th className="px-4 py-3.5">Rôle</th>
                    <th className="px-4 py-3.5">Magasins Attribués</th>
                    <th className="px-4 py-3.5 text-center">Statut (ON/OFF)</th>
                    <th className="px-4 py-3.5">Permissions Actives</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        Aucun utilisateur ne correspond aux critères de recherche.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map(user => {
                      const roleMeta = ROLE_DEFINITIONS[user.roleId] || ROLE_DEFINITIONS.VENDEUR;
                      const isCurrentUser = user.id === currentUser.id;
                      const assignedStores = stores.filter(s => (user.storeIds || []).includes(s.id));
                      const defaultPerms = DEFAULT_ROLE_PERMISSIONS[user.roleId] || [];
                      const isCustomPerms = user.permissions.length !== defaultPerms.length || 
                        !user.permissions.every(p => defaultPerms.includes(p));

                      return (
                        <tr 
                          key={user.id} 
                          className={`hover:bg-slate-50/70 transition-colors ${
                            !user.isActive ? "bg-slate-50/40 opacity-75" : ""
                          }`}
                        >
                          {/* Name & Username */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                                user.isActive 
                                  ? "bg-slate-800 text-white" 
                                  : "bg-slate-300 text-slate-600"
                              }`}>
                                {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                  {user.firstName} {user.lastName}
                                  {isCurrentUser && (
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                      Vous
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 flex items-center gap-2">
                                  <span>@{user.username}</span>
                                  {user.email && (
                                    <>
                                      <span>•</span>
                                      <span className="text-slate-400">{user.email}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Role Badge */}
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleMeta.bgLight}`}>
                              {roleMeta.name}
                            </span>
                          </td>

                          {/* Assigned Stores */}
                          <td className="px-4 py-3.5">
                            {user.roleId === "SUPER_ADMIN" || ((user.roleId === "ADMIN") && (!user.storeIds || user.storeIds.length === 0)) ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                                <Building2 className="w-3 h-3" />
                                Tous les magasins (Global)
                              </span>
                            ) : assignedStores.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {assignedStores.map(st => (
                                  <span 
                                    key={st.id} 
                                    className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200"
                                    title={st.name}
                                  >
                                    <Building2 className="w-3 h-3 text-slate-400" />
                                    {st.code}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                Aucun magasin assigné
                              </span>
                            )}
                          </td>

                          {/* Statut Toggle Switch ON/OFF */}
                          <td className="px-4 py-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleQuickToggleActive(user)}
                              disabled={!canEdit}
                              title={user.isActive ? "Cliquer pour désactiver ce compte" : "Cliquer pour activer ce compte"}
                              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                user.isActive ? "bg-emerald-600" : "bg-slate-300"
                              } ${!canEdit ? "opacity-60 cursor-not-allowed" : ""}`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  user.isActive ? "translate-x-5" : "translate-x-0"
                                }`}
                              />
                            </button>
                            <div className="text-[10px] font-medium mt-0.5">
                              {user.isActive ? (
                                <span className="text-emerald-700 font-semibold">ACTIF</span>
                              ) : (
                                <span className="text-slate-400 font-semibold">INACTIF</span>
                              )}
                            </div>
                          </td>

                          {/* Permissions Count */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800 text-xs">
                                {user.roleId === "SUPER_ADMIN" 
                                  ? `${ALL_PERMISSIONS.length} / ${ALL_PERMISSIONS.length}` 
                                  : `${user.permissions.length} / ${ALL_PERMISSIONS.length}`}
                              </span>
                              {isCustomPerms && user.roleId !== "SUPER_ADMIN" && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                                  Personnalisé
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {canManagePerms || canEdit ? (
                                <button
                                  onClick={() => handleStartEdit(user)}
                                  className="inline-flex items-center gap-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium px-2.5 py-1.5 rounded-lg transition"
                                  title="Gérer les permissions et détails"
                                >
                                  <Sliders className="w-3.5 h-3.5 text-slate-600" />
                                  Droits & Magasins
                                </button>
                              ) : null}

                              {canDelete && !isCurrentUser && user.roleId !== "SUPER_ADMIN" && (
                                <button
                                  onClick={() => {
                                    if (confirm(`Confirmez-vous la suppression du compte de ${user.firstName} ${user.lastName} ?`)) {
                                      onDeleteUser(user.id);
                                    }
                                  }}
                                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition"
                                  title="Supprimer l'utilisateur"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Roles Matrix View */
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-1">
              Matrice de Définition des 8 Rôles de Base GILEADA
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Chaque rôle sert de modèle de départ. Les permissions de chaque utilisateur restent modulables individuellement.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.values(ROLE_DEFINITIONS).map(role => {
                const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role.id];
                const countUsers = users.filter(u => u.roleId === role.id).length;

                return (
                  <div key={role.id} className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between hover:border-slate-300 transition-all bg-white shadow-sm">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${role.bgLight}`}>
                          {role.name}
                        </span>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {countUsers} compte{countUsers > 1 ? "s" : ""}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mb-3 min-h-[3rem]">
                        {role.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Permissions par défaut :</span>
                      <span className="font-bold text-slate-800">
                        {defaultPerms.length} / {ALL_PERMISSIONS.length}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Edit / Create User Modal */}
      {(editingUser || isCreating) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Key className="w-5 h-5 text-emerald-600" />
                  {isCreating ? "Créer un Nouvel Utilisateur" : `Modifier le compte : ${formFirstName} ${formLastName}`}
                </h2>
                <p className="text-xs text-slate-500">
                  Configurez le rôle de base, les magasins affectés et les interrupteurs de permissions ON/OFF
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingUser(null);
                  setIsCreating(false);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-200 px-6 bg-white text-xs font-semibold">
              <button
                onClick={() => setModalTab("general")}
                className={`py-3 px-4 border-b-2 transition-all ${
                  modalTab === "general"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                1. Informations & Rôle
              </button>
              <button
                onClick={() => setModalTab("stores")}
                className={`py-3 px-4 border-b-2 transition-all flex items-center gap-1.5 ${
                  modalTab === "stores"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                2. Magasins / PV ({formStoreIds.length})
              </button>
              <button
                onClick={() => setModalTab("permissions")}
                className={`py-3 px-4 border-b-2 transition-all flex items-center gap-1.5 ${
                  modalTab === "permissions"
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                3. Permissions Granulaires ({formPermissions.length} ON)
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1">
              {saveSuccessMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  {saveSuccessMsg}
                </div>
              )}

              {/* TAB 1: General Info */}
              {modalTab === "general" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Prénom *
                      </label>
                      <input
                        type="text"
                        value={formFirstName}
                        onChange={e => setFormFirstName(e.target.value)}
                        placeholder="Ex: Jean"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nom de famille *
                      </label>
                      <input
                        type="text"
                        value={formLastName}
                        onChange={e => setFormLastName(e.target.value)}
                        placeholder="Ex: Rakoto"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Identifiant de connexion (Username) *
                      </label>
                      <input
                        type="text"
                        value={formUsername}
                        onChange={e => setFormUsername(e.target.value)}
                        placeholder="Ex: jean.vendeur"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Adresse E-mail
                      </label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={e => setFormEmail(e.target.value)}
                        placeholder="Ex: jean.rakoto@gileada.mg"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Active Switch */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-900">
                        Statut du compte : {formIsActive ? "Actif" : "Désactivé / Bloqué"}
                      </div>
                      <div className="text-xs text-slate-500">
                        Un compte inactif ne peut pas se connecter ni effectuer aucune opération sur l'application.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormIsActive(!formIsActive)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        formIsActive ? "bg-emerald-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                          formIsActive ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Role Selector */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Rôle Système de base
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {Object.values(ROLE_DEFINITIONS).map(r => {
                        const isSelected = formRoleId === r.id;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => handleRoleChange(r.id)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              isSelected
                                ? "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20"
                                : "border-slate-200 hover:border-slate-300 bg-white"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${r.bgLight}`}>
                                {r.name}
                              </span>
                              {isSelected && <Check className="w-4 h-4 text-emerald-600" />}
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2">
                              {r.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Stores Assignment */}
              {modalTab === "stores" && (
                <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                    <Building2 className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-amber-950">Règle de cloisonnement par magasin :</span>
                      <p>
                        Un utilisateur assigné à des magasins précis ne voit que les stocks, ventes et mouvements de ces magasins. 
                        Un vendeur en point de vente ne peut pas interagir avec le dépôt central ou un autre point de vente.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-semibold text-slate-700 uppercase">
                      Sélectionnez les magasins / points de vente autorisés :
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFormStoreIds(stores.map(s => s.id))}
                        className="text-xs text-emerald-700 hover:underline font-medium"
                      >
                        Tout cocher
                      </button>
                      <span className="text-slate-300">•</span>
                      <button
                        type="button"
                        onClick={() => setFormStoreIds([])}
                        className="text-xs text-slate-500 hover:underline font-medium"
                      >
                        Tout décocher
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {stores.map(st => {
                      const isChecked = formStoreIds.includes(st.id);
                      return (
                        <div
                          key={st.id}
                          onClick={() => handleToggleStore(st.id)}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                            isChecked
                              ? "border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/20"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent div
                            className="mt-1 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm text-slate-900">{st.name}</span>
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                {st.code}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              Type : <strong className="text-slate-700">{st.store_type}</strong>
                              {st.location && ` • ${st.location}`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: Granular Permissions (ON/OFF) */}
              {modalTab === "permissions" && (
                <div className="space-y-6">
                  {/* Action Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="text-xs font-semibold text-slate-700">
                      Total permissions activées : <span className="text-emerald-700 font-bold">{formPermissions.length}</span> / {ALL_PERMISSIONS.length}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetToRoleDefaults}
                        className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition shadow-xs"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                        Rétablir selon rôle ({ROLE_DEFINITIONS[formRoleId].name})
                      </button>
                      <button
                        type="button"
                        onClick={handleEnableAllPermissions}
                        className="inline-flex items-center gap-1 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Tout Activer (ON)
                      </button>
                      <button
                        type="button"
                        onClick={handleDisableAllPermissions}
                        className="inline-flex items-center gap-1 text-xs bg-rose-50 border border-rose-200 text-rose-800 px-2.5 py-1.5 rounded-lg hover:bg-rose-100 transition"
                      >
                        <X className="w-3.5 h-3.5 text-rose-600" />
                        Tout Désactiver (OFF)
                      </button>
                    </div>
                  </div>

                  {/* Grouped Permissions Accordion / Panels */}
                  <div className="space-y-4">
                    {PERMISSION_GROUPS.map(group => {
                      const groupCodes = group.permissions.map(p => p.code);
                      const enabledCount = groupCodes.filter(c => formPermissions.includes(c)).length;
                      const allInGroupEnabled = enabledCount === groupCodes.length;

                      return (
                        <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                          {/* Group Header */}
                          <div className="p-3.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                            <div>
                              <div className="font-bold text-sm text-slate-900 flex items-center gap-2">
                                {group.label}
                                <span className={`text-[11px] font-semibold px-2 py-0.2 rounded-full ${
                                  enabledCount === groupCodes.length 
                                    ? "bg-emerald-100 text-emerald-800" 
                                    : enabledCount > 0 
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-slate-200 text-slate-600"
                                }`}>
                                  {enabledCount}/{groupCodes.length}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {group.description}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleGroup(groupCodes, !allInGroupEnabled)}
                              className="text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
                            >
                              {allInGroupEnabled ? "Désactiver groupe" : "Activer tout le groupe"}
                            </button>
                          </div>

                          {/* Group Permissions List */}
                          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {group.permissions.map(perm => {
                              const isChecked = formPermissions.includes(perm.code);
                              return (
                                <div
                                  key={perm.code}
                                  onClick={() => handleTogglePermission(perm.code)}
                                  className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                    isChecked
                                      ? "border-emerald-400 bg-emerald-50/30"
                                      : "border-slate-200 hover:border-slate-300 bg-white"
                                  }`}
                                >
                                  <div className="pr-3">
                                    <div className="text-xs font-semibold text-slate-900">
                                      {perm.label}
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      {perm.description}
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                                      {perm.code}
                                    </div>
                                  </div>

                                  {/* Switch ON/OFF */}
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      handleTogglePermission(perm.code);
                                    }}
                                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isChecked ? "bg-emerald-600" : "bg-slate-300"
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                        isChecked ? "translate-x-4" : "translate-x-0"
                                      }`}
                                    />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between rounded-b-2xl">
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setIsCreating(false);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={handleSaveModal}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-sm"
              >
                <Save className="w-4 h-4" />
                {isCreating ? "Créer l'utilisateur" : "Enregistrer les modifications"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
