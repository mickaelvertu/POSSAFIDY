import { useState, useEffect } from "react";
import { 
  Store, 
  Category, 
  Article, 
  StoreStock, 
  StockTransfer, 
  StockTransferLine, 
  StockMovement, 
  Sale, 
  Production, 
  AuditLog, 
  UserProfile, 
  ReportType, 
  GeneralFilters,
  StockMovementType
} from "./types";
import { 
  INITIAL_STORES, 
  INITIAL_CATEGORIES, 
  INITIAL_ARTICLES, 
  INITIAL_STOCKS, 
  INITIAL_TRANSFERS, 
  INITIAL_SALES, 
  INITIAL_PRODUCTIONS, 
  INITIAL_MOVEMENTS, 
  INITIAL_AUDIT_LOGS, 
  DEMO_USERS 
} from "./data/initialData";
import { updateStockQuantity } from "./services/stockService";

import Navbar from "./components/Navbar";
import DashboardView from "./components/DashboardView";
import StocksView from "./components/StocksView";
import TransfersView from "./components/TransfersView";
import SalesView from "./components/SalesView";
import ProductionView from "./components/ProductionView";
import CatalogView from "./components/CatalogView";
import StoresView from "./components/StoresView";
import MovementsView from "./components/MovementsView";
import ReportsView from "./components/ReportsView";
import AuditView from "./components/AuditView";
import ReportViewer from "./components/ReportViewer";

import { 
  LayoutDashboard, 
  Boxes, 
  ArrowRightLeft, 
  ShoppingCart, 
  Factory, 
  Tag, 
  Building2, 
  ArrowUpDown, 
  FileText, 
  ShieldAlert
} from "lucide-react";

export default function App() {
  // Navigation active tab
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Current logged in user (defaults to Super Admin for seamless exploration)
  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem("gileada_user");
    return saved ? JSON.parse(saved) : DEMO_USERS[0];
  });

  // Application Data States with LocalStorage Persistence
  const [stores, setStores] = useState<Store[]>(() => {
    const saved = localStorage.getItem("gileada_stores_v2");
    return saved ? JSON.parse(saved) : INITIAL_STORES;
  });

  const [categories, setCategories] = useState<Category[]>(() => {
    const saved = localStorage.getItem("gileada_categories_v2");
    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
  });

  const [articles, setArticles] = useState<Article[]>(() => {
    const saved = localStorage.getItem("gileada_articles_v2");
    return saved ? JSON.parse(saved) : INITIAL_ARTICLES;
  });

  const [stocks, setStocks] = useState<StoreStock[]>(() => {
    const saved = localStorage.getItem("gileada_stocks_v2");
    return saved ? JSON.parse(saved) : INITIAL_STOCKS;
  });

  const [transfers, setTransfers] = useState<StockTransfer[]>(() => {
    const saved = localStorage.getItem("gileada_transfers_v2");
    return saved ? JSON.parse(saved) : INITIAL_TRANSFERS;
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    const saved = localStorage.getItem("gileada_sales_v2");
    return saved ? JSON.parse(saved) : INITIAL_SALES;
  });

  const [productions, setProductions] = useState<Production[]>(() => {
    const saved = localStorage.getItem("gileada_productions_v2");
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTIONS;
  });

  const [movements, setMovements] = useState<StockMovement[]>(() => {
    const saved = localStorage.getItem("gileada_movements_v2");
    return saved ? JSON.parse(saved) : INITIAL_MOVEMENTS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem("gileada_audit_v2");
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  // Report Viewer Modal State
  const [activeReport, setActiveReport] = useState<{
    type: ReportType;
    filters: GeneralFilters;
  } | null>(null);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem("gileada_user", JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem("gileada_stores_v2", JSON.stringify(stores));
  }, [stores]);

  useEffect(() => {
    localStorage.setItem("gileada_categories_v2", JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem("gileada_articles_v2", JSON.stringify(articles));
  }, [articles]);

  useEffect(() => {
    localStorage.setItem("gileada_stocks_v2", JSON.stringify(stocks));
  }, [stocks]);

  useEffect(() => {
    localStorage.setItem("gileada_transfers_v2", JSON.stringify(transfers));
  }, [transfers]);

  useEffect(() => {
    localStorage.setItem("gileada_sales_v2", JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem("gileada_productions_v2", JSON.stringify(productions));
  }, [productions]);

  useEffect(() => {
    localStorage.setItem("gileada_movements_v2", JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    localStorage.setItem("gileada_audit_v2", JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Reset to initial demo fixtures
  const handleResetData = () => {
    if (confirm("Réinitialiser toutes les données de l'application aux valeurs par défaut de démonstration ?")) {
      setStores(INITIAL_STORES);
      setCategories(INITIAL_CATEGORIES);
      setArticles(INITIAL_ARTICLES);
      setStocks(INITIAL_STOCKS);
      setTransfers(INITIAL_TRANSFERS);
      setSales(INITIAL_SALES);
      setProductions(INITIAL_PRODUCTIONS);
      setMovements(INITIAL_MOVEMENTS);
      setAuditLogs(INITIAL_AUDIT_LOGS);
      localStorage.clear();
      alert("Données réinitialisées avec succès !");
    }
  };

  // Helper to log audit events (Section 11)
  const logAudit = (
    action: string, 
    entityType: string, 
    entityId: string, 
    storeId?: string, 
    oldValue?: any, 
    newValue?: any
  ) => {
    const newLog: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: currentUser.uid,
      user_name: `${currentUser.displayName || currentUser.email} (${currentUser.role})`,
      store_id: storeId || currentUser.storeId,
      device_id: "BROWSER-CLIENT-LINUX",
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_value: oldValue,
      new_value: newValue,
      created_at: Date.now()
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  // --- 1. TRANSFERTS WORKFLOW (Section 3, 4, 5) ---
  const handleCreateTransfer = (transfer: StockTransfer) => {
    setTransfers(prev => [transfer, ...prev]);
    logAudit("CREATE_TRANSFER", "STOCK_TRANSFER", transfer.transfer_number, transfer.source_store_id, null, transfer);
  };

  const handleApproveTransfer = (transferId: string) => {
    setTransfers(prev => prev.map(t => {
      if (t.id === transferId) {
        logAudit("APPROVE_TRANSFER", "STOCK_TRANSFER", t.transfer_number, t.source_store_id, { status: t.status }, { status: "APPROVED" });
        return {
          ...t,
          status: "APPROVED",
          approved_by: currentUser.uid,
          approved_by_name: currentUser.displayName || currentUser.email,
          approved_at: Date.now(),
          updated_at: Date.now()
        };
      }
      return t;
    }));
  };

  // Rule 4: Lors de l'expédition :
  // - stock source diminué immédiatement de quantity_sent
  // - stock destination RESTE STRICTEMENT INCHANGÉ
  // - statut = IN_TRANSIT
  const handleShipTransfer = (transferId: string) => {
    const target = transfers.find(t => t.id === transferId);
    if (!target) return;

    let updatedStocks = [...stocks];
    const newMovements: StockMovement[] = [];

    // Deduct each line from source store
    target.lines.forEach(line => {
      const res = updateStockQuantity(updatedStocks, target.source_store_id, line.article_id, -line.quantity_sent);
      updatedStocks = res.newStocks;

      // Determine movement type
      let movType: StockMovementType = "CENTRAL_TO_POS";
      if (target.type === "CENTRAL_TO_RESELLER") movType = "CENTRAL_TO_RESELLER";
      if (target.type === "CENTRAL_TO_MANUFACTURER") movType = "CENTRAL_TO_MANUFACTURER";
      if (target.type === "STORE_TO_STORE") movType = "STORE_TO_STORE";
      if (target.type === "MANUFACTURER_TO_CENTRAL") movType = "MANUFACTURER_TO_CENTRAL";
      if (target.type === "RETURN") movType = "RETURN";

      newMovements.push({
        id: `mov-${Date.now()}-${line.id}`,
        store_id: target.source_store_id,
        article_id: line.article_id,
        movement_type: movType,
        quantity: -line.quantity_sent,
        reference_type: "TRANSFER",
        reference_id: target.id,
        reference_number: target.transfer_number,
        before_quantity: res.beforeQty,
        after_quantity: res.afterQty,
        created_by: currentUser.uid,
        created_by_name: currentUser.displayName || currentUser.email,
        notes: `Expédition transfert ${target.transfer_number}`,
        created_at: Date.now()
      });
    });

    setStocks(updatedStocks);
    setMovements(prev => [...newMovements, ...prev]);

    setTransfers(prev => prev.map(t => {
      if (t.id === transferId) {
        return {
          ...t,
          status: "IN_TRANSIT",
          shipped_by: currentUser.uid,
          shipped_by_name: currentUser.displayName || currentUser.email,
          shipped_at: Date.now(),
          updated_at: Date.now()
        };
      }
      return t;
    }));

    logAudit("SHIP_TRANSFER", "STOCK_TRANSFER", target.transfer_number, target.source_store_id, { status: target.status }, { status: "IN_TRANSIT" });
  };

  // Rule 4: Lors de la réception :
  // - seule la quantité acceptée est créditée au destinataire
  // - les écarts (rejets/manquants) restent tracés
  const handleReceiveAndValidateTransfer = (
    transferId: string, 
    updatedLines: StockTransferLine[], 
    receiverNote?: string
  ) => {
    const target = transfers.find(t => t.id === transferId);
    if (!target) return;

    let updatedStocks = [...stocks];
    const newMovements: StockMovement[] = [];
    let hasDiscrepancy = false;

    // Credit each line into destination store for ACCEPTED quantity ONLY
    updatedLines.forEach(line => {
      if (line.quantity_rejected > 0) {
        hasDiscrepancy = true;
      }

      if (line.quantity_accepted > 0) {
        const res = updateStockQuantity(updatedStocks, target.destination_store_id, line.article_id, line.quantity_accepted);
        updatedStocks = res.newStocks;

        let movType: StockMovementType = "CENTRAL_TO_POS";
        if (target.type === "CENTRAL_TO_RESELLER") movType = "CENTRAL_TO_RESELLER";
        if (target.type === "CENTRAL_TO_MANUFACTURER") movType = "CENTRAL_TO_MANUFACTURER";
        if (target.type === "STORE_TO_STORE") movType = "STORE_TO_STORE";
        if (target.type === "MANUFACTURER_TO_CENTRAL") movType = "MANUFACTURER_TO_CENTRAL";
        if (target.type === "RETURN") movType = "RETURN";

        newMovements.push({
          id: `mov-${Date.now()}-${line.id}-rcv`,
          store_id: target.destination_store_id,
          article_id: line.article_id,
          movement_type: movType,
          quantity: line.quantity_accepted,
          reference_type: "TRANSFER",
          reference_id: target.id,
          reference_number: target.transfer_number,
          before_quantity: res.beforeQty,
          after_quantity: res.afterQty,
          created_by: currentUser.uid,
          created_by_name: currentUser.displayName || currentUser.email,
          notes: `Réception validée ${target.transfer_number}`,
          created_at: Date.now()
        });
      }
    });

    setStocks(updatedStocks);
    setMovements(prev => [...newMovements, ...prev]);

    const finalStatus = hasDiscrepancy ? "DISCREPANCY" : "VALIDATED";

    setTransfers(prev => prev.map(t => {
      if (t.id === transferId) {
        return {
          ...t,
          lines: updatedLines,
          status: finalStatus,
          received_by: currentUser.uid,
          received_by_name: currentUser.displayName || currentUser.email,
          validated_by: currentUser.uid,
          validated_by_name: currentUser.displayName || currentUser.email,
          received_at: Date.now(),
          validated_at: Date.now(),
          has_discrepancy: hasDiscrepancy,
          discrepancy_resolved: !hasDiscrepancy,
          note: receiverNote || t.note,
          updated_at: Date.now()
        };
      }
      return t;
    }));

    logAudit("RECEIVE_AND_VALIDATE_TRANSFER", "STOCK_TRANSFER", target.transfer_number, target.destination_store_id, { status: "IN_TRANSIT" }, { status: finalStatus, hasDiscrepancy });
  };

  const handleResolveDiscrepancy = (transferId: string, resolutionNote: string) => {
    setTransfers(prev => prev.map(t => {
      if (t.id === transferId) {
        logAudit("RESOLVE_DISCREPANCY", "STOCK_TRANSFER", t.transfer_number, t.destination_store_id, null, { resolution: resolutionNote });
        return {
          ...t,
          status: "VALIDATED",
          discrepancy_resolved: true,
          discrepancy_resolution_note: resolutionNote,
          updated_at: Date.now()
        };
      }
      return t;
    }));
  };

  // --- 2. VENTES WORKFLOW (Section 7 & 8) ---
  const handleCreateSale = (sale: Sale) => {
    setSales(prev => [sale, ...prev]);
    logAudit("CREATE_SALE", "SALE", sale.sale_number, sale.store_id, null, sale);
  };

  const handleVerifySale = (saleId: string) => {
    setSales(prev => prev.map(s => {
      if (s.id === saleId) {
        const nextStatus = s.status === "DRAFT" ? "CHECKING" : "VERIFIED";
        logAudit("VERIFY_SALE", "SALE", s.sale_number, s.store_id, { status: s.status }, { status: nextStatus });
        return {
          ...s,
          status: nextStatus,
          verified_by: currentUser.uid,
          verified_by_name: currentUser.displayName || currentUser.email,
          verified_at: Date.now()
        };
      }
      return s;
    }));
  };

  // Section 8: Une vente validée crée alors la sortie de stock correspondante.
  const handleValidateSale = (saleId: string) => {
    const target = sales.find(s => s.id === saleId);
    if (!target) return;

    let updatedStocks = [...stocks];
    const newMovements: StockMovement[] = [];

    // Deduct each sold line from store stock
    target.lines.forEach(line => {
      const res = updateStockQuantity(updatedStocks, target.store_id, line.article_id, -line.quantity);
      updatedStocks = res.newStocks;

      newMovements.push({
        id: `mov-${Date.now()}-${line.id}-sale`,
        store_id: target.store_id,
        article_id: line.article_id,
        movement_type: "SALE",
        quantity: -line.quantity,
        reference_type: "SALE",
        reference_id: target.id,
        reference_number: target.sale_number,
        before_quantity: res.beforeQty,
        after_quantity: res.afterQty,
        created_by: currentUser.uid,
        created_by_name: currentUser.displayName || currentUser.email,
        notes: `Vente caisse ${target.sale_number} - ${target.customer_name}`,
        created_at: Date.now()
      });
    });

    setStocks(updatedStocks);
    setMovements(prev => [...newMovements, ...prev]);

    setSales(prev => prev.map(s => {
      if (s.id === saleId) {
        return {
          ...s,
          status: "VALIDATED",
          validated_by: currentUser.uid,
          validated_by_name: currentUser.displayName || currentUser.email,
          validated_at: Date.now()
        };
      }
      return s;
    }));

    logAudit("VALIDATE_SALE_AND_OUTPUT_STOCK", "SALE", target.sale_number, target.store_id, { status: target.status }, { status: "VALIDATED", total: target.total });
  };

  const handleCancelSale = (saleId: string) => {
    setSales(prev => prev.map(s => {
      if (s.id === saleId) {
        logAudit("CANCEL_SALE", "SALE", s.sale_number, s.store_id, { status: s.status }, { status: "CANCELLED" });
        return { ...s, status: "CANCELLED" };
      }
      return s;
    }));
  };

  // --- 3. PRODUCTION WORKFLOW (Section 6) ---
  const handleCreateProduction = (prod: Production) => {
    let updatedStocks = [...stocks];
    const newMovements: StockMovement[] = [];

    // 1. Decrease consumed raw materials from manufacturer store
    prod.consumptions.forEach(c => {
      const res = updateStockQuantity(updatedStocks, prod.manufacturer_store_id, c.article_id, -c.quantity);
      updatedStocks = res.newStocks;

      newMovements.push({
        id: `mov-${Date.now()}-${c.id}-cons`,
        store_id: prod.manufacturer_store_id,
        article_id: c.article_id,
        movement_type: "CONSUMPTION",
        quantity: -c.quantity,
        reference_type: "PRODUCTION",
        reference_id: prod.id,
        reference_number: prod.production_number,
        before_quantity: res.beforeQty,
        after_quantity: res.afterQty,
        created_by: currentUser.uid,
        created_by_name: currentUser.displayName || currentUser.email,
        notes: `Consommation fabrication ${prod.production_number}`,
        created_at: Date.now()
      });
    });

    // 2. Increase manufactured finished goods into manufacturer store
    prod.outputs.forEach(o => {
      const res = updateStockQuantity(updatedStocks, prod.manufacturer_store_id, o.article_id, o.quantity);
      updatedStocks = res.newStocks;

      newMovements.push({
        id: `mov-${Date.now()}-${o.id}-out`,
        store_id: prod.manufacturer_store_id,
        article_id: o.article_id,
        movement_type: "PRODUCTION",
        quantity: o.quantity,
        reference_type: "PRODUCTION",
        reference_id: prod.id,
        reference_number: prod.production_number,
        before_quantity: res.beforeQty,
        after_quantity: res.afterQty,
        created_by: currentUser.uid,
        created_by_name: currentUser.displayName || currentUser.email,
        notes: `Entrée produit fini ${prod.production_number}`,
        created_at: Date.now()
      });
    });

    setStocks(updatedStocks);
    setMovements(prev => [...newMovements, ...prev]);
    setProductions(prev => [prod, ...prev]);

    logAudit("CREATE_AND_VALIDATE_PRODUCTION", "PRODUCTION", prod.production_number, prod.manufacturer_store_id, null, prod);
  };

  // --- 4. INVENTORY ADJUSTMENTS (Section 10) ---
  const handleAdjustStock = (storeId: string, articleId: string, newQty: number, reason: string) => {
    const currentStock = stocks.find(s => s.store_id === storeId && s.article_id === articleId)?.quantity || 0;
    const delta = newQty - currentStock;

    const res = updateStockQuantity(stocks, storeId, articleId, delta);
    setStocks(res.newStocks);

    const art = articles.find(a => a.id === articleId);
    const movRef = `INV-${Date.now().toString(36).toUpperCase()}`;

    setMovements(prev => [{
      id: `mov-${Date.now()}-adj`,
      store_id: storeId,
      article_id: articleId,
      movement_type: "INVENTORY_ADJUSTMENT",
      quantity: delta,
      reference_type: "INVENTORY",
      reference_id: movRef,
      reference_number: movRef,
      before_quantity: res.beforeQty,
      after_quantity: res.afterQty,
      created_by: currentUser.uid,
      created_by_name: currentUser.displayName || currentUser.email,
      notes: reason,
      created_at: Date.now()
    }, ...prev]);

    logAudit("INVENTORY_ADJUSTMENT", "STOCK", `${storeId}:${art?.code}`, storeId, { before: res.beforeQty }, { after: res.afterQty, reason });
  };

  // --- 5. CATALOGUE & MAGASINS (Section 1 & 2) ---
  const handleCreateArticle = (art: Article) => {
    setArticles(prev => [art, ...prev]);
    logAudit("CREATE_ARTICLE", "ARTICLE", art.code, undefined, null, art);
  };

  const handleUpdateArticle = (art: Article) => {
    setArticles(prev => prev.map(a => a.id === art.id ? art : a));
    logAudit("UPDATE_ARTICLE", "ARTICLE", art.code, undefined, null, art);
  };

  const handleToggleArticleStatus = (articleId: string) => {
    setArticles(prev => prev.map(a => {
      if (a.id === articleId) {
        const nextState = !a.is_active;
        logAudit("TOGGLE_ARTICLE_ACTIVE", "ARTICLE", a.code, undefined, { active: a.is_active }, { active: nextState });
        return { ...a, is_active: nextState, updated_at: Date.now() };
      }
      return a;
    }));
  };

  const handleCreateCategory = (cat: Category) => {
    setCategories(prev => [cat, ...prev]);
    logAudit("CREATE_CATEGORY", "CATEGORY", cat.code, undefined, null, cat);
  };

  const handleToggleCategoryStatus = (categoryId: string) => {
    setCategories(prev => prev.map(c => {
      if (c.id === categoryId) {
        return { ...c, is_active: !c.is_active, updated_at: Date.now() };
      }
      return c;
    }));
  };

  const handleCreateStore = (store: Store) => {
    setStores(prev => [store, ...prev]);
    logAudit("CREATE_STORE", "STORE", store.code, store.id, null, store);
  };

  const handleUpdateStore = (store: Store) => {
    setStores(prev => prev.map(s => s.id === store.id ? store : s));
    logAudit("UPDATE_STORE", "STORE", store.code, store.id, null, store);
  };

  const handleToggleStoreStatus = (storeId: string) => {
    setStores(prev => prev.map(s => {
      if (s.id === storeId) {
        return { ...s, is_active: !s.is_active, updated_at: Date.now() };
      }
      return s;
    }));
  };

  // Launch Report Viewer Modal
  const handleOpenReportViewer = (type: ReportType, filters: GeneralFilters) => {
    setActiveReport({ type, filters });
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        onSelectUser={(u) => setCurrentUser(u)}
        onResetData={handleResetData}
      />

      {/* Main Container with Sidebar Navigation */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 flex flex-col lg:flex-row gap-6">
        
        {/* Navigation Sidebar */}
        <aside className="w-full lg:w-64 shrink-0">
          <nav className="bg-white rounded-2xl border border-slate-200 p-3 shadow-xs space-y-1 sticky top-20">
            
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "dashboard" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Tableau de Bord</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("stocks")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "stocks" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Boxes className="h-4 w-4" />
              <span>Stock Multi-Magasin</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("transfers")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "transfers" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <ArrowRightLeft className="h-4 w-4" />
                <span>Transferts & Réceptions</span>
              </div>
              {transfers.filter(t => t.status === "IN_TRANSIT").length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                  {transfers.filter(t => t.status === "IN_TRANSIT").length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("sales")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "sales" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              <span>Ventes & Caisse</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("production")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "production" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Factory className="h-4 w-4" />
              <span>Magasin Production</span>
            </button>

            <div className="pt-2 pb-1 px-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Paramétrage & Données
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("catalog")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "catalog" ? "bg-purple-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Tag className="h-4 w-4" />
              <span>Articles & Catégories</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("stores")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "stores" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>Magasins & Entrepôts</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("movements")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "movements" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ArrowUpDown className="h-4 w-4" />
              <span>Mouvements (14 Flux)</span>
            </button>

            <div className="pt-2 pb-1 px-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                États & Sécurité
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab("reports")}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "reports" ? "bg-blue-900 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4" />
                <span>13 Rapports PDF</span>
              </div>
              <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                13
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("audit")}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === "audit" ? "bg-slate-800 text-white shadow-xs" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>Journal d'Audit</span>
            </button>

          </nav>
        </aside>

        {/* Content View Container */}
        <main className="flex-1 min-w-0">
          {activeTab === "dashboard" && (
            <DashboardView
              stores={stores}
              articles={articles}
              stocks={stocks}
              transfers={transfers}
              sales={sales}
              movements={movements}
              productions={productions}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === "stocks" && (
            <StocksView
              stores={stores}
              categories={categories}
              articles={articles}
              stocks={stocks}
              currentUser={currentUser}
              onAdjustStock={handleAdjustStock}
            />
          )}

          {activeTab === "transfers" && (
            <TransfersView
              transfers={transfers}
              stores={stores}
              articles={articles}
              stocks={stocks}
              currentUser={currentUser}
              onCreateTransfer={handleCreateTransfer}
              onApproveTransfer={handleApproveTransfer}
              onShipTransfer={handleShipTransfer}
              onReceiveAndValidateTransfer={handleReceiveAndValidateTransfer}
              onResolveDiscrepancy={handleResolveDiscrepancy}
            />
          )}

          {activeTab === "sales" && (
            <SalesView
              sales={sales}
              stores={stores}
              articles={articles}
              stocks={stocks}
              currentUser={currentUser}
              onCreateSale={handleCreateSale}
              onVerifySale={handleVerifySale}
              onValidateSale={handleValidateSale}
              onCancelSale={handleCancelSale}
            />
          )}

          {activeTab === "production" && (
            <ProductionView
              productions={productions}
              stores={stores}
              articles={articles}
              stocks={stocks}
              currentUser={currentUser}
              onCreateProduction={handleCreateProduction}
              onInitiateReturn={handleCreateTransfer}
            />
          )}

          {activeTab === "catalog" && (
            <CatalogView
              articles={articles}
              categories={categories}
              currentUser={currentUser}
              onCreateArticle={handleCreateArticle}
              onUpdateArticle={handleUpdateArticle}
              onToggleArticleStatus={handleToggleArticleStatus}
              onCreateCategory={handleCreateCategory}
              onToggleCategoryStatus={handleToggleCategoryStatus}
            />
          )}

          {activeTab === "stores" && (
            <StoresView
              stores={stores}
              currentUser={currentUser}
              onCreateStore={handleCreateStore}
              onUpdateStore={handleUpdateStore}
              onToggleStoreStatus={handleToggleStoreStatus}
            />
          )}

          {activeTab === "movements" && (
            <MovementsView
              movements={movements}
              stores={stores}
              articles={articles}
            />
          )}

          {activeTab === "reports" && (
            <ReportsView
              stores={stores}
              categories={categories}
              articles={articles}
              stocks={stocks}
              transfers={transfers}
              movements={movements}
              sales={sales}
              productions={productions}
              auditLogs={auditLogs}
              currentUser={currentUser}
              onOpenReportViewer={handleOpenReportViewer}
            />
          )}

          {activeTab === "audit" && (
            <AuditView
              auditLogs={auditLogs}
              stores={stores}
            />
          )}
        </main>

      </div>

      {/* Official GILEADA PDF Report Modal */}
      {activeReport && (
        <ReportViewer
          reportType={activeReport.type}
          filters={activeReport.filters}
          stores={stores}
          categories={categories}
          articles={articles}
          stocks={stocks}
          transfers={transfers}
          movements={movements}
          sales={sales}
          productions={productions}
          auditLogs={auditLogs}
          currentUser={{
            email: currentUser.email,
            displayName: currentUser.displayName
          }}
          onClose={() => setActiveReport(null)}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="font-semibold text-slate-700">
            GILEADA Madagascar © {new Date().getFullYear()} — Système de Gestion Multi-Magasins & Traçabilité
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Version 2.0 • Respect strict des règles métier (Articles, Magasins, Flux, Ventes, Rapports)
          </div>
        </div>
      </footer>

    </div>
  );
}
