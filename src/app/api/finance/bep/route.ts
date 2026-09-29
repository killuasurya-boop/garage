import { financeSectionHandler } from "@/lib/finance-control-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Break Even Point harian / periode / bulanan / tahunan (PRD §18).
export const GET = financeSectionHandler((dashboard) => ({
  bep: dashboard.bep,
  todayBep: dashboard.todayBep,
  hourly: dashboard.hourly,
  trend: dashboard.trend.map(({ key, label, revenue, bep, target }) => ({ key, label, revenue, bep, target })),
}));
