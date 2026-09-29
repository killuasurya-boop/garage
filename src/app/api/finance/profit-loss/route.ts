import { financeSectionHandler } from "@/lib/finance-control-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Profit & Loss per periode (PRD §13).
export const GET = financeSectionHandler((dashboard) => ({
  pnl: dashboard.pnl,
  expenses: dashboard.expenses,
  trend: dashboard.trend.map(({ key, label, revenue, cogs, grossProfit, netProfit, prevNetProfit }) => ({
    key,
    label,
    revenue,
    cogs,
    grossProfit,
    netProfit,
    prevNetProfit,
  })),
}));
