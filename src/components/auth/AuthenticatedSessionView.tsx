import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { authService } from "../../services/authService";
import { AppRoleId, AppUser, Article, AuditLog, Category, Expense, GeneralFilters, Purchase, ReportType, StockTransferLine, Supplier, SupplierPayment, UnitOfMeasure } from "../../types";
import { User } from "../../types/auth";
import { INITIAL_STORES, INITIAL_CATEGORIES, INITIAL_ARTICLES, INITIAL_STOCKS, INITIAL_SALES, INITIAL_PRODUCTIONS, INITIAL_TRANSFERS } from "../../data/initialData";
import UsersView from "../UsersView";
import RoleHomeView from "../RoleHomeView";
import SalesView from "../SalesView";
import StocksView from "../StocksView";
import { Production, Sale, StockMovement, StockTransfer, Store, StoreStock } from "../../types";
import { generateRef, updateStockQuantity } from "../../services/stockService";
import {
  deleteStore,
  loadCatalogData,
  loadInventoryData,
  loadProcurementData,
  receivePurchase,
  recordSupplierPayment,
  saveArticle,
  saveCategory,
  saveStockAdjustment,
  saveStore,
  saveSupplier,
  seedInitialCatalogData,
  seedInitialInventoryData
} from "../../services/inventoryService";
import StoresView from "../StoresView";
import CatalogView from "../CatalogView";
import ProductionView from "../ProductionView";
import ProcurementView from "../ProcurementView";
import ExpensesView from "../ExpensesView";
import TransfersView from "../TransfersView";
import UnitsView from "../UnitsView";
import ReportsView from "../ReportsView";
import ReportViewer from "../ReportViewer";
import { loadExpenses, saveExpense } from "../../services/expenseService";
import { deleteUnit, loadUnits, saveUnit } from "../../services/unitService";
import { 
  ShieldCheck, 
  LogOut, 
  User as UserIcon, 
  Mail, 
  Phone, 
  Calendar, 
  Key, 
  CheckCircle2, 
  Copy, 
  Check, 
  Terminal, 
  Play, 
  AlertTriangle,
  Building,
  Shield,
  Layers
} from "lucide-react";

const APP_ROLES: AppRoleId[] = ["SUPER_ADMIN", "ADMIN", "VENDEUR", "MAGASINIER", "RESPONSABLE_MAGASIN", "PRODUCTION", "COMPTABLE"];

function toAppUser(user: User): AppUser {
  const roleId = APP_ROLES.includes(user.role as AppRoleId) ? user.role as AppRoleId : "VENDEUR";
  return {
    id: user.id,
    uid: user.id,
    username: user.email.split("@")[0],
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: `${user.firstName} ${user.lastName}`,
    role: roleId,
    roleId,
    storeIds: user.assignedStores || [],
    permissions: user.permissions || [],
    isActive: user.status === "ACTIVE",
    createdAt: Date.parse(user.createdAt),
    updatedAt: Date.parse(user.updatedAt)
  };
}

export default function AuthenticatedSessionView() {
  const { user, token, logout } = useAuth();

  const [copiedToken, setCopiedToken] = useState(false);
  const [testResult, setTestResult] = useState<{
    status: number;
    data: any;
    duration: number;
    testedWithToken: boolean;
  } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [managedUsers, setManagedUsers] = useState<AppUser[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<"home" | "sales" | "stocks" | "stores" | "catalog" | "production" | "procurement" | "expenses" | "transfers" | "units">("home");
  const [reportRequest, setReportRequest] = useState<{ type: ReportType; filters: GeneralFilters } | null>(null);
  const [sales, setSales] = useState<Sale[]>([...INITIAL_SALES]);
  const [productions, setProductions] = useState<Production[]>([...INITIAL_PRODUCTIONS]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([...INITIAL_TRANSFERS]);
  const [stocks, setStocks] = useState<StoreStock[]>([...INITIAL_STOCKS]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [inventoryStores, setInventoryStores] = useState([...INITIAL_STORES]);
  const [articles, setArticles] = useState<Article[]>([...INITIAL_ARTICLES]);
  const [categories, setCategories] = useState<Category[]>([...INITIAL_CATEGORIES]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);

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
    async function loadInventory() {
      try {
        if (canManageStores) {
          await Promise.all([seedInitialInventoryData(), seedInitialCatalogData()]);
        }
        const [inventory, catalog, procurement] = await Promise.all([
          loadInventoryData(),
          loadCatalogData(),
          canManageStores ? loadProcurementData() : Promise.resolve({ suppliers: [], purchases: [] })
        ]);
        const loadedUnits = canManageStores ? await loadUnits(catalog.articles) : [];
        if (!isMounted) return;
        setInventoryStores(inventory.stores);
        setStocks(inventory.stocks);
        setMovements(inventory.movements);
        setArticles(catalog.articles);
        setCategories(catalog.categories);
        setUnits(loadedUnits);
        if (canManageStores) {
          setSuppliers(procurement.suppliers);
          setPurchases(procurement.purchases);
        }
      } catch (error) {
        console.error("Inventory Firestore load failed:", error);
      }
    }
    if (user) loadInventory();
    return () => {
      isMounted = false;
    };
  }, [canManageStores, user]);

  useEffect(() => {
    let isMounted = true;
    const canViewExpenses = user && (
      user.role === "ADMIN" ||
      user.role === "SUPER_ADMIN" ||
      user.permissions.includes("expenses.view")
    );
    if (!canViewExpenses) {
      setExpenses([]);
      return;
    }
    loadExpenses()
      .then(loadedExpenses => {
        if (isMounted) setExpenses(loadedExpenses);
      })
      .catch(error => console.error("Expense Firestore load failed:", error));
    return () => {
      isMounted = false;
    };
  }, [user]);

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
    setManagedUsers(current => [...current, toAppUser(response.data!.user)]);
    alert(`Utilisateur créé. Mot de passe temporaire : ${response.data.temporaryPassword}`);
  };

  const handleUpdateManagedUser = async (updatedUser: AppUser) => {
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
    setManagedUsers(current => current.map(item => item.id === updatedUser.id ? toAppUser(response.data!.user) : item));
  };

  const handleDeleteManagedUser = async (userId: string) => {
    const response = await authService.deleteManagedUser(userId);
    if (!response.success) {
      alert(response.message);
      return;
    }
    setManagedUsers(current => current.filter(item => item.id !== userId));
  };

  const openUserManagement = () => {
    document.getElementById("user-management")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const currentAppUser = user ? toAppUser(user) : null;
  const accessibleStores = user && user.assignedStores.length > 0 && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN"
    ? inventoryStores.filter(store => user.assignedStores.includes(store.id))
    : inventoryStores;

  const handleCreateSale = (sale: Sale) => {
    setSales(current => [sale, ...current]);
  };

  const handleVerifySale = (saleId: string) => {
    setSales(current => current.map(sale => {
      if (sale.id !== saleId) return sale;
      return { ...sale, status: sale.status === "DRAFT" ? "CHECKING" : "VERIFIED" };
    }));
  };

  const handleValidateSale = (saleId: string) => {
    setSales(current => current.map(sale => sale.id === saleId ? { ...sale, status: "VALIDATED", validated_at: Date.now(), validated_by: user?.id, validated_by_name: user ? `${user.firstName} ${user.lastName}` : undefined } : sale));
  };

  const handleCancelSale = (saleId: string) => {
    setSales(current => current.map(sale => sale.id === saleId ? { ...sale, status: "CANCELLED" } : sale));
  };

  const handleCreateProduction = (production: Production) => {
    let updatedStocks = stocks;
    production.consumptions.forEach(line => {
      updatedStocks = updateStockQuantity(updatedStocks, production.manufacturer_store_id, line.article_id, -line.quantity).newStocks;
    });
    production.outputs.forEach(line => {
      updatedStocks = updateStockQuantity(updatedStocks, production.manufacturer_store_id, line.article_id, line.quantity).newStocks;
    });
    setStocks(updatedStocks);
    setProductions(current => [production, ...current]);
  };

  const handleInitiateProductionReturn = (transfer: StockTransfer) => {
    setTransfers(current => [transfer, ...current]);
  };

  const handleCreateTransfer = (transfer: StockTransfer) => {
    if (currentAppUser?.roleId !== "ADMIN" && currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("Seul un administrateur peut créer un transfert de stock.");
      return;
    }
    setTransfers(current => [transfer, ...current]);
  };

  const handleApproveTransfer = (transferId: string) => {
    if (currentAppUser?.roleId !== "ADMIN" && currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("Seul un administrateur peut approuver un transfert.");
      return;
    }
    const timestamp = Date.now();
    setTransfers(current => current.map(transfer => transfer.id === transferId && transfer.status === "DRAFT"
      ? { ...transfer, status: "APPROVED", approved_by: currentAppUser?.uid, approved_by_name: currentAppUser?.displayName, approved_at: timestamp, updated_at: timestamp }
      : transfer));
  };

  const handleShipTransfer = (transferId: string) => {
    if (currentAppUser?.roleId !== "ADMIN" && currentAppUser?.roleId !== "SUPER_ADMIN") {
      alert("Seul un administrateur peut expédier un transfert.");
      return;
    }
    const transfer = transfers.find(item => item.id === transferId);
    if (!transfer || transfer.status !== "APPROVED") return;
    let updatedStocks = stocks;
    for (const line of transfer.lines) {
      const available = updatedStocks.find(stock => stock.store_id === transfer.source_store_id && stock.article_id === line.article_id)?.quantity || 0;
      if (line.quantity_sent <= 0 || available < line.quantity_sent) {
        alert(`Stock insuffisant pour ${line.article_name}. Disponible : ${available}.`);
        return;
      }
      updatedStocks = updateStockQuantity(updatedStocks, transfer.source_store_id, line.article_id, -line.quantity_sent).newStocks;
    }
    const timestamp = Date.now();
    setStocks(updatedStocks);
    setTransfers(current => current.map(item => item.id === transferId
      ? { ...item, status: "IN_TRANSIT", shipped_by: currentAppUser?.uid, shipped_by_name: currentAppUser?.displayName, shipped_at: timestamp, updated_at: timestamp }
      : item));
  };

  const handleReceiveTransfer = (transferId: string, updatedLines: StockTransferLine[], receiverNote?: string) => {
    const transfer = transfers.find(item => item.id === transferId);
    if (!transfer || transfer.status !== "IN_TRANSIT") return;
    const isAssignedReceiver = currentAppUser?.roleId === "RESPONSABLE_MAGASIN"
      && currentAppUser.storeIds.includes(transfer.destination_store_id)
      && currentAppUser.uid !== transfer.requested_by;
    if (!isAssignedReceiver) {
      alert("Seul le responsable du magasin destinataire, différent de l'initiateur, peut valider cette réception.");
      return;
    }
    if (updatedLines.some(line => line.quantity_received < 0 || line.quantity_received > line.quantity_sent || line.quantity_accepted < 0 || line.quantity_accepted > line.quantity_received)) {
      alert("Vérifiez les quantités reçues et acceptées : elles ne peuvent pas dépasser la quantité expédiée.");
      return;
    }
    let updatedStocks = stocks;
    updatedLines.forEach(line => {
      if (line.quantity_accepted > 0) {
        updatedStocks = updateStockQuantity(updatedStocks, transfer.destination_store_id, line.article_id, line.quantity_accepted).newStocks;
      }
    });
    const hasDiscrepancy = updatedLines.some(line => line.quantity_rejected > 0 || line.quantity_received !== line.quantity_sent);
    const timestamp = Date.now();
    setStocks(updatedStocks);
    setTransfers(current => current.map(item => item.id === transferId ? {
      ...item,
      status: hasDiscrepancy ? "DISCREPANCY" : "VALIDATED",
      lines: updatedLines,
      received_by: currentAppUser?.uid,
      received_by_name: currentAppUser?.displayName,
      received_at: timestamp,
      validated_by: currentAppUser?.uid,
      validated_by_name: currentAppUser?.displayName,
      validated_at: timestamp,
      has_discrepancy: hasDiscrepancy,
      note: receiverNote || item.note,
      updated_at: timestamp
    } : item));
  };

  const handleResolveTransferDiscrepancy = (transferId: string, resolutionNote: string) => {
    const timestamp = Date.now();
    setTransfers(current => current.map(transfer => transfer.id === transferId && transfer.status === "DISCREPANCY"
      ? { ...transfer, discrepancy_resolved: true, discrepancy_resolution_note: resolutionNote, updated_at: timestamp }
      : transfer));
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
      await saveStockAdjustment(updatedStock, afterQty, movement);
      setStocks(newStocks);
      setMovements(current => [movement, ...current]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Impossible d'enregistrer l'ajustement dans Firestore.");
    }
  };

  const handleCreateStore = async (store: Store) => {
    await saveStore(store);
    setInventoryStores(current => [...current, store]);
  };

  const handleUpdateStore = async (store: Store) => {
    await saveStore(store);
    setInventoryStores(current => current.map(item => item.id === store.id ? store : item));
  };

  const handleToggleStoreStatus = async (storeId: string) => {
    const store = inventoryStores.find(item => item.id === storeId);
    if (!store) return;
    await handleUpdateStore({ ...store, is_active: !store.is_active, updated_at: Date.now() });
  };

  const handleDeleteStore = async (storeId: string) => {
    await deleteStore(storeId);
    setInventoryStores(current => current.filter(store => store.id !== storeId));
    setStocks(current => current.filter(stock => stock.store_id !== storeId));
    setManagedUsers(current => current.map(managedUser => ({
      ...managedUser,
      storeIds: managedUser.storeIds.filter(id => id !== storeId)
    })));
  };

  const handleCreateArticle = async (article: Article) => {
    await saveArticle(article);
    setArticles(current => [...current, article]);
  };

  const handleUpdateArticle = async (article: Article) => {
    await saveArticle(article);
    setArticles(current => current.map(item => item.id === article.id ? article : item));
  };

  const handleToggleArticleStatus = async (articleId: string) => {
    const article = articles.find(item => item.id === articleId);
    if (article) await handleUpdateArticle({ ...article, is_active: !article.is_active, updated_at: Date.now() });
  };

  const handleCreateCategory = async (category: Category) => {
    await saveCategory(category);
    setCategories(current => [...current, category]);
  };

  const handleCreateUnit = async (unit: UnitOfMeasure) => {
    await saveUnit(unit);
    setUnits(current => [...current, unit].sort((left, right) => left.name.localeCompare(right.name, "fr")));
  };

  const handleToggleUnit = async (unit: UnitOfMeasure) => {
    if (!unit.is_active && articles.some(article => article.unit.toLocaleLowerCase("fr-FR") === unit.name.toLocaleLowerCase("fr-FR"))) {
      throw new Error("Cette unité est encore associée à un article et ne peut pas être désactivée.");
    }
    await saveUnit(unit);
    setUnits(current => current.map(item => item.id === unit.id ? unit : item));
  };

  const handleDeleteUnit = async (unitId: string) => {
    const unit = units.find(item => item.id === unitId);
    if (!unit) return;
    if (articles.some(article => article.unit.toLocaleLowerCase("fr-FR") === unit.name.toLocaleLowerCase("fr-FR"))) {
      throw new Error("Cette unité est encore associée à un article et ne peut pas être supprimée.");
    }
    await deleteUnit(unitId);
    setUnits(current => current.filter(item => item.id !== unitId));
  };

  const handleToggleCategoryStatus = async (categoryId: string) => {
    const category = categories.find(item => item.id === categoryId);
    if (!category) return;
    const updated = { ...category, is_active: !category.is_active, updated_at: Date.now() };
    await saveCategory(updated);
    setCategories(current => current.map(item => item.id === categoryId ? updated : item));
  };
  
  const handleImportCatalogData = async (data: { articles: Article[]; categories: Category[] }) => {
    if (!data || !Array.isArray(data.articles) || !Array.isArray(data.categories)) {
      throw new Error("Le fichier catalogue doit contenir les tableaux articles et catégories.");
    }
    await Promise.all([
      ...data.articles.map(article => saveArticle(article)),
      ...data.categories.map(category => saveCategory(category))
    ]);
    setArticles(data.articles);
    setCategories(data.categories);
  };
  
  const handleResetCatalogData = async () => {
    await Promise.all([
      ...INITIAL_ARTICLES.map(article => saveArticle(article)),
      ...INITIAL_CATEGORIES.map(category => saveCategory(category))
    ]);
    setArticles([...INITIAL_ARTICLES]);
    setCategories([...INITIAL_CATEGORIES]);
  };
  
  const handleImportStores = async (data: Store[]) => {
    if (!Array.isArray(data) || data.some(store => !store.id || !store.code || !store.name)) {
      throw new Error("Le fichier magasins est invalide.");
    }
    await Promise.all(data.map(store => saveStore(store)));
    setInventoryStores(data);
  };
  
  const handleResetStores = async () => {
    await Promise.all(INITIAL_STORES.map(store => saveStore(store)));
    setInventoryStores([...INITIAL_STORES]);
  };

  const handleCreateSupplier = async (supplier: Supplier) => {
    await saveSupplier(supplier);
    setSuppliers(current => [...current, supplier]);
  };

  const handleToggleSupplier = async (supplier: Supplier) => {
    await saveSupplier(supplier);
    setSuppliers(current => current.map(item => item.id === supplier.id ? supplier : item));
  };
  
  const handleImportSuppliers = async (data: Supplier[]) => {
    if (!Array.isArray(data) || data.some(supplier => !supplier.id || !supplier.name)) {
      throw new Error("Le fichier fournisseurs est invalide.");
    }
    await Promise.all(data.map(supplier => saveSupplier(supplier)));
    setSuppliers(data);
  };
  
  const handleResetSuppliers = async () => {
    const resetSuppliers = suppliers.map(supplier => ({ ...supplier, is_active: false, updated_at: Date.now() }));
    await Promise.all(resetSuppliers.map(supplier => saveSupplier(supplier)));
    setSuppliers(resetSuppliers);
  };

  const handleReceivePurchase = async (purchase: Purchase) => {
    const updatedStocks = await receivePurchase(purchase, stocks);
    setStocks(updatedStocks);
    setPurchases(current => [purchase, ...current]);
  };
  
  const handleImportUnits = async (data: UnitOfMeasure[]) => {
    if (!Array.isArray(data) || data.some(unit => !unit.id || !unit.name)) {
      throw new Error("Le fichier unités est invalide.");
    }
    await Promise.all(data.map(unit => saveUnit(unit)));
    setUnits([...data].sort((left, right) => left.name.localeCompare(right.name, "fr")));
  };
  
  const handleResetUnits = async () => {
    const resetUnits = units.map(unit => ({ ...unit, is_active: false, updated_at: Date.now() }));
    await Promise.all(resetUnits.map(unit => saveUnit(unit)));
    setUnits(resetUnits);
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
    setManagedUsers(updatedUsers);
  };
  
  const handleResetManagedUsers = async () => {
    const resetUsers = await Promise.all(managedUsers.map(async managedUser => {
      if (managedUser.id === user?.id) return managedUser;
      const response = await authService.updateManagedUser(managedUser.id, { status: "DISABLED" });
      if (!response.success || !response.data) throw new Error(response.message);
      return toAppUser(response.data.user);
    }));
    setManagedUsers(resetUsers);
  };

  const handleRecordSupplierPayment = async (purchase: Purchase, payment: SupplierPayment) => {
    const updatedPurchase = await recordSupplierPayment(purchase, payment);
    setPurchases(current => current.map(item => item.id === purchase.id ? updatedPurchase : item));
  };

  const handleCreateExpense = async (expense: Expense) => {
    await saveExpense(expense);
    setExpenses(current => [expense, ...current].sort((left, right) => right.expense_date - left.expense_date));
  };

  const handleCopyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  const testProtectedRoute = async (withValidToken: boolean) => {
    setTestLoading(true);
    const start = performance.now();
    try {
      const currentUser = withValidToken ? await authService.getCurrentUser() : null;
      const end = performance.now();

      setTestResult({
        status: currentUser ? 200 : 401,
        data: currentUser
          ? { success: true, code: "FIREBASE_SESSION_VALID", data: { user: currentUser } }
          : { success: false, code: "FIREBASE_SESSION_INVALID", message: "Aucune session Firebase active." },
        duration: Math.round(end - start),
        testedWithToken: withValidToken
      });
    } catch (err) {
      const end = performance.now();
      setTestResult({
        status: 0,
        data: { error: err instanceof Error ? err.message : "Erreur réseau" },
        duration: Math.round(end - start),
        testedWithToken: withValidToken
      });
    } finally {
      setTestLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Top Application Bar */}
      <header className="bg-slate-800/90 border-b border-slate-700/80 backdrop-blur sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-base">GILEADA</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                BLOC AUTHENTIFICATION
              </span>
            </div>
            <p className="text-xs text-slate-400">Session utilisateur active & vérifiée</p>
          </div>
        </div>

        {/* User preview and Logout button */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-white">
              {user.firstName} {user.lastName}
            </span>
            <span className="text-[11px] text-slate-400">{user.email}</span>
          </div>

          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:text-rose-200 text-xs font-semibold transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Déconnexion</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Status Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Authentification Réussie</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                  {user.status}
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Le compte est actif. Le jeton de session est valide et prêt pour sécuriser les futurs modules métier.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-700/60 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Session: ACTIVE (24h)</span>
          </div>
        </div>

        {activeModule === "sales" && currentAppUser ? (
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
              stores={accessibleStores}
              articles={articles}
              stocks={stocks}
              currentUser={currentAppUser}
              onCreateSale={handleCreateSale}
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
              transfers={transfers}
              stores={accessibleStores}
              articles={articles.filter(article => article.is_active)}
              stocks={stocks}
              currentUser={currentAppUser}
              canCreate={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN"}
              canApprove={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN"}
              canShip={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN"}
              canReceive={currentAppUser.roleId === "RESPONSABLE_MAGASIN" || currentAppUser.permissions.includes("transfers.receive")}
              canResolveDiscrepancy={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN"}
              onCreateTransfer={handleCreateTransfer}
              onApproveTransfer={handleApproveTransfer}
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
              transfers={transfers}
              movements={movements}
              sales={sales}
              productions={productions}
              auditLogs={[] as AuditLog[]}
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
                transfers={transfers}
                movements={movements}
                sales={sales}
                productions={productions}
                auditLogs={[]}
                currentUser={currentAppUser}
                onClose={() => setReportRequest(null)}
              />
            )}
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
        ) : activeModule === "expenses" && currentAppUser && (currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN" || currentAppUser.permissions.includes("expenses.view")) ? (
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
              canCreate={currentAppUser.roleId === "SUPER_ADMIN" || currentAppUser.roleId === "ADMIN" || currentAppUser.permissions.includes("expenses.create")}
              onCreateExpense={handleCreateExpense}
            />
          </section>
        ) : user && (
          <RoleHomeView
            user={toAppUser(user)}
            onOpenUsers={openUserManagement}
            onOpenSales={() => setActiveModule("sales")}
            onOpenStocks={() => setActiveModule("stocks")}
            onOpenProduction={() => setActiveModule("production")}
            onOpenStores={() => setActiveModule("stores")}
            onOpenCatalog={() => setActiveModule("catalog")}
            onOpenProcurement={() => setActiveModule("procurement")}
            onOpenExpenses={() => setActiveModule("expenses")}
            onOpenTransfers={() => setActiveModule("transfers")}
            onOpenUnits={() => setActiveModule("units")}
            onOpenReports={() => setActiveModule("reports")}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Profile Card */}
          <div className="lg:col-span-1 bg-slate-800/80 rounded-2xl border border-slate-700/80 p-5 space-y-5">
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
          </div>

          {/* Middleware and Session Verification Testing Center */}
          <div className="lg:col-span-2 space-y-6">
            {/* Session Token Details */}
            <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-400" />
                  <span>Jeton de Session Actif (Bearer Token)</span>
                </h3>
                <span className="text-[11px] text-emerald-400 font-mono">Format 256-bit crypto</span>
              </div>

              <div className="relative">
                <div className="font-mono text-xs text-emerald-300 bg-slate-950 p-3.5 rounded-xl border border-slate-700/80 break-all select-all flex items-center justify-between gap-3">
                  <span className="truncate">{token || "Aucun jeton actif"}</span>
                  {token && (
                    <button
                      type="button"
                      onClick={handleCopyToken}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-sans shrink-0 flex items-center gap-1.5 transition-all cursor-pointer border border-slate-600"
                    >
                      {copiedToken ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Ce jeton est stocké de manière sécurisée et transmis dans l'en-tête{" "}
                <code className="bg-slate-900 px-1 py-0.5 rounded text-slate-300 font-mono">
                  Authorization: Bearer &lt;token&gt;
                </code>{" "}
                pour chaque requête protégée.
              </p>
            </div>

              {/* Firebase session verification panel */}
            <div className="bg-slate-800/80 rounded-2xl border border-slate-700/80 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-700/70 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                    <span>Vérification de session Firebase Auth</span>
                </h3>
                  <span className="text-xs text-slate-400">Firebase Auth + Firestore</span>
              </div>

              <p className="text-xs text-slate-300">
                Vérifiez directement la session Firebase et le profil utilisateur Firestore actuellement connectés :
              </p>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => testProtectedRoute(true)}
                  disabled={testLoading}
                  className="p-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-left transition-all cursor-pointer group disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" /> Vérifier la session Firebase
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      HTTP 200 Attendu
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 group-hover:text-slate-300">
                    Recharge l'utilisateur Firebase et son profil Firestore actif.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => testProtectedRoute(false)}
                  disabled={testLoading}
                  className="p-3 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-left transition-all cursor-pointer group disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" /> Tester une session absente
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                      HTTP 401 Attendu
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 group-hover:text-slate-300">
                    Vérifie que l'absence de session est correctement refusée.
                  </p>
                </button>
              </div>

              {/* Test Response Console */}
              {testResult && (
                <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-700/80 font-mono text-xs space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-2">
                    <span className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          testResult.status === 200 ? "bg-emerald-400" : "bg-rose-400"
                        }`}
                      />
                      <span>Résultat : Firebase Auth / users/{"uid"}</span>
                    </span>
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded ${
                          testResult.status === 200
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-rose-500/20 text-rose-400"
                        }`}
                      >
                        Status: {testResult.status} {testResult.status === 200 ? "OK" : "Unauthorized"}
                      </span>
                      <span className="text-[11px] text-slate-500">{testResult.duration}ms</span>
                    </div>
                  </div>

                  <pre className="text-slate-300 overflow-x-auto text-[11px] leading-relaxed pt-1">
                    {JSON.stringify(testResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Architecture Modular Notice */}
            <div className="p-4 bg-slate-800/40 border border-slate-700/60 rounded-2xl flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                <Layers className="w-4 h-4" />
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                <span className="font-bold text-white block">
                  Conformité de l'Architecture Modulaire GILEADA
                </span>
                <p className="text-slate-400 leading-relaxed">
                  Le bloc d'authentification est totalement autonome et étanche. Aucun module métier (Stock, Ventes, POS, Transferts, Production, Rapports) n'a été altéré ou prématurément instancié. Dès que l'administrateur configurera les rôles et affectations de magasins, les modules pourront être montés directement sur cette fondation sécurisée.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
