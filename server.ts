import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type UserStatus = "PENDING" | "ACTIVE" | "DISABLED";

export interface StoredUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  passwordHash: string;
  status: UserStatus;
  role: string | null;
  permissions: string[];
  assignedStores: string[];
  createdAt: string;
  updatedAt: string;
}

export type SafeUser = Omit<StoredUser, "passwordHash">;

export interface AuthenticatedRequest extends Request {
  user?: SafeUser;
  token?: string;
}

// Password hashing utility with PBKDF2 (100k rounds, sha512)
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(":");
    if (parts.length !== 2) return false;
    const [salt, hash] = parts;
    const hashBuffer = Buffer.from(hash, "hex");
    const derivedBuffer = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512");
    return crypto.timingSafeEqual(hashBuffer, derivedBuffer);
  } catch {
    return false;
  }
}

export function sanitizeUser(user: StoredUser): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safe } = user;
  return safe;
}

// In-Memory and File Storage
const USERS_STORAGE_PATH = path.resolve(__dirname, "data-users.json");

// Default initial test users for testing scenarios
const DEFAULT_TEST_USERS: StoredUser[] = [
  {
    id: "USR-001",
    firstName: "Jean",
    lastName: "Rakoto",
    email: "active@gileada.mg",
    phone: "0340000000",
    passwordHash: hashPassword("Password123!"),
    status: "ACTIVE",
    role: null,
    permissions: [],
    assignedStores: [],
    createdAt: new Date("2026-01-01T08:00:00Z").toISOString(),
    updatedAt: new Date("2026-01-01T08:00:00Z").toISOString()
  },
  {
    id: "USR-002",
    firstName: "Hanta",
    lastName: "Rasoa",
    email: "pending@gileada.mg",
    phone: "0320000000",
    passwordHash: hashPassword("Password123!"),
    status: "PENDING",
    role: null,
    permissions: [],
    assignedStores: [],
    createdAt: new Date("2026-01-02T09:00:00Z").toISOString(),
    updatedAt: new Date("2026-01-02T09:00:00Z").toISOString()
  },
  {
    id: "USR-003",
    firstName: "Andry",
    lastName: "Nirina",
    email: "disabled@gileada.mg",
    phone: "0330000000",
    passwordHash: hashPassword("Password123!"),
    status: "DISABLED",
    role: null,
    permissions: [],
    assignedStores: [],
    createdAt: new Date("2026-01-03T10:00:00Z").toISOString(),
    updatedAt: new Date("2026-01-03T10:00:00Z").toISOString()
  }
];

class UserStore {
  private users: Map<string, StoredUser> = new Map();

  constructor() {
    this.load();
  }

  private load() {
    if (fs.existsSync(USERS_STORAGE_PATH)) {
      try {
        const raw = fs.readFileSync(USERS_STORAGE_PATH, "utf-8");
        const list: StoredUser[] = JSON.parse(raw);
        for (const u of list) {
          this.users.set(u.email.toLowerCase(), u);
        }
      } catch (err) {
        console.error("Failed to load user storage, fallback to default seed users:", err);
      }
    }

    // Ensure default test users exist
    for (const testUser of DEFAULT_TEST_USERS) {
      if (!this.users.has(testUser.email.toLowerCase())) {
        this.users.set(testUser.email.toLowerCase(), testUser);
      }
    }
  }

  private persist() {
    try {
      const list = Array.from(this.users.values());
      fs.writeFileSync(USERS_STORAGE_PATH, JSON.stringify(list, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to persist users to disk:", err);
    }
  }

  findByEmail(email: string): StoredUser | undefined {
    return this.users.get(email.trim().toLowerCase());
  }

  findById(id: string): StoredUser | undefined {
    for (const user of this.users.values()) {
      if (user.id === id) return user;
    }
    return undefined;
  }

  create(user: StoredUser): StoredUser {
    this.users.set(user.email.toLowerCase(), user);
    this.persist();
    return user;
  }
}

export const userStore = new UserStore();

// Session Token Store
interface SessionData {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

class SessionStore {
  private sessions: Map<string, SessionData> = new Map();

  createSession(userId: string): string {
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours
    this.sessions.set(token, { userId, createdAt: now, expiresAt });
    return token;
  }

  getSession(token: string): SessionData | undefined {
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }

  invalidateSession(token: string): boolean {
    return this.sessions.delete(token);
  }
}

export const sessionStore = new SessionStore();

// Authentication Middleware for Protected API routes
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Non autorisé. Jeton de session manquant ou invalide."
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Non autorisé. Jeton de session vide."
    });
    return;
  }

  const session = sessionStore.getSession(token);
  if (!session) {
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Session expirée ou invalide. Veuillez vous reconnecter."
    });
    return;
  }

  const user = userStore.findById(session.userId);
  if (!user) {
    sessionStore.invalidateSession(token);
    res.status(401).json({
      success: false,
      code: "UNAUTHORIZED",
      message: "Utilisateur introuvable."
    });
    return;
  }

  if (user.status !== "ACTIVE") {
    sessionStore.invalidateSession(token);
    const code = user.status === "PENDING" ? "ACCOUNT_PENDING" : "ACCOUNT_DISABLED";
    const message = user.status === "PENDING"
      ? "Votre compte est en attente de validation par un administrateur."
      : "Votre compte a été désactivé.";
    res.status(403).json({
      success: false,
      code,
      message
    });
    return;
  }

  req.user = sanitizeUser(user);
  req.token = token;
  next();
}

export function createExpressApp() {
  const app = express();
  app.use(express.json());

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      block: "AUTHENTICATION_BLOCK",
      service: "GILEADA Auth Service",
      timestamp: new Date().toISOString()
    });
  });

  // 1. SIGN UP API
  // POST /api/auth/signup
  app.post("/api/auth/signup", (req: Request, res: Response): void => {
    try {
      const { firstName, lastName, email, phone, password } = req.body || {};

      // Validate required inputs
      if (!firstName || typeof firstName !== "string" || firstName.trim().length < 2) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Le prénom est requis (minimum 2 caractères)."
        });
        return;
      }

      if (!lastName || typeof lastName !== "string" || lastName.trim().length < 2) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Le nom est requis (minimum 2 caractères)."
        });
        return;
      }

      if (!email || typeof email !== "string") {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "L'adresse email est requise."
        });
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const normalizedEmail = email.trim().toLowerCase();
      if (!emailRegex.test(normalizedEmail)) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Le format de l'adresse email est invalide."
        });
        return;
      }

      if (!password || typeof password !== "string" || password.length < 6) {
        res.status(400).json({
          success: false,
          code: "VALIDATION_ERROR",
          message: "Le mot de passe doit comporter au moins 6 caractères."
        });
        return;
      }

      // Check existing email
      const existing = userStore.findByEmail(normalizedEmail);
      if (existing) {
        res.status(409).json({
          success: false,
          code: "EMAIL_ALREADY_EXISTS",
          message: "Cette adresse email est déjà utilisée."
        });
        return;
      }

      // Hash password & create PENDING user
      const passwordHash = hashPassword(password);
      const newUser: StoredUser = {
        id: "USR-" + Date.now().toString().slice(-6),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: normalizedEmail,
        phone: typeof phone === "string" && phone.trim().length > 0 ? phone.trim() : undefined,
        passwordHash,
        status: "PENDING",
        role: null,
        permissions: [],
        assignedStores: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      userStore.create(newUser);

      res.status(201).json({
        success: true,
        code: "ACCOUNT_CREATED",
        message: "Votre compte a été créé et est en attente de validation."
      });
    } catch (err) {
      console.error("Sign up error:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Une erreur inattendue est survenue lors de la création du compte."
      });
    }
  });

  // 2. LOGIN API
  // POST /api/auth/login
  app.post("/api/auth/login", (req: Request, res: Response): void => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password || typeof email !== "string" || typeof password !== "string") {
        res.status(400).json({
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "Email ou mot de passe incorrect."
        });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = userStore.findByEmail(normalizedEmail);

      // Verify credentials without leaking email existence
      if (!user || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "Email ou mot de passe incorrect."
        });
        return;
      }

      // Check account status
      if (user.status === "PENDING") {
        res.status(403).json({
          success: false,
          code: "ACCOUNT_PENDING",
          message: "Votre compte est en attente de validation par un administrateur."
        });
        return;
      }

      if (user.status === "DISABLED") {
        res.status(403).json({
          success: false,
          code: "ACCOUNT_DISABLED",
          message: "Votre compte a été désactivé."
        });
        return;
      }

      if (user.status === "ACTIVE") {
        const token = sessionStore.createSession(user.id);
        res.status(200).json({
          success: true,
          code: "LOGIN_SUCCESS",
          message: "Connexion réussie.",
          data: {
            token,
            user: sanitizeUser(user)
          }
        });
        return;
      }

      // Fallback unexpected status
      res.status(403).json({
        success: false,
        code: "ACCOUNT_BLOCKED",
        message: "Statut de compte non autorisé."
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Une erreur inattendue est survenue lors de la connexion."
      });
    }
  });

  // 3. LOGOUT API
  // POST /api/auth/logout
  app.post("/api/auth/logout", (req: Request, res: Response): void => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.substring(7).trim();
        sessionStore.invalidateSession(token);
      }

      res.status(200).json({
        success: true,
        code: "LOGOUT_SUCCESS",
        message: "Déconnexion réussie."
      });
    } catch (err) {
      console.error("Logout error:", err);
      res.status(500).json({
        success: false,
        code: "SERVER_ERROR",
        message: "Une erreur inattendue est survenue lors de la déconnexion."
      });
    }
  });

  // 4. PROTECTED USER PROFILE
  // GET /api/auth/me
  app.get("/api/auth/me", authMiddleware, (req: AuthenticatedRequest, res: Response): void => {
    res.status(200).json({
      success: true,
      code: "USER_PROFILE",
      message: "Profil utilisateur récupéré avec succès.",
      data: {
        user: req.user
      }
    });
  });

  return app;
}

export async function startServer() {
  const app = createExpressApp();
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[GILEADA Auth] Server running at http://0.0.0.0:${PORT}`);
  });
}

// Start only if executed directly as entrypoint
const isDirectRun = Boolean(
  process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))
);

if (isDirectRun && process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
  });
}
