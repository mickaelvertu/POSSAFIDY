import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPortal from "./components/auth/AuthPortal";
import AuthenticatedSessionView from "./components/auth/AuthenticatedSessionView";
import { ThemeProvider } from "./context/ThemeContext";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";

function AuthApp() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="session-loading min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-200">
        <div className="session-loader" aria-label="Chargement" role="status">
          <div className="slice" />
          <div className="slice" />
          <div className="slice" />
          <div className="slice" />
          <div className="slice" />
          <div className="slice" />
        </div>
        <p className="mt-5 text-sm font-medium tracking-wide text-slate-300">
          Chargement
        </p>
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
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AuthApp />
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
