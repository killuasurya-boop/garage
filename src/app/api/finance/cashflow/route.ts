import { financeSectionHandler } from "@/lib/finance-control-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cashflow: Opening + Cash In − Cash Out = Closing (PRD §14).
export const GET = financeSectionHandler((dashboard) => ({
  cashflow: dashboard.cashflow,
  cash: dashboard.kpis.cash,
  channels: dashboard.channels,
  trend: dashboard.trend.map(({ key, label, cashIn, cashOut, netCash }) => ({ key, label, cashIn, cashOut, netCash })),
}));
