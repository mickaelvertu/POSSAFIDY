import { useState } from "react";
import LoginForm from "./LoginForm";
import SignUpForm from "./SignUpForm";
import ResellerSignUpForm from "./ResellerSignUpForm";
import { UserPlus, LogIn } from "lucide-react";
import ThemeSwitcher from "../ThemeSwitcher";

export default function AuthPortal() {
  const [activeTab, setActiveTab] = useState<"login" | "signup" | "reseller">("login");
  const [prefillEmail, setPrefillEmail] = useState<string>("");

  const handleSwitchToLogin = (email?: string) => {
    if (email) setPrefillEmail(email);
    setActiveTab("login");
  };

  const handleSwitchToSignUp = () => {
    setActiveTab("signup");
  };

  return (
    <div className="theme-portal min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Brand Header */}
      <div className="w-full max-w-md text-center mb-8 relative z-10">
        <div className="mb-4 flex justify-center">
          <ThemeSwitcher />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          <img src="/branding/gileada-logo.png" alt="GILEADA" className="mx-auto w-60 rounded-xl bg-white p-3" />
        </h1>
      </div>

      {/* Main Auth Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden relative z-10">
        {/* Navigation tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("login")}
            className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "login"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Connexion</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("signup")}
            className={`flex-1 py-2.5 px-4 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "signup"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200/80"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Compte employé</span>
          </button>
        </div>

        {/* Content body */}
        <div className="p-6 sm:p-8">
          {activeTab === "login" ? (
            <LoginForm
              onSwitchToSignUp={handleSwitchToSignUp}
              onSwitchToReseller={() => setActiveTab("reseller")}
              prefillEmail={prefillEmail}
            />
          ) : activeTab === "signup" ? (
            <SignUpForm onSwitchToLogin={handleSwitchToLogin} />
          ) : (
            <ResellerSignUpForm onSwitchToLogin={handleSwitchToLogin} />
          )}
        </div>
      </div>

    </div>
  );
}
