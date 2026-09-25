import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, AuthState, SignUpPayload, LoginPayload, ApiResponse } from "../types/auth";
import { authService } from "../services/authService";

interface AuthContextType extends AuthState {
  signUp: (payload: SignUpPayload) => Promise<ApiResponse>;
  login: (payload: LoginPayload) => Promise<ApiResponse<{ token: string; user: User }>>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(authService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore session on initial boot
  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        const currentUser = await authService.restoreSession();
        if (isMounted) {
          if (currentUser) {
            setUser(currentUser);
            setToken(authService.getToken());
          } else {
            setUser(null);
            setToken(null);
          }
        }
      } catch (err) {
        console.error("Session restoration failed:", err);
        if (isMounted) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignUp = async (payload: SignUpPayload): Promise<ApiResponse> => {
    return await authService.signUp(payload);
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
    setUser(current);
    setToken(authService.getToken());
  };

  const value: AuthContextType = {
    isAuthenticated: !!user && user.status === "ACTIVE",
    isLoading,
    user,
    token,
    signUp: handleSignUp,
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
