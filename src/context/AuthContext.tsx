import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { User, AuthState, SignUpPayload, ResellerSignUpPayload, LoginPayload, ApiResponse } from "../types/auth";
import { authService } from "../services/authService";
import { auth, db } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, waitForPendingWrites } from "firebase/firestore";
import { trackUserPresence } from "../services/presenceService";
import { describeReadError } from "../services/dataSyncPolicy";

interface AuthContextType extends AuthState {
  isProfileFromCache: boolean;
  hasPendingWrites: boolean;
  authorizationError: string | null;
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
  const [isProfileFromCache, setIsProfileFromCache] = useState(false);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  const [authorizationError, setAuthorizationError] = useState<string | null>(null);
  const [authorizationRetry, setAuthorizationRetry] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: number | undefined;

    const pollPendingWrites = async () => {
      try {
        const pendingWrites = waitForPendingWrites(db);
        let pollTimeoutId: number | undefined;
        const hasUnacknowledgedWrites = await Promise.race([
          pendingWrites.then(() => false),
          new Promise<boolean>(resolve => {
            pollTimeoutId = window.setTimeout(() => resolve(true), 1000);
          })
        ]);
        if (pollTimeoutId !== undefined) window.clearTimeout(pollTimeoutId);
        if (!isMounted) return;
        setHasPendingWrites(hasUnacknowledgedWrites);
        if (hasUnacknowledgedWrites) await pendingWrites;
      } catch (error) {
        console.error("Firestore pending-write check failed:", error);
        if (isMounted) setHasPendingWrites(false);
      }
      if (isMounted) timeoutId = window.setTimeout(() => void pollPendingWrites(), 1000);
    };

    void pollPendingWrites();
    return () => {
      isMounted = false;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!user || user.status !== "ACTIVE") return;
    return trackUserPresence(user.id);
  }, [user?.id, user?.status]);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const unsubscribe = onSnapshot(
      doc(db, "users", user.id),
      { includeMetadataChanges: true },
      snapshot => {
        setIsProfileFromCache(snapshot.metadata.fromCache);
        if (!isMounted || auth.currentUser?.uid !== user.id) return;
        setAuthorizationError(null);
        const current = snapshot.exists() ? authService.userFromProfile(auth.currentUser, snapshot.data()) : null;
        setUser(keepStableUser(current?.status === "ACTIVE" ? current : null));
      },
      error => {
        console.error("User authorization listener failed:", error);
        if (isMounted) setAuthorizationError(describeReadError(error));
      }
    );
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.id, authorizationRetry]);

  // Restore session on initial boot
  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async firebaseUser => {
      try {
        const currentUser = firebaseUser ? await authService.restoreSession() : null;
        if (!isMounted) return;
        setUser(keepStableUser(currentUser));
        setToken(authService.getToken());
        setIsProfileFromCache(Boolean(currentUser) && !navigator.onLine);
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
      setIsProfileFromCache(false);
    }
    return res;
  };

  const handleLogout = async (): Promise<void> => {
    await authService.logout();
    setUser(null);
    setToken(null);
    setIsProfileFromCache(false);
  };

  const handleRefreshUser = async (): Promise<void> => {
    setAuthorizationRetry(value => value + 1);
    // Reattach the authoritative listener; a failed extra read must not log out a valid session.
    setAuthorizationError(null);
  };

  const value: AuthContextType = {
    isAuthenticated: !!user && user.status === "ACTIVE",
    isLoading,
    user,
    token,
    isProfileFromCache,
    hasPendingWrites,
    authorizationError,
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
