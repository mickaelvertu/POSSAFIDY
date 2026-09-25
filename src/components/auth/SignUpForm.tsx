import { useState, FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { User, Mail, Phone, Lock, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

interface SignUpFormProps {
  onSwitchToLogin: (prefillEmail?: string) => void;
}

export default function SignUpForm({ onSwitchToLogin }: SignUpFormProps) {
  const { signUp } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validateForm = (): boolean => {
    setErrorMessage(null);

    // Required fields check
    if (!firstName.trim()) {
      setErrorMessage("Le prénom est obligatoire.");
      return false;
    }
    if (firstName.trim().length < 2) {
      setErrorMessage("Le prénom doit comporter au moins 2 caractères.");
      return false;
    }

    if (!lastName.trim()) {
      setErrorMessage("Le nom de famille est obligatoire.");
      return false;
    }
    if (lastName.trim().length < 2) {
      setErrorMessage("Le nom doit comporter au moins 2 caractères.");
      return false;
    }

    if (!email.trim()) {
      setErrorMessage("L'adresse email est obligatoire.");
      return false;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage("Veuillez saisir une adresse email valide (ex: utilisateur@domaine.com).");
      return false;
    }

    // Password requirements
    if (!password) {
      setErrorMessage("Le mot de passe est obligatoire.");
      return false;
    }
    if (password.length < 6) {
      setErrorMessage("Le mot de passe doit contenir au moins 6 caractères.");
      return false;
    }

    // Password confirmation
    if (password !== confirmPassword) {
      setErrorMessage("Les mots de passe ne correspondent pas.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Notice: frontend strictly does NOT assign role, permissions, store, or admin privileges
      const res = await signUp({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() ? phone.trim() : undefined,
        password
      });

      if (res.success) {
        setSuccessMessage(
          res.message || "Votre compte a été créé et est en attente de validation."
        );
      } else {
        setErrorMessage(res.message || "Une erreur est survenue lors de l'inscription.");
      }
    } catch {
      setErrorMessage("Erreur de connexion. Veuillez réessayer plus tard.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Créer un compte GILEADA
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Remplissez les informations ci-dessous pour soumettre votre demande d'accès
        </p>
      </div>

      {/* Success State */}
      {successMessage ? (
        <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-950">Compte créé avec succès !</h3>
            <p className="mt-1 text-sm text-emerald-800 leading-relaxed font-medium">
              {successMessage}
            </p>
            <p className="mt-2 text-xs text-emerald-700/80">
              Votre compte est actuellement configuré avec le statut <span className="font-semibold uppercase tracking-wider">PENDING</span>. Un administrateur système doit approuver votre accès et vous assigner un rôle et un magasin avant que vous puissiez vous connecter.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onSwitchToLogin(email)}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Aller à l'écran de connexion</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* Sign Up Form */
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Error Message banner */}
          {errorMessage && (
            <div
              className="p-3.5 bg-red-50 border border-red-200 text-red-900 rounded-xl flex items-start gap-3 text-sm animate-in fade-in"
              role="alert"
            >
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Erreur d'inscription</span>
                <span className="mt-0.5 block">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* First Name & Last Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Prénom <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jean"
                  disabled={loading}
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-lg text-sm transition-all outline-none disabled:opacity-60"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Nom <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Rakoto"
                  disabled={loading}
                  className="w-full pl-10 pr-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-lg text-sm transition-all outline-none disabled:opacity-60"
                  required
                />
              </div>
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Adresse Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jean.rakoto@example.com"
                disabled={loading}
                className="w-full pl-10 pr-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-lg text-sm transition-all outline-none disabled:opacity-60"
                required
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Téléphone <span className="text-slate-400 font-normal lowercase">(optionnel)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Phone className="w-4 h-4" />
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="034 00 000 00"
                disabled={loading}
                className="w-full pl-10 pr-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-lg text-sm transition-all outline-none disabled:opacity-60"
              />
            </div>
          </div>

          {/* Password & Confirm Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Mot de passe <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 caractères"
                  disabled={loading}
                  className="w-full pl-10 pr-9 py-2 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-lg text-sm transition-all outline-none disabled:opacity-60"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Confirmer mot de passe <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmer"
                  disabled={loading}
                  className="w-full pl-10 pr-9 py-2 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-300 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 rounded-lg text-sm transition-all outline-none disabled:opacity-60"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Notice about status PENDING */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-700">Règle de sécurité GILEADA :</span> Tout nouveau compte est créé avec le statut <span className="font-mono text-amber-700 font-bold">PENDING</span> sans rôle ni magasin assigné. Une validation préalable par l'administration est obligatoire avant toute connexion.
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium text-sm rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Création du compte en cours...</span>
              </>
            ) : (
              <span>Créer le compte</span>
            )}
          </button>

          {/* Switch to login */}
          <div className="pt-4 border-t border-slate-200 text-center">
            <p className="text-sm text-slate-600">
              Vous avez déjà un compte ?{" "}
              <button
                type="button"
                onClick={() => onSwitchToLogin()}
                className="font-semibold text-emerald-600 hover:text-emerald-700 underline underline-offset-2 cursor-pointer ml-1"
              >
                Se connecter
              </button>
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
