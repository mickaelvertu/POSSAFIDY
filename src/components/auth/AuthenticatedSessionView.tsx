import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authService, hasPermission } from "../../services/authService";
import { AppRoleId, AppUser, Article, AuditLog, Category, CreditCustomer, CreditFollowUp, CreditPayment, Employee, Expense, GeneralFilters, Payslip, Purchase, ResellerNotification, ResellerOrder, Sale, SalaryAdvance, ReportType, StockTransferLine, Supplier, SupplierPayment, UnitOfMeasure } from "../../types";
import { User } from "../../types/auth";
import UsersView from "../UsersView";
import RoleHomeView from "../RoleHomeView";
import SalesView from "../SalesView";
import StocksView from "../StocksView";
import { Production, StockMovement, StockTransfer, Store, StoreStock } from "../../types";
import { generateRef, getArticleStock, updateStockQuantity } from "../../services/stockService";
import {
  deleteStore,
  deleteDraftTransfer,
  loadCatalogData,
  loadInventoryData,
  loadStores,
  loadProcurementData,
  receivePurchase,
  recordSupplierPayment,
  saveArticle,
  saveCategory,
  saveStockAdjustment,
  saveStore,
  saveSupplier,
  saveTransfer,
  saveTransferWithStockEffects,
  updateDraftTransfer,
} from "../../services/inventoryService";
import { advanceSale, cancelSale, createProduction, deleteDraftSale, deleteDraftProduction, loadOperationalData, saveAuditLog, updateDraftProduction, updateDraftSale, validateSale } from "../../services/operationsService";
import { createCreditSale, loadCreditCustomerForUser, loadCreditCustomers, recordCreditFollowUp, recordCreditPayment, saveCreditCustomer } from "../../services/creditService";
import { createResellerOrder, loadResellerStocks, markResellerNotificationsRead, recordResellerCashPayment, reviewResellerOrder, subscribeResellerNotifications, subscribeResellerOrders, updateResellerOrder } from "../../services/resellerOrderService";
import { createAuditLog } from "../../services/auditService";
import AuditView from "../AuditView";
import StoresView from "../StoresView";
import CatalogView from "../CatalogView";
import ProductionView from "../ProductionView";
import ProcurementView from "../ProcurementView";
import ExpensesView from "../ExpensesView";
import StaffView from "../StaffView";
import { loadEmployees, saveEmployee } from "../../services/employeeService";
import PayrollView from "../PayrollView";
import CreditManagementView from "../CreditManagementView";
import ResellerPortalView from "../ResellerPortalView";
import { loadPayslips, loadSalaryAdvances, savePayslip, saveSalaryAdvance } from "../../services/payrollService";
import TransfersView from "../TransfersView";
import UnitsView from "../UnitsView";
import ReportsView from "../ReportsView";
import ReportViewer from "../ReportViewer";
import ThemeSwitcher from "../ThemeSwitcher";
import { deleteExpense, loadExpenses, saveExpense, updateDraftExpense, validateExpense } from "../../services/expenseService";
import { deleteUnit, loadUnits, saveUnit } from "../../services/unitService";
import { applyStockSnapshot, importInitialStocks } from "../../services/stockImportService";
import type { StockSyncRow } from "../../services/stockSyncValidation";
import type { InitialStockImportRow } from "../../services/stockImportValidation";
import { 
  ShieldCheck, 
  LogOut, 
  User as UserIcon, 
  Mail, 
  Phone, 
  Calendar, 
  Shield
} from "lucide-react";

const APP_ROLES: AppRoleId[] = ["SUPER_ADMIN", "ADMIN", "VENDEUR", "MAGASINIER", "RESPONSABLE_MAGASIN", "PRODUCTION", "COMPTABLE", "GESTIONNAIRE_CREDIT", "REVENDEUR"];

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
    isActive: user.status === "ACTIVE",
    accountStatus: user.status,
    createdAt: Date.parse(user.createdAt),
    updatedAt: Date.parse(user.updatedAt)
  };
}

export default function AuthenticatedSessionView() {
  const { user, logout } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [managedUsers, setManagedUsers] = useState<AppUser[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<"home" | "sales" | "stocks" | "stores" | "catalog" | "production" | "procurement" | "expenses" | "transfers" | "units" | "staff" | "payroll" | "reports" | "audit" | "credit" | "resellerPortal">(user?.role === "REVENDEUR" ? "resellerPortal" : "home");
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

  useEffect(() => {
    if (!canManageUsers) return;
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
      const isReseller = user.role === "REVENDEUR";
      const canManageCredit = Boolean(user.permissions.includes("credit.manage"));
      let unitAuditLogs: AuditLog[] = [];

      // Each block is independent: stores appear as soon as they load, even if another collection fails.
      const storesPromise = withRetry("Stores", loadStores);
      const catalogPromise = withRetry("Catalog", async () => {
        const catalog = await loadCatalogData();
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
          setMovements(inventory.movements);
          setTransfers(inventory.transfers);
          if (!isReseller) {
            setStocks(inventory.stocks);
            return;
          }
          const [loadedStores, result] = await Promise.all([storesPromise, catalogPromise]);
          if (!loadedStores || !result) return;
          const resellerStocks = await withRetry("Reseller stocks", () => loadResellerStocks(loadedStores, result.catalog.articles));
          if (isMounted && resellerStocks) setStocks(resellerStocks);
        }),
        canManageStores
          ? withRetry("Procurement", loadProcurementData).then(procurement => {
              if (!isMounted || !procurement) return;
              setSuppliers(procurement.suppliers);
              setPurchases(procurement.purchases);
            })
          : Promise.resolve(),
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
      return;
    }
    loadExpenses(user?.role === "SUPER_ADMIN" ? undefined : user?.assignedStores, user?.id)
      .then(loadedExpenses => {
        if (isMounted) setExpenses(loadedExpenses);
      })
      .catch(error => console.error("Expense Firestore load failed:", error));
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

  const handleSaveAdvance = async (advance: SalaryAdvance) => {
    const auditLog = createAuditLog(currentAppUser!, "SALARY_ADVANCE_CREATED", "SALARY_ADVANCE", advance.id, undefined, advance);
    await saveSalaryAdvance(advance, auditLog);
    setSalaryAdvances(current => [advance, ...current]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleSavePayslip = async (payslip: Payslip, isNew: boolean, settledAdvances: SalaryAdvance[]) => {
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
  const accessibleStores = user && user.assignedStores.length > 0 && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN"
    ? inventoryStores.filter(store => user.assignedStores.includes(store.id))
    : inventoryStores;
  // Non-admin roles only see transfers involving one of their assigned stores.
  const visibleTransfers = currentAppUser && currentAppUser.roleId !== "SUPER_ADMIN" && currentAppUser.roleId !== "ADMIN"
    ? transfers.filter(transfer =>
        currentAppUser.storeIds.includes(transfer.source_store_id) || currentAppUser.storeIds.includes(transfer.destination_store_id)
      )
    : transfers;

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
      if (user?.role !== "REVENDEUR" || !user.businessName || order.reseller_user_id !== user.id) {
        throw new Error("Seul un compte revendeur activé peut soumettre une commande.");
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

  const handleValidateSale = async (saleId: string) => {
    const sale = sales.find(item => item.id === saleId);
    if (!sale || !currentAppUser) return;
    if (sale.customer_type === "REVENDEUR" && currentAppUser.roleId !== "ADMIN" && currentAppUser.roleId !== "SUPER_ADMIN") {
      alert("Seul un administrateur peut approuver une demande revendeur.");
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
    const sale = sales.find(item => item.id === saleId);
    if (!sale || !currentAppUser) return;
    try {
      const result = await cancelSale(sale, currentAppUser.uid, currentAppUser.displayName);
      setSales(current => current.map(item => item.id === saleId ? result.sale : item));
      if (sale.credit_customer_id) {
        const amountReleased = Math.max(0, sale.total - sale.amount_paid);
        setCreditCustomers(current => current.map(customer => customer.id === sale.credit_customer_id
          ? { ...customer, outstanding_balance: Math.max(0, customer.outstanding_balance - amountReleased), updated_at: Date.now() }
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
      alert(error instanceof Error ? error.message : "Impossible de supprimer le brouillon de vente.");
    }
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
    if ((!isAdmin && !currentAppUser.storeIds.includes(transfer.source_store_id))
      || transfer.source_store_id === transfer.destination_store_id
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
    const allowedArticles = destinationStore.store_type === "POS" || destinationStore.store_type === "RESELLER"
      ? articles.filter(article => article.article_type === "RESALE" && article.is_active)
      : articles.filter(article => article.is_active);
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
      const physicalStock = getArticleStock(stocks, sourceStore.id, articleId);
      const pendingQuantity = transfers
        .filter(item => item.id !== transfer.id && item.source_store_id === sourceStore.id && ["DRAFT", "APPROVED"].includes(item.status))
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

  const handleDeleteTransfer = async (transfer: StockTransfer) => {
    if (currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("Suppression réservée aux super administrateurs.");
      return;
    }
    try {
      const auditLog = createAuditLog(currentAppUser, "TRANSFER_DRAFT_DELETED", "TRANSFER", transfer.id, transfer, undefined, transfer.source_store_id);
      await deleteDraftTransfer(transfer, auditLog);
      setTransfers(current => current.filter(item => item.id !== transfer.id));
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible de supprimer le brouillon de transfert.");
    }
  };

  const handleApproveTransfer = async (transferId: string) => {
    if (currentAppUser?.roleId !== "ADMIN" && currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("Seul un administrateur peut approuver un transfert.");
      return;
    }
    const transfer = transfers.find(item => item.id === transferId);
    if (!transfer || transfer.status !== "DRAFT") return;
    if (transfer.requested_by === currentAppUser.uid) {
      alert("Un administrateur différent du demandeur doit approuver ce transfert.");
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
    for (const line of transfer.lines) {
      const available = updatedStocks.find(stock => stock.store_id === transfer.source_store_id && stock.article_id === line.article_id)?.quantity || 0;
      if (line.quantity_sent <= 0 || available - line.quantity_sent < 0) {
        alert(`Stock insuffisant pour ${line.article_name}. Disponible : ${available}.`);
        return;
      }
      const { newStocks, beforeQty, afterQty } = updateStockQuantity(updatedStocks, transfer.source_store_id, line.article_id, -line.quantity_sent);
      updatedStocks = newStocks;
      movements.push({
        id: `movement-${transfer.id}-ship-${line.article_id}`,
        store_id: transfer.source_store_id,
        article_id: line.article_id,
        movement_type: transfer.type,
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
    let updatedStocks = stocks;
    const movements: StockMovement[] = [];
    updatedLines.forEach(line => {
      if (line.quantity_accepted > 0) {
        const { newStocks, beforeQty, afterQty } = updateStockQuantity(updatedStocks, transfer.destination_store_id, line.article_id, line.quantity_accepted);
        updatedStocks = newStocks;
        movements.push({
          id: `movement-${transfer.id}-receive-${line.article_id}`,
          store_id: transfer.destination_store_id,
          article_id: line.article_id,
          movement_type: transfer.type,
          quantity: line.quantity_accepted,
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
      const result = await saveTransferWithStockEffects(updatedTransfer, changedStocks, movements, auditLog);
      setStocks(current => current.map(stock => result.stocks.find(updated => updated.id === stock.id) || stock)
        .concat(result.stocks.filter(updated => !current.some(stock => stock.id === updated.id))));
      setMovements(current => [...result.movements, ...current]);
      setTransfers(current => current.map(item => item.id === transferId ? updatedTransfer : item));
      setAuditLogs(current => [auditLog, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer la réception du transfert dans Firestore.");
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
    const auditLog = createAuditLog(currentAppUser!, "ARTICLE_CREATED", "ARTICLE", article.id, undefined, article);
    await saveArticle(article, auditLog);
    setArticles(current => [...current, article]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleUpdateArticle = async (article: Article) => {
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
    const auditLog = createAuditLog(currentAppUser!, "SUPPLIER_CREATED", "SUPPLIER", supplier.id, undefined, supplier);
    await saveSupplier(supplier, auditLog);
    setSuppliers(current => [...current, supplier]);
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleToggleSupplier = async (supplier: Supplier) => {
    const previous = suppliers.find(item => item.id === supplier.id);
    const auditLog = createAuditLog(currentAppUser!, "SUPPLIER_UPDATED", "SUPPLIER", supplier.id, previous, supplier);
    await saveSupplier(supplier, auditLog);
    setSuppliers(current => current.map(item => item.id === supplier.id ? supplier : item));
    setAuditLogs(current => [auditLog, ...current]);
  };
  
  const handleImportSuppliers = async (data: Supplier[]) => {
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
    const resetSuppliers = suppliers.map(supplier => ({ ...supplier, is_active: false, updated_at: Date.now() }));
    const auditLogs = resetSuppliers.map(supplier => createAuditLog(
      currentAppUser!, "SUPPLIER_DEACTIVATED", "SUPPLIER", supplier.id,
      suppliers.find(item => item.id === supplier.id), supplier
    ));
    await Promise.all(resetSuppliers.map((supplier, index) => saveSupplier(supplier, auditLogs[index])));
    setSuppliers(resetSuppliers);
    setAuditLogs(current => [...auditLogs, ...current]);
  };

  const handleReceivePurchase = async (purchase: Purchase) => {
    const auditLog = createAuditLog(currentAppUser!, "PURCHASE_RECEIVED", "PURCHASE", purchase.id, undefined, purchase, purchase.store_id);
    const updatedStocks = await receivePurchase(purchase, stocks, auditLog);
    setStocks(updatedStocks);
    setPurchases(current => [purchase, ...current]);
    setAuditLogs(current => [auditLog, ...current]);
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
    const auditLog = createAuditLog(currentAppUser!, "SUPPLIER_PAYMENT_RECORDED", "PURCHASE", purchase.id, purchase, undefined, purchase.store_id);
    const updatedPurchase = await recordSupplierPayment(purchase, payment, auditLog);
    setPurchases(current => current.map(item => item.id === purchase.id ? updatedPurchase : item));
    setAuditLogs(current => [{ ...auditLog, new_value: updatedPurchase }, ...current]);
  };

  const handleCreateExpense = async (expense: Expense) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !(currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.create"))) throw new Error("Vous ne disposez pas de la permission de créer une dépense.");
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
    const auditLog = createAuditLog(currentAppUser, "EXPENSE_DRAFT_UPDATED", "EXPENSE", expense.id, original, expense, expense.store_id);
    const updated = await updateDraftExpense(original, expense, currentAppUser.uid, auditLog);
    setExpenses(current => current.map(item => item.id === updated.id ? updated : item)
      .sort((left, right) => right.expense_date - left.expense_date));
    setAuditLogs(current => [auditLog, ...current]);
  };

  const handleValidateExpense = async (expense: Expense) => {
    if (user?.status !== "ACTIVE" || !currentAppUser || !(currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.create")) || (currentAppUser.roleId !== "SUPER_ADMIN" && (expense.created_by !== currentAppUser.uid || !expense.store_id || !currentAppUser.storeIds.includes(expense.store_id)))) throw new Error("Vous pouvez uniquement valider vos propres dépenses avec la permission de création.");
    const auditLog = createAuditLog(currentAppUser, "EXPENSE_VALIDATED", "EXPENSE", expense.id, expense, undefined, expense.store_id);
    const updated = await validateExpense(expense, currentAppUser.uid, auditLog, currentAppUser.roleId === "SUPER_ADMIN");
    setExpenses(current => current.map(item => item.id === updated.id ? updated : item));
    setAuditLogs(current => [{ ...auditLog, new_value: updated }, ...current]);
  };
  const handleDeleteExpense = async (expense: Expense) => {
    if (currentAppUser?.roleId !== "SUPER_ADMIN") throw new Error("Suppression réservée aux super administrateurs.");
    const auditLog = createAuditLog(currentAppUser, "EXPENSE_DELETED", "EXPENSE", expense.id, expense, undefined, expense.store_id);
    await deleteExpense(expense, auditLog);
    setExpenses(current => current.filter(item => item.id !== expense.id));
    setAuditLogs(current => [auditLog, ...current]);
  };

  if (!user) return null;

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
          <div className={`hidden sm:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${isOnline ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}`} role="status">
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-amber-400"}`} />
            {isOnline ? "En ligne" : "Hors connexion · synchro en attente"}
          </div>
          <ThemeSwitcher />
          {currentAppUser && user.status === "ACTIVE" && (currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.view") || hasPermission(currentAppUser, "expenses.create")) && <button type="button" onClick={() => setActiveModule("expenses")} className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">Dépenses</button>}
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
              orders={resellerOrders}
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
              sales={sales}
              creditCustomers={creditCustomers}
              stores={accessibleStores}
              articles={articles}
              stocks={stocks}
              currentUser={currentAppUser}
              canCreateResellerSale={currentAppUser.roleId === "RESPONSABLE_MAGASIN"
                && hasPermission(currentAppUser, "credit.sales")
                && currentAppUser.storeIds.some(storeId => inventoryStores.some(store => store.id === storeId && store.store_type === "CENTRAL_WAREHOUSE"))}
              onCreateSale={handleCreateSale}
              onUpdateSale={handleUpdateSale}
              onDeleteSale={handleDeleteSale}
              onVerifySale={handleVerifySale}
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
              canApprove={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN"}
              canReject={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN"}
              canShip={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "transfers.ship")}
              canReceive={hasPermission(currentAppUser, "transfers.receive")}
              canResolveDiscrepancy={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN"}
              onCreateTransfer={handleCreateTransfer}
              onUpdateTransfer={handleUpdateTransfer}
              onDeleteTransfer={handleDeleteTransfer}
              onApproveTransfer={handleApproveTransfer}
              onRejectTransfer={handleRejectTransfer}
              onShipTransfer={handleShipTransfer}
              onReceiveAndValidateTransfer={handleReceiveTransfer}
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
              stores={accessibleStores}
              categories={categories}
              articles={articles}
              stocks={stocks}
              transfers={visibleTransfers}
              movements={movements}
              sales={sales}
              productions={productions}
              auditLogs={auditLogs}
              currentUser={currentAppUser}
              onOpenReportViewer={(type, filters) => setReportRequest({ type, filters })}
            />
            {reportRequest && (
              <ReportViewer
                reportType={reportRequest.type}
                filters={reportRequest.filters}
                stores={accessibleStores}
                categories={categories}
                articles={articles}
                stocks={stocks}
                transfers={visibleTransfers}
                movements={movements}
                sales={sales}
                productions={productions}
                auditLogs={auditLogs}
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
              auditLogs={auditLogs}
              stores={accessibleStores}
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
              productions={productions}
              stores={accessibleStores}
              articles={articles}
              stocks={stocks}
              currentUser={currentAppUser}
              onCreateProduction={handleCreateProduction}
              onUpdateDraftProduction={handleUpdateDraftProduction}
              onDeleteDraftProduction={handleDeleteDraftProduction}
              onInitiateReturn={handleInitiateProductionReturn}
            />
          </section>
        ) : activeModule === "procurement" && currentAppUser && canManageStores ? (
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
              purchases={purchases}
              stores={inventoryStores}
              articles={articles}
              stocks={stocks}
              currentUser={currentAppUser}
              onCreateSupplier={handleCreateSupplier}
              onToggleSupplier={handleToggleSupplier}
              onReceivePurchase={handleReceivePurchase}
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
              stores={accessibleStores}
              currentUser={currentAppUser}
              canCreate={user.status === "ACTIVE" && (currentAppUser.roleId === "ADMIN" || hasPermission(currentAppUser, "expenses.create"))}
              onValidateExpense={handleValidateExpense}
              onDeleteExpense={handleDeleteExpense}
              onCreateExpense={handleCreateExpense}
              onUpdateExpense={handleUpdateExpense}
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
              sales={sales}
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
            <StaffView employees={employees} stores={inventoryStores} onOpenPayroll={() => setActiveModule("payroll")} onSaveEmployee={handleSaveEmployee} />
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
              currentUserId={currentAppUser.uid}
              onSavePayslip={handleSavePayslip}
              onSaveAdvance={handleSaveAdvance}
            />
          </section>
        ) : user && (
          <RoleHomeView
            user={toAppUser(user)}
            stores={inventoryStores}
            sales={sales}
            expenses={expenses}
            auditLogs={auditLogs}
            onOpenUsers={openUserManagement}
            onOpenSales={() => setActiveModule("sales")}
            onOpenStocks={() => setActiveModule("stocks")}
            onOpenProduction={() => setActiveModule("production")}
            onOpenStores={() => setActiveModule("stores")}
            onOpenCatalog={() => setActiveModule("catalog")}
            onOpenProcurement={() => setActiveModule("procurement")}
            onOpenExpenses={() => setActiveModule("expenses")}
            onOpenTransfers={() => setActiveModule("transfers")}
            onOpenCredit={() => setActiveModule("credit")}
            onOpenResellerOrders={() => setActiveModule("resellerPortal")}
            pendingResellerOrders={resellerOrders.filter(order => order.status === "PENDING").length}
            onOpenUnits={() => setActiveModule("units")}
            onOpenStaff={() => setActiveModule("staff")}
            onOpenReports={() => setActiveModule("reports")}
            onOpenAudit={() => setActiveModule("audit")}
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
      </main>
    </div>
  );
}
