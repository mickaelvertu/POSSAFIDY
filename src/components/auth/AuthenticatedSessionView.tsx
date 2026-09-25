import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/authService";
import { AppRoleId, AppUser } from "../../types";
import { User } from "../../types/auth";
import { INITIAL_STORES } from "../../data/initialData";
import UsersView from "../UsersView";
import { 
  ShieldCheck, 
  LogOut, 
  User as UserIcon, 
  Mail, 
  Phone, 
  Calendar, 
  Key, 
  CheckCircle2, 
  Copy, 
  Check, 
  Terminal, 
  Play, 
  AlertTriangle,
  Building,
  Shield,
  Layers
} from "lucide-react";

const APP_ROLES: AppRoleId[] = ["SUPER_ADMIN", "ADMIN", "VENDEUR", "MAGASINIER", "RESPONSABLE_MAGASIN", "PRODUCTION", "COMPTABLE"];

function toAppUser(user: User): AppUser {
  const roleId = APP_ROLES.includes(user.role as AppRoleId) ? user.role as AppRoleId : "VENDEUR";
  return {
    id: user.id,
    uid: user.id,
    username: user.email.split("@")[0],
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: `${user.firstName} ${user.lastName}`,
    role: roleId,
    roleId,
    storeIds: user.assignedStores || [],
    permissions: user.permissions || [],
    isActive: user.status === "ACTIVE",
    createdAt: Date.parse(user.createdAt),
    updatedAt: Date.parse(user.updatedAt)
  };
}

export default function AuthenticatedSessionView() {
  const { user, token, logout } = useAuth();

  const [copiedToken, setCopiedToken] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: number;
    data: any;
    duration: number;
    testedWithToken: boolean;
  } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [managedUsers, setManagedUsers] = useState<AppUser[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);

  const canManageUsers = Boolean(user && (
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN" ||
    user.permissions.includes("users.view")
  ));

  useEffect(() => {
    if (!canManageUsers) return;
    authService.listManagedUsers().then(response => {
      if (response.success && response.data) {
        setManagedUsers(response.data.users.map(toAppUser));
      } else {
        setUsersError(response.message);
      }
    }).catch(error => {
      setUsersError(error instanceof Error ? error.message : "Impossible de charger les utilisateurs.");
    });
  }, [canManageUsers]);

  const handleCreateManagedUser = async (newUser: AppUser) => {
    const response = await authService.createManagedUser({
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      role: newUser.roleId,
      permissions: newUser.permissions,
      assignedStores: newUser.storeIds,
      status: newUser.isActive ? "ACTIVE" : "PENDING"
    });
    if (!response.success || !response.data) {
      alert(response.message);
      return;
    }
    setManagedUsers(current => [...current, toAppUser(response.data!.user)]);
    alert(`Utilisateur créé. Mot de passe temporaire : ${response.data.temporaryPassword}`);
  };

  const handleUpdateManagedUser = async (updatedUser: AppUser) => {
    const response = await authService.updateManagedUser(updatedUser.id, {
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      role: updatedUser.roleId,
      permissions: updatedUser.permissions,
      assignedStores: updatedUser.storeIds,
      status: updatedUser.isActive ? "ACTIVE" : "DISABLED"
    });
    if (!response.success || !response.data) {
      alert(response.message);
      return;
    }
    setManagedUsers(current => current.map(item => item.id === updatedUser.id ? toAppUser(response.data!.user) : item));
  };

  const handleDeleteManagedUser = async (userId: string) => {
    const response = await authService.deleteManagedUser(userId);
    if (!response.success) {
      alert(response.message);
      return;
    }
    setManagedUsers(current => current.filter(item => item.id !== userId));
  };

  const handleCopyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const testProtectedRoute = async (withValidToken: boolean) => {
    setTestLoading(true);
    const start = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (withValidToken && token) {
        headers["Authorization"] = `Bearer ${token}`;
      } else {
        headers["Authorization"] = "Bearer INVALID_OR_EMPTY_TOKEN";
      }

      const res = await fetch("/api/auth/me", {
        method: "GET",
        headers
      });

      const data = await res.json();
      const end = performance.now();

      setTestResult({
        status: res.status,
        data,
        duration: Math.round(end - start),
        testedWithToken: withValidToken
      });
    } catch (err) {
      const end = performance.now();
      setTestResult({
        status: 0,
        data: { error: err instanceof Error ? err.message : "Erreur réseau" },
        duration: Math.round(end - start),
        testedWithToken: withValidToken
      });
    } finally {
      setTestLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Application Bar */}
      <header className="bg-slate-800/90 border-b border-slate-700/80 backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-base">GILEADA</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                BLOC AUTHENTIFICATION
              </span>
            </div>
            <p className="text-xs text-slate-400">Session utilisateur active & vérifiée</p>
          </div>
        </div>

        {/* User preview and Logout button */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-white">
              {user.firstName} {user.lastName}
            </span>
            <span className="text-[11px] text-slate-400">{user.email}</span>
          </div>

          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-semibold transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Déconnexion</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Status Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Authentification Réussie</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  {user.status}
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Le compte est actif. Le jeton de session est valide et prêt pour sécuriser les futurs modules métier.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700/60 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Session: ACTIVE (24h)</span>
          </div>
        </div>

        {canManageUsers && (
          <section className="space-y-3">
            {usersError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-sm text-rose-200">
                {usersError}
              </div>
            )}
            {user && (
              <UsersView
                currentUser={toAppUser(user)}
                users={managedUsers}
                stores={INITIAL_STORES}
                onUpdateUser={handleUpdateManagedUser}
                onCreateUser={handleCreateManagedUser}
                onDeleteUser={handleDeleteManagedUser}
              />
            )}
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Profile Card */}
          <div className="lg:col-span-1 bg-slate-800/80 rounded-2xl border border-slate-700/80 p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-emerald-400" />
                <span>Profil Utilisateur</span>
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700">
                {user.id}
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Nom Complet
                </label>
                <div className="text-slate-200 font-medium bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50">
                  {user.firstName} {user.lastName}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Email
                </label>
                <div className="text-slate-200 font-medium bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50 flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Téléphone
                </label>
                <div className="text-slate-200 font-medium bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50 flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{user.phone || "Non renseigné"}</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Statut du Compte
                </label>
                <div className="bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50 flex items-center justify-between">
                  <span className="font-semibold text-emerald-400 font-mono">{user.status}</span>
                  <span className="text-[10px] text-slate-500">Validation effectuée</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Date de Création
                </label>
                <div className="text-slate-300 bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-mono text-[11px]">
                    {new Date(user.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
              </div>
            </div>

            {/* Role & Stores Note */}
            <div className="pt-4 border-t border-slate-700/70 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>Rôles & Permissions (Module Admin)</span>
              </div>
              <div className="p-3 bg-slate-900/70 border border-slate-700/60 rounded-xl space-y-1.5 text-[11px] text-slate-400">
                <p>
                  <strong className="text-slate-300">Rôle :</strong>{" "}
                  {user.role === null ? (
                    <span className="italic text-amber-300/80">null (aucun rôle assigné)</span>
                  ) : (
                    user.role
                  )}
                </p>
                <p>
                  <strong className="text-slate-300">Permissions :</strong>{" "}
                  <code className="text-slate-400 bg-slate-800 px-1 py-0.5 rounded">
                    {JSON.stringify(user.permissions)}
                  </code>
                </p>
                <p>
                  <strong className="text-slate-300">Magasins assignés :</strong>{" "}
                  <code className="text-slate-400 bg-slate-800 px-1 py-0.5 rounded">
                    {JSON.stringify(user.assignedStores)}
                  </code>
                </p>
                <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                  Ces propriétés seront configurées lors de l'intégration du module Administration.
                </p>
              </div>
            </div>
          </div>

          {/* Middleware and Session Verification Testing Center */}
          <div className="lg:col-span-2 space-y-6">
            {/* Session Token Details */}
            <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-400" />
                  <span>Jeton de Session Actif (Bearer Token)</span>
                </h3>
                <span className="text-[11px] text-emerald-400 font-mono">Format 256-bit crypto</span>
              </div>

              <div className="relative">
                <div className="font-mono text-xs text-emerald-300 bg-slate-950 p-3.5 rounded-xl border border-slate-700/80 break-all select-all flex items-center justify-between gap-3">
                  <span className="truncate">{token || "Aucun jeton actif"}</span>
                  {token && (
                    <button
                      type="button"
                      onClick={handleCopyToken}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-sans shrink-0 flex items-center gap-1.5 transition-all cursor-pointer border border-slate-600"
                    >
                      {copiedToken ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Ce jeton est stocké de manière sécurisée et transmis dans l'en-tête{" "}
                <code className="bg-slate-900 px-1 py-0.5 rounded text-slate-300 font-mono">
                  Authorization: Bearer &lt;token&gt;
                </code>{" "}
                pour chaque requête protégée.
              </p>
            </div>

            {/* Interactive Middleware Verification Panel */}
            <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>Vérification Middleware : Route Protégée /api/auth/me</span>
                </h3>
                <span className="text-xs text-slate-400">Scénario de test Section 9 & 11</span>
              </div>

              <p className="text-xs text-slate-300">
                Testez en direct le comportement du middleware d'authentification sur le serveur Node.js / Express :
              </p>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => testProtectedRoute(true)}
                  disabled={testLoading}
                  className="p-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-left transition-all cursor-pointer group disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" /> Test avec Jeton Valide
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      HTTP 200 Attendu
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 group-hover:text-slate-300">
                    Envoie le jeton actif. Le middleware valide la session et retourne le profil utilisateur.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => testProtectedRoute(false)}
                  disabled={testLoading}
                  className="p-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-left transition-all cursor-pointer group disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" /> Test sans Jeton / Invalide
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                      HTTP 401 Attendu
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 group-hover:text-slate-300">
                    Envoie un jeton invalide. Le middleware intercepte la requête et la rejette avec UNAUTHORIZED.
                  </p>
                </button>
              </div>

              {/* Test Response Console */}
              {testResult && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-700/80 font-mono text-xs space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          testResult.status === 200 ? "bg-emerald-400" : "bg-rose-400"
                        }`}
                      />
                      <span>Résultat API : GET /api/auth/me</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          testResult.status === 200
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-rose-500/20 text-rose-400"
                        }`}
                      >
                        Status: {testResult.status} {testResult.status === 200 ? "OK" : "Unauthorized"}
                      </span>
                      <span className="text-[11px] text-slate-500">{testResult.duration}ms</span>
                    </div>
                  </div>

                  <pre className="text-slate-300 overflow-x-auto text-[11px] leading-relaxed pt-1">
                    {JSON.stringify(testResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Architecture Modular Notice */}
            <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                <Layers className="w-4 h-4" />
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                <span className="font-bold text-white block">
                  Conformité de l'Architecture Modulaire GILEADA
                </span>
                <p className="text-slate-400 leading-relaxed">
                  Le bloc d'authentification est totalement autonome et étanche. Aucun module métier (Stock, Ventes, POS, Transferts, Production, Rapports) n'a été altéré ou prématurément instancié. Dès que l'administrateur configurera les rôles et affectations de magasins, les modules pourront être montés directement sur cette fondation sécurisée.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
