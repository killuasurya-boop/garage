export type FinanceOverview = {
  today: {
    revenue: number;
    expense: number;
    grossProfit: number;
    netProfit: number;
    foodCostRatio: number;
    recipeFoodCost: number;
    recipeLines: number;
    averageOrderValue: number;
    orderCount: number;
    cashCollected: number;
    nonCashCollected: number;
  };
  feeLiability: {
    totalAccrued: number;
    accruedCount: number;
    totalApproved: number;
    approvedPayoutCount: number;
  };
  recentOrders: Array<{
    id: string;
    orderNo: string;
    channel: string;
    total: number;
    tableLabel: string;
    paymentMethod: string;
    createdAt: string;
  }>;
  cashSession: import("@/lib/garage-api-types").CashSession;
  paymentBreakdown: import("@/lib/garage-api-types").PaymentBreakdown[];
  paymentSettlement: Array<{
    id: string | null;
    method: string;
    provider: string;
    amount: number;
    expectedAmount: number;
    settledAmount: number;
    feeAmount: number;
    share: number;
    status: string;
  }>;
  expenseAnalysis: {
    totalExpense: number;
    cogs: number;
    operational: number;
    payroll: number;
    pendingApproval: number;
    pendingApprovalCount: number;
    cashExpense: number;
    cashExpenseCount: number;
    categories: Array<{ category: string; amount: number; note: string }>;
  };
  cashflow: {
    cashIn: number;
    cashOut: number;
    netFlow: number;
    burnRateDaily: number;
    weeks: Array<{ period: string; cashIn: number; cashOut: number; netFlow: number }>;
  };
  profitLoss: {
    grossRevenue: number;
    discounts: number;
    netRevenue: number;
    cogs: number;
    grossProfit: number;
    payroll: number;
    operational: number;
    marketing: number;
    other: number;
    netProfit: number;
  };
  supplierPayables: {
    total: number;
    due: number;
    overdue: number;
    paidThisMonth: number;
    rows: Array<{
      id: string | null;
      supplier: string;
      invoiceNo: string;
      dueDate: string;
      amount: number;
      status: string;
    }>;
  };
  bomCoverage?: {
    totalVariants: number;
    withBom: number;
    missingCount: number;
    coveragePct: number;
    lowMarginCount: number;
    noBomCount: number;
    lowMarginSample: Array<{
      menuName: string;
      variantLabel: string;
      marginPct: number;
      price: number;
      recipeCost: number;
    }>;
  };
  financeGuard: {
    healthScore: number;
    level: string;
    brief: string;
    risks: Array<{ area: string; level: string; message: string }>;
    nextActions: string[];
    reportReadiness: {
      pnl: string;
      settlement: string;
      cashClosing: string;
    };
  };
  alerts: Array<{ type: string; level: string; message: string; time: string }>;
  roleAccess: Array<{
    role: string;
    sales: string;
    expense: string;
    cashflow: string;
    settlement: string;
    pnl: string;
    supplier: string;
    ceoPanel: string;
  }>;
};

export type FinanceClosingReadiness = {
  generatedAt: string;
  steps: Array<{
    id: "shift" | "settlement" | "expense" | "export";
    label: string;
    done: boolean;
    detail: string;
  }>;
  completed: number;
  total: number;
  progressPct: number;
  ready: boolean;
  shiftNeedsClosing: boolean;
  openSessionCount: number;
};

export type FinanceBrief = {
  generatedAt: string;
  headline: {
    revenue: number;
    netProfit: number;
    grossProfit: number;
    cashCollected: number;
    nonCashCollected: number;
    orderCount: number;
    foodCostRatio: number;
  };
  guard: FinanceOverview["financeGuard"];
  closingProgress: number;
  closingReady: boolean;
  risks: FinanceOverview["financeGuard"]["risks"];
  nextActions: string[];
  bomCoverage?: FinanceOverview["bomCoverage"];
};
