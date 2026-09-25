import { useState, FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { Mail, Lock, Eye, EyeOff, Loader2, AlertCircle, Clock, ShieldX, KeyRound } from "lucide-react";

interface LoginFormProps {
  onSwitchToSignUp: () => void;
  prefillEmail?: string;
}

export default function LoginForm({ onSwitchToSignUp, prefillEmail = "" }: LoginFormProps) {
  const { login } = useAuth();

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const validateForm = (): boolean => {
    setErrorCode(null);
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorCode("VALIDATION_ERROR");
      setErrorMessage("Veuillez saisir votre adresse email.");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorCode("VALIDATION_ERROR");
      setErrorMessage("Format d'adresse email invalide.");
      return false;
    }

    if (!password) {
      setErrorCode("VALIDATION_ERROR");
      setErrorMessage("Veuillez saisir votre mot de passe.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setErrorCode(null);
    setErrorMessage(null);

    try {
      const res = await login({
        email: email.trim(),
        password
      });

      if (!res.success) {
        setErrorCode(res.code);
        setErrorMessage(res.message);
      }
    } catch {
      setErrorCode("UNKNOWN_ERROR");
      setErrorMessage("Une erreur inattendue est survenue lors de la tentative de connexion.");
    } finally {
      setLoading(false);
    }
  };

  const setTestAccount = (testEmail: string, testPass: string) => {
    setEmail(testEmail);
    setPassword(testPass);
    setErrorCode(null);
    setErrorMessage(null);
  };

  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Connexion à GILEADA
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Accédez à votre espace sécurisé GILEADA
        </p>
      </div>

      {/* Error state display */}
      {errorMessage && (
        <div
          className={`mb-5 p-4 rounded-xl border flex items-start gap-3 transition-all ${
            errorCode === "ACCOUNT_PENDING"
              ? "bg-amber-50 border-amber-200 text-amber-900"
              : errorCode === "ACCOUNT_DISABLED"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
          role="alert"
        >
          {errorCode === "ACCOUNT_PENDING" ? (
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          ) : errorCode === "ACCOUNT_DISABLED" ? (
            <ShieldX className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          )}

          <div className="text-sm">
            <span className="font-semibold block">
              {errorCode === "ACCOUNT_PENDING" && "Compte en attente de validation"}
              {errorCode === "ACCOUNT_DISABLED" && "Compte désactivé"}
              {errorCode === "INVALID_CREDENTIALS" && "Identifiants invalides"}
              {!["ACCOUNT_PENDING", "ACCOUNT_DISABLED", "INVALID_CREDENTIALS"].includes(errorCode || "") &&
                "Erreur de connexion"}
            </span>
            <span className="mt-0.5 block leading-relaxed">{errorMessage}</span>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Email Field */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Adresse Email
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Mail className="w-4 h-4" />
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre.email@gileada.mg"
              disabled={loading}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-lg text-sm transition-all outline-none disabled:opacity-60"
              required
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Mot de passe
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={loading}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-lg text-sm transition-all outline-none disabled:opacity-60"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Submit button with loading indicator */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium text-sm rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Vérification des identifiants...</span>
            </>
          ) : (
            <span>Se connecter</span>
          )}
        </button>
      </form>

      {/* Switch to Sign Up */}
      <div className="mt-6 pt-5 border-t border-slate-200 text-center">
        <p className="text-sm text-slate-600">
          Vous n'avez pas encore de compte ?{" "}
          <button
            type="button"
            onClick={onSwitchToSignUp}
            className="font-semibold text-emerald-600 hover:text-emerald-700 underline underline-offset-2 cursor-pointer ml-1"
          >
            Créer un compte
          </button>
        </p>
      </div>

      {/* Testing Scenarios Helper Cards */}
      <div className="mt-6 p-3.5 bg-slate-100/70 border border-slate-200 rounded-xl">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2.5">
          <KeyRound className="w-3.5 h-3.5 text-slate-500" />
          <span>Comptes de test (cliquez pour tester les scénarios) :</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Active test account */}
          <button
            type="button"
            onClick={() => setTestAccount("active@gileada.mg", "Password123!")}
            className="text-left p-2 rounded-lg bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all text-xs cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Actif</span>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 truncate">active@gileada.mg</p>
            <p className="text-[10px] text-emerald-700 font-mono mt-0.5">Accès autorisé</p>
          </button>

          {/* Pending test account */}
          <button
            type="button"
            onClick={() => setTestAccount("pending@gileada.mg", "Password123!")}
            className="text-left p-2 rounded-lg bg-white border border-slate-200 hover:border-amber-500 hover:bg-amber-50/40 transition-all text-xs cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">En attente</span>
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
            </div>
            <p className="text-[11px] text-slate-500 truncate">pending@gileada.mg</p>
            <p className="text-[10px] text-amber-700 font-mono mt-0.5">ACCOUNT_PENDING</p>
          </button>

          {/* Disabled test account */}
          <button
            type="button"
            onClick={() => setTestAccount("disabled@gileada.mg", "Password123!")}
            className="text-left p-2 rounded-lg bg-white border border-slate-200 hover:border-rose-500 hover:bg-rose-50/40 transition-all text-xs cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800">Désactivé</span>
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
            </div>
            <p className="text-[11px] text-slate-500 truncate">disabled@gileada.mg</p>
            <p className="text-[10px] text-rose-700 font-mono mt-0.5">ACCOUNT_DISABLED</p>
          </button>
        </div>
      </div>
    </div>
  );
}
