import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPortal from "./components/auth/AuthPortal";
import AuthenticatedSessionView from "./components/auth/AuthenticatedSessionView";
import { Loader2 } from "lucide-react";

function AuthApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-200">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm font-medium tracking-wide text-slate-300">
            Vérification de la session GILEADA...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPortal />;
  }

  return <AuthenticatedSessionView />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthApp />
    </AuthProvider>
  );
}
