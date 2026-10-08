import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, AuthState, SignUpPayload, ResellerSignUpPayload, LoginPayload, ApiResponse } from "../types/auth";
import { authService } from "../services/authService";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { trackUserPresence } from "../services/presenceService";

interface AuthContextType extends AuthState {
  signUp: (payload: SignUpPayload) => Promise<ApiResponse>;
  signUpReseller: (payload: ResellerSignUpPayload) => Promise<ApiResponse>;
  login: (payload: LoginPayload) => Promise<ApiResponse<{ token: string; user: User }>>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Keep the same object when a session refresh returns identical data, so effects keyed on `user` don't reload everything.
const keepStableUser = (next: User | null) => (previous: User | null): User | null =>
  previous && next && JSON.stringify(previous) === JSON.stringify(next) ? previous : next;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(authService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!user || user.status !== "ACTIVE") return;
    return trackUserPresence(user.id);
  }, [user?.id, user?.status]);

  // Restore session on initial boot
  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      try {
        const currentUser = firebaseUser ? await authService.restoreSession() : null;
        if (!isMounted) return;
        setUser(keepStableUser(currentUser));
        setToken(authService.getToken());
      } catch (err) {
        console.error("Firebase session restoration failed:", err);
        if (isMounted) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleSignUp = async (payload: SignUpPayload): Promise<ApiResponse> => {
    return await authService.signUp(payload);
  };

  const handleResellerSignUp = async (payload: ResellerSignUpPayload): Promise<ApiResponse> => {
    return await authService.signUpReseller(payload);
  };

  const handleLogin = async (payload: LoginPayload): Promise<ApiResponse<{ token: string; user: User }>> => {
    const res = await authService.login(payload);
    if (res.success && res.data) {
      setUser(res.data.user);
      setToken(res.data.token);
    }
    return res;
  };

  const handleLogout = async (): Promise<void> => {
    await authService.logout();
    setUser(null);
    setToken(null);
  };

  const handleRefreshUser = async (): Promise<void> => {
    const current = await authService.getCurrentUser();
    setUser(keepStableUser(current));
    setToken(authService.getToken());
  };

  const value: AuthContextType = {
    isAuthenticated: !!user && user.status === "ACTIVE",
    isLoading,
    user,
    token,
    signUp: handleSignUp,
    signUpReseller: handleResellerSignUp,
    login: handleLogin,
    logout: handleLogout,
    refreshUser: handleRefreshUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
