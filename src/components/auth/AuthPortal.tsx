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
    <div className="theme-portal min-h-dvh grid content-center justify-items-center gap-6 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:gap-12 lg:px-[max(2rem,calc((100vw-64rem)/2))]">
      {/* Brand Header */}
      <div className="flex w-full max-w-md flex-wrap items-center justify-between gap-4 lg:flex-col lg:items-start lg:self-center">
        <div className="order-last flex justify-center">
          <ThemeSwitcher />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          <img src="/branding/gileada-logo.png" alt="GILEADA" className="w-36 rounded-xl bg-white p-2 sm:w-44 lg:w-64 lg:p-3" />
        </h1>
      </div>

      {/* Main Auth Card */}
      <div className="auth-card w-full max-w-md overflow-hidden rounded-[14px] border">
        {/* Navigation tabs */}
        <div className="auth-tabs flex gap-1 border-b p-1.5">
          <button
            type="button"
            onClick={() => setActiveTab("login")}
            aria-pressed={activeTab === "login"}
            className="ui-btn ui-btn-ghost min-h-11 flex-1 gap-2 rounded-[10px] px-2 text-sm"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" />
            <span>Connexion</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("signup")}
            aria-pressed={activeTab === "signup"}
            className="ui-btn ui-btn-ghost min-h-11 flex-1 gap-2 rounded-[10px] px-2 text-sm"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
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
