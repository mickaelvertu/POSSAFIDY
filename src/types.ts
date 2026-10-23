// GILEADA — Modèle de données & Règles métier
export * from "./types/auth";


export type AppRoleId =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "VENDEUR"
  | "MAGASINIER"
  | "RESPONSABLE_MAGASIN"
  | "CONTROLEUR"
  | "PRODUCTION"
  | "COMPTABLE"
  | "GESTIONNAIRE_CREDIT"
  | "STAFF"
  | "REVENDEUR";

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
  code?: string;
  username: string;
  businessName?: string;
  email: string;
  phone?: string;
  displayName: string;
  role: UserRole;
  roleId: AppRoleId;
  firstName: string;
  lastName: string;
  storeId?: string;
  storeIds: string[];
  permissions: AppPermission[];
  visibleArticleTypes?: ArticleTypeCode[];
  isActive: boolean;
  accountStatus?: "PENDING" | "ACTIVE" | "DISABLED";
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
  "credit.sales", "credit.manage", "inventory.count", "inventory.review",
  "users.view", "users.create", "users.edit", "users.delete", "users.permissions",
  "expenses.view", "expenses.create",
  "cash_handover.view", "cash_handover.create", "cash_handover.receive", "cash_handover.deposit",
  "procurement.manage",
  "units.manage"
];

// 1. Types de magasins
export type StoreTypeCode = "CENTRAL_WAREHOUSE" | "POS" | "RESELLER" | "MANUFACTURER";

export interface Store {
  id: string; // ID technique séquentiel, stable après création
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
  id: string; // ID technique séquentiel, stable après création
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
  id: string; // ID technique séquentiel, stable après création
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
  paid_by?: string;
  paid_by_name?: string;
}

export type ExpenseCategory = "RENT" | "ELECTRICITY" | "FUEL" | "TRANSPORT" | "MAINTENANCE" | "SUPPLIES" | "COMMUNICATION" | "FOOD" | "SALARY_ADVANCE" | "OTHER";

export interface Expense {
  status?: "DRAFT" | "VALIDATED";
  validated_by?: string;
  validated_at?: number;
  id: string;
  expense_number: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expense_date: number;
  store_id?: string;
  store_name?: string;
  payee?: string;
  employee_id?: string;
  employee_name?: string;
  salary_advance_id?: string;
  payment_method: PaymentMethod;
  payment_status: "PAID" | "PENDING";
  reference?: string;
  notes?: string;
  created_by: string;
  created_by_name: string;
  created_at: number;
}

export type CashHandoverStatus = "DECLARED" | "RECEIVED" | "DISCREPANCY" | "PARTIALLY_DEPOSITED" | "DEPOSITED";

export interface CashHandoverDeposit {
  amount: number;
  bank_name: string;
  reference: string;
  deposited_by: string;
  deposited_by_name: string;
  deposited_at: number;
}

export interface CashHandover {
  id: string;
  handover_number: string;
  store_id: string;
  store_name: string;
  business_date: string;
  expected_cash_sales: number;
  cash_sale_count: number;
  declared_amount: number;
  declared_by: string;
  declared_by_name: string;
  declared_at: number;
  status: CashHandoverStatus;
  received_amount?: number;
  received_by?: string;
  received_by_name?: string;
  received_at?: number;
  discrepancy_note?: string;
  deposited_amount: number;
  deposits: CashHandoverDeposit[];
}

export interface Purchase {
  status?: "DRAFT" | "APPROVED" | "RECEIVED";
  id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_name: string;
  store_id: string;
  created_by?: string;
  created_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: number;
  transfer_id?: string;
  invoice_number: string;
  lines: PurchaseLine[];
  total: number;
  amount_paid: number;
  payment_status: PurchasePaymentStatus;
  expected_payment_at: number;
  payments: SupplierPayment[];
  notes?: string;
  received_by?: string;
  received_by_name?: string;
  received_at?: number;
  created_at: number;
  updated_at: number;
}

// 4. Stock par magasin
export interface StoreStock {
  id: string; // UUID PK
  store_id: string;
  article_id: string;
  quantity: number;
  quarantine_quantity?: number; // retours à recycler, jamais vendables
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
  | "REJECTED"
  | "CANCELLED";

export type TransferTypeCode = 
  | "SUPPLIER_TO_STORE"
  | "CENTRAL_TO_POS"
  | "CENTRAL_TO_RESELLER"
  | "CENTRAL_TO_MANUFACTURER"
  | "STORE_TO_STORE"
  | "MANUFACTURER_TO_CENTRAL"
  | "MANUFACTURER_TO_STORE"
  | "RETURN"
  | "STORE_RETURN"
  | "RECYCLING"
  | "DIRECT_DEPOSIT";

export type ReturnReason = "EXPIRED" | "DAMAGED_LABEL" | "DEFECT" | "CUSTOMER_RETURN";
export type RecyclingDecision = "RECYCLED" | "DESTROYED";

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  EXPIRED: "Péremption",
  DAMAGED_LABEL: "Étiquette usée / illisible",
  DEFECT: "Défaut / casse",
  CUSTOMER_RETURN: "Retour client"
};

export const RECYCLING_DECISION_LABELS: Record<RecyclingDecision, string> = {
  RECYCLED: "Recyclé en production",
  DESTROYED: "Détruit (perte)"
};

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
  source_stock_floor?: number;
  note?: string;
  return_reason?: ReturnReason;
  batch_number?: string;
  expiry_date?: string;
  recycling_decision?: RecyclingDecision;
  recycled_available?: boolean; // « Recyclé » : reste en stock à recycler jusqu'à sa consommation dans un ordre de fabrication
  recycling_decided_by?: string;
  recycling_decided_by_name?: string;
  recycling_decided_at?: number;
  recycling_note?: string;
}

export interface StockTransfer {
  cancelled_by?: string;
  cancelled_by_name?: string;
  cancelled_at?: number;
  id: string;
  transfer_number: string; // ex: TRF-2026-0001
  type: TransferTypeCode;
  source_store_id: string;
  source_name?: string;
  destination_store_id: string;
  purchase_id?: string;
  purchase_number?: string;
  supplier_id?: string;
  supplier_name?: string;
  status: TransferStatus;
  requested_by: string;
  requested_by_name: string;
  approved_by?: string;
  approved_by_name?: string;
  rejected_by?: string;
  rejected_by_name?: string;
  rejected_at?: number;
  rejection_note?: string;
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
  | "STORE_RETURN"
  | "RECYCLING"
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
  stock_bucket?: "QUARANTINE";
  created_at: number;
}

// 7. Ventes & Lignes de vente
export type SaleStatus = 
  | "DRAFT"
  | "CHECKING"
  | "VERIFIED"
  | "APPROVED"
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
  line_type?: "PRODUCT" | "SERVICE"; // absent = produit (anciennes ventes)
  price_reason?: string; // motif obligatoire pour une prestation à prix saisi manuellement
}

export interface Sale {
  id: string;
  sale_number: string; // VTE-2026-0001
  store_id: string;
  customer_name: string;
  customer_phone?: string;
  customer_type: "PARTICULIER" | "REVENDEUR" | "ENTREPRISE";
  credit_customer_id?: string;
  credit_due_at?: number;
  credit_payments?: CreditPayment[];
  credit_followups?: CreditFollowUp[];
  status: SaleStatus;
  seller_id: string;
  seller_name: string;
  verified_by?: string;
  verified_by_name?: string;
  validated_by?: string;
  validated_by_name?: string;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: number;
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

export type ResellerOrderStatus = "PENDING" | "APPROVED" | "REJECTED" | "REVISION_REQUESTED";

export interface ResellerOrder {
  id: string;
  order_number: string;
  reseller_user_id: string;
  business_name: string;
  customer_name: string;
  customer_phone: string;
  store_id: string;
  lines: SaleLine[];
  total: number;
  payment_type: "CASH" | "CREDIT";
  status: ResellerOrderStatus;
  notes?: string;
  admin_message?: string;
  created_at: number;
  updated_at: number;
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: number;
  sale_id?: string;
  cash_paid_at?: number;
  cash_paid_by?: string;
  cash_paid_by_name?: string;
}

export interface ResellerNotification {
  id: string;
  user_id: string;
  order_id: string;
  title: string;
  message: string;
  status: ResellerOrderStatus;
  is_read: boolean;
  created_at: number;
}

export interface CreditCustomer {
  id: string;
  linked_user_id?: string;
  name: string;
  phone: string;
  credit_limit: number;
  payment_term_days: number;
  outstanding_balance: number;
  is_active: boolean;
  created_at: number;
  updated_at: number;
  last_credit_sale_id?: string;
  last_cancelled_credit_sale_id?: string;
}

export interface CreditPayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paid_at: number;
  recorded_by: string;
  recorded_by_name: string;
}

export interface CreditFollowUp {
  id: string;
  note: string;
  followed_up_at: number;
  followed_up_by: string;
  followed_up_by_name: string;
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
  source?: "RECYCLED"; // prélevé sur le stock « à recycler » (articles retournés) et non sur le stock normal
}

export interface ProductionOutputLine {
  id: string;
  article_id: string; // Matière première fabriquée ou produit fini
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

// 8b. Contrôle d'inventaire
export type InventoryCountStatus = "DRAFT" | "AWAITING_SIGNATURE" | "SUBMITTED" | "VALIDATED" | "REJECTED";
export type InventoryReasonDecision = "ACCEPTED" | "REJECTED";

export interface InventoryCountLine {
  article_id: string;
  article_code: string;
  article_name: string;
  unit: string;
  system_quantity: number;
  counted_quantity: number;
  variance: number; // counted - system
  unit_cost: number;
  variance_value: number;
  reason?: string; // motif obligatoire en cas d'anomalie avant soumission
  decision?: InventoryReasonDecision; // décision de l'administrateur sur le motif
  charged_amount?: number; // manque retenu au responsable si motif refusé
}

export interface InventoryChargeSettlement {
  settled_at: number;
  settled_by: string;
  settled_by_name: string;
  method: "PAYSLIP" | "ADVANCE" | "OTHER";
  reference: string; // ex: "Paie 2026-03", n° d'avance, quittance
  payslip_id?: string;
  note?: string;
}

export interface InventoryCount {
  id: string;
  count_number: string;
  store_id: string;
  store_name: string;
  status: InventoryCountStatus;
  lines: InventoryCountLine[];
  notes?: string;
  created_by: string;
  created_by_name: string;
  created_at: number;
  updated_at: number;
  submitted_at?: number;
  manager_id?: string; // responsable du magasin désigné pour signer
  manager_name?: string;
  manager_signed_at?: number; // signature = présence attestée lors du comptage
  manager_signed_by?: string;
  manager_signed_by_name?: string;
  signature_waived?: boolean; // aucun responsable inscrit : envoyé sans signature, contrôle renforcé par l'administrateur
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: number;
  review_note?: string;
  charged_to?: string; // responsable auquel le manque est retenu
  charged_to_name?: string;
  total_charged_amount?: number;
  charge_settlement?: InventoryChargeSettlement; // renseigné une fois la retenue déduite
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
export type MovementDirection = "ALL" | "IN" | "OUT";
export interface GeneralFilters {
  startDate?: string;
  endDate?: string;
  storeIds: string[]; // multi-sélection
  statuses: string[]; // multi-sélection
  movementTypes: StockMovementType[]; // multi-sélection
  movementDirection?: MovementDirection;
  categoryIds: string[]; // multi-sélection
  articleType?: "ALL" | ArticleTypeCode;
  searchRef?: string;
  minQty?: number;
  maxQty?: number;
  articleId?: string;
  articleIds?: string[]; // multi-sélection d'articles précis
  customerName?: string;
  resellerPaymentStatus?: "ALL" | PaymentStatus;
  sellerId?: string;
}

// 11. Type de rapport PDF
export type ReportType = 
  | "STOCK_STATUS"
  | "STOCK_MOVEMENTS"
  | "STOCK_LEDGER"
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
  | "AUDIT_LOG"
  | "RESELLER_CREDIT"
  | "EXPENSES";

export type EmployeeContractType = "CDI" | "CDD" | "TEMPORARY" | "INTERN" | "DAILY";

export interface Employee {
  id: string;
  code?: string;
  first_name: string;
  last_name: string;
  position: string;
  user_id?: string;
  application_status?: "PENDING" | "APPROVED" | "REJECTED";
  store_id?: string;
  phone?: string;
  email?: string;
  hire_date?: number;
  contract_type?: EmployeeContractType;
  salary?: number;
  notes?: string;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface SalaryAdvance {
  id: string;
  employee_id: string;
  employee_name: string;
  amount: number;
  advance_date: number;
  payment_method: PaymentMethod;
  reason?: string;
  status: "OUTSTANDING" | "DEDUCTED";
  payslip_id?: string;
  expense_id?: string;
  created_at: number;
  updated_at: number;
  created_by: string;
}

export interface Payslip {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code?: string;
  employee_position: string;
  period: string;
  base_salary: number;
  bonuses: number;
  deductions: number;
  advances_deducted?: number;
  advance_ids?: string[];
  inventory_charges_deducted?: number;
  inventory_count_ids?: string[];
  net_salary: number;
  payment_status: "PENDING" | "PAID";
  payment_date?: number;
  payment_method?: PaymentMethod;
  created_at: number;
  updated_at: number;
  created_by: string;
}
