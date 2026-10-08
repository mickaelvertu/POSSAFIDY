import { FormEvent, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Lock, Mail, Phone, Store, User } from "lucide-react";

interface ResellerSignUpFormProps {
  onSwitchToLogin: (email?: string) => void;
}

export default function ResellerSignUpForm({ onSwitchToLogin }: ResellerSignUpFormProps) {
  const { signUpReseller } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    if (businessName.trim().length < 2) {
      setErrorMessage("Le nom du commerce doit comporter au moins 2 caractères.");
      return;
    }
    if (firstName.trim().length < 2 || lastName.trim().length < 2) {
      setErrorMessage("Renseignez votre prénom et votre nom (au moins 2 caractères chacun).");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMessage("Saisissez une adresse e-mail valide.");
      return;
    }
    if (!phone.trim()) {
      setErrorMessage("Le numéro de téléphone est obligatoire pour vous contacter au sujet de la demande.");
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const response = await signUpReseller({
        businessName: businessName.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password
      });
      if (response.success) setSuccessMessage(response.message);
      else setErrorMessage(response.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'envoyer la demande.");
    } finally {
      setLoading(false);
    }
  };

  if (successMessage) {
    return (
      <div className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <div>
          <h2 className="text-xl font-bold text-emerald-950">Demande envoyée</h2>
          <p className="mt-2 text-sm leading-6 text-emerald-900">{successMessage}</p>
          <p className="mt-2 text-xs leading-5 text-emerald-800">
            Votre compte restera inaccessible jusqu'à son approbation et à la configuration de vos conditions de règlement par GILEADA.
          </p>
        </div>
        <button type="button" onClick={() => onSwitchToLogin(email)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">
          <ArrowLeft className="h-4 w-4" /> Retour à la connexion
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-orange-100 text-orange-700"><Store className="h-6 w-6" /></div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Inscription revendeur</h2>
        <p className="mt-1 text-sm text-slate-500">Soumettez les coordonnées de votre commerce pour examen.</p>
      </div>

      {errorMessage && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <label className="block text-xs font-semibold text-slate-700">
          Nom du commerce <span className="text-rose-600">*</span>
          <div className="relative mt-1">
            <Store className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input required value={businessName} onChange={event => setBusinessName(event.target.value)} disabled={loading} autoComplete="organization" className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none" placeholder="Ex. Épicerie Soa" />
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-700">
            Prénom <span className="text-rose-600">*</span>
            <input required value={firstName} onChange={event => setFirstName(event.target.value)} disabled={loading} autoComplete="given-name" className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none" />
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Nom <span className="text-rose-600">*</span>
            <input required value={lastName} onChange={event => setLastName(event.target.value)} disabled={loading} autoComplete="family-name" className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none" />
          </label>
        </div>

        <label className="block text-xs font-semibold text-slate-700">
          Adresse e-mail <span className="text-rose-600">*</span>
          <div className="relative mt-1">
            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={loading} autoComplete="email" className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none" placeholder="vous@commerce.mg" />
          </div>
        </label>

        <label className="block text-xs font-semibold text-slate-700">
          Téléphone <span className="text-rose-600">*</span>
          <div className="relative mt-1">
            <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="tel" required value={phone} onChange={event => setPhone(event.target.value)} disabled={loading} autoComplete="tel" className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none" placeholder="034 00 000 00" />
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-700">
            Mot de passe <span className="text-rose-600">*</span>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="password" required minLength={6} value={password} onChange={event => setPassword(event.target.value)} disabled={loading} autoComplete="new-password" className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-2 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none" />
            </div>
          </label>
          <label className="block text-xs font-semibold text-slate-700">
            Confirmer <span className="text-rose-600">*</span>
            <input type="password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={loading} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none" />
          </label>
        </div>

        <button type="submit" disabled={loading} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Envoi de la demande…</> : <><User className="h-4 w-4" /> Envoyer ma demande</>}
        </button>
      </form>
    </div>
  );
}
