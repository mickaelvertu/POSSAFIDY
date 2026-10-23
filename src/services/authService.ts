import { SignUpPayload, ResellerSignUpPayload, LoginPayload, ApiResponse, User } from "../types/auth";
import { ALL_PERMISSIONS, AppPermission, AppRoleId, AppUser, ArticleTypeCode } from "../types";
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  User as FirebaseUser
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { createSequentialId } from "./idService";
import firebaseConfig from "../../firebase-applet-config.json";

export const ROLE_DEFINITIONS: Record<AppRoleId, { id: AppRoleId; name: string; description: string; bgLight: string }> = {
  SUPER_ADMIN: { id: "SUPER_ADMIN", name: "Super Administrateur", description: "Accès complet", bgLight: "bg-purple-100 text-purple-800 border-purple-300" },
  ADMIN: { id: "ADMIN", name: "Administrateur", description: "Gestion opérationnelle et utilisateurs", bgLight: "bg-blue-100 text-blue-800 border-blue-300" },
  VENDEUR: { id: "VENDEUR", name: "Vendeur", description: "Ventes du magasin assigné", bgLight: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  MAGASINIER: { id: "MAGASINIER", name: "Magasinier", description: "Stocks et transferts", bgLight: "bg-cyan-100 text-cyan-800 border-cyan-300" },
  RESPONSABLE_MAGASIN: { id: "RESPONSABLE_MAGASIN", name: "Responsable magasin", description: "Pilotage d'un magasin", bgLight: "bg-amber-100 text-amber-800 border-amber-300" },
  CONTROLEUR: { id: "CONTROLEUR", name: "Contrôleur", description: "Comptage physique et contrôle des stocks", bgLight: "bg-rose-100 text-rose-800 border-rose-300" },
  PRODUCTION: { id: "PRODUCTION", name: "Production", description: "Production et consommation", bgLight: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  COMPTABLE: { id: "COMPTABLE", name: "Comptable", description: "Ventes et rapports", bgLight: "bg-slate-100 text-slate-800 border-slate-300" },
  GESTIONNAIRE_CREDIT: { id: "GESTIONNAIRE_CREDIT", name: "Gestionnaire crédit", description: "Plafonds, encaissements et relances revendeurs", bgLight: "bg-teal-100 text-teal-800 border-teal-300" },
  STAFF: { id: "STAFF", name: "Staff", description: "Collaborateur actif sans rôle administratif : espace personnel en lecture seule", bgLight: "bg-sky-100 text-sky-800 border-sky-300" },
  REVENDEUR: { id: "REVENDEUR", name: "Revendeur", description: "Compte revendeur en attente d'activation", bgLight: "bg-orange-100 text-orange-800 border-orange-300" }
};

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRoleId, AppPermission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  ADMIN: ALL_PERMISSIONS.filter(permission => permission !== "users.delete"),
  VENDEUR: ["dashboard.view", "products.view", "stock.view", "sales.view", "sales.create", "sales.edit", "credit.sales", "transfers.view", "transfers.create"],
  MAGASINIER: ["dashboard.view", "products.view", "stock.view", "stock.edit", "stock.adjust", "transfers.view", "transfers.create", "transfers.ship", "transfers.receive"],
  RESPONSABLE_MAGASIN: ["dashboard.view", "products.view", "stock.view", "stock.edit", "sales.view", "sales.create", "sales.validate", "credit.sales", "transfers.view", "transfers.create", "transfers.ship",   "transfers.receive", "reports.view", "inventory.count", "cash_handover.view", "cash_handover.create"],
  CONTROLEUR: ["dashboard.view", "products.view", "stock.view", "reports.view", "inventory.count"],
  PRODUCTION: ["dashboard.view", "products.view", "stock.view", "production.view", "production.create", "production.validate", "transfers.view", "transfers.create", "transfers.ship", "transfers.receive"],
  COMPTABLE: ["dashboard.view", "sales.view", "reports.view", "reports.export", "expenses.view", "expenses.create", "cash_handover.view", "procurement.manage"],
  GESTIONNAIRE_CREDIT: ["dashboard.view", "credit.sales", "credit.manage"],
  STAFF: ["dashboard.view"],
  REVENDEUR: []
};

export const DEFAULT_ARTICLE_VISIBILITY: Record<AppRoleId, ArticleTypeCode[]> = {
  SUPER_ADMIN: ["RAW_MATERIAL", "RESALE"],
  ADMIN: ["RAW_MATERIAL", "RESALE"],
  VENDEUR: ["RESALE"],
  MAGASINIER: ["RAW_MATERIAL", "RESALE"],
  RESPONSABLE_MAGASIN: ["RAW_MATERIAL", "RESALE"],
  PRODUCTION: ["RAW_MATERIAL", "RESALE"],
  COMPTABLE: ["RAW_MATERIAL"],
  GESTIONNAIRE_CREDIT: ["RESALE"],
  CONTROLEUR: ["RAW_MATERIAL", "RESALE"],
  STAFF: [],
  REVENDEUR: ["RESALE"]
};

const CASH_HANDOVER_PERMISSION_LABELS: Record<string, string> = {
  "cash_handover.view": "Voir les remises de caisse",
  "cash_handover.create": "Déclarer une clôture POS",
  "cash_handover.receive": "Confirmer la réception de caisse",
  "cash_handover.deposit": "Enregistrer un dépôt bancaire"
};
const PROCUREMENT_PERMISSION_LABELS: Record<string, string> = {
  "procurement.manage": "Gérer les achats et paiements fournisseurs"
};

const permissionDefinition = (code: string) => ({
  code,
  label: CASH_HANDOVER_PERMISSION_LABELS[code] || PROCUREMENT_PERMISSION_LABELS[code] || code.split(".").map(part => part[0].toUpperCase() + part.slice(1)).join(" "),
  description: `Permission ${code}`
});

export const PERMISSION_GROUPS = [
  { id: "dashboard", label: "Tableau de bord", description: "Accès aux indicateurs", permissions: ["dashboard.view"] },
  { id: "catalog", label: "Produits et stocks", description: "Catalogue et inventaire", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("products.") || permission.startsWith("stock.")) },
  { id: "inventory", label: "Contrôle d'inventaire", description: "Comptage et validation des écarts", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("inventory.")) },
  { id: "units", label: "Unités de mesure", description: "Gérer les unités des articles", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("units.")) },
  { id: "sales", label: "Ventes", description: "Cycle de vente", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("sales.")) },
  { id: "credit", label: "Crédits revendeurs", description: "Gérer les plafonds, paiements et relances", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("credit.")) },
  { id: "transfers", label: "Transferts", description: "Flux entre magasins", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("transfers.")) },
  { id: "production", label: "Production", description: "Ordres de production", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("production.")) },
  { id: "reporting", label: "Rapports et audit", description: "Analyse et traçabilité", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("reports.") || permission.startsWith("audit.")) },
  { id: "expenses", label: "Dépenses", description: "Saisie et suivi des frais", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("expenses.")) },
  { id: "cash_handover", label: "Remises de caisse", description: "Déclarations POS, réception et dépôts bancaires", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("cash_handover.")) },
  { id: "procurement", label: "Achats & fournisseurs", description: "Saisir, approuver et régler les achats fournisseurs", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("procurement.")) },
  { id: "users", label: "Utilisateurs", description: "Administration des accès", permissions: ALL_PERMISSIONS.filter(permission => permission.startsWith("users.")) }
].map(group => ({ ...group, permissions: group.permissions.map(permissionDefinition) }));

export function hasPermission(user: AppUser, permission: AppPermission): boolean {
  return user.roleId === "SUPER_ADMIN" || user.permissions.includes(permission);
}

export async function syncUserToFirestore(user: AppUser): Promise<void> {
  await authService.updateManagedUser(user.id, {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.roleId,
    permissions: user.permissions,
    visibleArticleTypes: user.visibleArticleTypes || [],
    assignedStores: user.storeIds,
    status: user.isActive ? "ACTIVE" : "DISABLED"
  });
}

export class AuthService {
  private token: string | null = null;
  private provisioningAuth = getAuth(initializeApp(firebaseConfig, "admin-user-provisioning"));

  setStoredToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  private errorResponse(error: unknown): ApiResponse {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "FIREBASE_ERROR";
    const message = code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")
      ? "Email ou mot de passe incorrect."
      : error instanceof Error ? error.message : "Une erreur Firebase est survenue.";
    return { success: false, code, message };
  }

  private async mapFirebaseUser(firebaseUser: FirebaseUser): Promise<User> {
    const profileRef = doc(db, "users", firebaseUser.uid);
    const profileSnapshot = await getDoc(profileRef);
    if (!profileSnapshot.exists()) {
      throw new Error("Profil utilisateur introuvable. Contactez un administrateur.");
    }
    const profile = profileSnapshot.data();
    const now = new Date().toISOString();
    const user: User = {
      id: firebaseUser.uid,
      code: typeof profile.code === "string" ? profile.code : undefined,
      businessName: typeof profile.businessName === "string" ? profile.businessName : undefined,
      firstName: String(profile.firstName || firebaseUser.displayName?.split(" ")[0] || "Utilisateur"),
      lastName: String(profile.lastName || firebaseUser.displayName?.split(" ").slice(1).join(" ") || ""),
      email: firebaseUser.email || String(profile.email || ""),
      phone: profile.phone,
      status: profile.status || "PENDING",
      role: profile.role || null,
      permissions: Array.isArray(profile.permissions) ? profile.permissions : [],
      visibleArticleTypes: Array.isArray(profile.visibleArticleTypes)
        ? profile.visibleArticleTypes.filter((type): type is ArticleTypeCode => type === "RAW_MATERIAL" || type === "RESALE")
        : DEFAULT_ARTICLE_VISIBILITY[profile.role as AppRoleId] || [],
      assignedStores: Array.isArray(profile.assignedStores) ? profile.assignedStores : [],
      createdAt: profile.createdAt || now,
      updatedAt: profile.updatedAt || now
    };
    return user;
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs = 15000): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error("Firebase met trop de temps à répondre. Vérifiez la configuration Firebase et les règles Firestore.")), timeoutMs);
    });
    try {
      return await Promise.race([operation, timeout]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  }

  async signUp(payload: SignUpPayload): Promise<ApiResponse> {
    let createdUser: FirebaseUser | null = null;
    try {
      const credential = await this.withTimeout(createUserWithEmailAndPassword(auth, payload.email.trim(), payload.password));
      createdUser = credential.user;
      const now = new Date().toISOString();
      const createdAt = Date.now();
      const userRef = doc(db, "users", credential.user.uid);
      const employeeRef = doc(db, "employees", credential.user.uid);
      const batch = writeBatch(db);
      batch.set(userRef, {
        uid: credential.user.uid,
        email: payload.email.trim().toLowerCase(),
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        phone: payload.phone?.trim() || null,
        status: "PENDING",
        role: null,
        permissions: [],
        assignedStores: [],
        createdAt: now,
        updatedAt: now
      });
      batch.set(employeeRef, {
        id: credential.user.uid,
        user_id: credential.user.uid,
        first_name: payload.firstName.trim(),
        last_name: payload.lastName.trim(),
        position: payload.position.trim(),
        email: payload.email.trim().toLowerCase(),
        ...(payload.phone?.trim() ? { phone: payload.phone.trim() } : {}),
        application_status: "PENDING",
        is_active: false,
        created_at: createdAt,
        updated_at: createdAt
      });
      await this.withTimeout(batch.commit());
    } catch (err) {
      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch (cleanupError) {
          console.error("Failed to clean up Firebase account after registration failed:", cleanupError);
        }
      }
      return this.errorResponse(err);
    }

    try {
      await signOut(auth);
    } catch (err) {
      console.error("Failed to sign out after successful registration:", err);
    }
    this.setStoredToken(null);
    return { success: true, code: "ACCOUNT_CREATED", message: "Votre compte et votre fiche de personnel ont été créés et sont en attente de validation." };
  }

  async signUpReseller(payload: ResellerSignUpPayload): Promise<ApiResponse> {
    let createdUser: FirebaseUser | null = null;
    try {
      const email = payload.email.trim().toLowerCase();
      const credential = await this.withTimeout(createUserWithEmailAndPassword(auth, email, payload.password));
      createdUser = credential.user;
      const now = new Date().toISOString();
      await this.withTimeout(setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        email,
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        businessName: payload.businessName.trim(),
        phone: payload.phone.trim(),
        status: "PENDING",
        role: "REVENDEUR",
        permissions: [],
        assignedStores: [],
        createdAt: now,
        updatedAt: now
      }));
    } catch (err) {
      if (createdUser) {
        try {
          await deleteUser(createdUser);
        } catch (cleanupError) {
          console.error("Failed to clean up Firebase account after reseller registration failed:", cleanupError);
        }
      }
      return this.errorResponse(err);
    }

    try {
      await signOut(auth);
    } catch (err) {
      console.error("Failed to sign out after successful reseller registration:", err);
    }
    this.setStoredToken(null);
    return {
      success: true,
      code: "RESELLER_APPLICATION_CREATED",
      message: "Votre demande d'inscription revendeur a été envoyée. Elle sera examinée par un administrateur avant l'activation du compte."
    };
  }

  async login(payload: LoginPayload): Promise<ApiResponse<{ token: string; user: User }>> {
    try {
      const credential = await signInWithEmailAndPassword(auth, payload.email.trim(), payload.password);
      const user = await this.mapFirebaseUser(credential.user);
      if (user.status === "PENDING" || user.status === "DISABLED") {
        await signOut(auth);
        return {
          success: false,
          code: user.status === "PENDING" ? "ACCOUNT_PENDING" : "ACCOUNT_DISABLED",
          message: user.status === "PENDING" ? "Votre compte est en attente de validation." : "Votre compte a été désactivé."
        };
      }
      const token = await credential.user.getIdToken();
      this.setStoredToken(token);
      return { success: true, code: "LOGIN_SUCCESS", message: "Connexion réussie.", data: { token, user } };
    } catch (err) {
      return this.errorResponse(err) as ApiResponse<{ token: string; user: User }>;
    }
  }

  async logout(): Promise<ApiResponse> {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Firebase logout error:", err);
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
    try {
      if (!auth.currentUser) return null;
      const user = await this.mapFirebaseUser(auth.currentUser);
      if (typeof navigator === "undefined" || navigator.onLine) {
        try {
          this.setStoredToken(await auth.currentUser.getIdToken());
        } catch (error) {
          const isNetworkFailure = typeof error === "object" && error !== null && "code" in error &&
            error.code === "auth/network-request-failed";
          if (!isNetworkFailure) throw error;
          console.warn("Using the cached user profile while Firebase authentication is unreachable.");
        }
      }
      return user.status === "ACTIVE" ? user : null;
    } catch (err) {
      console.error("getCurrentUser Firebase error:", err);
      return null;
    }
  }

  async restoreSession(): Promise<User | null> {
    return this.getCurrentUser();
  }

  async listStoreManagers(storeId: string): Promise<{ id: string; name: string }[]> {
    const snapshot = await getDocs(query(collection(db, "users"), where("role", "==", "RESPONSABLE_MAGASIN")));
    return snapshot.docs
      .filter(item => {
        const data = item.data();
        return data.status === "ACTIVE" && Array.isArray(data.assignedStores) && data.assignedStores.includes(storeId);
      })
      .map(item => {
        const data = item.data();
        const name = `${data.firstName || ""} ${data.lastName || ""}`.trim() || String(data.email || item.id);
        return { id: item.id, name };
      });
  }

  async listManagedUsers(): Promise<ApiResponse<{ users: User[] }>> {
    try {
      const snapshot = await getDocs(collection(db, "users"));
      const users = await Promise.all(snapshot.docs.map(async snapshotDoc => {
        const data = snapshotDoc.data();
        const firebaseUser = { uid: snapshotDoc.id, email: data.email || "", displayName: data.displayName || null } as FirebaseUser;
        return this.mapFirebaseUser(firebaseUser);
      }));
      return { success: true, code: "USERS_LIST", message: "Utilisateurs récupérés avec succès.", data: { users } };
    } catch (err) {
      return this.errorResponse(err) as ApiResponse<{ users: User[] }>;
    }
  }

  async createManagedUser(payload: Record<string, unknown>): Promise<ApiResponse<{ user: User; temporaryPassword: string }>> {
    try {
      const email = String(payload.email || "").trim().toLowerCase();
      const temporaryPassword = crypto.randomUUID().replaceAll("-", "").slice(0, 16) + "A1!";
      const usersSnapshot = await getDocs(collection(db, "users"));
      const code = await createSequentialId("UTI", usersSnapshot.docs.map(userDoc => String(userDoc.data().code || "")));
      const credential = await createUserWithEmailAndPassword(this.provisioningAuth, email, temporaryPassword);
      const now = new Date().toISOString();
      await setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        code,
        email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        status: payload.status || "PENDING",
        role: payload.role || null,
        permissions: payload.permissions || [],
        visibleArticleTypes: payload.visibleArticleTypes || [],
        assignedStores: payload.assignedStores || [],
        createdAt: now,
        updatedAt: now
      });
      await signOut(this.provisioningAuth);
      const user = await this.mapFirebaseUser({ ...credential.user, uid: credential.user.uid });
      return { success: true, code: "USER_CREATED", message: "Utilisateur créé avec succès.", data: { user, temporaryPassword } };
    } catch (err) {
      return this.errorResponse(err) as ApiResponse<{ user: User; temporaryPassword: string }>;
    }
  }

  async updateManagedUser(id: string, payload: Record<string, unknown>): Promise<ApiResponse<{ user: User }>> {
    try {
      const userRef = doc(db, "users", id);
      const currentProfile = await getDoc(userRef);
      const updatePayload = { ...payload };
      if (!currentProfile.data()?.code && payload.status === "ACTIVE") {
        const usersSnapshot = await getDocs(collection(db, "users"));
        updatePayload.code = await createSequentialId("UTI", usersSnapshot.docs.map(userDoc => String(userDoc.data().code || "")));
      }
      await updateDoc(userRef, { ...updatePayload, updatedAt: new Date().toISOString() });
      const snapshot = await getDoc(userRef);
      const data = snapshot.data() || {};
      const user = await this.mapFirebaseUser({ uid: id, email: data.email || "", displayName: null } as FirebaseUser);
      return { success: true, code: "USER_UPDATED", message: "Utilisateur mis à jour avec succès.", data: { user } };
    } catch (err) {
      return this.errorResponse(err) as ApiResponse<{ user: User }>;
    }
  }

  async deleteManagedUser(id: string): Promise<ApiResponse> {
    try {
      await updateDoc(doc(db, "users", id), {
        status: "DISABLED",
        permissions: [],
        assignedStores: [],
        updatedAt: new Date().toISOString()
      });
      const adminRef = doc(db, "admins", id);
      if ((await getDoc(adminRef)).exists()) await deleteDoc(adminRef);
      return { success: true, code: "USER_DISABLED", message: "Utilisateur désactivé avec succès." };
    } catch (err) {
      return this.errorResponse(err);
    }
  }
}

export const authService = new AuthService();
