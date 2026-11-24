import { lazy, Suspense } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthPortal from "./components/auth/AuthPortal";
import { ThemeProvider } from "./context/ThemeContext";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import AppUpdateNotice from "./components/AppUpdateNotice";
import DeviceClockNotice from "./components/DeviceClockNotice";

const AuthenticatedSessionView = lazy(() => import("./components/auth/AuthenticatedSessionView"));

function SessionLoading() {
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

function AuthApp() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <SessionLoading />;

  if (!isAuthenticated) {
    return <AuthPortal />;
  }

  return (
    <Suspense fallback={<SessionLoading />}>
      <AuthenticatedSessionView />
    </Suspense>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppUpdateNotice />
          <DeviceClockNotice />
          <AppErrorBoundary>
            <AuthApp />
          </AppErrorBoundary>
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
