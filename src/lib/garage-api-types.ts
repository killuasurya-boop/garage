import type {
  GarageMenuItem,
  MenuCategory,
  Role,
} from "@/lib/garage-data";

export type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
};

export type HealthData = {
  ok: boolean;
  database: {
    configured: boolean;
    status: string;
  };
};

export type Tone = "good" | "watch" | "warn" | "risk";
export type CartLine = {
  itemId: string;
  variantId: string;
  qty: number;
  // Catatan per line: "less ice", "no garlic", "extra spicy" — dikirim ke kitchen
  note?: string;
};
export type MenuItem = GarageMenuItem;
export type MenuVariant = MenuItem["variants"][number];
export type MenuGroup = "Dapur" | "Bar";
export type MenuFilter = "All" | MenuGroup | MenuCategory;

export const MENU_GROUP_CATEGORIES: Record<MenuGroup, MenuCategory[]> = {
  Dapur: ["Makanan", "Cemilan"],
  Bar: ["Coffee", "Non-Coffee"],
};

export function menuFilterMatches(filter: MenuFilter, category: MenuCategory): boolean {
  if (filter === "All") return true;
  if (filter === "Dapur" || filter === "Bar") {
    return MENU_GROUP_CATEGORIES[filter].includes(category);
  }
  return filter === category;
}

export function menuGroupForCategory(category: MenuCategory): MenuGroup {
  return MENU_GROUP_CATEGORIES.Dapur.includes(category) ? "Dapur" : "Bar";
}
export type OrderType = "dine-in" | "takeaway" | "delivery";

export type DashboardMetric = {
  id: "revenue" | "cash" | "orders" | "approvals";
  label: string;
  value: string;
  delta: string;
  tone: Tone;
};

export type DashboardData = {
  headlineMetrics: DashboardMetric[];
  salesTrend: Array<{ hour: string; sales: number }>;
  operationalSignals: Array<{ label: string; value: string; status: string }>;
};

export type KitchenOrder = {
  id: string;
  table: string;
  channel: string;
  station: string;
  status: string;
  elapsed: number;
  items: string[];
  itemNotes: Record<string, string>;
  internalNotes: string | null;
  priority: string;
  targetMinutes: number;
  targetGroup: string;
  acceptedAt: string | null;
  acceptedByName: string | null;
  readyAt: string | null;
  readyByName: string | null;
  deliveredAt: string | null;
  deliveredByName: string | null;
  createdAt: string;
  // Sequence dalam session meja yang sama: 1 = order pertama, 2+ = add-on
  addonSequence?: number;
};

export type KitchenPerformanceRow = {
  staffName: string;
  stations: string[];
  totalTickets: number;
  totalProducts: number;
  onTimeProducts: number;
  onTimeTickets: number;
  lateTickets: number;
  lateRate: number;
  score: number;
  bonusPoints: number;
  warningLevel: "Aman" | "SP1" | "SP2" | "SP3" | "Data Belum Cukup";
  avgProductionMinutes: number | null;
};

export type KitchenPerformanceData = {
  range: "today" | "month";
  generatedAt: string;
  summary: {
    onTimeTickets: number;
    lateTickets: number;
    totalTickets: number;
    totalProducts: number;
    bonusPoints: number;
    avgScore: number | null;
    avgProductionMinutes: number | null;
    activeTickets: number;
  };
  rows: KitchenPerformanceRow[];
};

export type KitchenShiftReport = {
  date: string;
  generatedAt: string;
  shifts: Array<{
    sessionId: string;
    shiftNumber: number;
    shiftLabel: string;
    cashierName: string;
    status: string;
    openedAt: string;
    closedAt: string | null;
    foodTickets: number;
    readyTickets: number;
    activeTickets: number;
    totalItems: number;
    totalFee: number;
    kokiFee: number;
    assistantFee: number;
  }>;
  totals: {
    shifts: number;
    foodTickets: number;
    readyTickets: number;
    activeTickets: number;
    totalItems: number;
    totalFee: number;
    kokiFee: number;
    assistantFee: number;
  };
};

export type InventoryItem = {
  sku: string;
  name: string;
  alternativeName: string;
  category: string;
  usageArea: string;
  onHand: number;
  min: number;
  unit: string;
  packageSize: string;
  unitCost?: number;
  status: string;
  movement: string;
};

export type PaymentBreakdown = {
  method: string;
  amount: number;
  share: number;
};

export type ClosingChecklistItem = {
  label: string;
  done: boolean;
};

export type Customer = {
  id?: string;
  name: string;
  phone: string;
  tier: string;
  points: number;
  visits: number;
  lastOrder: string;
  flag: string;
  annualSpend?: number;
  memberCode?: string | null;
  cardTier?: string | null;
  membershipSince?: Date | string | null;
  ultraCandidate?: boolean | null;
  ultraApprovedAt?: Date | string | null;
  ultraApprovedBy?: string | null;
  staffNote?: string | null;
  birthday?: string | null;
  referralCode?: string | null;
  referredByCode?: string | null;
  address?: string | null;
  photoUrl?: string | null;
  expiresAt?: Date | string | null;
  createdAt?: Date | string | null;
  isMember?: boolean;
};

export type MemberProfile = {
  id?: string;
  name: string;
  phone: string;
  level: string;
  tier: string;
  totalPoints: number;
  points: number;
  visits: number;
  lastOrder: string;
  flag: string;
  multiplier: number;
  perks: string[];
  annualSpend?: number;
  birthday?: string | null;
  referralCode?: string | null;
  referredByCode?: string | null;
  progress: {
    currentLevel: string;
    nextLevel: string | null;
    min: number;
    next: number | null;
    percent: number;
    remaining: number;
  };
};

export type PosMemberLookupResponse = {
  accountStatus: string;
  customerId: string;
  member: MemberProfile;
};

export type PosMemberCreateResponse = PosMemberLookupResponse & {
  temporaryPin: string;
};

export type MemberReward = {
  memberName: string;
  level: string;
  pointsEarned: number;
  totalPoints: number;
  upgradeNotification: string | null;
};

export type Approval = {
  id: string;
  type: string;
  requester: string;
  amount: string;
  reason: string;
  risk: string;
  age: string;
  status?: string;
};

export type AuditLog = {
  time: string;
  actor: string;
  action: string;
  object: string;
  device: string;
  status: string;
};

export type ServiceRule = {
  label: string;
  value: string;
};

export type SiteAsset = {
  slot: string;
  publicUrl: string;
  width: number;
  height: number;
  alt: string;
  sizeBytes: number;
  mimeType: string;
  version: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CashSession = {
  id: string | null;
  code: string;
  openingCash: number;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number;
  discrepancyStatus?: string;
  status: string;
  checklist: ClosingChecklistItem[];
  denominations?: Record<string, number>;
  closingNote?: string | null;
  managerSignOffAt?: string | null;
  resetTables?: {
    requested: boolean;
    mode?: "none" | "completed" | "all";
    count: number;
  };
};

export type GarageMe = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  role: Role;
  outlet: {
    id: string;
    code: string;
    name: string;
    timezone: string;
  };
  shift: string;
  device: string;
};

export type GarageBootstrapData = {
  me: GarageMe;
  dashboard: DashboardData;
  cartSeed: CartLine[];
  menuItems: MenuItem[];
  kitchenOrders: KitchenOrder[];
  inventoryItems: InventoryItem[];
  stockMovements: string[];
  paymentBreakdown: PaymentBreakdown[];
  cashSession: CashSession;
  closingChecklist: ClosingChecklistItem[];
  customers: Customer[];
  approvals: Approval[];
  auditLogs: AuditLog[];
  serviceRules: ServiceRule[];
  settings: AppSettings;
};

// Single source of truth — re-export dari garage-app-settings-types.ts.
// Dulu type ini duplikat & ketinggalan saat key baru ditambah; sekarang sinkron.
// Import + re-export (bukan cuma re-export) supaya bisa dipake di file ini juga.
import type { AppSettings as _AppSettings } from "./garage-app-settings-types";
export type AppSettings = _AppSettings;

export type OrderReceipt = {
  invoiceNo: string;
  invoiceStatus: string;
  orderNo: string;
  ticketNo: string;
  ticketNos: string[];
  createdAt: string;
  outlet: {
    code: string;
    name: string;
  };
  cashier: {
    name: string;
    role: Role;
    device: string;
  };
  tableLabel: string;
  channel: string;
  payment: {
    method: string;
    provider: string | null;
    reference: string | null;
    cashReceived: number | null;
    change: number | null;
  };
  customer?: {
    name: string | null;
    phone: string | null;
  };
  invoicePdfUrl?: string | null;
  invoiceWebUrl?: string | null;
  whatsappInvoiceUrl?: string | null;
  items: Array<{
    name: string;
    variant: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  service: number;
  tax: number;
  discount: number;
  total: number;
  settings?: Pick<
    AppSettings,
    | "serviceChargePct"
    | "taxPct"
    | "defaultPrinterName"
    | "receiptCopies"
    | "brandName"
    | "brandTagline"
    | "outletAddress"
    | "outletPhone"
    | "npwp"
    | "receiptFooter"
  >;
  // Diset client-side saat reprint dari Riwayat Struk; struk akan menampilkan
  // badge "CETAK ULANG" untuk audit & mencegah double-spending receipt.
  isReprint?: boolean;
  reprintAt?: string;
  memberReward: MemberReward | null;
  brand: {
    deliveryWhatsapp: string;
    social: {
      instagram: string;
      facebook: string;
      tiktok: string;
      youtube: string;
    };
  };
};

export type OrderCreateResponse = {
  orderNo: string;
  ticketNo: string;
  ticketNos: string[];
  subtotal: number;
  service: number;
  tax: number;
  discount: number;
  total: number;
  memberReward: MemberReward | null;
  invoicePdfUrl?: string | null;
  invoiceWebUrl?: string | null;
  whatsappInvoiceUrl?: string | null;
  receipt: OrderReceipt;
};

export type CustomerOrderItem = {
  id: string;
  itemName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  note?: string | null;
};

export type CustomerOrder = {
  id: string;
  orderNo: string;
  tableLabel: string;
  channel: string;
  status: "pending_cashier" | "awaiting_payment" | "accepted" | "paid" | "rejected" | string;
  orderSource: "qr_table" | "qr_takeaway" | "instagram" | "campaign" | string;
  customerMode: "guest" | "member" | string;
  customerName: string | null;
  customerPhone: string | null;
  customerNote: string | null;
  campaign: string | null;
  whatsappInvoiceStatus: "not_sent" | "sent" | "failed" | string;
  whatsappInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  invoiceWebUrl: string | null;
  invoicePdfGeneratedAt: string | null;
  subtotal: number;
  service: number;
  tax: number;
  discount: number;
  total: number;
  createdAt: string;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  paymentMethod: string | null;
  paymentProvider: string | null;
  paymentReference: string | null;
  paymentStatus: string | null;
  invoiceNo: string | null;
  invoiceStatus: string | null;
  invoiceIssuedAt: string | null;
  cashFlowStatus: string | null;
  cashReceived: number | null;
  cashDeposited: number | null;
  cashHeldBy: string | null;
  cashReceivedAt: string | null;
  cashDepositedAt: string | null;
  cashierConfirmedAt: string | null;
  items: CustomerOrderItem[];
};

export type CustomerOrderCreateResponse = {
  order: CustomerOrder;
  whatsapp: {
    status: string;
    url: string | null;
  };
  memberCta: string;
};

export type CustomerOrderActionResponse = {
  order: CustomerOrder;
  ticketNos: string[];
};

export type PublicOrderStatus = {
  id: string;
  orderNo: string;
  tableLabel: string;
  orderStatus: string;
  kitchenStatus: "waiting_cashier" | "queue" | "cooking" | "ready" | "delivered" | "rejected" | "completed";
  estimatedMinutes: number | null;
  message: string;
  invoicePdfUrl?: string | null;
  invoiceWebUrl?: string | null;
  whatsappInvoiceUrl?: string | null;
  updatedAt: string;
};

export type TableLiveRow = {
  tableNumber: string;
  tableLabel: string;
  status: "empty" | "pending" | "accepted" | "paid" | "ready" | "needs_cleaning" | "rejected" | string;
  currentOrderId: string | null;
  orderNo: string | null;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  timerMinutes: number;
  kitchenStatus: string | null;
  needsCleaning: boolean;
  lastStatusAt: string | null;
};

export type PublicTableLiveRow = {
  tableNumber: string;
  tableLabel: string;
  status: "empty" | "pending" | "occupied" | "needs_cleaning" | "unavailable" | string;
  available: boolean;
  needsCleaning: boolean;
  lastStatusAt: string | null;
};

export type VoucherValidation = {
  valid: boolean;
  code: string;
  title: string | null;
  discount: number;
  message: string;
};

export type VoucherRecord = {
  id: string;
  code: string;
  title: string;
  type: string;
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  audience: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  createdAt: string;
};

export type PrintJob = {
  id: string;
  jobType: string;
  target: string;
  status: string;
  orderId: string | null;
  ticketNo: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  printedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DisplayQueueOrder = {
  ticketNo: string;
  orderNo: string | null;
  tableLabel: string;
  station: string;
  status: string;
  targetGroup: string;
  elapsed: number;
  targetMinutes: number;
  createdAt: string;
};

export type ShiftHandoverReport = {
  id: string;
  status: string;
  summary: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
};

export type QrControlInsights = {
  generatedAt: string;
  rangeLabel: string;
  pendingSlaMinutes: number;
  filters: {
    status: string;
    source: string;
    table: string;
  };
  summary: {
    total: number;
    pending: number;
    awaitingPayment: number;
    accepted: number;
    paid: number;
    rejected: number;
    totalSales: number;
    averageProcessingMinutes: number | null;
    pendingOverSla: number;
    uniqueCustomers: number;
    repeatGuests: number;
  };
  topTables: Array<{
    tableLabel: string;
    total: number;
    paid: number;
    rejected: number;
    revenue: number;
  }>;
  pendingAlerts: Array<{
    orderId: string;
    orderNo: string;
    tableLabel: string;
    customerName: string | null;
    customerPhone: string | null;
    minutesWaiting: number;
    total: number;
  }>;
  repeatCustomers: Array<{
    name: string;
    phone: string;
    label: string;
    isMember: boolean;
    totalOrders: number;
    totalSpend: number;
    lastVisit: string;
    favoriteItem: string;
    suggestedAction: string;
    whatsapp: {
      receiptUrl: string | null;
      promoUrl: string;
      reviewUrl: string;
      memberUrl: string;
    };
  }>;
  rejectedReasons: Array<{
    reason: string;
    count: number;
  }>;
  recentOrders: CustomerOrder[];
  shiftReport: {
    gate: "GO" | "WATCH";
    lines: string[];
  };
};

export type AiAgentIntent =
  | "cart_review"
  | "upsell"
  | "inventory_warning"
  | "kitchen_warning"
  | "finance_check"
  | "approval_assist"
  | "daily_brief"
  | "sop_knowledge"
  | "owner_ceo_brain"
  | "shift_copilot"
  | "general_assist";

export type AiDataAccessLevel = "basic" | "operational" | "financial" | "executive";

export type AiProviderProfile = "fast" | "manager" | "finance" | "async";

export type AiChatMode = "operational" | "owner_free_chat";

export type AiSubAgentId =
  | "supervisor"
  | "pos_agent"
  | "inventory_agent"
  | "kitchen_agent"
  | "finance_guard_agent"
  | "approval_agent"
  | "sop_knowledge_agent"
  | "daily_brief_agent";

export type AiAutonomyMode = "read_only" | "draft" | "controlled";

export type AiSafetyLevel = "safe" | "draft" | "critical";

export type AiRiskLevel = "low" | "medium" | "high";

export type AiApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type AiAgentHandoff = {
  from: AiSubAgentId;
  to: AiSubAgentId;
  reason: string;
};

export type AiAgentPlanStep = {
  agentId: AiSubAgentId;
  title: string;
  detail: string;
  status: "planned" | "completed" | "blocked";
};

export type AiSupervisorDecision = {
  autonomyMode: AiAutonomyMode;
  agentsUsed: AiSubAgentId[];
  handoffs: AiAgentHandoff[];
  agentPlan: AiAgentPlanStep[];
  riskLevel: AiRiskLevel;
  approvalRequired: boolean;
  approvalStatus: AiApprovalStatus;
  reason: string;
};

export type AiActionDraft = {
  id?: string;
  type: "approval" | "inventory" | "kitchen" | "finance" | "pos" | "sop";
  actionType?: string;
  agentId?: AiSubAgentId;
  title: string;
  detail: string;
  risk: "low" | "medium" | "high";
  riskLevel?: AiRiskLevel;
  safetyLevel?: AiSafetyLevel;
  approvalStatus?: AiApprovalStatus;
  approvalRequired: boolean;
  createdAt?: string;
};

export type AiTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AiBusinessFreshness = {
  generatedAt: string;
  dataSourcesUsed: string[];
  staleSources: string[];
  knowledgeBaseConfigured: boolean;
  lastAgentRunAt: string | null;
  lastReportGeneratedAt: string | null;
};

export type AiPosAgentResponse = {
  runId?: string;
  ownerChatHistoryId?: string;
  mode?: AiChatMode;
  response: string;
  intent: AiAgentIntent;
  urgency: "low" | "medium" | "high";
  confidence: number;
  requiresApproval: boolean;
  requiresHumanApproval?: boolean;
  suggestedActions: string[];
  operationalWarnings: string[];
  contextUsed: string[];
  nextStep: string;
  dataAccessLevel?: AiDataAccessLevel;
  actionDrafts?: AiActionDraft[];
  profile?: AiProviderProfile;
  contextIntent?: AiAgentIntent;
  providerUsed?: string;
  modelUsed?: string;
  fallbackUsed?: boolean;
  latencyMs?: number;
  tokenUsage?: AiTokenUsage | null;
  agentsUsed?: AiSubAgentId[];
  handoffs?: AiAgentHandoff[];
  agentPlan?: AiAgentPlanStep[];
  riskLevel?: AiRiskLevel;
  approvalRequired?: boolean;
  approvalStatus?: AiApprovalStatus;
  businessFreshness?: AiBusinessFreshness;
};

export type AiOwnerChatHistoryRecord = {
  id: string;
  runId: string | null;
  prompt: string;
  response: string;
  provider: string | null;
  model: string | null;
  profile: string | null;
  tool: string | null;
  dataAccessLevel: string | null;
  latencyMs: number | null;
  tokenUsage: AiTokenUsage | null;
  createdAt: string;
};

export type AiOwnerChatHistoryListResponse = {
  history: AiOwnerChatHistoryRecord[];
};

export type AiOwnerChatHistoryDetailResponse = {
  history: AiOwnerChatHistoryRecord;
};

export type AiOwnerChatHistoryMutationResponse = {
  deleted: number;
};

export type AiAgentConfigPublic = {
  agentId: AiSubAgentId;
  label: string;
  description: string;
  enabled: boolean;
  autonomyMode: AiAutonomyMode;
  maxRiskLevel: AiRiskLevel;
  allowedIntents: string[];
  sortOrder: number;
  updatedAt: string | null;
};

export type AiAgentsResponse = {
  agents: AiAgentConfigPublic[];
  autonomyModes: AiAutonomyMode[];
  riskLevels: AiRiskLevel[];
};

export type AiAgentReportPeriod = "daily" | "monthly" | "yearly";

export type AiAgentReportResponse = {
  fileName: string;
  generatedAt: string;
  days: number;
  period: AiAgentReportPeriod;
  date: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  rowCounts: {
    configs: number;
    runs: number;
    drafts: number;
    events: number;
    orders: number;
    orderItems: number;
    payments: number;
    cashSessions: number;
    inventory: number;
    stockMovements: number;
    kitchenTickets: number;
    approvals: number;
    customers: number;
  };
  downloadUrl: string;
  driveFileId: string | null;
  driveWebUrl: string | null;
  drive: {
    configured: boolean;
    uploaded: boolean;
    authMode?: "service_account" | "google_oauth" | "missing";
    fileId: string | null;
    name: string | null;
    webViewLink: string | null;
    webContentLink: string | null;
    message: string;
  };
};

export type GoogleDriveConnectionStatusResponse = {
  configured: boolean;
  authMode: "service_account" | "google_oauth" | "missing";
  oauthClientConfigured: boolean;
  oauthConnected: boolean;
  oauthEmail: string | null;
  oauthName: string | null;
  connectedAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  lastUploadAt: string | null;
  folderIdConfigured: boolean;
  serviceAccountConfigured: boolean;
  serviceAccountEmail: string | null;
  redirectUri: string;
  message: string;
};

export type GoogleDriveDisconnectResponse = {
  disconnected: boolean;
};

export type AiLogCleanupResponse = {
  policy: {
    retentionDays: number;
    intervalDays: number;
  };
  result?: {
    retentionDays: number;
    intervalDays: number;
    cutoff: string;
    deleted: {
      auditLogs: number;
      agentRuns: number;
      agentEvents: number;
      expiredSnapshots: number;
    };
    totalDeleted: number;
    skipped: boolean;
    reason: "manual" | "interval" | "recently_checked";
  };
};

export type AiKnowledgeUploadFileResult = {
  fileName: string;
  size: number;
  status: "completed" | "failed" | "in_progress" | "skipped";
  message: string;
  openAiFileId: string | null;
  vectorStoreFileId: string | null;
};

export type AiKnowledgeUploadResponse = {
  vectorStoreConfigured: boolean;
  vectorStoreId: string | null;
  uploadedCount: number;
  failedCount: number;
  files: AiKnowledgeUploadFileResult[];
};

export type AiKnowledgeFileRecord = {
  vectorStoreFileId: string;
  openAiFileId: string | null;
  fileName: string;
  status: "completed" | "failed" | "in_progress" | "cancelled" | "unknown";
  sizeBytes: number | null;
  createdAt: string | null;
  lastError: string | null;
};

export type AiKnowledgeListResponse = {
  vectorStoreConfigured: boolean;
  vectorStoreId: string | null;
  status: "ready" | "empty" | "missing" | "error";
  message: string;
  files: AiKnowledgeFileRecord[];
};

export type AiKnowledgeDeleteResponse = {
  deleted: boolean;
  vectorStoreFileId: string;
  openAiFileId: string | null;
  message: string;
};

export type AiJobsStatusResponse = {
  auth: {
    configured: boolean;
  };
  drive: {
    configured: boolean;
    folderIdConfigured: boolean;
    serviceAccountConfigured: boolean;
    serviceAccountEmail: string | null;
    oauthClientConfigured?: boolean;
    oauthConnected?: boolean;
    oauthEmail?: string | null;
    oauthName?: string | null;
    authMode?: "service_account" | "google_oauth" | "missing";
    lastStatus?: string | null;
    lastError?: string | null;
    lastUploadAt?: string | null;
    redirectUri?: string;
    message?: string;
  };
  report: {
    path: string;
    schedule: string;
    localTimeLabel: string;
    timeZone: string;
    offsetDays: number;
  };
  cleanup: {
    path: string;
    schedule: string;
    localTimeLabel: string;
    retentionDays: number;
    intervalDays: number;
  };
  doctor: {
    path: string;
    schedule: string;
    localTimeLabel: string;
    autoHeal: boolean;
  };
  shiftCopilot?: {
    path: string;
    schedule: string;
    localTimeLabel: string;
    mode: string;
    description: string;
  };
};

export type AiActionRegistryPublic = {
  actionType: string;
  label: string;
  description: string;
  safetyLevel: AiSafetyLevel;
  requiresApproval: boolean;
  enabled: boolean;
  allowedRoles: Role[];
  updatedAt: string | null;
};

export type AiActionDraftRecord = {
  id: string;
  runId: string | null;
  actionType: string;
  agentId: AiSubAgentId;
  title: string;
  detail: string;
  riskLevel: AiRiskLevel;
  safetyLevel: AiSafetyLevel;
  approvalStatus: AiApprovalStatus;
  payload: Record<string, unknown>;
  createdBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiActionsResponse = {
  actions: AiActionDraftRecord[];
  registry: AiActionRegistryPublic[];
};

export type AiOperationalAlertPriority = "low" | "medium" | "high";

export type AiWhatsappAlertTarget = {
  phone: string;
  url: string;
  roleGroup: string;
};

export type AiStaffSupervisionKind = "mistake" | "correction" | "coaching";

export type AiOperationalAlert = {
  id: string;
  actionType: string;
  agentId: string;
  title: string;
  detail: string;
  priority: AiOperationalAlertPriority;
  targetRoles: string[];
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
  runId: string | null;
  approvalStatus: AiApprovalStatus;
  source: string;
  fingerprint: string;
  whatsappTargets: AiWhatsappAlertTarget[];
  category: "staff_supervision" | "operational";
  supervisionKind: AiStaffSupervisionKind | null;
  staffGroup: "floor" | "kitchen" | "inventory" | "control" | null;
  fixAction: string | null;
};

export type AiAutopilotStatusResponse = {
  active: boolean;
  withinHours: boolean;
  hoursLabel: string;
  whatsappHighAlerts: boolean;
  message: string;
};

export type AiAlertsResponse = {
  alerts: AiOperationalAlert[];
  unreadCount: number;
  lastAutopilotAt: string | null;
};

export type AiShiftCopilotRunResponse = {
  runId: string;
  signalCount: number;
  created: number;
  skipped: number;
  generatedAt: string;
  latencyMs: number;
};

export type AiActionDecisionResponse = {
  action: AiActionDraftRecord;
};

export type AiProviderId = string;

export type AiProviderStatus =
  | "ready"
  | "missing"
  | "limited"
  | "error"
  | "untested";

export type AiProviderHealth = {
  requestCount: number;
  errorRate: number;
  rateLimitCount: number;
  fallbackCount: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  estimatedCostUsd: number | null;
};

export type AiProviderTemplate = {
  provider: AiProviderId;
  label: string;
  baseUrl: string;
  model: string;
  priority: number;
  category: "primary" | "aggregator" | "direct" | "local" | "custom";
  note: string;
};

export type AiProviderPublicConfig = {
  provider: AiProviderId;
  label: string;
  baseUrl: string;
  model: string;
  enabled: boolean;
  priority: number;
  keyStatus: "configured" | "missing" | "locked";
  maskedKey: string | null;
  lastStatus: AiProviderStatus;
  lastError: string | null;
  lastLatencyMs: number | null;
  health?: AiProviderHealth;
  isBuiltIn?: boolean;
  updatedAt: string | null;
};

export type AiProvidersResponse = {
  providers: AiProviderPublicConfig[];
  templates?: AiProviderTemplate[];
  connectionTest?: AiProviderConnectionTestResult | null;
};

export type AiProviderTestResponse = {
  provider: AiProviderId;
  status: AiProviderStatus;
  latencyMs: number | null;
  message: string;
  model: string;
};

export type AiProviderConnectionTestResult = {
  provider: AiProviderId;
  status: "ready" | "failed";
  ok: boolean;
  providerStatus: AiProviderStatus;
  latencyMs: number | null;
  message: string;
  model: string;
  code?: string;
};

export type AiProviderAutoFixResponse = {
  providers: AiProviderPublicConfig[];
  fixes: Array<{
    provider: AiProviderId;
    title: string;
    detail: string;
    status: "completed" | "skipped";
  }>;
};

export type AiSystemDoctorSeverity = "healthy" | "watch" | "critical";

export type AiSystemDoctorIssueSeverity = "info" | "warning" | "critical";

export type AiSystemDoctorIssue = {
  id: string;
  area:
    | "database"
    | "provider"
    | "agents"
    | "jobs"
    | "knowledge"
    | "logs"
    | "security"
    | "actions";
  title: string;
  detail: string;
  severity: AiSystemDoctorIssueSeverity;
  autoFixAvailable: boolean;
  autoFixed: boolean;
  nextStep: string;
};

export type AiSystemDoctorFix = {
  id: string;
  title: string;
  status: "completed" | "skipped" | "failed";
  detail: string;
};

export type AiSystemDoctorExecutionLog = {
  step: string;
  status: "running" | "completed" | "skipped" | "failed";
  detail: string;
  timestamp: string;
};

export type AiSystemDoctorDeveloperDiagnosis = {
  area: string;
  severity: AiSystemDoctorIssueSeverity;
  finding: string;
  recommendedFix: string;
};

export type AiSystemDoctorResponse = {
  generatedAt: string;
  status: AiSystemDoctorSeverity;
  healthColor: "green" | "yellow" | "red";
  score: number;
  autoHealMode: boolean;
  summary: {
    providerReady: number;
    providerConfigured: number;
    agentActive: number;
    pendingCriticalActions: number;
    recentAiErrors: number;
    driveReady: boolean;
    jobSecretReady: boolean;
    knowledgeReady: boolean;
  };
  issues: AiSystemDoctorIssue[];
  fixes: AiSystemDoctorFix[];
  guardrails: string[];
  executionLog?: AiSystemDoctorExecutionLog[];
  developerDiagnosis?: AiSystemDoctorDeveloperDiagnosis[];
};

export type AiGarageAiHealthResponse = {
  ok: boolean;
  generatedAt: string;
  status: "ready" | "watch" | "critical";
  setup: Array<{
    id:
      | "provider"
      | "knowledge"
      | "drive"
      | "cron"
      | "encryption"
      | "database"
      | "auto_fix";
    label: string;
    status: "ready" | "setup" | "error";
    detail: string;
    nextStep: string;
  }>;
  observability: {
    providerRequestCount: number;
    providerFallbackCount: number;
    providerErrorRate: number;
    p95LatencyMs: number | null;
    tokenUsageTotal: number;
    reportGeneratedCount: number;
    reportUploadedCount: number;
    knowledgeUploadCount: number;
    autoFixEventCount: number;
  };
  drive: AiJobsStatusResponse["drive"];
  knowledgeBase: {
    configured: boolean;
    vectorStoreId: string | null;
  };
  providers: {
    total: number;
    configured: number;
    ready: number;
  };
};
