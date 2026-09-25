import { SignUpPayload, LoginPayload, ApiResponse, User } from "../types/auth";

const TOKEN_KEY = "gileada_auth_token";

export class AuthService {
  private token: string | null = null;

  constructor() {
    this.token = this.getStoredToken();
  }

  getStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  setStoredToken(token: string | null): void {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch (e) {
      console.error("Failed to access localStorage:", e);
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = this.getStoredToken();
    }
    return this.token;
  }

  async signUp(payload: SignUpPayload): Promise<ApiResponse> {
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data: ApiResponse = await response.json();
      return data;
    } catch (err) {
      return {
        success: false,
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Erreur de connexion avec le serveur."
      };
    }
  }

  async login(payload: LoginPayload): Promise<ApiResponse<{ token: string; user: User }>> {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data: ApiResponse<{ token: string; user: User }> = await response.json();

      if (data.success && data.data?.token) {
        this.setStoredToken(data.data.token);
      }

      return data;
    } catch (err) {
      return {
        success: false,
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : "Erreur de connexion avec le serveur."
      };
    }
  }

  async logout(): Promise<ApiResponse> {
    const token = this.getToken();
    try {
      if (token) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          }
        });
      }
    } catch (err) {
      console.warn("Logout request error:", err);
    } finally {
      this.setStoredToken(null);
    }

    return {
      success: true,
      code: "LOGOUT_SUCCESS",
      message: "Déconnexion réussie."
    };
  }

  async getCurrentUser(): Promise<User | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        // If 401/403, token is no longer valid
        this.setStoredToken(null);
        return null;
      }

      const res: ApiResponse<{ user: User }> = await response.json();
      if (res.success && res.data?.user) {
        return res.data.user;
      }
      return null;
    } catch (err) {
      console.error("getCurrentUser error:", err);
      return null;
    }
  }

  async restoreSession(): Promise<User | null> {
    return this.getCurrentUser();
  }
}

export const authService = new AuthService();
