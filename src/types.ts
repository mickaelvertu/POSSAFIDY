// GILEADA — Modèle de données & Règles métier
export * from "./types/auth";


export type AppRoleId =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "VENDEUR"
  | "MAGASINIER"
  | "RESPONSABLE_MAGASIN"
  | "PRODUCTION"
  | "COMPTABLE";

export type AppPermission = string;

export type UserRole = AppRoleId | "admin" | "storekeeper_central" | "pos_seller" | "reseller_manager" | "manufacturer_manager";

export type Permission = 
  | "CREATE"
  | "READ"
  | "UPDATE"
  | "DEACTIVATE"
  | "APPROVE"
  | "SHIP"
  | "RECEIVE"
  | "VERIFY"
  | "VALIDATE"
  | "CANCEL"
  | "ADJUST_STOCK"
  | "EXPORT_PDF";

export interface UserProfile {
  id: string;
  uid: string;
  username: string;
  email: string;
  displayName: string;
  role: UserRole;
  roleId: AppRoleId;
  firstName: string;
  lastName: string;
  storeId?: string;
  storeIds: string[];
  permissions: AppPermission[];
  isActive: boolean;
  createdAt: number;
  updatedAt?: number;
  lastLoginAt?: number;
}

export type AppUser = UserProfile;

export const ALL_PERMISSIONS: AppPermission[] = [
  "dashboard.view", "products.view", "products.create", "products.edit",
  "stock.view", "stock.create", "stock.edit", "stock.adjust",
  "sales.view", "sales.create", "sales.edit", "sales.validate", "sales.cancel",
  "transfers.view", "transfers.create", "transfers.approve", "transfers.ship",
  "transfers.receive", "transfers.validate", "production.view", "production.create",
  "production.validate", "reports.view", "reports.export", "audit.view",
  "users.view", "users.create", "users.edit", "users.delete", "users.permissions",
  "expenses.view", "expenses.create", "units.manage"
];

// 1. Types de magasins
export type StoreTypeCode = "CENTRAL_WAREHOUSE" | "POS" | "RESELLER" | "MANUFACTURER";

export interface Store {
  id: string; // UUID PK immuable
  code: string; // Code métier modifiable par admin (ex: DEP-01, POS-ANA)
  name: string;
  store_type: StoreTypeCode;
  location?: string;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

// 2. Catégories administrables
export interface Category {
  id: string; // UUID PK
  code: string; // Code métier UNIQUE
  name: string;
  description?: string;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface UnitOfMeasure {
  id: string;
  name: string;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

// 3. Articles (RESALE ou RAW_MATERIAL)
export type ArticleTypeCode = "RESALE" | "RAW_MATERIAL";

export interface Article {
  id: string; // UUID PK
  code: string; // Code métier UNIQUE (ex: A-001)
  name: string;
  category_id: string;
  article_type: ArticleTypeCode;
  unit: string; // Flacon, Pot, Sachet, Litre, Kg, etc.
  prix_achat: number;
  prix_normal: number;
  prix_revendeur: number;
  prix_special?: number;
  min_alert_stock?: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export type PurchasePaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export interface PurchaseLine {
  id: string;
  article_id: string;
  article_code: string;
  article_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  total: number;
}

export interface SupplierPayment {
  id: string;
  amount: number;
  paid_at: number;
  method: PaymentMethod;
  reference?: string;
}

export type ExpenseCategory = "RENT" | "ELECTRICITY" | "FUEL" | "TRANSPORT" | "MAINTENANCE" | "SUPPLIES" | "COMMUNICATION" | "OTHER";

export interface Expense {
  id: string;
  expense_number: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: number;
  store_id?: string;
  store_name?: string;
  payee?: string;
  payment_method: PaymentMethod;
  payment_status: "PAID" | "PENDING";
  reference?: string;
  notes?: string;
  created_by: string;
  created_by_name: string;
  created_at: number;
}

export interface Purchase {
  id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_name: string;
  store_id: string;
  invoice_number: string;
  lines: PurchaseLine[];
  total: number;
  amount_paid: number;
  payment_status: PurchasePaymentStatus;
  expected_payment_at: number;
  payments: SupplierPayment[];
  notes?: string;
  received_by: string;
  received_by_name: string;
  received_at: number;
  created_at: number;
  updated_at: number;
}

// 4. Stock par magasin
export interface StoreStock {
  id: string; // UUID PK
  store_id: string;
  article_id: string;
  quantity: number;
  reserved_quantity: number;
  updated_at: number;
}

// 5. Transferts & Réceptions
export type TransferStatus = 
  | "DRAFT"
  | "APPROVED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "RECEIVED"
  | "VALIDATED"
  | "DISCREPANCY"
  | "CANCELLED";

export type TransferTypeCode = 
  | "CENTRAL_TO_POS"
  | "CENTRAL_TO_RESELLER"
  | "CENTRAL_TO_MANUFACTURER"
  | "STORE_TO_STORE"
  | "MANUFACTURER_TO_CENTRAL"
  | "MANUFACTURER_TO_STORE"
  | "RETURN";

export interface StockTransferLine {
  id: string;
  transfer_id: string;
  article_id: string;
  article_code: string;
  article_name: string;
  unit: string;
  quantity_sent: number;
  quantity_received: number;
  quantity_accepted: number;
  quantity_rejected: number; // Discrepancy / manquants / avaries
  note?: string;
}

export interface StockTransfer {
  id: string;
  transfer_number: string; // ex: TRF-2026-0001
  type: TransferTypeCode;
  source_store_id: string;
  destination_store_id: string;
  status: TransferStatus;
  requested_by: string;
  requested_by_name: string;
  approved_by?: string;
  approved_by_name?: string;
  shipped_by?: string;
  shipped_by_name?: string;
  received_by?: string;
  received_by_name?: string;
  validated_by?: string;
  validated_by_name?: string;
  approved_at?: number;
  shipped_at?: number;
  received_at?: number;
  validated_at?: number;
  lines: StockTransferLine[];
  note?: string;
  has_discrepancy?: boolean;
  discrepancy_resolved?: boolean;
  discrepancy_resolution_note?: string;
  created_at: number;
  updated_at: number;
}

// 6. Types de flux & Mouvements de stock
export type StockMovementType = 
  | "PURCHASE"
  | "CENTRAL_TO_POS"
  | "CENTRAL_TO_RESELLER"
  | "CENTRAL_TO_MANUFACTURER"
  | "STORE_TO_STORE"
  | "MANUFACTURER_TO_CENTRAL"
  | "MANUFACTURER_TO_STORE"
  | "SALE"
  | "RETURN"
  | "PRODUCTION"
  | "CONSUMPTION"
  | "INVENTORY_ADJUSTMENT"
  | "LOSS"
  | "EXPIRY";

export interface StockMovement {
  id: string;
  store_id: string;
  article_id: string;
  movement_type: StockMovementType;
  quantity: number; // positif pour entrée, négatif pour sortie
  reference_type: string; // TRANSFER, SALE, PRODUCTION, INVENTORY
  reference_id: string;
  reference_number: string;
  before_quantity: number;
  after_quantity: number;
  created_by: string;
  created_by_name: string;
  notes?: string;
  created_at: number;
}

// 7. Ventes & Lignes de vente
export type SaleStatus = 
  | "DRAFT"
  | "CHECKING"
  | "VERIFIED"
  | "VALIDATED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentMethod = 
  | "CASH"
  | "MVOLA"
  | "AIRTEL_MONEY"
  | "ORANGE_MONEY"
  | "CHECK"
  | "BANK_TRANSFER";

export type PaymentStatus = "PAID" | "PENDING" | "PARTIAL";

export interface SaleLine {
  id: string;
  sale_id: string;
  article_id: string;
  article_code: string;
  article_name: string;
  quantity: number;
  unit_price: number;
  discount: number; // en montant ou pourcentage
  total: number;
}

export interface Sale {
  id: string;
  sale_number: string; // VTE-2026-0001
  store_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_type: "PARTICULIER" | "REVENDEUR" | "ENTREPRISE";
  status: SaleStatus;
  seller_id: string;
  seller_name: string;
  verified_by?: string;
  verified_by_name?: string;
  validated_by?: string;
  validated_by_name?: string;
  lines: SaleLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  amount_paid: number;
  change_returned: number;
  notes?: string;
  device_id: string;
  created_at: number;
  verified_at?: number;
  validated_at?: number;
}

// 8. Production & Consommation
export type ProductionStatus = "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface ProductionConsumptionLine {
  id: string;
  article_id: string; // Matière première
  article_code: string;
  article_name: string;
  unit: string;
  quantity: number;
}

export interface ProductionOutputLine {
  id: string;
  article_id: string; // Produit fini
  article_code: string;
  article_name: string;
  unit: string;
  quantity: number;
}

export interface Production {
  id: string;
  production_number: string; // PRD-2026-0001
  manufacturer_store_id: string;
  status: ProductionStatus;
  consumptions: ProductionConsumptionLine[];
  outputs: ProductionOutputLine[];
  notes?: string;
  created_by: string;
  created_by_name: string;
  validated_by?: string;
  validated_by_name?: string;
  created_at: number;
  validated_at?: number;
}

// 9. Journal d'Audit
export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  store_id?: string;
  device_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value?: any;
  new_value?: any;
  created_at: number;
}

// 10. Filtres généraux obligatoires
export interface GeneralFilters {
  startDate?: string;
  endDate?: string;
  storeIds: string[]; // multi-sélection
  statuses: string[]; // multi-sélection
  movementTypes: StockMovementType[]; // multi-sélection
  categoryIds: string[]; // multi-sélection
  articleType?: "ALL" | ArticleTypeCode;
  searchRef?: string;
  minQty?: number;
  maxQty?: number;
  articleId?: string;
  customerName?: string;
  sellerId?: string;
}

// 11. Type de rapport PDF
export type ReportType = 
  | "STOCK_STATUS"
  | "STOCK_MOVEMENTS"
  | "TRANSFERS"
  | "RECEIPTS"
  | "DISCREPANCIES"
  | "SALES"
  | "SALES_BY_CUSTOMER"
  | "SALES_BY_ARTICLE"
  | "SALES_BY_CATEGORY"
  | "RAW_MATERIAL_CONSUMPTION"
  | "PRODUCTION"
  | "RETURNS"
  | "AUDIT_LOG";
