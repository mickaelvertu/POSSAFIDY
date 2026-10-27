import { lazy, Suspense, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authService, DEFAULT_ARTICLE_VISIBILITY, hasPermission } from "../../services/authService";
import { AppRoleId, AppUser, Article, AuditLog, Category, CashHandover, CashHandoverDeposit, CreditCustomer, CreditFollowUp, CreditPayment, Employee, Expense, GeneralFilters, Payslip, Purchase, ResellerNotification, ResellerOrder, Sale, SalaryAdvance, ReportType, StockTransferLine, Supplier, SupplierPayment, UnitOfMeasure } from "../../types";
import { User } from "../../types/auth";
import RoleHomeView from "../RoleHomeView";
import { Production, RECYCLING_DECISION_LABELS, RETURN_REASON_LABELS, RecyclingDecision, StockMovement, StockTransfer, Store, StoreStock } from "../../types";
import { generateRef, getArticleStock, updateQuarantineQuantity, updateStockQuantity } from "../../services/stockService";
import {
  deleteStore,
  deleteDraftTransfer,
  cancelTransfer,
  loadCatalogData,
  loadInventoryData,
  loadStores,
  loadProcurementData,
  approvePurchase,
  recordSupplierPayment,
  saveDraftPurchase,
  saveArticle,
  saveCategory,
  saveStockAdjustment,
  saveStore,
  saveSupplier,
  saveTransfer,
  saveTransferWithStockEffects,
  recordTransferReceipt,
  updateDraftTransfer,
} from "../../services/inventoryService";
import { advanceSale, approveSale, cancelSale, createProduction, deleteCancelledSale, deleteDraftSale, deleteDraftProduction, loadOperationalData, saveAuditLog, updateDraftProduction, updateDraftSale, validateSale } from "../../services/operationsService";
import { createCreditSale, loadCreditCustomerForUser, loadCreditCustomers, recordCreditFollowUp, recordCreditPayment, saveCreditCustomer } from "../../services/creditService";
import { createResellerOrder, loadResellerStocks, markResellerNotificationsRead, recordResellerCashPayment, reviewResellerOrder, subscribeResellerNotifications, subscribeResellerOrders, updateResellerOrder } from "../../services/resellerOrderService";
import { createAuditLog } from "../../services/auditService";
import { deleteInventoryCountDraft, loadInventoryCounts, refuseInventorySignature, rejectInventoryCount, saveInventoryCount, settleInventoryCharges, signInventoryCount, validateInventoryCount } from "../../services/inventoryCountService";
import type { InventoryCount, InventoryReasonDecision } from "../../types";
import { linkEmployeeAccount, loadEmployees, saveEmployee } from "../../services/employeeService";
import { loadPayslips, loadSalaryAdvances, savePayslip, saveSalaryAdvance } from "../../services/payrollService";
import UserAuditReport from "../UserAuditReport";
import ThemeSwitcher from "../ThemeSwitcher";
import NotificationBell from "../NotificationBell";
import { buildActionNotifications } from "../../services/notificationService";
import { deleteExpense, loadExpenses, saveExpense, updateDraftExpense, validateExpense } from "../../services/expenseService";
import { confirmCashHandoverReceipt, createCashHandover, loadCashHandovers, recordCashHandoverDeposit } from "../../services/cashHandoverService";
import { deleteUnit, loadUnits, saveUnit } from "../../services/unitService";
import { applyStockSnapshot, importInitialStocks } from "../../services/stockImportService";
import type { StockSyncRow } from "../../services/stockSyncValidation";
import type { InitialStockImportRow } from "../../services/stockImportValidation";
import { consumeRawMaterial } from "../../services/operationsService";
import { canApproveTransfer } from "../../services/transferApproval";
const UsersView = lazy(() => import("../UsersView"));
const SalesView = lazy(() => import("../SalesView"));
const StocksView = lazy(() => import("../StocksView"));
const EmployeePresentationView = lazy(() => import("../EmployeePresentationView"));
const InventoryControlView = lazy(() => import("../InventoryControlView"));
const AuditView = lazy(() => import("../AuditView"));
const StoresView = lazy(() => import("../StoresView"));
const CatalogView = lazy(() => import("../CatalogView"));
const ProductionView = lazy(() => import("../ProductionView"));
const ProcurementView = lazy(() => import("../ProcurementView"));
const ExpensesView = lazy(() => import("../ExpensesView"));
const CashHandoverView = lazy(() => import("../CashHandoverView"));
const StaffView = lazy(() => import("../StaffView"));
const PayrollView = lazy(() => import("../PayrollView"));
const CreditManagementView = lazy(() => import("../CreditManagementView"));
const ResellerPortalView = lazy(() => import("../ResellerPortalView"));
const TransfersView = lazy(() => import("../TransfersView"));
const UnitsView = lazy(() => import("../UnitsView"));
const ReportsView = lazy(() => import("../ReportsView"));
const ReportViewer = lazy(() => import("../ReportViewer"));
import { 
  ShieldCheck, 
  LogOut, 
  User as UserIcon, 
  Mail, 
  Phone, 
  Calendar, 
  Shield
} from "lucide-react";

const APP_ROLES: AppRoleId[] = ["SUPER_ADMIN", "ADMIN", "VENDEUR", "MAGASINIER", "RESPONSABLE_MAGASIN", "CONTROLEUR", "PRODUCTION", "COMPTABLE", "GESTIONNAIRE_CREDIT", "STAFF", "REVENDEUR"];

function hasCashHandoverPermission(user: AppUser, action: "view" | "create" | "receive" | "deposit"): boolean {
  return user.roleId === "ADMIN" || hasPermission(user, `cash_handover.${action}`);
}

function hasProcurementPermission(user: AppUser): boolean {
  return user.roleId === "ADMIN" || user.roleId === "SUPER_ADMIN" || hasPermission(user, "procurement.manage");
}

function toAppUser(user: User): AppUser {
  const roleId = APP_ROLES.includes(user.role as AppRoleId) ? user.role as AppRoleId : "VENDEUR";
  return {
    id: user.id,
    uid: user.id,
    code: user.code,
    username: user.email.split("@")[0],
    businessName: user.businessName,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: `${user.firstName} ${user.lastName}`,
    role: roleId,
    roleId,
    storeIds: user.assignedStores || [],
    permissions: user.permissions || [],
    visibleArticleTypes: user.visibleArticleTypes ?? DEFAULT_ARTICLE_VISIBILITY[roleId],
    isActive: user.status === "ACTIVE",
    accountStatus: user.status,
    createdAt: Date.parse(user.createdAt),
    updatedAt: Date.parse(user.updatedAt)
  };
}

function containsHiddenArticleReference(value: unknown, visibleArticleIds: Set<string>): boolean {
  if (Array.isArray(value)) return value.some(item => containsHiddenArticleReference(item, visibleArticleIds));
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.article_id === "string" && !visibleArticleIds.has(record.article_id)) return true;
  if (
    (record.article_type === "RAW_MATERIAL" || record.article_type === "RESALE") &&
    typeof record.id === "string" &&
    !visibleArticleIds.has(record.id)
  ) return true;
  return Object.values(record).some(item => containsHiddenArticleReference(item, visibleArticleIds));
}

export default function AuthenticatedSessionView() {
  const { user, logout, isProfileFromCache, hasPendingWrites } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [managedUsers, setManagedUsers] = useState<AppUser[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<"home" | "sales" | "stocks" | "stores" | "catalog" | "production" | "procurement" | "expenses" | "cashHandovers" | "transfers" | "units" | "staff" | "payroll" | "reports" | "audit" | "credit" | "resellerPortal" | "inventory" | "employeePresentation">(user?.role === "REVENDEUR" ? "resellerPortal" : "home");
  const [inventoryCounts, setInventoryCounts] = useState<InventoryCount[]>([]);
  const [reportRequest, setReportRequest] = useState<{ type: ReportType; filters: GeneralFilters } | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [creditCustomers, setCreditCustomers] = useState<CreditCustomer[]>([]);
  const [resellerOrders, setResellerOrders] = useState<ResellerOrder[]>([]);
  const [resellerNotifications, setResellerNotifications] = useState<ResellerNotification[]>([]);
  const [productions, setProductions] = useState<Production[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [stocks, setStocks] = useState<StoreStock[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [inventoryStores, setInventoryStores] = useState<Store[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoadError, setExpensesLoadError] = useState<string | null>(null);
  const [cashHandovers, setCashHandovers] = useState<CashHandover[]>([]);
  const [cashHandoversError, setCashHandoversError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [salaryAdvances, setSalaryAdvances] = useState<SalaryAdvance[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const canManageUsers = Boolean(user && (
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN" ||
    user.permissions.includes("users.view")
  ));
  const canManageStores = Boolean(user && (user.role === "ADMIN" || user.role === "SUPER_ADMIN"));
  const canManageProcurement = Boolean(user && user.status === "ACTIVE" && (
    canManageStores || user.permissions.includes("procurement.manage")
  ));

  useEffect(() => {
    if (!canManageUsers) {
      setManagedUsers([]);
      return;
    }
    authService.listManagedUsers().then(response => {
      if (response.success && response.data) {
        setManagedUsers(response.data.users.map(toAppUser));
      } else {
        setUsersError(response.message);
      }
    }).catch(error => {
      setUsersError(error instanceof Error ? error.message : "Impossible de charger les utilisateurs.");
    });
  }, [canManageUsers]);

  useEffect(() => {
    let isMounted = true;
    const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
    // Bounded retry with backoff: a transient Firestore failure must not leave a screen empty, and must never loop forever.
    const withRetry = async <T,>(label: string, task: () => Promise<T>, attempts = 3): Promise<T | undefined> => {
      for (let attempt = 1; attempt <= attempts && isMounted; attempt++) {
        try {
          return await task();
        } catch (error) {
          console.error(`${label} Firestore load failed (attempt ${attempt}/${attempts}):`, error);
          if (attempt < attempts) await wait(1000 * 2 ** (attempt - 1));
        }
      }
      return undefined;
    };

    async function loadInventory() {
      if (!user) return;
      setArticles([]);
      setStocks([]);
      setMovements([]);
      setTransfers([]);
      setSales([]);
      setProductions([]);
      setAuditLogs([]);
      const isReseller = user.role === "REVENDEUR";
      const canManageCredit = Boolean(user.permissions.includes("credit.manage"));
      let unitAuditLogs: AuditLog[] = [];

      // Each block is independent: stores appear as soon as they load, even if another collection fails.
      const storesPromise = withRetry("Stores", loadStores);
      const visibleArticleTypes = [...new Set([
        ...(user.visibleArticleTypes ?? DEFAULT_ARTICLE_VISIBILITY[user.role as AppRoleId] ?? []),
        ...(canManageProcurement ? ["RAW_MATERIAL" as const] : [])
      ])];
      const catalogPromise = withRetry("Catalog", async () => {
        const catalog = await loadCatalogData(visibleArticleTypes);
        const loadedUnits = canManageStores
          ? await loadUnits(catalog.articles, toAppUser(user), entries => { unitAuditLogs = entries; })
          : [];
        return { catalog, loadedUnits };
      });

      await Promise.all([
        storesPromise.then(loadedStores => {
          if (isMounted && loadedStores) setInventoryStores(loadedStores);
        }),
        catalogPromise.then(result => {
          if (!isMounted || !result) return;
          setArticles(result.catalog.articles);
          setCategories(result.catalog.categories);
          setUnits(result.loadedUnits);
        }),
        withRetry("Inventory", () => loadInventoryData(canManageStores ? undefined : user.assignedStores)).then(async inventory => {
          if (!isMounted || !inventory) return;
          const catalogResult = await catalogPromise;
          if (!isMounted || !catalogResult) return;
          const articleIds = new Set(catalogResult.catalog.articles.map(article => article.id));
          setMovements(inventory.movements.filter(movement => articleIds.has(movement.article_id)));
          setTransfers(inventory.transfers.filter(transfer => transfer.lines.every(line => articleIds.has(line.article_id))));
          if (!isReseller) {
            setStocks(inventory.stocks.filter(stock => articleIds.has(stock.article_id)));
            return;
          }
          const loadedStores = await storesPromise;
          if (!loadedStores) return;
          const resellerStocks = await withRetry("Reseller stocks", () => loadResellerStocks(loadedStores, catalogResult.catalog.articles));
          if (isMounted && resellerStocks) setStocks(resellerStocks);
        }),
        canManageProcurement
          ? withRetry("Procurement", () => loadProcurementData(canManageStores ? undefined : user.assignedStores)).then(procurement => {
              if (!isMounted || !procurement) return;
              setSuppliers(procurement.suppliers);
              setPurchases(procurement.purchases);
            })
          : Promise.resolve(),
        withRetry("Inventory counts", () => loadInventoryCounts(canManageStores ? undefined : user.assignedStores)).then(loaded => {
          if (isMounted && loaded) setInventoryCounts(loaded);
        }),
        withRetry("Operations", () => loadOperationalData({
          sales: canManageStores || Boolean(user.permissions.includes("sales.view") || canManageCredit),
          productions: canManageStores || Boolean(user.permissions.includes("production.view")),
          audit: true,
          auditUserOnly: Boolean(canManageCredit && !canManageStores),
          storeIds: canManageStores || canManageCredit ? undefined : user.assignedStores,
          userId: user.id || ""
        })).then(async operations => {
          if (!operations) return;
          await catalogPromise;
          if (!isMounted) return;
          setSales(operations.sales);
          setProductions(operations.productions);
          setAuditLogs([...unitAuditLogs, ...operations.auditLogs]);
        }),
        withRetry("Credit customers", async () => {
          if (isReseller) {
            const linkedCustomer = await loadCreditCustomerForUser(user.id);
            return linkedCustomer ? [linkedCustomer] : [];
          }
          if (user.permissions.includes("credit.sales") || canManageCredit || canManageStores) return loadCreditCustomers();
          return [] as CreditCustomer[];
        }).then(customers => {
          if (isMounted && customers) setCreditCustomers(customers);
        })
      ]);
    }
    void loadInventory();
    return () => {
      isMounted = false;
    };
  }, [canManageStores, canManageProcurement, user]);

  useEffect(() => {
    const canAccess = user?.status === "ACTIVE" && (
      canManageStores ||
      user?.permissions.some(permission => permission.startsWith("cash_handover."))
    );
    if (!canAccess || !user) {
      setCashHandovers([]);
      setCashHandoversError(null);
      return;
    }
    let isMounted = true;
    setCashHandoversError(null);
    setCashHandovers([]);
    loadCashHandovers(canManageStores ? undefined : user.assignedStores)
      .then(rows => { if (isMounted) setCashHandovers(rows); })
      .catch(error => {
        console.error("Cash handover Firestore load failed:", error);
        if (isMounted) setCashHandoversError(error instanceof Error ? error.message : "Erreur inconnue.");
      });
    return () => { isMounted = false; };
  }, [canManageStores, user]);

  useEffect(() => {
    if (!user) return;
    const isReseller = user.role === "REVENDEUR";
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
    if (!isReseller && !isAdmin) return;
    let isMounted = true;
    const reportError = (error: Error) => {
      console.error("Reseller portal listener failed:", error);
      if (isMounted) window.alert(`Impossible de synchroniser le portail revendeur : ${error.message}`);
    };
    const unsubscribeOrders = subscribeResellerOrders(user.id, isAdmin, setResellerOrders, reportError);
    const unsubscribeNotifications = isReseller
      ? subscribeResellerNotifications(user.id, setResellerNotifications, reportError)
      : undefined;
    return () => {
      isMounted = false;
      unsubscribeOrders();
      unsubscribeNotifications?.();
    };
  }, [user]);

  useEffect(() => {
    let isMounted = true;
    const canViewExpenses = user?.status === "ACTIVE" && (canManageStores || user.permissions.includes("expenses.view") || user.permissions.includes("expenses.create"));
    if (!canViewExpenses) {
      setExpenses([]);
      setExpensesLoadError("Accès aux dépenses nécessaire pour calculer la clôture POS.");
      return;
    }
    setExpensesLoadError("Chargement des dépenses en cours.");
    loadExpenses(user?.role === "SUPER_ADMIN" ? undefined : user?.assignedStores, user?.id)
      .then(loadedExpenses => {
        if (isMounted) { setExpenses(loadedExpenses); setExpensesLoadError(null); }
      })
      .catch(error => { console.error("Expense Firestore load failed:", error); if (isMounted) setExpensesLoadError("Impossible de charger les dépenses pour calculer la clôture POS."); });
    return () => {
      isMounted = false;
    };
  }, [canManageStores, user]);

  useEffect(() => {
    if (!canManageStores) {
      setEmployees([]);
      return;
    }
    let isMounted = true;
    Promise.all([loadEmployees(), loadPayslips(), loadSalaryAdvances()])
      .then(([loadedEmployees, loadedPayslips, loadedAdvances]) => {
        if (!isMounted) return;
        setEmployees(loadedEmployees);
        setPayslips(loadedPayslips);
        setSalaryAdvances(loadedAdvances);
      })
      .catch(error => console.error("Employee/payroll Firestore load failed:", error));
    return () => {
      isMounted = false;
    };
  }, [canManageStores]);

  const handleSaveEmployee = async (employee: Employee, isNew: boolean) => {
    const previous = employees.find(item => item.id === employee.id);
    const action = isNew
      ? "EMPLOYEE_CREATED"
      : previous && previous.is_active !== employee.is_active
        ? (employee.is_active ? "EMPLOYEE_REACTIVATED" : "EMPLOYEE_DEACTIVATED")
        : "EMPLOYEE_UPDATED";
    const auditLog = createAuditLog(currentAppUser!, action, "EMPLOYEE", employee.id, previous, employee, employee.store_id);
    await saveEmployee(employee, auditLog);
    setEmployees(current => isNew ? [...current, employee] : current.map(item => item.id === employee.id ? employee : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleLinkEmployee = async (employee: Employee, userId: string) => {
    const user = managedUsers.find(item => item.uid === userId);
    if (!user) throw new Error("Compte introuvable.");
    const updated = { ...employee, user_id: userId, updated_at: Date.now() };
    const audit = createAuditLog(currentAppUser!, "EMPLOYEE_UPDATED", "EMPLOYEE", employee.id, employee, updated, employee.store_id);
    await linkEmployeeAccount(employee.id, userId, audit);
    setEmployees(await loadEmployees());
    setAuditLogs(current => [audit, ...current]);
  };

  const handleSaveAdvance = async (advance: SalaryAdvance) => {
    const auditLog = createAuditLog(currentAppUser!, "SALARY_ADVANCE_CREATED", "SALARY_ADVANCE", advance.id, undefined, advance);
    await saveSalaryAdvance(advance, auditLog);
    setSalaryAdvances(current => [advance, ...current]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleSavePayslip = async (payslip: Payslip, isNew: boolean, settledAdvances: SalaryAdvance[], settledCounts: InventoryCount[] = []) => {
    if (settledCounts.length > 0) {
      await settleInventoryCounts(settledCounts, "PAYSLIP", `Paie ${payslip.period} - ${payslip.employee_name}`, "", payslip.id);
    }
    const previous = payslips.find(item => item.id === payslip.id);
    const auditLog = createAuditLog(
      currentAppUser!,
      isNew ? "PAYSLIP_CREATED" : "PAYSLIP_UPDATED",
      "PAYSLIP",
      payslip.id,
      previous,
      payslip
    );
    await savePayslip(payslip, auditLog, settledAdvances);
    setSalaryAdvances(current => current.map(item => settledAdvances.find(settled => settled.id === item.id) || item));
    setPayslips(current => isNew ? [payslip, ...current] : current.map(item => item.id === payslip.id ? payslip : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleCreateManagedUser = async (newUser: AppUser) => {
    const response = await authService.createManagedUser({
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      role: newUser.roleId,
      permissions: newUser.permissions,
      visibleArticleTypes: newUser.visibleArticleTypes || [],
      assignedStores: newUser.storeIds,
      status: newUser.isActive ? "ACTIVE" : "PENDING"
    });
    if (!response.success || !response.data) {
      alert(response.message);
      return;
    }
    const createdUser = toAppUser(response.data.user);
    const auditLog = createAuditLog(currentAppUser!, "USER_CREATED", "USER", createdUser.id, undefined, {
      id: createdUser.id,
      email: createdUser.email,
      roleId: createdUser.roleId,
      permissions: createdUser.permissions,
      storeIds: createdUser.storeIds,
      isActive: createdUser.isActive
    });
    try {
      await saveAuditLog(auditLog);
    } catch (error) {
      throw new Error(`Le compte a été créé, mais sa trace d'audit n'a pas pu être enregistrée : ${error instanceof Error ? error.message : "erreur inconnue"}`);
    }
    setManagedUsers(current => [...current, toAppUser(response.data!.user)]);
    setAuditLogs(current => [auditLog, ...current]);
    alert(`Utilisateur créé. Mot de passe temporaire : ${response.data.temporaryPassword}`);
  };

  const handleUpdateManagedUser = async (updatedUser: AppUser) => {
    if (updatedUser.id === user?.id) {
      alert("Pour votre sécurité, un administrateur ne peut pas modifier son propre rôle, son statut ou ses permissions.");
      return;
    }
    const existingUser = managedUsers.find(item => item.id === updatedUser.id);
    const activeSuperAdmins = managedUsers.filter(item => item.roleId === "SUPER_ADMIN" && item.isActive);
    if (existingUser?.roleId === "SUPER_ADMIN" && activeSuperAdmins.length <= 1 &&
      (updatedUser.roleId !== "SUPER_ADMIN" || !updatedUser.isActive)) {
      alert("Le dernier super administrateur actif ne peut pas être désactivé ou rétrogradé.");
      return;
    }
    const response = await authService.updateManagedUser(updatedUser.id, {
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      role: updatedUser.roleId,
      permissions: updatedUser.permissions,
      visibleArticleTypes: updatedUser.visibleArticleTypes || [],
      assignedStores: updatedUser.storeIds,
      status: updatedUser.isActive ? "ACTIVE" : "DISABLED"
    });
    if (!response.success || !response.data) {
      alert(response.message);
      return;
    }
    const savedUser = toAppUser(response.data.user);
    const auditLog = createAuditLog(currentAppUser!, "USER_UPDATED", "USER", savedUser.id, existingUser, {
      id: savedUser.id,
      email: savedUser.email,
      roleId: savedUser.roleId,
      permissions: savedUser.permissions,
      storeIds: savedUser.storeIds,
      isActive: savedUser.isActive
    });
    try {
      await saveAuditLog(auditLog);
    } catch (error) {
      throw new Error(`Le compte a été modifié, mais sa trace d'audit n'a pas pu être enregistrée : ${error instanceof Error ? error.message : "erreur inconnue"}`);
    }
    setManagedUsers(current => current.map(item => item.id === updatedUser.id ? savedUser : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleDeleteManagedUser = async (userId: string) => {
    const previousUser = managedUsers.find(item => item.id === userId);
    const response = await authService.deleteManagedUser(userId);
    if (!response.success) {
      alert(response.message);
      return;
    }
    const auditLog = createAuditLog(currentAppUser!, "USER_DISABLED", "USER", userId, previousUser, {
      ...previousUser,
      isActive: false,
      permissions: [],
      storeIds: []
    });
    try {
      await saveAuditLog(auditLog);
    } catch (error) {
      throw new Error(`Le compte a été désactivé, mais sa trace d'audit n'a pas pu être enregistrée : ${error instanceof Error ? error.message : "erreur inconnue"}`);
    }
    setManagedUsers(current => current.map(item => item.id === userId
      ? { ...item, isActive: false, permissions: [], storeIds: [] }
      : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const openUserManagement = () => {
    document.getElementById("user-management")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const currentAppUser = user ? toAppUser(user) : null;
  const isInventoryAdmin = currentAppUser?.roleId === "SUPER_ADMIN" || currentAppUser?.roleId === "ADMIN";
  const canReviewInventory = Boolean(currentAppUser && (isInventoryAdmin || hasPermission(currentAppUser, "inventory.review")));
  const canCountInventory = Boolean(currentAppUser && (isInventoryAdmin || currentAppUser.storeIds.length > 0)
    && (isInventoryAdmin || currentAppUser.roleId === "RESPONSABLE_MAGASIN" || currentAppUser.roleId === "CONTROLEUR" || hasPermission(currentAppUser, "inventory.count")));
  const inventoryScopeStores = isInventoryAdmin || !currentAppUser
    ? inventoryStores
    : inventoryStores.filter(store => currentAppUser.storeIds.includes(store.id));
  const accessibleStores = user && user.assignedStores.length > 0 && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN"
    ? inventoryStores.filter(store => user.assignedStores.includes(store.id))
    : inventoryStores;
  // Même règle d'accès que le module Dépenses. ADMIN et SUPER_ADMIN voient tout ;
  // les autres utilisateurs ne voient que leurs propres dépenses, dans leurs magasins assignés.
  const canAccessExpenses = Boolean(currentAppUser && user?.status === "ACTIVE" && (currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.view") || hasPermission(currentAppUser, "expenses.create")));
  const reportExpenses = !canAccessExpenses || !user
    ? undefined
    : user.role === "ADMIN" || user.role === "SUPER_ADMIN"
      ? expenses
      : expenses.filter(expense => expense.created_by === user.id &&
          (user.assignedStores.length === 0 || (Boolean(expense.store_id) && user.assignedStores.includes(expense.store_id as string))));
  // Non-admin roles only see transfers involving one of their assigned stores.
  const visibleArticleIds = new Set<string>(articles.map(article => article.id));
  const visibleTransfers = currentAppUser && currentAppUser.roleId !== "SUPER_ADMIN" && currentAppUser.roleId !== "ADMIN"
    ? transfers.filter(transfer =>
        (currentAppUser.storeIds.includes(transfer.source_store_id) || currentAppUser.storeIds.includes(transfer.destination_store_id)) &&
        transfer.lines.every(line => visibleArticleIds.has(line.article_id))
      )
    : transfers.filter(transfer => transfer.lines.every(line => visibleArticleIds.has(line.article_id)));
  const visibleSales = sales.filter(sale => sale.lines.every(line =>
    line.line_type === "SERVICE" || visibleArticleIds.has(line.article_id)
  ));
  const visibleResellerOrders = resellerOrders.filter(order =>
    order.lines.every(line => visibleArticleIds.has(line.article_id))
  );
  const visibleProductions = productions.filter(production =>
    [...production.consumptions, ...production.outputs].every(line => visibleArticleIds.has(line.article_id))
  );
  const visiblePurchases = purchases.filter(purchase => purchase.lines.every(line => visibleArticleIds.has(line.article_id)));
  const visibleAuditLogs = auditLogs.filter(entry =>
    (entry.entity_type !== "ARTICLE" || visibleArticleIds.has(entry.entity_id)) &&
    !containsHiddenArticleReference([entry.old_value, entry.new_value], visibleArticleIds)
  );

  const handleImportInitialStocks = async (rows: InitialStockImportRow[]) => {
    if (!currentAppUser || currentAppUser.roleId !== "SUPER_ADMIN") {
      throw new Error("Seul le super administrateur peut importer l'inventaire initial.");
    }
    const result = await importInitialStocks(rows, currentAppUser);
    setStocks(current => [
      ...current.filter(stock => !result.stocks.some(imported => imported.id === stock.id)),
      ...result.stocks
    ]);
    setMovements(current => [...result.movements, ...current]);
    setAuditLogs(current => [...result.auditLogs, ...current]);
  };

  const handleSyncStocks = async (rows: StockSyncRow[]) => {
    if (!currentAppUser || currentAppUser.roleId !== "SUPER_ADMIN") {
      throw new Error("Seul le super administrateur peut importer le stock.");
    }
    const result = await applyStockSnapshot(rows, currentAppUser);
    setStocks(current => [
      ...current.filter(stock => !result.stocks.some(updated => updated.id === stock.id)),
      ...result.stocks
    ]);
    setMovements(current => [...result.movements, ...current]);
    setAuditLogs(current => [...result.auditLogs, ...current]);
  };

  const handleCreateSale = async (sale: Sale) => {
    try {
      if (!currentAppUser) throw new Error("Session utilisateur invalide.");
      if (sale.customer_type === "REVENDEUR") {
        const store = inventoryStores.find(item => item.id === sale.store_id);
        if (
          currentAppUser.roleId !== "RESPONSABLE_MAGASIN" ||
          !currentAppUser.storeIds.includes(sale.store_id) ||
          store?.store_type !== "CENTRAL_WAREHOUSE" ||
          !hasPermission(currentAppUser, "credit.sales") ||
          sale.lines.some(line => line.line_type === "SERVICE" || articles.find(article => article.id === line.article_id)?.article_type !== "RESALE")
        ) {
          throw new Error("Seul un responsable assigné au dépôt central peut créer une demande revendeur composée de produits de revente.");
        }
      }
      if (sale.customer_type === "REVENDEUR" && sale.total > sale.amount_paid && !sale.credit_customer_id) {
        throw new Error("Sélectionnez le compte revendeur avant d'accorder un paiement à crédit.");
      }
      if (sale.credit_customer_id &&
        currentAppUser.roleId !== "ADMIN" &&
        currentAppUser.roleId !== "SUPER_ADMIN" &&
        !hasPermission(currentAppUser, "credit.sales")) {
        throw new Error("Vous n'êtes pas autorisé à enregistrer une vente à crédit.");
      }
      const entry = createAuditLog(currentAppUser, "SALE_CREATED", "SALE", sale.id, undefined, sale, sale.store_id);
      await createCreditSale(sale, entry);
      setSales(current => [sale, ...current]);
      setAuditLogs(current => [entry, ...current]);
      if (sale.credit_customer_id && sale.total > sale.amount_paid) {
        const balance = sale.total - sale.amount_paid;
        setCreditCustomers(current => current.map(customer => customer.id === sale.credit_customer_id
          ? { ...customer, outstanding_balance: customer.outstanding_balance + balance, updated_at: sale.created_at }
          : customer));
      }
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer la vente.");
      return false;
    }
  };

  const handleUpdateSale = async (originalSale: Sale, sale: Sale): Promise<boolean> => {
    try {
      if (!currentAppUser || originalSale.seller_id !== currentAppUser.uid || originalSale.status !== "DRAFT") {
        throw new Error("Seul le créateur peut modifier sa vente tant qu'elle est en brouillon.");
      }
      if (sale.customer_type === "REVENDEUR") {
        const store = inventoryStores.find(item => item.id === sale.store_id);
        if (
          currentAppUser.roleId !== "RESPONSABLE_MAGASIN" ||
          !currentAppUser.storeIds.includes(sale.store_id) ||
          store?.store_type !== "CENTRAL_WAREHOUSE" ||
          !hasPermission(currentAppUser, "credit.sales") ||
          sale.lines.some(line => line.line_type === "SERVICE" || articles.find(article => article.id === line.article_id)?.article_type !== "RESALE")
        ) {
          throw new Error("Une demande revendeur doit rester créée par un responsable assigné au dépôt central et contenir des produits de revente.");
        }
        if (sale.total > sale.amount_paid && !sale.credit_customer_id) {
          throw new Error("Sélectionnez le compte revendeur avant de conserver un solde à crédit.");
        }
      }
      if (sale.credit_customer_id &&
        currentAppUser.roleId !== "ADMIN" &&
        currentAppUser.roleId !== "SUPER_ADMIN" &&
        !hasPermission(currentAppUser, "credit.sales")) {
        throw new Error("Vous n'êtes pas autorisé à modifier cette vente à crédit.");
      }
      const result = await updateDraftSale(originalSale, sale, currentAppUser.uid, currentAppUser.displayName);
      setSales(current => current.map(item => item.id === sale.id ? result.sale : item));
      if (sale.credit_customer_id) {
        const creditDelta = Math.max(0, sale.total - sale.amount_paid) - Math.max(0, originalSale.total - originalSale.amount_paid);
        if (creditDelta !== 0) {
          setCreditCustomers(current => current.map(customer => customer.id === sale.credit_customer_id
            ? { ...customer, outstanding_balance: customer.outstanding_balance + creditDelta, updated_at: Date.now() }
            : customer));
        }
      }
      setAuditLogs(current => [result.auditLog, ...current]);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de modifier le brouillon de vente.");
      return false;
    }
  };

  const handleCreateResellerOrder = async (order: ResellerOrder): Promise<boolean> => {
    try {
      if (user?.role !== "REVENDEUR") {
        throw new Error("Seul un compte revendeur peut soumettre une commande.");
      }
      if (user.status !== "ACTIVE") {
        throw new Error("Votre compte revendeur n'est pas encore activé : un administrateur doit l'approuver avant toute commande.");
      }
      if (order.reseller_user_id !== user.id) {
        throw new Error("Cette commande n'est pas rattachée à votre compte.");
      }
      await createResellerOrder(order);
      setResellerOrders(current => [order, ...current]);
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Impossible d'envoyer la commande.");
      return false;
    }
  };

  const handleUpdateResellerOrder = async (order: ResellerOrder): Promise<boolean> => {
    try {
      if (user?.role !== "REVENDEUR" || order.reseller_user_id !== user.id) {
        throw new Error("Vous ne pouvez modifier que vos propres commandes.");
      }
      await updateResellerOrder(order);
      setResellerOrders(current => current.map(item => item.id === order.id ? order : item));
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Impossible de renvoyer la commande.");
      return false;
    }
  };

  const handleReviewResellerOrder = async (
    order: ResellerOrder,
    decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED",
    message: string
  ): Promise<boolean> => {
    try {
      if (!currentAppUser || (currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN")) {
        throw new Error("Seul un administrateur peut traiter une commande revendeur.");
      }
      const linkedCreditCustomer = creditCustomers.find(customer => customer.linked_user_id === order.reseller_user_id);
      const result = await reviewResellerOrder(
        order,
        decision,
        message,
        currentAppUser.uid,
        currentAppUser.displayName,
        stocks,
        articles,
        linkedCreditCustomer
      );
      setResellerOrders(current => current.map(item => item.id === order.id ? result.order : item));
      if (result.sale) setSales(current => [result.sale!, ...current]);
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      if (result.customer) {
        setCreditCustomers(current => current.map(customer => customer.id === result.customer!.id ? result.customer! : customer));
      }
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Impossible de traiter la commande revendeur.");
      return false;
    }
  };

  const handleMarkResellerNotificationsRead = async (): Promise<void> => {
    try {
      await markResellerNotificationsRead(resellerNotifications);
      setResellerNotifications(current => current.map(notification => ({ ...notification, is_read: true })));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Impossible de mettre à jour les notifications.");
    }
  };

  const handleRecordResellerCashPayment = async (order: ResellerOrder): Promise<boolean> => {
    try {
      if (!currentAppUser || (currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN")) {
        throw new Error("Seul un administrateur peut confirmer le paiement.");
      }
      const result = await recordResellerCashPayment(order, currentAppUser.uid, currentAppUser.displayName);
      setResellerOrders(current => current.map(item => item.id === order.id ? result.order : item));
      setSales(current => current.map(item => item.id === result.sale.id ? result.sale : item));
      return true;
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Impossible d'enregistrer le paiement comptant.");
      return false;
    }
  };

  const handleSaveCreditCustomer = async (customer: CreditCustomer): Promise<boolean> => {
    if (!currentAppUser || (
      currentAppUser.roleId !== "ADMIN" &&
      currentAppUser.roleId !== "SUPER_ADMIN" &&
      !hasPermission(currentAppUser, "credit.manage")
    )) {
      alert("Seul le gestionnaire de crédit ou un administrateur peut gérer les comptes revendeurs.");
      return false;
    }
    if (!customer.name.trim() || !Number.isFinite(customer.credit_limit) || customer.credit_limit < customer.outstanding_balance
      || !Number.isInteger(customer.payment_term_days) || customer.payment_term_days < 1) {
      alert("Vérifiez le nom, le plafond (au moins égal à l'encours) et le délai de paiement.");
      return false;
    }
    const existing = creditCustomers.find(item => item.id === customer.id);
    if (!existing && creditCustomers.some(item => item.name.trim().toLocaleLowerCase("fr") === customer.name.trim().toLocaleLowerCase("fr"))) {
      alert("Un compte revendeur porte déjà ce nom.");
      return false;
    }
    const updated = {
      ...customer,
      created_at: existing?.created_at || customer.created_at,
      updated_at: Date.now()
    };
    const auditLog = createAuditLog(currentAppUser, "CREDIT_CUSTOMER_UPDATED", "CREDIT_CUSTOMER", customer.id, existing, updated);
    try {
      await saveCreditCustomer(updated, auditLog);
      setCreditCustomers(current => existing
        ? current.map(item => item.id === customer.id ? updated : item)
        : [...current, updated]);
      setAuditLogs(current => [auditLog, ...current]);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer le compte revendeur.");
      return false;
    }
  };

  const handleRecordCreditPayment = async (sale: Sale, payment: CreditPayment): Promise<boolean> => {
    if (!currentAppUser || (
      currentAppUser.roleId !== "ADMIN" &&
      currentAppUser.roleId !== "SUPER_ADMIN" &&
      !hasPermission(currentAppUser, "credit.manage")
    )) {
      alert("Seul le gestionnaire de crédit ou un administrateur peut enregistrer un règlement.");
      return false;
    }
    const auditLog = createAuditLog(currentAppUser, "CREDIT_PAYMENT_RECORDED", "SALE", sale.id, sale, {
      payment,
      balance: sale.total - sale.amount_paid - payment.amount
    }, sale.store_id);
    try {
      const updated = await recordCreditPayment(sale, payment, auditLog);
      setSales(current => current.map(item => item.id === sale.id ? updated : item));
      setCreditCustomers(current => current.map(customer => customer.id === sale.credit_customer_id
        ? { ...customer, outstanding_balance: Math.max(0, customer.outstanding_balance - payment.amount), updated_at: payment.paid_at }
        : customer));
      setAuditLogs(current => [auditLog, ...current]);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer le paiement du revendeur.");
      return false;
    }
  };

  const handleRecordCreditFollowUp = async (sale: Sale, followUp: CreditFollowUp): Promise<boolean> => {
    if (!currentAppUser || (
      currentAppUser.roleId !== "ADMIN" &&
      currentAppUser.roleId !== "SUPER_ADMIN" &&
      !hasPermission(currentAppUser, "credit.manage")
    )) {
      alert("Seul le gestionnaire de crédit ou un administrateur peut consigner une relance.");
      return false;
    }
    const updatedSnapshot = {
      ...sale,
      credit_followups: [...(sale.credit_followups || []), followUp]
    };
    const auditLog = createAuditLog(currentAppUser, "CREDIT_FOLLOW_UP_RECORDED", "SALE", sale.id, sale, updatedSnapshot, sale.store_id);
    try {
      const updated = await recordCreditFollowUp(sale, followUp, auditLog);
      setSales(current => current.map(item => item.id === sale.id ? updated : item));
      setAuditLogs(current => [auditLog, ...current]);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer la relance du revendeur.");
      return false;
    }
  };

  const handleVerifySale = async (saleId: string) => {
    const sale = sales.find(item => item.id === saleId);
    if (!sale || !currentAppUser) return;
    const nextStatus = sale.status === "DRAFT" ? "CHECKING" : "VERIFIED";
    try {
      const result = await advanceSale(sale, nextStatus, currentAppUser.uid, currentAppUser.displayName);
      setSales(current => current.map(item => item.id === saleId ? result.sale : item));
      setAuditLogs(current => [result.auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de modifier la vente.");
    }
  };

  const handleApproveSale = async (saleId: string) => {
    const sale = sales.find(item => item.id === saleId);
    if (!sale || !currentAppUser) return;
    if (currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN") {
      alert("Seul un administrateur peut approuver une demande revendeur.");
      return;
    }
    try {
      const result = await approveSale(sale, currentAppUser.uid, currentAppUser.displayName);
      setSales(current => current.map(item => item.id === saleId ? result.sale : item));
      setAuditLogs(current => [result.auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'approuver la demande.");
    }
  };

  const handleValidateSale = async (saleId: string) => {
    const sale = sales.find(item => item.id === saleId);
    if (!sale || !currentAppUser) return;
    if (sale.customer_type === "REVENDEUR" && sale.status !== "APPROVED") {
      alert("La demande revendeur doit d'abord être approuvée par un administrateur.");
      return;
    }
    try {
      const result = await validateSale(sale, stocks, currentAppUser.uid, currentAppUser.displayName);
      setSales(current => current.map(item => item.id === saleId ? result.sale : item));
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      setAuditLogs(current => [result.auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de valider la vente.");
    }
  };

  const handleCancelSale = async (saleId: string) => {
    if (currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("L'annulation des ventes est réservée aux super administrateurs.");
      return;
    }
    const sale = sales.find(item => item.id === saleId);
    if (!sale || !currentAppUser) return;
    try {
      const result = await cancelSale(sale, currentAppUser.uid, currentAppUser.displayName, currentAppUser.roleId, stocks);
      setSales(current => current.map(item => item.id === saleId ? result.sale : item));
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      if (sale.credit_customer_id) {
        setCreditCustomers(current => current.map(customer => customer.id === sale.credit_customer_id
          ? {
              ...customer,
              outstanding_balance: Math.max(0, customer.outstanding_balance - result.releasedCredit),
              ...(result.releasedCredit > 0 ? { last_cancelled_credit_sale_id: sale.id } : {}),
              updated_at: Date.now()
            }
          : customer));
      }
      setAuditLogs(current => [result.auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'annuler la vente.");
    }
  };

  const handleDeleteSale = async (sale: Sale) => {
    if (currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("Suppression réservée aux super administrateurs.");
      return;
    }
    try {
      if (sale.status === "CANCELLED") {
        const result = await deleteCancelledSale(sale, currentAppUser.uid, currentAppUser.displayName);
        setSales(current => current.filter(item => item.id !== sale.id));
        if (result.updatedCustomer) {
          setCreditCustomers(current => current.map(customer =>
            customer.id === result.updatedCustomer?.id ? result.updatedCustomer : customer
          ));
        }
        setAuditLogs(current => [result.auditLog, ...current]);
        return;
      }
      const auditLog = createAuditLog(currentAppUser, "SALE_DRAFT_DELETED", "SALE", sale.id, sale, undefined, sale.store_id);
      const updatedCustomer = await deleteDraftSale(sale, currentAppUser.uid, auditLog);
      setSales(current => current.filter(item => item.id !== sale.id));
      if (updatedCustomer) {
        setCreditCustomers(current => current.map(customer =>
          customer.id === updatedCustomer.id ? updatedCustomer : customer
        ));
      }
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de supprimer la vente.");
    }
  };

  const handleConsumeMaterial = async (storeId: string, articleId: string, quantity: number, reason: string) => {
    const article = articles.find(item => item.id === articleId);
    const store = accessibleStores.find(store => store.id === storeId && store.is_active);
    if (!currentAppUser || !article || !store) {
      throw new Error("Magasin ou matière première inaccessible.");
    }
    const result = await consumeRawMaterial(currentAppUser, store, article, quantity, reason, stocks);
    setStocks(current => current.map(stock => stock.id === result.stock.id ? result.stock : stock));
    setMovements(current => [result.movement, ...current]);
    setAuditLogs(current => [result.auditLog, ...current]);
  };

  const handleCreateProduction = async (production: Production) => {
    try {
      const result = await createProduction(production, stocks);
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      setProductions(current => [production, ...current]);
      setAuditLogs(current => [result.auditLog, ...current]);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer la production.");
      return false;
    }
  };

  const handleUpdateDraftProduction = async (original: Production, production: Production): Promise<boolean> => {
    try {
      if (
        !currentAppUser ||
        !hasPermission(currentAppUser, "production.create") ||
        currentAppUser.uid !== original.created_by ||
        original.status !== "DRAFT"
      ) {
        throw new Error("Seul le créateur peut modifier une production en brouillon.");
      }
      const auditLog = createAuditLog(currentAppUser, "PRODUCTION_DRAFT_UPDATED", "PRODUCTION", production.id, original, production, production.manufacturer_store_id);
      const updated = await updateDraftProduction(original, production, currentAppUser.uid, auditLog);
      setProductions(current => current.map(item => item.id === updated.id ? updated : item));
      setAuditLogs(current => [auditLog, ...current]);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de modifier la production en brouillon.");
      return false;
    }
  };

  const handleDeleteDraftProduction = async (production: Production) => {
    if (currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("Suppression réservée aux super administrateurs.");
      return;
    }
    try {
      const auditLog = createAuditLog(currentAppUser, "PRODUCTION_DRAFT_DELETED", "PRODUCTION", production.id, production, undefined, production.manufacturer_store_id);
      await deleteDraftProduction(production, auditLog);
      setProductions(current => current.filter(item => item.id !== production.id));
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de supprimer la production en brouillon.");
    }
  };

  const handleInitiateProductionReturn = (transfer: StockTransfer) => {
    setTransfers(current => [transfer, ...current]);
    const auditLog = currentAppUser && createAuditLog(currentAppUser, "PRODUCTION_RETURN_CREATED", "TRANSFER", transfer.id, undefined, transfer, transfer.source_store_id);
    saveTransfer(transfer, auditLog || undefined).catch(error => {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer le retour de production dans Firestore.");
    });
  };

  const handleSaveTransfer = async (transfer: StockTransfer, originalTransfer?: StockTransfer): Promise<boolean> => {
    if (!currentAppUser || (
      currentAppUser.roleId !== "ADMIN" &&
      currentAppUser.roleId !== "SUPER_ADMIN" &&
      !hasPermission(currentAppUser, "transfers.create")
    )) {
      alert("Vous n'avez pas la permission de demander un transfert.");
      return false;
    }
    const isAdmin = currentAppUser.roleId === "ADMIN" || currentAppUser.roleId === "SUPER_ADMIN";
    const sourceStore = inventoryStores.find(store => store.id === transfer.source_store_id);
    const destinationStore = inventoryStores.find(store => store.id === transfer.destination_store_id);
    const isDirectDeposit = transfer.type === "DIRECT_DEPOSIT";
    if ((!isAdmin && !currentAppUser.storeIds.includes(transfer.source_store_id))
      || (isDirectDeposit
        ? transfer.source_store_id !== transfer.destination_store_id || destinationStore?.store_type !== "CENTRAL_WAREHOUSE"
        : transfer.source_store_id === transfer.destination_store_id)
      || !sourceStore?.is_active
      || !destinationStore?.is_active) {
      alert("Choisissez un magasin source qui vous est attribué et un autre magasin destinataire.");
      return false;
    }
    if (transfer.status !== "DRAFT" || transfer.requested_by !== currentAppUser.uid || transfer.lines.length === 0) {
      alert("La demande de transfert est invalide.");
      return false;
    }
    if (originalTransfer && (
      originalTransfer.status !== "DRAFT" ||
      originalTransfer.requested_by !== currentAppUser.uid ||
      transfer.id !== originalTransfer.id ||
      transfer.transfer_number !== originalTransfer.transfer_number ||
      transfer.created_at !== originalTransfer.created_at
    )) {
      alert("Seul le demandeur peut modifier un transfert encore en brouillon.");
      return false;
    }
    const rawMaterialsAllowed = ["CENTRAL_WAREHOUSE", "MANUFACTURER"].includes(sourceStore.store_type)
      && ["CENTRAL_WAREHOUSE", "MANUFACTURER"].includes(destinationStore.store_type);
    const allowedArticles = articles.filter(article => article.is_active && (rawMaterialsAllowed || article.article_type === "RESALE"));
    const requestedByArticle = new Map<string, number>();
    for (const line of transfer.lines) {
      if (!allowedArticles.some(article => article.id === line.article_id)
        || !Number.isFinite(line.quantity_sent)
        || line.quantity_sent <= 0) {
        alert("La demande contient un article ou une quantité invalide pour le magasin destinataire.");
        return false;
      }
      requestedByArticle.set(line.article_id, (requestedByArticle.get(line.article_id) || 0) + line.quantity_sent);
    }
    for (const [articleId, requestedQuantity] of requestedByArticle) {
      if (isDirectDeposit) break;
      const physicalStock = getArticleStock(stocks, sourceStore.id, articleId);
      const pendingQuantity = transfers
        .filter(item => item.id !== transfer.id && item.type !== "DIRECT_DEPOSIT" && item.source_store_id === sourceStore.id && ["DRAFT", "APPROVED"].includes(item.status))
        .flatMap(item => item.lines)
        .filter(line => line.article_id === articleId)
        .reduce((total, line) => total + line.quantity_sent, 0);
      const dispatchableStock = Math.max(0, physicalStock - pendingQuantity);
      if (requestedQuantity > dispatchableStock) {
        const article = articles.find(item => item.id === articleId);
        alert(`Stock insuffisant pour ${article?.name || "cet article"}. Demandé : ${requestedQuantity}. Disponible après les demandes en attente : ${dispatchableStock}.`);
        return false;
      }
    }
    try {
      const auditLog = createAuditLog(currentAppUser, originalTransfer ? "TRANSFER_DRAFT_UPDATED" : "TRANSFER_CREATED", "TRANSFER", transfer.id, originalTransfer, transfer, transfer.source_store_id);
      if (originalTransfer) await updateDraftTransfer(originalTransfer, transfer, auditLog);
      else await saveTransfer(transfer, auditLog);
      setTransfers(current => originalTransfer
        ? current.map(item => item.id === transfer.id ? transfer : item)
        : [transfer, ...current]);
      setAuditLogs(current => [auditLog, ...current]);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer le transfert dans Firestore.");
      return false;
    }
  };

  const handleCreateTransfer = (transfer: StockTransfer) => handleSaveTransfer(transfer);
  const handleUpdateTransfer = (originalTransfer: StockTransfer, transfer: StockTransfer) => handleSaveTransfer(transfer, originalTransfer);

  const handleCancelTransfer = async (transfer: StockTransfer) => {
    if (!currentAppUser || currentAppUser.roleId !== "SUPER_ADMIN") return;
    try {
      const result = await cancelTransfer(transfer, currentAppUser);
      setTransfers(current => current.map(item => item.id === transfer.id ? result.transfer : item));
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      setAuditLogs(current => [result.auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'annuler le transfert.");
    }
  };

  const handleDeleteTransfer = async (transfer: StockTransfer) => {
    if (currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("Suppression réservée aux super administrateurs.");
      return;
    }
    try {
      const action = transfer.status === "APPROVED" ? "TRANSFER_APPROVED_DELETED" : "TRANSFER_DRAFT_DELETED";
      const auditLog = createAuditLog(currentAppUser, action, "TRANSFER", transfer.id, transfer, undefined, transfer.source_store_id);
      await deleteDraftTransfer(transfer, auditLog);
      setTransfers(current => current.filter(item => item.id !== transfer.id));
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de supprimer le brouillon de transfert.");
    }
  };

  const handleApproveTransfer = async (transferId: string) => {
    const transfer = transfers.find(item => item.id === transferId);
    if (!transfer || transfer.status !== "DRAFT") return;
    if (!currentAppUser || !canApproveTransfer(currentAppUser, transfer, inventoryStores)) {
      alert("L’approbation nécessite un opérateur autorisé de l’atelier source pour un transfert entre ateliers, ou un administrateur différent du demandeur.");
      return;
    }
    const timestamp = Date.now();
    const updatedTransfer: StockTransfer = {
      ...transfer,
      status: "APPROVED",
      approved_by: currentAppUser?.uid,
      approved_by_name: currentAppUser?.displayName,
      approved_at: timestamp,
      updated_at: timestamp
    };
    try {
      const auditLog = createAuditLog(currentAppUser!, "TRANSFER_APPROVED", "TRANSFER", transfer.id, transfer, updatedTransfer, transfer.source_store_id);
      await saveTransfer(updatedTransfer, auditLog);
      setTransfers(current => current.map(item => item.id === transferId ? updatedTransfer : item));
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer l'approbation du transfert dans Firestore.");
    }
  };

  const handleRejectTransfer = async (transferId: string, rejectionNote: string): Promise<boolean> => {
    if (currentAppUser?.roleId !== "ADMIN" && currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("Seul un administrateur peut refuser un transfert.");
      return false;
    }
    const transfer = transfers.find(item => item.id === transferId);
    const note = rejectionNote.trim();
    if (!transfer || transfer.status !== "DRAFT") return false;
    if (transfer.requested_by === currentAppUser.uid) {
      alert("Un administrateur différent du demandeur doit traiter ce transfert.");
      return false;
    }
    if (!note) {
      alert("Indiquez le motif du refus.");
      return false;
    }
    const timestamp = Date.now();
    const updatedTransfer: StockTransfer = {
      ...transfer,
      status: "REJECTED",
      rejected_by: currentAppUser.uid,
      rejected_by_name: currentAppUser.displayName,
      rejected_at: timestamp,
      rejection_note: note,
      updated_at: timestamp
    };
    try {
      const auditLog = createAuditLog(currentAppUser, "TRANSFER_REJECTED", "TRANSFER", transfer.id, transfer, updatedTransfer, transfer.source_store_id);
      await saveTransfer(updatedTransfer, auditLog);
      setTransfers(current => current.map(item => item.id === transferId ? updatedTransfer : item));
      setAuditLogs(current => [auditLog, ...current]);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer le refus du transfert dans Firestore.");
      return false;
    }
  };

  const handleShipTransfer = async (transferId: string) => {
    if (!currentAppUser || !hasPermission(currentAppUser, "transfers.ship")) {
      alert("Vous n'avez pas la permission d'expédier un transfert.");
      return;
    }
    const transfer = transfers.find(item => item.id === transferId);
    if (!transfer || transfer.status !== "APPROVED") return;
    const isAdmin = currentAppUser.roleId === "ADMIN" || currentAppUser.roleId === "SUPER_ADMIN";
    if (!isAdmin && !currentAppUser.storeIds.includes(transfer.source_store_id)) {
      alert("Seul un utilisateur autorisé du magasin source peut expédier ce transfert.");
      return;
    }
    let updatedStocks = stocks;
    const movements: StockMovement[] = [];
    const shipFromQuarantine = transfer.type === "RECYCLING";
    for (const line of transfer.lines) {
      const stockRow = updatedStocks.find(stock => stock.store_id === transfer.source_store_id && stock.article_id === line.article_id);
      const available = (shipFromQuarantine ? stockRow?.quarantine_quantity : stockRow?.quantity) || 0;
      if (line.quantity_sent <= 0 || available - line.quantity_sent < 0) {
        alert(`Stock insuffisant pour ${line.article_name}. Disponible : ${available}.`);
        return;
      }
      const { newStocks, beforeQty, afterQty } = (shipFromQuarantine ? updateQuarantineQuantity : updateStockQuantity)(updatedStocks, transfer.source_store_id, line.article_id, -line.quantity_sent);
      updatedStocks = newStocks;
      movements.push({
        id: `movement-${transfer.id}-ship-${line.article_id}`,
        store_id: transfer.source_store_id,
        article_id: line.article_id,
        movement_type: transfer.type,
        ...(shipFromQuarantine ? { stock_bucket: "QUARANTINE" as const } : {}),
        quantity: -line.quantity_sent,
        reference_type: "TRANSFER",
        reference_id: transfer.id,
        reference_number: transfer.transfer_number,
        before_quantity: beforeQty,
        after_quantity: afterQty,
        created_by: currentAppUser?.uid || "",
        created_by_name: currentAppUser?.displayName || currentAppUser?.email || "Utilisateur",
        created_at: Date.now()
      });
    }
    const timestamp = Date.now();
    const updatedTransfer: StockTransfer = {
      ...transfer,
      status: "IN_TRANSIT",
      shipped_by: currentAppUser?.uid,
      shipped_by_name: currentAppUser?.displayName,
      shipped_at: timestamp,
      updated_at: timestamp
    };
    const changedStocks = updatedStocks.filter(stock =>
      transfer.lines.some(line => stock.store_id === transfer.source_store_id && stock.article_id === line.article_id)
    );
    try {
      const auditLog = createAuditLog(currentAppUser!, "TRANSFER_SHIPPED", "TRANSFER", transfer.id, transfer, updatedTransfer, transfer.source_store_id);
      const result = await saveTransferWithStockEffects(updatedTransfer, changedStocks, movements, auditLog);
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      setTransfers(current => current.map(item => item.id === transferId ? updatedTransfer : item));
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer l'expédition du transfert dans Firestore.");
    }
  };

  const handleReceiveTransfer = async (transferId: string, updatedLines: StockTransferLine[], receiverNote?: string) => {
    const transfer = transfers.find(item => item.id === transferId);
    if (!transfer || transfer.status !== "IN_TRANSIT") return;
    const isAssignedReceiver = Boolean(currentAppUser)
      && hasPermission(currentAppUser!, "transfers.receive")
      && currentAppUser!.storeIds.includes(transfer.destination_store_id)
      && currentAppUser!.uid !== transfer.requested_by
      && currentAppUser!.uid !== transfer.approved_by;
    if (!isAssignedReceiver) {
      alert("Un utilisateur autorisé du magasin destinataire, différent du demandeur et de l'approbateur, doit valider cette réception.");
      return;
    }
    if (updatedLines.some(line => line.quantity_received < 0 || line.quantity_received > line.quantity_sent || line.quantity_accepted < 0 || line.quantity_accepted > line.quantity_received)) {
      alert("Vérifiez les quantités reçues et acceptées : elles ne peuvent pas dépasser la quantité expédiée.");
      return;
    }
    const destinationStore = inventoryStores.find(store => store.id === transfer.destination_store_id);
    if (destinationStore?.store_type === "CENTRAL_WAREHOUSE") {
      const hasDiscrepancy = updatedLines.some(line => line.quantity_rejected > 0 || line.quantity_received !== line.quantity_sent);
      const timestamp = Date.now();
      const stagedTransfer: StockTransfer = {
        ...transfer,
        status: "RECEIVED",
        lines: updatedLines,
        received_by: currentAppUser!.uid,
        received_by_name: currentAppUser!.displayName,
        received_at: timestamp,
        has_discrepancy: hasDiscrepancy,
        note: receiverNote || transfer.note,
        updated_at: timestamp
      };
      try {
        const auditLog = createAuditLog(currentAppUser!, "TRANSFER_RECEIPT_RECORDED", "TRANSFER", transfer.id, transfer, stagedTransfer, transfer.destination_store_id);
        await recordTransferReceipt(stagedTransfer, auditLog);
        setTransfers(current => current.map(item => item.id === transferId ? stagedTransfer : item));
        setAuditLogs(current => [auditLog, ...current]);
      } catch (error) {
        alert(error instanceof Error ? error.message : "Impossible d'enregistrer la réception en attente de confirmation.");
      }
      return;
    }
    let updatedStocks = stocks;
    const movements: StockMovement[] = [];
    const receiveIntoQuarantine = transfer.type === "STORE_RETURN" || transfer.type === "RECYCLING";
    updatedLines.forEach(line => {
      if (line.quantity_accepted > 0) {
        const { newStocks, beforeQty, afterQty } = (receiveIntoQuarantine ? updateQuarantineQuantity : updateStockQuantity)(updatedStocks, transfer.destination_store_id, line.article_id, line.quantity_accepted);
        updatedStocks = newStocks;
        const isSupplierDelivery = transfer.type === "SUPPLIER_TO_STORE";
        movements.push({
          id: `movement-${transfer.id}-receive-${line.article_id}`,
          store_id: transfer.destination_store_id,
          article_id: line.article_id,
          movement_type: isSupplierDelivery ? "PURCHASE" : transfer.type,
          ...(receiveIntoQuarantine ? { stock_bucket: "QUARANTINE" as const } : {}),
          quantity: line.quantity_accepted,
          reference_type: isSupplierDelivery ? "PURCHASE" : "TRANSFER",
          reference_id: isSupplierDelivery ? transfer.purchase_id! : transfer.id,
          reference_number: isSupplierDelivery ? transfer.purchase_number || transfer.transfer_number : transfer.transfer_number,
          before_quantity: beforeQty,
          after_quantity: afterQty,
          created_by: currentAppUser?.uid || "",
          created_by_name: currentAppUser?.displayName || currentAppUser?.email || "Utilisateur",
          notes: isSupplierDelivery ? `Réception achat fournisseur ${transfer.supplier_name || transfer.source_name || ""}` : undefined,
          created_at: Date.now()
        });
      }
    });
    const hasDiscrepancy = updatedLines.some(line => line.quantity_rejected > 0 || line.quantity_received !== line.quantity_sent);
    const timestamp = Date.now();
    const updatedTransfer: StockTransfer = {
      ...transfer,
      status: hasDiscrepancy ? "DISCREPANCY" : "VALIDATED",
      lines: updatedLines,
      received_by: currentAppUser?.uid,
      received_by_name: currentAppUser?.displayName,
      received_at: timestamp,
      validated_by: currentAppUser?.uid,
      validated_by_name: currentAppUser?.displayName,
      validated_at: timestamp,
      has_discrepancy: hasDiscrepancy,
      note: receiverNote || transfer.note,
      updated_at: timestamp
    };
    const changedStocks = updatedStocks.filter(stock =>
      transfer.lines.some(line => stock.store_id === transfer.destination_store_id && stock.article_id === line.article_id)
    );
    try {
      const auditLog = createAuditLog(currentAppUser, hasDiscrepancy ? "TRANSFER_DISCREPANCY_RECORDED" : "TRANSFER_RECEIVED", "TRANSFER", transfer.id, transfer, updatedTransfer, transfer.destination_store_id);
      const purchaseAuditLog = transfer.purchase_id
        ? createAuditLog(
            currentAppUser,
            "PURCHASE_RECEIVED",
            "PURCHASE",
            transfer.purchase_id,
            { status: "APPROVED", transfer_id: transfer.id },
            { status: "RECEIVED", transfer_id: transfer.id, received_by: currentAppUser.uid, received_by_name: currentAppUser.displayName, received_at: timestamp },
            transfer.destination_store_id
          )
        : undefined;
      const result = await saveTransferWithStockEffects(updatedTransfer, changedStocks, movements, auditLog, purchaseAuditLog);
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      setTransfers(current => current.map(item => item.id === transferId ? updatedTransfer : item));
      setAuditLogs(current => [auditLog, ...(purchaseAuditLog ? [purchaseAuditLog] : []), ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer la réception du transfert dans Firestore.");
    }
  };

  const handleReceiveDirectDeposit = async (transferId: string, receiverNote?: string) => {
    const transfer = transfers.find(item => item.id === transferId);
    if (!transfer || transfer.type !== "DIRECT_DEPOSIT" || transfer.status !== "APPROVED" || !currentAppUser) return;
    if (!hasPermission(currentAppUser, "transfers.receive")
      || !currentAppUser.storeIds.includes(transfer.destination_store_id)
      || currentAppUser.uid === transfer.approved_by) {
      alert("Seul un responsable du dépôt, différent de l'approbateur, peut réceptionner ce dépôt.");
      return;
    }
    const timestamp = Date.now();
    const lines = transfer.lines.map(line => ({
      ...line,
      quantity_received: line.quantity_sent,
      quantity_accepted: line.quantity_sent,
      quantity_rejected: 0
    }));
    let updatedStocks = stocks;
    const movements: StockMovement[] = [];
    for (const line of lines) {
      const { newStocks, beforeQty, afterQty } = updateStockQuantity(updatedStocks, transfer.destination_store_id, line.article_id, line.quantity_accepted);
      updatedStocks = newStocks;
      movements.push({
        id: `movement-${transfer.id}-deposit-${line.article_id}`,
        store_id: transfer.destination_store_id,
        article_id: line.article_id,
        movement_type: "PURCHASE",
        quantity: line.quantity_accepted,
        reference_type: "STOCK_DEPOSIT",
        reference_id: transfer.id,
        reference_number: transfer.transfer_number,
        before_quantity: beforeQty,
        after_quantity: afterQty,
        created_by: currentAppUser.uid,
        created_by_name: currentAppUser.displayName || currentAppUser.email || "Utilisateur",
        notes: "Dépôt direct validé par un administrateur",
        created_at: timestamp
      });
    }
    const updatedTransfer: StockTransfer = {
      ...transfer,
      status: "VALIDATED",
      lines,
      received_by: currentAppUser.uid,
      received_by_name: currentAppUser.displayName,
      received_at: timestamp,
      validated_by: currentAppUser.uid,
      validated_by_name: currentAppUser.displayName,
      validated_at: timestamp,
      has_discrepancy: false,
      note: receiverNote || transfer.note,
      updated_at: timestamp
    };
    const changedStocks = updatedStocks.filter(stock =>
      stock.store_id === transfer.destination_store_id && lines.some(line => line.article_id === stock.article_id)
    );
    try {
      const auditLog = createAuditLog(currentAppUser, "DIRECT_DEPOSIT_RECEIVED", "TRANSFER", transfer.id, transfer, updatedTransfer, transfer.destination_store_id);
      const result = await saveTransferWithStockEffects(updatedTransfer, changedStocks, movements, auditLog);
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      setTransfers(current => current.map(item => item.id === transferId ? updatedTransfer : item));
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer la réception du dépôt.");
    }
  };

  const handleConfirmCentralReceipt = async (transferId: string) => {
    const transfer = transfers.find(item => item.id === transferId);
    if (!transfer || transfer.status !== "RECEIVED" || !currentAppUser) return;
    if (inventoryStores.find(store => store.id === transfer.destination_store_id)?.store_type !== "CENTRAL_WAREHOUSE") {
      alert("Cette double confirmation est réservée aux entrées du dépôt central.");
      return;
    }
    const isAssignedConfirmer = hasPermission(currentAppUser, "transfers.receive")
      && currentAppUser.storeIds.includes(transfer.destination_store_id)
      && currentAppUser.uid !== transfer.received_by
      && currentAppUser.uid !== transfer.requested_by
      && currentAppUser.uid !== transfer.approved_by;
    if (!isAssignedConfirmer) {
      alert("Un autre utilisateur autorisé du dépôt central doit confirmer cette réception.");
      return;
    }
    if (transfer.lines.some(line =>
      line.quantity_received < 0 ||
      line.quantity_received > line.quantity_sent ||
      line.quantity_accepted < 0 ||
      line.quantity_accepted > line.quantity_received
    )) {
      alert("Les quantités enregistrées sont invalides. Rechargez les données et vérifiez la réception.");
      return;
    }

    let updatedStocks = stocks;
    const movements: StockMovement[] = [];
    const receiveIntoQuarantine = transfer.type === "STORE_RETURN" || transfer.type === "RECYCLING";
    const isSupplierDelivery = transfer.type === "SUPPLIER_TO_STORE";
    transfer.lines.forEach(line => {
      if (line.quantity_accepted <= 0) return;
      const { newStocks, beforeQty, afterQty } = (receiveIntoQuarantine ? updateQuarantineQuantity : updateStockQuantity)(
        updatedStocks,
        transfer.destination_store_id,
        line.article_id,
        line.quantity_accepted
      );
      updatedStocks = newStocks;
      movements.push({
        id: `movement-${transfer.id}-receive-${line.article_id}`,
        store_id: transfer.destination_store_id,
        article_id: line.article_id,
        movement_type: isSupplierDelivery ? "PURCHASE" : transfer.type,
        ...(receiveIntoQuarantine ? { stock_bucket: "QUARANTINE" as const } : {}),
        quantity: line.quantity_accepted,
        reference_type: isSupplierDelivery ? "PURCHASE" : "TRANSFER",
        reference_id: isSupplierDelivery ? transfer.purchase_id! : transfer.id,
        reference_number: isSupplierDelivery ? transfer.purchase_number || transfer.transfer_number : transfer.transfer_number,
        before_quantity: beforeQty,
        after_quantity: afterQty,
        created_by: currentAppUser.uid,
        created_by_name: currentAppUser.displayName || currentAppUser.email,
        notes: isSupplierDelivery ? `Réception achat fournisseur ${transfer.supplier_name || transfer.source_name || ""}` : undefined,
        created_at: Date.now()
      });
    });

    const timestamp = Date.now();
    const finalStatus = transfer.has_discrepancy ? "DISCREPANCY" : "VALIDATED";
    const confirmedTransfer: StockTransfer = {
      ...transfer,
      status: finalStatus,
      validated_by: currentAppUser.uid,
      validated_by_name: currentAppUser.displayName || currentAppUser.email,
      validated_at: timestamp,
      updated_at: timestamp
    };
    const changedStocks = updatedStocks.filter(stock =>
      transfer.lines.some(line => stock.store_id === transfer.destination_store_id && stock.article_id === line.article_id)
    );
    try {
      const auditLog = createAuditLog(currentAppUser, "TRANSFER_RECEIPT_CONFIRMED", "TRANSFER", transfer.id, transfer, confirmedTransfer, transfer.destination_store_id);
      const purchaseAuditLog = transfer.purchase_id
        ? createAuditLog(
            currentAppUser,
            "PURCHASE_RECEIVED",
            "PURCHASE",
            transfer.purchase_id,
            { status: "APPROVED", transfer_id: transfer.id },
            { status: "RECEIVED", transfer_id: transfer.id, received_by: transfer.received_by, received_by_name: transfer.received_by_name, received_at: transfer.received_at },
            transfer.destination_store_id
          )
        : undefined;
      const result = await saveTransferWithStockEffects(confirmedTransfer, changedStocks, movements, auditLog, purchaseAuditLog);
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      setTransfers(current => current.map(item => item.id === transferId ? confirmedTransfer : item));
      setAuditLogs(current => [auditLog, ...(purchaseAuditLog ? [purchaseAuditLog] : []), ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de confirmer cette entrée de stock.");
    }
  };

  const handleResolveTransferDiscrepancy = async (transferId: string, resolutionNote: string) => {
    const transfer = transfers.find(item => item.id === transferId);
    if (!transfer || transfer.status !== "DISCREPANCY") return;
    const updatedTransfer: StockTransfer = {
      ...transfer,
      discrepancy_resolved: true,
      discrepancy_resolution_note: resolutionNote,
      updated_at: Date.now()
    };
    try {
      const auditLog = createAuditLog(currentAppUser!, "TRANSFER_DISCREPANCY_RESOLVED", "TRANSFER", transfer.id, transfer, updatedTransfer, transfer.destination_store_id);
      await saveTransfer(updatedTransfer, auditLog);
      setTransfers(current => current.map(item => item.id === transferId ? updatedTransfer : item));
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer la résolution de l'écart dans Firestore.");
    }
  };

  const handleDecideRecycling = async (
    transferId: string,
    decisions: Array<{ lineId: string; decision: RecyclingDecision; note?: string }>
  ): Promise<boolean> => {
    const transfer = transfers.find(item => item.id === transferId);
    if (!currentAppUser || !transfer || transfer.type !== "RECYCLING" || !["VALIDATED", "DISCREPANCY"].includes(transfer.status)) return false;
    const canDecide = (hasPermission(currentAppUser, "production.create") || hasPermission(currentAppUser, "production.validate"))
      && currentAppUser.storeIds.includes(transfer.destination_store_id);
    if (!canDecide) {
      alert("Seul le magasin de production destinataire peut décider du sort de ces articles.");
      return false;
    }
    const timestamp = Date.now();
    let updatedStocks = stocks;
    const movements: StockMovement[] = [];
    let decidedCount = 0;
    const lines = transfer.lines.map(line => {
      const choice = decisions.find(item => item.lineId === line.id);
      if (!choice || line.recycling_decision || line.quantity_accepted <= 0) return line;
      const decidedFields = {
        recycling_decision: choice.decision,
        recycling_decided_by: currentAppUser.uid,
        recycling_decided_by_name: currentAppUser.displayName || currentAppUser.email,
        recycling_decided_at: timestamp,
        recycling_note: choice.note || ""
      };
      // « Recyclé » : le stock reste à recycler et sera consommé par un ordre de fabrication.
      if (choice.decision === "RECYCLED") {
        decidedCount += 1;
        return { ...line, ...decidedFields, recycled_available: true };
      }
      decidedCount += 1;
      const { newStocks, beforeQty, afterQty } = updateQuarantineQuantity(updatedStocks, transfer.destination_store_id, line.article_id, -line.quantity_accepted);
      if (afterQty < 0) throw new Error(`Stock à recycler insuffisant en production pour ${line.article_name}. Disponible : ${beforeQty}.`);
      updatedStocks = newStocks;
      movements.push({
        id: `movement-${transfer.id}-recycling-${line.id}`,
        store_id: transfer.destination_store_id,
        article_id: line.article_id,
        stock_bucket: "QUARANTINE",
        movement_type: "LOSS",
        quantity: -line.quantity_accepted,
        reference_type: "RECYCLING",
        reference_id: transfer.id,
        reference_number: transfer.transfer_number,
        before_quantity: beforeQty,
        after_quantity: afterQty,
        created_by: currentAppUser.uid,
        created_by_name: currentAppUser.displayName || currentAppUser.email || "Utilisateur",
        notes: `${RECYCLING_DECISION_LABELS[choice.decision]}${line.return_reason ? ` — ${RETURN_REASON_LABELS[line.return_reason]}` : ""}${choice.note ? ` — ${choice.note}` : ""}`,
        created_at: timestamp
      });
      return {
        ...line,
        ...decidedFields
      };
    });
    if (decidedCount === 0) return false;
    const updatedTransfer: StockTransfer = { ...transfer, lines, updated_at: Math.max(timestamp, transfer.updated_at + 1) };
    const changedStocks = updatedStocks.filter(stock =>
      movements.some(movement => movement.store_id === stock.store_id && movement.article_id === stock.article_id)
    );
    try {
      const auditLog = createAuditLog(currentAppUser, "RECYCLING_DECIDED", "TRANSFER", transfer.id, transfer, updatedTransfer, transfer.destination_store_id);
      const result = await saveTransferWithStockEffects(updatedTransfer, changedStocks, movements, auditLog, undefined, { recyclingDecision: true });
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      setTransfers(current => current.map(item => item.id === transferId ? updatedTransfer : item));
      setAuditLogs(current => [auditLog, ...current]);
      return true;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer la décision de recyclage.");
      return false;
    }
  };

  const handleAdjustStock = async (storeId: string, articleId: string, newQty: number, reason: string, isDeposit = false) => {
    const targetStore = inventoryStores.find(store => store.id === storeId);
    const canManageCentralStock = (currentAppUser?.roleId === "ADMIN" || currentAppUser?.roleId === "SUPER_ADMIN") && targetStore?.store_type === "CENTRAL_WAREHOUSE";
    if (!canManageCentralStock) {
      alert("Le stock ne peut être créé ou ajusté que par un administrateur dans le dépôt central.");
      return;
    }
    const currentQty = stocks.find(stock => stock.store_id === storeId && stock.article_id === articleId)?.quantity || 0;
    const { newStocks, beforeQty, afterQty } = updateStockQuantity(stocks, storeId, articleId, newQty - currentQty);
    const updatedStock = newStocks.find(stock => stock.store_id === storeId && stock.article_id === articleId);
    if (!updatedStock) return;
    const timestamp = Date.now();
    const movementId = `movement-${crypto.randomUUID()}`;
    const movement: StockMovement = {
      id: movementId,
      store_id: storeId,
      article_id: articleId,
      movement_type: isDeposit ? "PURCHASE" : "INVENTORY_ADJUSTMENT",
      quantity: afterQty - beforeQty,
      reference_type: isDeposit ? "STOCK_DEPOSIT" : "INVENTORY_ADJUSTMENT",
      reference_id: movementId,
      reference_number: generateRef(isDeposit ? "DEP" : "ADJ", movements.length),
      before_quantity: beforeQty,
      after_quantity: afterQty,
      created_by: currentAppUser?.uid || "",
      created_by_name: currentAppUser?.displayName || currentAppUser?.email || "Utilisateur",
      notes: reason,
      created_at: timestamp
    };
    try {
      const auditLog = createAuditLog(currentAppUser!, "STOCK_ADJUSTED", "STOCK", updatedStock.id, { quantity: beforeQty }, { quantity: afterQty, reason }, storeId);
      await saveStockAdjustment(updatedStock, afterQty, movement, auditLog);
      setStocks(newStocks);
      setMovements(current => [movement, ...current]);
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer l'ajustement dans Firestore.");
    }
  };

  const handleSaveInventoryCount = async (count: InventoryCount, submit: boolean) => {
    if (!currentAppUser || !canCountInventory || user?.status !== "ACTIVE") throw new Error("Vous n'êtes pas autorisé à saisir un inventaire.");
    if ((!isInventoryAdmin && !currentAppUser.storeIds.includes(count.store_id)) || count.created_by !== currentAppUser.uid) throw new Error("Ce magasin n'est pas dans votre périmètre.");
    const previous = inventoryCounts.find(item => item.id === count.id);
    if (previous && previous.status !== "DRAFT") throw new Error("Cet inventaire n'est plus modifiable.");
    if (submit && !count.manager_id && !count.signature_waived) throw new Error("Désignez le responsable du magasin qui doit signer.");
    const auditLog = createAuditLog(currentAppUser, submit ? (count.signature_waived ? "INVENTORY_COUNT_SUBMITTED_WITHOUT_SIGNATURE" : "INVENTORY_COUNT_SENT_FOR_SIGNATURE") : "INVENTORY_COUNT_DRAFT_SAVED", "INVENTORY_COUNT", count.id, previous, count, count.store_id);
    await saveInventoryCount(count, auditLog);
    setInventoryCounts(current => [count, ...current.filter(item => item.id !== count.id)]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleSignInventoryCount = async (count: InventoryCount) => {
    if (!currentAppUser || user?.status !== "ACTIVE" || count.manager_id !== currentAppUser.uid) throw new Error("Seul le responsable désigné peut signer ce comptage.");
    const name = currentAppUser.displayName || currentAppUser.email;
    const auditLog = createAuditLog(currentAppUser, "INVENTORY_COUNT_SIGNED", "INVENTORY_COUNT", count.id, { status: count.status }, { status: "SUBMITTED", presence_attested_by: name }, count.store_id);
    const signed = await signInventoryCount(count, { id: currentAppUser.uid, name }, auditLog);
    setInventoryCounts(current => current.map(item => item.id === count.id ? signed : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleRefuseInventorySignature = async (count: InventoryCount, note: string) => {
    if (!currentAppUser || user?.status !== "ACTIVE" || count.manager_id !== currentAppUser.uid) throw new Error("Seul le responsable désigné peut refuser ce comptage.");
    const auditLog = createAuditLog(currentAppUser, "INVENTORY_COUNT_SIGNATURE_REFUSED", "INVENTORY_COUNT", count.id, { status: count.status }, { status: "REJECTED", note }, count.store_id);
    const refused = await refuseInventorySignature(count, { id: currentAppUser.uid, name: currentAppUser.displayName || currentAppUser.email }, note, auditLog);
    setInventoryCounts(current => current.map(item => item.id === count.id ? refused : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleDeleteInventoryDraft = async (count: InventoryCount) => {
    if (!currentAppUser || count.created_by !== currentAppUser.uid) throw new Error("Vous ne pouvez supprimer que vos brouillons.");
    await deleteInventoryCountDraft(count);
    setInventoryCounts(current => current.filter(item => item.id !== count.id));
  };

  const handleValidateInventoryCount = async (count: InventoryCount, decisions: Record<string, InventoryReasonDecision>, note: string) => {
    if (!currentAppUser || !canReviewInventory || user?.status !== "ACTIVE") throw new Error("Seul un administrateur peut valider un inventaire.");
    const result = await validateInventoryCount(
      count,
      decisions,
      { id: currentAppUser.uid, name: currentAppUser.displayName || currentAppUser.email },
      note,
      stocks,
      validated => createAuditLog(currentAppUser, "INVENTORY_COUNT_VALIDATED", "INVENTORY_COUNT", count.id, { status: count.status }, {
        status: validated.status,
        total_charged_amount: validated.total_charged_amount,
        charged_to: validated.charged_to_name,
        rejected_reasons: validated.lines.filter(line => line.decision === "REJECTED").map(line => line.article_name)
      }, count.store_id)
    );
    setInventoryCounts(current => current.map(item => item.id === count.id ? result.count : item));
    setStocks(current => {
      const updated = new Map(result.stocks.map(stock => [stock.id, stock]));
      const known = new Set(current.map(stock => stock.id));
      return [...current.map(stock => updated.get(stock.id) || stock), ...result.stocks.filter(stock => !known.has(stock.id))];
    });
    setMovements(current => [...result.movements, ...current]);
  };

  const handleRejectInventoryCount = async (count: InventoryCount, note: string) => {
    if (!currentAppUser || !canReviewInventory || user?.status !== "ACTIVE") throw new Error("Seul un administrateur peut rejeter un inventaire.");
    const auditLog = createAuditLog(currentAppUser, "INVENTORY_COUNT_REJECTED", "INVENTORY_COUNT", count.id, { status: count.status }, { status: "REJECTED", note }, count.store_id);
    const rejected = await rejectInventoryCount(count, { id: currentAppUser.uid, name: currentAppUser.displayName || currentAppUser.email }, note, auditLog);
    setInventoryCounts(current => current.map(item => item.id === count.id ? rejected : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const settleInventoryCounts = async (counts: InventoryCount[], method: "PAYSLIP" | "ADVANCE" | "OTHER", reference: string, note: string, payslipId?: string) => {
    if (!currentAppUser || !canReviewInventory || user?.status !== "ACTIVE") throw new Error("Seul un administrateur peut marquer une retenue comme déduite.");
    const settlement = {
      settled_at: Date.now(),
      settled_by: currentAppUser.uid,
      settled_by_name: currentAppUser.displayName || currentAppUser.email,
      method,
      reference,
      payslip_id: payslipId,
      note: note || undefined
    };
    const auditLog = createAuditLog(currentAppUser, "INVENTORY_CHARGE_SETTLED", "INVENTORY_COUNT", counts.map(count => count.id).join(","), undefined, { ...settlement, counts: counts.map(count => count.count_number) });
    const updated = await settleInventoryCharges(counts, settlement, auditLog);
    setInventoryCounts(current => current.map(item => updated.find(count => count.id === item.id) || item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleCreateStore = async (store: Store) => {
    const auditLog = createAuditLog(currentAppUser!, "STORE_CREATED", "STORE", store.id, undefined, store);
    await saveStore(store, auditLog);
    setInventoryStores(current => [...current, store]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleUpdateStore = async (store: Store) => {
    const previous = inventoryStores.find(item => item.id === store.id);
    const auditLog = createAuditLog(currentAppUser!, "STORE_UPDATED", "STORE", store.id, previous, store);
    await saveStore(store, auditLog);
    setInventoryStores(current => current.map(item => item.id === store.id ? store : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleToggleStoreStatus = async (storeId: string) => {
    const store = inventoryStores.find(item => item.id === storeId);
    if (!store) return;
    await handleUpdateStore({ ...store, is_active: !store.is_active, updated_at: Date.now() });
  };

  const handleDeleteStore = async (storeId: string) => {
    const previous = inventoryStores.find(item => item.id === storeId);
    const auditLog = createAuditLog(currentAppUser!, "STORE_DELETED", "STORE", storeId, previous);
    await deleteStore(storeId, auditLog);
    setInventoryStores(current => current.filter(store => store.id !== storeId));
    setStocks(current => current.filter(stock => stock.store_id !== storeId));
    setManagedUsers(current => current.map(managedUser => ({
      ...managedUser,
      storeIds: managedUser.storeIds.filter(id => id !== storeId)
    })));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleCreateArticle = async (article: Article) => {
    const allowedTypes = user?.visibleArticleTypes ?? DEFAULT_ARTICLE_VISIBILITY[user?.role as AppRoleId] ?? [];
    if (!allowedTypes.includes(article.article_type)) throw new Error("Vous ne pouvez pas créer ce type d'article.");
    const auditLog = createAuditLog(currentAppUser!, "ARTICLE_CREATED", "ARTICLE", article.id, undefined, article);
    await saveArticle(article, auditLog);
    setArticles(current => [...current, article]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleUpdateArticle = async (article: Article) => {
    const allowedTypes = user?.visibleArticleTypes ?? DEFAULT_ARTICLE_VISIBILITY[user?.role as AppRoleId] ?? [];
    if (!allowedTypes.includes(article.article_type)) throw new Error("Vous ne pouvez pas modifier ce type d'article.");
    const previous = articles.find(item => item.id === article.id);
    const auditLog = createAuditLog(currentAppUser!, "ARTICLE_UPDATED", "ARTICLE", article.id, previous, article);
    await saveArticle(article, auditLog);
    setArticles(current => current.map(item => item.id === article.id ? article : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleToggleArticleStatus = async (articleId: string) => {
    const article = articles.find(item => item.id === articleId);
    if (article) await handleUpdateArticle({ ...article, is_active: !article.is_active, updated_at: Date.now() });
  };

  const handleCreateCategory = async (category: Category) => {
    const auditLog = createAuditLog(currentAppUser!, "CATEGORY_CREATED", "CATEGORY", category.id, undefined, category);
    await saveCategory(category, auditLog);
    setCategories(current => [...current, category]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleCreateUnit = async (unit: UnitOfMeasure) => {
    const auditLog = createAuditLog(currentAppUser!, "UNIT_CREATED", "UNIT", unit.id, undefined, unit);
    await saveUnit(unit, auditLog);
    setUnits(current => [...current, unit].sort((left, right) => left.name.localeCompare(right.name, "fr")));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleToggleUnit = async (unit: UnitOfMeasure) => {
    if (!unit.is_active && articles.some(article => article.unit.toLocaleLowerCase("fr-FR") === unit.name.toLocaleLowerCase("fr-FR"))) {
      throw new Error("Cette unité est encore associée à un article et ne peut pas être désactivée.");
    }
    const previous = units.find(item => item.id === unit.id);
    const auditLog = createAuditLog(currentAppUser!, "UNIT_UPDATED", "UNIT", unit.id, previous, unit);
    await saveUnit(unit, auditLog);
    setUnits(current => current.map(item => item.id === unit.id ? unit : item));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleDeleteUnit = async (unitId: string) => {
    const unit = units.find(item => item.id === unitId);
    if (!unit) return;
    if (articles.some(article => article.unit.toLocaleLowerCase("fr-FR") === unit.name.toLocaleLowerCase("fr-FR"))) {
      throw new Error("Cette unité est encore associée à un article et ne peut pas être supprimée.");
    }
    const auditLog = createAuditLog(currentAppUser!, "UNIT_DELETED", "UNIT", unitId, unit);
    await deleteUnit(unitId, auditLog);
    setUnits(current => current.filter(item => item.id !== unitId));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleToggleCategoryStatus = async (categoryId: string) => {
    const category = categories.find(item => item.id === categoryId);
    if (!category) return;
    const updated = { ...category, is_active: !category.is_active, updated_at: Date.now() };
    const auditLog = createAuditLog(currentAppUser!, "CATEGORY_UPDATED", "CATEGORY", categoryId, category, updated);
    await saveCategory(updated, auditLog);
    setCategories(current => current.map(item => item.id === categoryId ? updated : item));
    setAuditLogs(current => [auditLog, ...current]);
  };
  
  const handleImportCatalogData = async (data: { articles: Article[]; categories: Category[] }) => {
    if (!data || !Array.isArray(data.articles) || !Array.isArray(data.categories)) {
      throw new Error("Le fichier catalogue doit contenir les tableaux articles et catégories.");
    }
    const allowedTypes = user?.visibleArticleTypes ?? DEFAULT_ARTICLE_VISIBILITY[user?.role as AppRoleId] ?? [];
    if (data.articles.some(article => !allowedTypes.includes(article.article_type))) {
      throw new Error("Le fichier contient un type d'article que votre compte n'est pas autorisé à voir ou gérer.");
    }
    const auditLogs = [
      ...data.articles.map(article => createAuditLog(
        currentAppUser!, "ARTICLE_IMPORTED", "ARTICLE", article.id,
        articles.find(existing => existing.id === article.id), article
      )),
      ...data.categories.map(category => createAuditLog(
        currentAppUser!, "CATEGORY_IMPORTED", "CATEGORY", category.id,
        categories.find(existing => existing.id === category.id), category
      ))
    ];
    await Promise.all([
      ...data.articles.map((article, index) => saveArticle(article, auditLogs[index])),
      ...data.categories.map((category, index) => saveCategory(category, auditLogs[data.articles.length + index]))
    ]);
    setArticles(data.articles);
    setCategories(data.categories);
    setAuditLogs(current => [...auditLogs, ...current]);
  };
  
  const handleResetCatalogData = async () => {
    const timestamp = Date.now();
    const resetArticles = articles.map(article => ({ ...article, is_active: false, updated_at: timestamp }));
    const resetCategories = categories.map(category => ({ ...category, is_active: false, updated_at: timestamp }));
    const auditLogs = [
      ...resetArticles.map(article => createAuditLog(currentAppUser!, "ARTICLE_DEACTIVATED", "ARTICLE", article.id, articles.find(item => item.id === article.id), article)),
      ...resetCategories.map(category => createAuditLog(currentAppUser!, "CATEGORY_DEACTIVATED", "CATEGORY", category.id, categories.find(item => item.id === category.id), category))
    ];
    await Promise.all([
      ...resetArticles.map((article, index) => saveArticle(article, auditLogs[index])),
      ...resetCategories.map((category, index) => saveCategory(category, auditLogs[resetArticles.length + index]))
    ]);
    setArticles(resetArticles);
    setCategories(resetCategories);
    setAuditLogs(current => [...auditLogs, ...current]);
  };
  
  const handleImportStores = async (data: Store[]) => {
    if (!Array.isArray(data) || data.some(store => !store.id || !store.code || !store.name)) {
      throw new Error("Le fichier magasins est invalide.");
    }
    const auditLogs = data.map(store => createAuditLog(
      currentAppUser!, "STORE_IMPORTED", "STORE", store.id,
      inventoryStores.find(existing => existing.id === store.id), store
    ));
    await Promise.all(data.map((store, index) => saveStore(store, auditLogs[index])));
    setInventoryStores(data);
    setAuditLogs(current => [...auditLogs, ...current]);
  };
  
  const handleResetStores = async () => {
    throw new Error("La réinitialisation globale des magasins est désactivée en production. Désactivez les magasins individuellement.");
  };

  const handleCreateSupplier = async (supplier: Supplier) => {
    if (!currentAppUser || !hasProcurementPermission(currentAppUser)) throw new Error("Vous ne disposez pas de la permission de gérer les fournisseurs.");
    const auditLog = createAuditLog(currentAppUser!, "SUPPLIER_CREATED", "SUPPLIER", supplier.id, undefined, supplier);
    await saveSupplier(supplier, auditLog);
    setSuppliers(current => [...current, supplier]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleToggleSupplier = async (supplier: Supplier) => {
    if (!currentAppUser || !hasProcurementPermission(currentAppUser)) throw new Error("Vous ne disposez pas de la permission de gérer les fournisseurs.");
    const previous = suppliers.find(item => item.id === supplier.id);
    const auditLog = createAuditLog(currentAppUser!, "SUPPLIER_UPDATED", "SUPPLIER", supplier.id, previous, supplier);
    await saveSupplier(supplier, auditLog);
    setSuppliers(current => current.map(item => item.id === supplier.id ? supplier : item));
    setAuditLogs(current => [auditLog, ...current]);
  };
  
  const handleImportSuppliers = async (data: Supplier[]) => {
    if (!currentAppUser || currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN") {
      throw new Error("Seul un administrateur peut importer les fournisseurs en lot.");
    }
    if (!Array.isArray(data) || data.some(supplier => !supplier.id || !supplier.name)) {
      throw new Error("Le fichier fournisseurs est invalide.");
    }
    const auditLogs = data.map(supplier => createAuditLog(
      currentAppUser!, "SUPPLIER_IMPORTED", "SUPPLIER", supplier.id,
      suppliers.find(existing => existing.id === supplier.id), supplier
    ));
    await Promise.all(data.map((supplier, index) => saveSupplier(supplier, auditLogs[index])));
    setSuppliers(data);
    setAuditLogs(current => [...auditLogs, ...current]);
  };
  
  const handleResetSuppliers = async () => {
    if (!currentAppUser || currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN") {
      throw new Error("Seul un administrateur peut désactiver tous les fournisseurs.");
    }
    const resetSuppliers = suppliers.map(supplier => ({ ...supplier, is_active: false, updated_at: Date.now() }));
    const auditLogs = resetSuppliers.map(supplier => createAuditLog(
      currentAppUser!, "SUPPLIER_DEACTIVATED", "SUPPLIER", supplier.id,
      suppliers.find(item => item.id === supplier.id), supplier
    ));
    await Promise.all(resetSuppliers.map((supplier, index) => saveSupplier(supplier, auditLogs[index])));
    setSuppliers(resetSuppliers);
    setAuditLogs(current => [...auditLogs, ...current]);
  };

  const handleCreatePurchase = async (purchase: Purchase) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !hasProcurementPermission(currentAppUser)) {
      throw new Error("Vous ne disposez pas de la permission de créer un achat.");
    }
    if (currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN" && !currentAppUser.storeIds.includes(purchase.store_id)) {
      throw new Error("Vous ne pouvez créer un achat que pour un magasin qui vous est attribué.");
    }
    const auditLog = createAuditLog(currentAppUser, "PURCHASE_DRAFT_CREATED", "PURCHASE", purchase.id, undefined, purchase, purchase.store_id);
    await saveDraftPurchase(purchase, auditLog);
    setPurchases(current => [purchase, ...current]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleApprovePurchase = async (purchase: Purchase) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !hasProcurementPermission(currentAppUser)) {
      throw new Error("Vous ne disposez pas de la permission d'approuver un achat.");
    }
    if (purchase.status !== "DRAFT" || !purchase.created_by) {
      throw new Error("Seul un achat en brouillon peut être approuvé.");
    }
    if (currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN" && !currentAppUser.storeIds.includes(purchase.store_id)) {
      throw new Error("Vous ne pouvez approuver que les achats d'un magasin qui vous est attribué.");
    }
    const timestamp = Date.now();
    const transferId = `trf-purchase-${purchase.id}`;
    const updatedPurchase: Purchase = {
      ...purchase,
      status: "APPROVED",
      approved_by: currentAppUser.uid,
      approved_by_name: currentAppUser.displayName,
      approved_at: timestamp,
      transfer_id: transferId,
      updated_at: timestamp
    };
    const transfer: StockTransfer = {
      id: transferId,
      transfer_number: generateRef("TRF", transfers.length),
      type: "SUPPLIER_TO_STORE",
      source_store_id: `supplier-${purchase.supplier_id}`,
      source_name: purchase.supplier_name,
      destination_store_id: purchase.store_id,
      purchase_id: purchase.id,
      purchase_number: purchase.purchase_number,
      supplier_id: purchase.supplier_id,
      supplier_name: purchase.supplier_name,
      status: "IN_TRANSIT",
      requested_by: purchase.created_by,
      requested_by_name: purchase.created_by_name || "Équipe achats",
      approved_by: currentAppUser.uid,
      approved_by_name: currentAppUser.displayName,
      approved_at: timestamp,
      shipped_by: `supplier-${purchase.supplier_id}`,
      shipped_by_name: purchase.supplier_name,
      shipped_at: timestamp,
      lines: purchase.lines.map(line => ({
        id: line.id,
        transfer_id: transferId,
        article_id: line.article_id,
        article_code: line.article_code,
        article_name: line.article_name,
        unit: line.unit,
        quantity_sent: line.quantity,
        quantity_received: 0,
        quantity_accepted: 0,
        quantity_rejected: 0
      })),
      note: purchase.notes,
      has_discrepancy: false,
      created_at: timestamp,
      updated_at: timestamp
    };
    const purchaseAuditLog = createAuditLog(currentAppUser, "PURCHASE_APPROVED", "PURCHASE", purchase.id, purchase, updatedPurchase, purchase.store_id);
    const transferAuditLog = createAuditLog(currentAppUser, "PURCHASE_DELIVERY_CREATED", "TRANSFER", transfer.id, undefined, transfer, purchase.store_id);
    await approvePurchase(purchase, updatedPurchase, transfer, purchaseAuditLog, transferAuditLog);
    setPurchases(current => current.map(item => item.id === purchase.id ? updatedPurchase : item));
    setTransfers(current => [transfer, ...current]);
    setAuditLogs(current => [purchaseAuditLog, transferAuditLog, ...current]);
  };
  
  const handleImportUnits = async (data: UnitOfMeasure[]) => {
    if (!Array.isArray(data) || data.some(unit => !unit.id || !unit.name)) {
      throw new Error("Le fichier unités est invalide.");
    }
    const auditLogs = data.map(unit => createAuditLog(
      currentAppUser!, "UNIT_IMPORTED", "UNIT", unit.id,
      units.find(existing => existing.id === unit.id), unit
    ));
    await Promise.all(data.map((unit, index) => saveUnit(unit, auditLogs[index])));
    setUnits([...data].sort((left, right) => left.name.localeCompare(right.name, "fr")));
    setAuditLogs(current => [...auditLogs, ...current]);
  };
  
  const handleResetUnits = async () => {
    const resetUnits = units.map(unit => ({ ...unit, is_active: false, updated_at: Date.now() }));
    const auditLogs = resetUnits.map(unit => createAuditLog(
      currentAppUser!, "UNIT_DEACTIVATED", "UNIT", unit.id,
      units.find(item => item.id === unit.id), unit
    ));
    await Promise.all(resetUnits.map((unit, index) => saveUnit(unit, auditLogs[index])));
    setUnits(resetUnits);
    setAuditLogs(current => [...auditLogs, ...current]);
  };
  
  const handleImportManagedUsers = async (data: AppUser[]) => {
    if (!Array.isArray(data) || data.some(importedUser => !importedUser.id || !importedUser.email || !importedUser.roleId)) {
      throw new Error("Le fichier utilisateurs est invalide.");
    }
    const currentIds = new Set(managedUsers.map(managedUser => managedUser.id));
    if (data.some(importedUser => !currentIds.has(importedUser.id))) {
      throw new Error("L'import des utilisateurs ne peut modifier que des comptes existants.");
    }
    const updatedUsers = await Promise.all(data.map(async importedUser => {
      const response = await authService.updateManagedUser(importedUser.id, {
        firstName: importedUser.firstName,
        lastName: importedUser.lastName,
        email: importedUser.email,
        role: importedUser.roleId,
        permissions: importedUser.permissions,
        assignedStores: importedUser.storeIds,
        status: importedUser.isActive ? "ACTIVE" : "DISABLED"
      });
      if (!response.success || !response.data) throw new Error(response.message);
      return toAppUser(response.data.user);
    }));
    const auditLogs = updatedUsers.map(updatedUser => createAuditLog(
      currentAppUser!, "USER_IMPORTED", "USER", updatedUser.id,
      managedUsers.find(existing => existing.id === updatedUser.id),
      {
        id: updatedUser.id,
        email: updatedUser.email,
        roleId: updatedUser.roleId,
        permissions: updatedUser.permissions,
        storeIds: updatedUser.storeIds,
        isActive: updatedUser.isActive
      }
    ));
    await Promise.all(auditLogs.map(entry => saveAuditLog(entry)));
    setManagedUsers(updatedUsers);
    setAuditLogs(current => [...auditLogs, ...current]);
  };
  
  const handleResetManagedUsers = async () => {
    const resetUsers = await Promise.all(managedUsers.map(async managedUser => {
      if (managedUser.id === user?.id) return managedUser;
      const response = await authService.updateManagedUser(managedUser.id, { status: "DISABLED" });
      if (!response.success || !response.data) throw new Error(response.message);
      return toAppUser(response.data.user);
    }));
    const auditLogs = resetUsers.filter(managedUser => managedUser.id !== user?.id)
      .map(disabledUser => createAuditLog(
        currentAppUser!, "USER_DISABLED", "USER", disabledUser.id,
        managedUsers.find(existing => existing.id === disabledUser.id),
        { ...disabledUser, isActive: false, permissions: [], storeIds: [] }
      ));
    await Promise.all(auditLogs.map(entry => saveAuditLog(entry)));
    setManagedUsers(resetUsers);
    setAuditLogs(current => [...auditLogs, ...current]);
  };

  const handleRecordSupplierPayment = async (purchase: Purchase, payment: SupplierPayment) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !hasProcurementPermission(currentAppUser)) {
      throw new Error("Vous ne disposez pas de la permission d'enregistrer un paiement fournisseur.");
    }
    if (currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN" && !currentAppUser.storeIds.includes(purchase.store_id)) {
      throw new Error("Vous ne pouvez régler que les achats d'un magasin qui vous est attribué.");
    }
    const auditLog = createAuditLog(currentAppUser!, "SUPPLIER_PAYMENT_RECORDED", "PURCHASE", purchase.id, purchase, undefined, purchase.store_id);
    const updatedPurchase = await recordSupplierPayment(purchase, payment, auditLog);
    setPurchases(current => current.map(item => item.id === purchase.id ? updatedPurchase : item));
    setAuditLogs(current => [{ ...auditLog, new_value: updatedPurchase }, ...current]);
  };

  const handleCreateCashHandover = async (handover: CashHandover) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !hasCashHandoverPermission(currentAppUser, "create")) {
      throw new Error("Vous ne disposez pas de la permission de déclarer une remise de caisse.");
    }
    if (currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN" && !currentAppUser.storeIds.includes(handover.store_id)) {
      throw new Error("Vous ne pouvez déclarer une remise que pour un point de vente attribué à votre compte.");
    }
    const auditLog = createAuditLog(currentAppUser, "CASH_HANDOVER_DECLARED", "CASH_HANDOVER", handover.id, undefined, handover, handover.store_id);
    await createCashHandover(handover, auditLog);
    setCashHandovers(current => [handover, ...current].sort((left, right) => right.business_date.localeCompare(left.business_date)));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleConfirmCashReceipt = async (handover: CashHandover, amount: number, note: string) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !hasCashHandoverPermission(currentAppUser, "receive")) {
      throw new Error("Vous ne disposez pas de la permission de confirmer une réception.");
    }
    if (currentAppUser.uid === handover.declared_by) {
      throw new Error("La réception doit être confirmée par une autre personne que l'auteur de la déclaration.");
    }
    const auditLog = createAuditLog(currentAppUser, "CASH_HANDOVER_RECEIVED", "CASH_HANDOVER", handover.id, handover, undefined, handover.store_id);
    const updated = await confirmCashHandoverReceipt(handover, amount, note, currentAppUser.uid, currentAppUser.displayName, auditLog);
    setCashHandovers(current => current.map(item => item.id === handover.id ? updated : item));
    setAuditLogs(current => [{ ...auditLog, new_value: updated }, ...current]);
  };

  const handleRecordCashDeposit = async (handover: CashHandover, deposit: CashHandoverDeposit) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !hasCashHandoverPermission(currentAppUser, "deposit")) {
      throw new Error("Vous ne disposez pas de la permission d'enregistrer un dépôt bancaire.");
    }
    const auditLog = createAuditLog(currentAppUser, "CASH_HANDOVER_BANK_DEPOSIT", "CASH_HANDOVER", handover.id, handover, undefined, handover.store_id);
    const updated = await recordCashHandoverDeposit(handover, deposit, currentAppUser.uid, auditLog);
    setCashHandovers(current => current.map(item => item.id === handover.id ? updated : item));
    setAuditLogs(current => [{ ...auditLog, new_value: updated }, ...current]);
  };

  const handleCreateExpense = async (expense: Expense) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !(currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.create"))) throw new Error("Vous ne disposez pas de la permission de créer une dépense.");
    const isAdmin = currentAppUser.roleId === "ADMIN" || currentAppUser.roleId === "SUPER_ADMIN";
    if (expense.category === "SALARY_ADVANCE" && !isAdmin) throw new Error("Seul un administrateur peut enregistrer une avance sur salaire.");
    if (expense.category === "SALARY_ADVANCE") {
      const employee = employees.find(item => item.id === expense.employee_id && item.is_active);
      if (!employee || !expense.description.trim()) throw new Error("Sélectionnez un employé actif et indiquez le motif de l'avance.");
      const employeeName = `${employee.first_name} ${employee.last_name}`;
      expense = {
        ...expense,
        employee_name: employeeName,
        payee: employeeName,
        salary_advance_id: `advance-${expense.id}`,
        payment_status: "PAID"
      };
    } else {
      expense = { ...expense, employee_id: undefined, employee_name: undefined, salary_advance_id: undefined };
    }
    const isSuperAdmin = currentAppUser.roleId === "SUPER_ADMIN";
    if (!isSuperAdmin && (!expense.store_id || !currentAppUser.storeIds.includes(expense.store_id))) {
      throw new Error("Vous ne pouvez enregistrer une dépense que pour un magasin attribué à votre compte.");
    }
    expense = { ...expense, status: "DRAFT", created_by: currentAppUser!.uid, validated_by: undefined, validated_at: undefined };
    const auditLog = createAuditLog(currentAppUser!, "EXPENSE_CREATED", "EXPENSE", expense.id, undefined, expense, expense.store_id);
    await saveExpense(expense, auditLog);
    setExpenses(current => [expense, ...current].sort((left, right) => right.expense_date - left.expense_date));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleUpdateExpense = async (original: Expense, expense: Expense) => {
    const isAdmin = currentAppUser?.roleId === "ADMIN" || currentAppUser?.roleId === "SUPER_ADMIN";
    const isSuperAdmin = currentAppUser?.roleId === "SUPER_ADMIN";
    if (
      user?.status !== "ACTIVE" ||
      !currentAppUser ||
      !hasPermission(currentAppUser, "expenses.create") ||
      expense.created_by !== currentAppUser.uid ||
      (!isSuperAdmin && (!expense.store_id || !currentAppUser.storeIds.includes(expense.store_id)))
    ) {
      throw new Error("Vous pouvez uniquement modifier vos propres brouillons dans un magasin attribué à votre compte.");
    }
    if ((original.category === "SALARY_ADVANCE" || expense.category === "SALARY_ADVANCE") && !isAdmin) {
      throw new Error("Seul un administrateur peut modifier une avance sur salaire.");
    }
    if (expense.category === "SALARY_ADVANCE") {
      const employee = employees.find(item => item.id === expense.employee_id && item.is_active);
      if (!employee || !expense.description.trim()) throw new Error("Sélectionnez un employé actif et indiquez le motif de l'avance.");
      const employeeName = `${employee.first_name} ${employee.last_name}`;
      expense = {
        ...expense,
        employee_name: employeeName,
        payee: employeeName,
        salary_advance_id: `advance-${expense.id}`,
        payment_status: "PAID"
      };
    } else {
      expense = { ...expense, employee_id: undefined, employee_name: undefined, salary_advance_id: undefined };
    }
    const auditLog = createAuditLog(currentAppUser, "EXPENSE_DRAFT_UPDATED", "EXPENSE", expense.id, original, expense, expense.store_id);
    const updated = await updateDraftExpense(original, expense, currentAppUser.uid, auditLog);
    setExpenses(current => current.map(item => item.id === updated.id ? updated : item)
      .sort((left, right) => right.expense_date - left.expense_date));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleValidateExpense = async (expense: Expense) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !(currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.create")) || (currentAppUser.roleId !== "SUPER_ADMIN" && (expense.created_by !== currentAppUser.uid || !expense.store_id || !currentAppUser.storeIds.includes(expense.store_id)))) throw new Error("Vous pouvez uniquement valider vos propres dépenses avec la permission de création.");
    const isAdmin = currentAppUser.roleId === "ADMIN" || currentAppUser.roleId === "SUPER_ADMIN";
    let salaryAdvance: SalaryAdvance | undefined;
    let salaryAdvanceAuditLog: AuditLog | undefined;
    if (expense.category === "SALARY_ADVANCE") {
      if (!isAdmin) throw new Error("Seul un administrateur peut valider une avance sur salaire.");
      const employee = employees.find(item => item.id === expense.employee_id && item.is_active);
      if (!employee || expense.payment_status !== "PAID" || !expense.description.trim()) {
        throw new Error("L'employé, le motif ou le paiement de cette avance n'est pas valide.");
      }
      const timestamp = Date.now();
      const employeeName = `${employee.first_name} ${employee.last_name}`;
      salaryAdvance = {
        id: expense.salary_advance_id || `advance-${expense.id}`,
        employee_id: employee.id,
        employee_name: employeeName,
        amount: expense.amount,
        advance_date: expense.expense_date,
        payment_method: expense.payment_method,
        reason: expense.description,
        status: "OUTSTANDING",
        expense_id: expense.id,
        created_at: timestamp,
        updated_at: timestamp,
        created_by: currentAppUser.uid
      };
      salaryAdvanceAuditLog = createAuditLog(
        currentAppUser,
        "SALARY_ADVANCE_CREATED",
        "SALARY_ADVANCE",
        salaryAdvance.id,
        undefined,
        salaryAdvance,
        expense.store_id
      );
    }
    const auditLog = createAuditLog(currentAppUser, "EXPENSE_VALIDATED", "EXPENSE", expense.id, expense, undefined, expense.store_id);
    const updated = await validateExpense(
      expense,
      currentAppUser.uid,
      auditLog,
      currentAppUser.roleId === "SUPER_ADMIN",
      isAdmin,
      salaryAdvance,
      salaryAdvanceAuditLog
    );
    setExpenses(current => current.map(item => item.id === updated.id ? updated : item));
    if (salaryAdvance) {
      const createdAdvance = salaryAdvance;
      setSalaryAdvances(current => [createdAdvance, ...current.filter(item => item.id !== createdAdvance.id)]);
    }
    setAuditLogs(current => [{ ...auditLog, new_value: updated }, ...current]);
    if (salaryAdvance && salaryAdvanceAuditLog) {
      const createdAdvance = salaryAdvance;
      const advanceAudit = salaryAdvanceAuditLog;
      setAuditLogs(current => [{ ...advanceAudit, new_value: createdAdvance }, ...current]);
    }
  };
  const handleDeleteExpense = async (expense: Expense) => {
    if (currentAppUser?.roleId !== "SUPER_ADMIN") throw new Error("Suppression réservée aux super administrateurs.");
    const auditLog = createAuditLog(currentAppUser, "EXPENSE_DELETED", "EXPENSE", expense.id, expense, undefined, expense.store_id);
    await deleteExpense(expense, auditLog);
    setExpenses(current => current.filter(item => item.id !== expense.id));
    setSalaryAdvances(current => current.filter(item => item.expense_id !== expense.id));
    setAuditLogs(current => [auditLog, ...current]);
  };

  if (!user) return null;

  const actionNotifications = currentAppUser && user.status === "ACTIVE"
    ? buildActionNotifications({
        uid: currentAppUser.uid,
        storeIds: currentAppUser.storeIds,
        canReceiveTransfers: hasPermission(currentAppUser, "transfers.receive"),
        isAdmin: isInventoryAdmin,
        canReviewInventory,
        transfers,
        inventoryCounts,
        resellerOrders,
        sales: visibleSales,
        canShipSales: hasPermission(currentAppUser, "sales.validate")
      })
    : [];

  return (
    <div className="theme-app min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Application Bar */}
      <header className="bg-slate-800/90 border-b border-slate-700/80 backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/branding/gileada-icon.png" alt="" className="h-9 w-9 rounded-lg bg-white p-1 object-contain" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-base">GILEADA</span>
            </div>
          </div>
        </div>

        {/* User preview and Logout button */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div
            className={`inline-flex max-w-[130px] sm:max-w-none truncate items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${isOnline && !isProfileFromCache && !hasPendingWrites ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`}
            role="status"
            title={!isOnline ? "Hors connexion · les droits ne sont pas vérifiés" : hasPendingWrites ? "Synchronisation en attente" : isProfileFromCache ? "Vérification des droits" : "En ligne"}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline && !isProfileFromCache && !hasPendingWrites ? "bg-emerald-400" : "bg-amber-400"}`} />
            {!isOnline
              ? hasPendingWrites
                ? "Hors ligne · écritures en attente"
                : "Hors ligne · cache, droits non vérifiés"
              : hasPendingWrites
                ? "Synchronisation en attente"
                : isProfileFromCache
                  ? "Vérification des droits…"
                  : "En ligne"}
          </div>
          <ThemeSwitcher />
          <NotificationBell notifications={actionNotifications} onOpen={setActiveModule} />
          {currentAppUser && user.status === "ACTIVE" && (currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.view") || hasPermission(currentAppUser, "expenses.create")) && <button type="button" onClick={() => setActiveModule("expenses")} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">Dépenses</button>}
          {currentAppUser && user.status === "ACTIVE" && (currentAppUser.roleId === "ADMIN" || ["view", "create", "receive", "deposit"].some(action => hasPermission(currentAppUser, `cash_handover.${action}`))) && <button type="button" onClick={() => setActiveModule("cashHandovers")} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">Remises de caisse</button>}
          <button
            type="button"
            onClick={() => setShowProfile(current => !current)}
            aria-expanded={showProfile}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            <UserIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{showProfile ? "Masquer le profil" : "Mon profil"}</span>
          </button>
          <button
            type="button"
            onClick={() => logout()}
            aria-label="Déconnexion"
            title="Déconnexion"
            className="inline-flex items-center gap-2 rounded-lg bg-rose-500/10 px-2 py-2 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500/20 hover:text-rose-200 border border-rose-500/30 cursor-pointer sm:px-3.5 sm:py-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Suspense fallback={<div className="py-16 text-center text-sm text-slate-500">Chargement?</div>}>
        {activeModule === "resellerPortal" && currentAppUser && (
          currentAppUser.roleId === "REVENDEUR" ||
          currentAppUser.roleId === "ADMIN" ||
          currentAppUser.roleId === "SUPER_ADMIN"
        ) ? (
          <section className="space-y-4">
            {currentAppUser.roleId !== "REVENDEUR" && (
              <button type="button" onClick={() => setActiveModule("home")} className="text-sm font-semibold text-slate-300 hover:text-white">
                ← Retour à l'accueil
              </button>
            )}
            <ResellerPortalView
              user={currentAppUser}
              isAdmin={currentAppUser.roleId === "ADMIN" || currentAppUser.roleId === "SUPER_ADMIN"}
              orders={visibleResellerOrders}
              notifications={resellerNotifications}
              articles={articles}
              stores={inventoryStores}
              stocks={stocks}
              creditCustomers={creditCustomers}
              onCreateOrder={handleCreateResellerOrder}
              onUpdateOrder={handleUpdateResellerOrder}
              onReviewOrder={handleReviewResellerOrder}
              onRecordCashPayment={handleRecordResellerCashPayment}
              onMarkNotificationsRead={handleMarkResellerNotificationsRead}
            />
          </section>
        ) : activeModule === "sales" && currentAppUser ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <SalesView
              sales={visibleSales}
              creditCustomers={creditCustomers}
              stores={accessibleStores}
              articles={articles}
              stocks={stocks}
              currentUser={currentAppUser}
              canCreateResellerSale={currentAppUser.roleId === "ADMIN" || currentAppUser.roleId === "SUPER_ADMIN"
                || (currentAppUser.roleId === "RESPONSABLE_MAGASIN"
                  && hasPermission(currentAppUser, "sales.create")
                  && currentAppUser.storeIds.some(storeId => inventoryStores.some(store => store.id === storeId && store.store_type === "CENTRAL_WAREHOUSE")))}
              onCreateSale={handleCreateSale}
              onUpdateSale={handleUpdateSale}
              onDeleteSale={handleDeleteSale}
              onVerifySale={handleVerifySale}
              onApproveSale={handleApproveSale}
              onValidateSale={handleValidateSale}
              onCancelSale={handleCancelSale}
            />
          </section>
        ) : activeModule === "stocks" && currentAppUser ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <StocksView
              stores={accessibleStores}
              categories={categories}
              articles={articles}
              stocks={stocks}
              movements={movements}
              currentUser={currentAppUser}
              onAdjustStock={handleAdjustStock}
              onImportInitialStocks={handleImportInitialStocks}
              onSyncStocks={handleSyncStocks}
            />
          </section>
        ) : activeModule === "employeePresentation" && currentAppUser ? (
          <section className="space-y-4">
            <button type="button" onClick={() => setActiveModule("home")} className="text-sm font-semibold text-slate-300">← Retour à l’accueil</button>
            <EmployeePresentationView user={currentAppUser} stores={accessibleStores} employees={employees} />
          </section>
        ) : activeModule === "inventory" && currentAppUser && (canCountInventory || canReviewInventory) ? (
          <section className="space-y-4">
            <button type="button" onClick={() => setActiveModule("home")} className="text-sm font-semibold text-slate-300 hover:text-white">
              ← Retour à l'accueil
            </button>
            <InventoryControlView
              currentUser={currentAppUser}
              stores={inventoryScopeStores}
              articles={articles}
              stocks={stocks}
              counts={inventoryCounts}
              canCount={canCountInventory}
              canReview={canReviewInventory}
              onSaveCount={handleSaveInventoryCount}
              onDeleteDraft={handleDeleteInventoryDraft}
              onValidateCount={handleValidateInventoryCount}
              onRejectCount={handleRejectInventoryCount}
              onSignCount={handleSignInventoryCount}
              onRefuseSignature={handleRefuseInventorySignature}
              loadStoreManagers={storeId => authService.listStoreManagers(storeId)}
              onSettleCharges={(counts, method, reference, note) => settleInventoryCounts(counts, method, reference, note)}
            />
          </section>
        ) : activeModule === "stores" && currentAppUser && canManageStores ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <StoresView
              stores={inventoryStores}
              users={managedUsers}
              currentUser={currentAppUser}
              onCreateStore={handleCreateStore}
              onUpdateStore={handleUpdateStore}
              onToggleStoreStatus={handleToggleStoreStatus}
              onDeleteStore={handleDeleteStore}
              onImportData={handleImportStores}
              onResetData={handleResetStores}
            />
          </section>
        ) : activeModule === "units" && currentAppUser && canManageStores ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <UnitsView units={units} articles={articles} currentUser={currentAppUser} onCreateUnit={handleCreateUnit} onToggleUnit={handleToggleUnit} onDeleteUnit={handleDeleteUnit} onImportData={handleImportUnits} onResetData={handleResetUnits} />
          </section>
        ) : activeModule === "catalog" && currentAppUser && canManageStores ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <CatalogView
              articles={articles}
              categories={categories}
              units={units}
              currentUser={currentAppUser}
              visibleArticleTypes={currentAppUser.visibleArticleTypes || []}
              onCreateArticle={handleCreateArticle}
              onUpdateArticle={handleUpdateArticle}
              onToggleArticleStatus={handleToggleArticleStatus}
              onCreateCategory={handleCreateCategory}
              onToggleCategoryStatus={handleToggleCategoryStatus}
              onImportData={handleImportCatalogData}
              onResetData={handleResetCatalogData}
            />
          </section>
        ) : activeModule === "transfers" && currentAppUser && (currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN" || currentAppUser.permissions.includes("transfers.view")) ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <TransfersView
              transfers={visibleTransfers}
              stores={inventoryStores}
              articles={articles.filter(article => article.is_active)}
              stocks={stocks}
              currentUser={currentAppUser}
              canCreate={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "transfers.create")}
              canReject={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN"}
              canShip={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "transfers.ship")}
              canReceive={hasPermission(currentAppUser, "transfers.receive")}
              canResolveDiscrepancy={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN"}
              onCreateTransfer={handleCreateTransfer}
              onUpdateTransfer={handleUpdateTransfer}
              onDeleteTransfer={handleDeleteTransfer}
              onCancelTransfer={handleCancelTransfer}
              onApproveTransfer={handleApproveTransfer}
              onRejectTransfer={handleRejectTransfer}
              onShipTransfer={handleShipTransfer}
              onReceiveAndValidateTransfer={handleReceiveTransfer}
              onConfirmCentralReceipt={handleConfirmCentralReceipt}
              onReceiveDirectDeposit={handleReceiveDirectDeposit}
              onResolveDiscrepancy={handleResolveTransferDiscrepancy}
            />
          </section>
        ) : activeModule === "reports" && currentAppUser && (currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN" || currentAppUser.permissions.includes("reports.view")) ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <ReportsView
              userAuditReport={canManageStores ? <UserAuditReport users={managedUsers} employees={employees} sales={sales} advances={salaryAdvances} payslips={payslips} counts={inventoryCounts} stores={accessibleStores} /> : undefined}
              stores={accessibleStores}
              categories={categories}
              articles={articles}
              stocks={stocks}
              transfers={visibleTransfers}
              movements={movements}
              sales={visibleSales}
              productions={visibleProductions}
              auditLogs={visibleAuditLogs}
              expenses={reportExpenses}
              currentUser={currentAppUser}
              onOpenReportViewer={(type, filters) => setReportRequest({ type, filters })}
            />
            {reportRequest && (
              <ReportViewer
                reportType={reportRequest.type}
                filters={reportRequest.filters}
                stores={inventoryStores}
                categories={categories}
                articles={articles}
                stocks={stocks}
                transfers={visibleTransfers}
                movements={movements}
                sales={visibleSales}
                productions={visibleProductions}
                auditLogs={visibleAuditLogs}
                expenses={reportExpenses}
                currentUser={currentAppUser}
                onClose={() => setReportRequest(null)}
              />
            )}
          </section>
        ) : activeModule === "audit" && currentAppUser && (
          currentAppUser.roleId === "SUPER_ADMIN" ||
          currentAppUser.roleId === "ADMIN" ||
          currentAppUser.permissions.includes("audit.view")
        ) ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <AuditView
              auditLogs={visibleAuditLogs}
              stores={inventoryStores}
              users={managedUsers}
              canViewConnectionStatus={canManageStores}
            />
          </section>
        ) : activeModule === "production" && currentAppUser ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <ProductionView
              onConsumeMaterial={handleConsumeMaterial}
              productions={visibleProductions}
              stores={accessibleStores}
              articles={articles}
              stocks={stocks}
              currentUser={currentAppUser}
              onCreateProduction={handleCreateProduction}
              onUpdateDraftProduction={handleUpdateDraftProduction}
              onDeleteDraftProduction={handleDeleteDraftProduction}
              onInitiateReturn={handleInitiateProductionReturn}
              transfers={transfers}
              onDecideRecycling={handleDecideRecycling}
            />
          </section>
        ) : activeModule === "procurement" && currentAppUser && canManageProcurement ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <ProcurementView
              suppliers={suppliers}
              purchases={visiblePurchases}
              stores={accessibleStores}
              articles={articles}
              stocks={stocks}
              currentUser={currentAppUser}
              onCreateSupplier={handleCreateSupplier}
              onToggleSupplier={handleToggleSupplier}
              onCreatePurchase={handleCreatePurchase}
              onApprovePurchase={handleApprovePurchase}
              onRecordPayment={handleRecordSupplierPayment}
              onImportData={handleImportSuppliers}
              onResetData={handleResetSuppliers}
            />
          </section>
        ) : activeModule === "expenses" && currentAppUser && user.status === "ACTIVE" && (currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.view") || hasPermission(currentAppUser, "expenses.create")) ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <ExpensesView
              expenses={expenses}
              employees={employees}
              stores={accessibleStores}
              currentUser={currentAppUser}
              canCreate={user.status === "ACTIVE" && (currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.create"))}
              canCreateSalaryAdvance={user.status === "ACTIVE" && (currentAppUser.roleId === "ADMIN" || currentAppUser.roleId === "SUPER_ADMIN")}
              onValidateExpense={handleValidateExpense}
              onDeleteExpense={handleDeleteExpense}
              onCreateExpense={handleCreateExpense}
              onUpdateExpense={handleUpdateExpense}
            />
          </section>
        ) : activeModule === "cashHandovers" && currentAppUser && user.status === "ACTIVE" && (currentAppUser.roleId === "ADMIN" || ["view", "create", "receive", "deposit"].some(action => hasPermission(currentAppUser, `cash_handover.${action}`))) ? (
          <section className="space-y-4">
            <button type="button" onClick={() => setActiveModule("home")} className="text-sm font-semibold text-slate-300 hover:text-white">← Retour à l'accueil</button>
            <CashHandoverView
              handovers={cashHandovers}
              loadError={cashHandoversError || expensesLoadError}
              sales={sales}
              expenses={expenses}
              stores={accessibleStores}
              currentUser={currentAppUser}
              canCreate={hasCashHandoverPermission(currentAppUser, "create")}
              canReceive={hasCashHandoverPermission(currentAppUser, "receive")}
              canDeposit={hasCashHandoverPermission(currentAppUser, "deposit")}
              onCreate={handleCreateCashHandover}
              onConfirmReceipt={handleConfirmCashReceipt}
              onRecordDeposit={handleRecordCashDeposit}
            />
          </section>
        ) : activeModule === "credit" && currentAppUser && (
          currentAppUser.roleId === "ADMIN" ||
          currentAppUser.roleId === "SUPER_ADMIN" ||
          hasPermission(currentAppUser, "credit.manage")
        ) ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <CreditManagementView
              customers={creditCustomers}
              sales={visibleSales}
              currentUser={currentAppUser}
              resellerUsers={managedUsers.filter(managedUser => managedUser.roleId === "REVENDEUR")}
              onSaveCustomer={handleSaveCreditCustomer}
              onRecordPayment={handleRecordCreditPayment}
              onRecordFollowUp={handleRecordCreditFollowUp}
            />
          </section>
        ) : activeModule === "staff" && currentAppUser && canManageStores ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("home")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour à l'accueil
            </button>
            <StaffView users={managedUsers} onLinkAccount={handleLinkEmployee} onOpenUsers={openUserManagement} employees={employees} stores={inventoryStores} expenses={expenses} advances={salaryAdvances} onOpenPayroll={() => setActiveModule("payroll")} onSaveEmployee={handleSaveEmployee} />
          </section>
        ) : activeModule === "payroll" && currentAppUser && canManageStores ? (
          <section className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveModule("staff")}
              className="text-sm font-semibold text-slate-300 hover:text-white"
            >
              ← Retour au personnel
            </button>
            <PayrollView
              employees={employees}
              payslips={payslips}
              advances={salaryAdvances}
              inventoryCounts={inventoryCounts}
              currentUserId={currentAppUser.uid}
              onSavePayslip={handleSavePayslip}
              onSaveAdvance={handleSaveAdvance}
            />
          </section>
        ) : user && (
          <RoleHomeView
            user={toAppUser(user)}
            stores={inventoryStores}
            sales={visibleSales}
            expenses={expenses}
            auditLogs={visibleAuditLogs}
            onOpenUsers={openUserManagement}
            onOpenSales={() => setActiveModule("sales")}
            onOpenStocks={() => setActiveModule("stocks")}
            onOpenProduction={() => setActiveModule("production")}
            onOpenStores={() => setActiveModule("stores")}
            onOpenCatalog={() => setActiveModule("catalog")}
            onOpenProcurement={() => setActiveModule("procurement")}
            onOpenExpenses={() => setActiveModule("expenses")}
            onOpenCashHandovers={() => setActiveModule("cashHandovers")}
            onOpenTransfers={() => setActiveModule("transfers")}
            onOpenCredit={() => setActiveModule("credit")}
            onOpenResellerOrders={() => setActiveModule("resellerPortal")}
            pendingResellerOrders={resellerOrders.filter(order => order.status === "PENDING").length}
            onOpenUnits={() => setActiveModule("units")}
            onOpenStaff={() => setActiveModule("staff")}
            onOpenReports={() => setActiveModule("reports")}
            onOpenAudit={() => setActiveModule("audit")}
            onOpenEmployeePresentation={() => setActiveModule("employeePresentation")}
            onOpenInventory={() => setActiveModule("inventory")}
          />
        )}

        {activeModule === "home" && canManageUsers && (
          <section id="user-management" className="scroll-mt-24 space-y-3">
            {usersError && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-sm text-rose-200">
                {usersError}
              </div>
            )}
            {user && (
              <UsersView
                currentUser={toAppUser(user)}
                users={managedUsers}
                stores={inventoryStores}
                onUpdateUser={handleUpdateManagedUser}
                onCreateUser={handleCreateManagedUser}
                onDeleteUser={handleDeleteManagedUser}
                onImportData={handleImportManagedUsers}
                onResetData={handleResetManagedUsers}
              />
            )}
          </section>
        )}

        {showProfile && (
          <section className="bg-slate-800/80 rounded-2xl border border-slate-700/80 p-5 space-y-5" aria-label="Profil utilisateur">
            <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-emerald-400" />
                <span>Profil Utilisateur</span>
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700">
                {user.id}
              </span>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Nom Complet
                </label>
                <div className="text-slate-200 font-medium bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50">
                  {user.firstName} {user.lastName}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Email
                </label>
                <div className="text-slate-200 font-medium bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50 flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{user.email}</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Téléphone
                </label>
                <div className="text-slate-200 font-medium bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50 flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{user.phone || "Non renseigné"}</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Statut du Compte
                </label>
                <div className="bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50 flex items-center justify-between">
                  <span className="font-semibold text-emerald-400 font-mono">{user.status}</span>
                  <span className="text-[10px] text-slate-500">Validation effectuée</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
                  Date de Création
                </label>
                <div className="text-slate-300 bg-slate-900/60 px-3 py-2 rounded-lg border border-slate-700/50 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="font-mono text-[11px]">
                    {new Date(user.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
              </div>
            </div>

            {/* Role & Stores Note */}
            <div className="pt-4 border-t border-slate-700/70 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span>Rôles & Permissions (Module Admin)</span>
              </div>
              <div className="p-3 bg-slate-900/70 border border-slate-700/60 rounded-xl space-y-1.5 text-[11px] text-slate-400">
                <p>
                  <strong className="text-slate-300">Rôle :</strong>{" "}
                  {user.role === null ? (
                    <span className="italic text-amber-300/80">null (aucun rôle assigné)</span>
                  ) : (
                    user.role
                  )}
                </p>
                <p>
                  <strong className="text-slate-300">Permissions :</strong>{" "}
                  <code className="text-slate-400 bg-slate-800 px-1 py-0.5 rounded">
                    {JSON.stringify(user.permissions)}
                  </code>
                </p>
                <p>
                  <strong className="text-slate-300">Magasins assignés :</strong>{" "}
                  <code className="text-slate-400 bg-slate-800 px-1 py-0.5 rounded">
                    {JSON.stringify(user.assignedStores)}
                  </code>
                </p>
                <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-800">
                  Ces propriétés seront configurées lors de l'intégration du module Administration.
                </p>
              </div>
            </div>
          </section>
        )}
      </Suspense>
      </main>
    </div>
  );
}
