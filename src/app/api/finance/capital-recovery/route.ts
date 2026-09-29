import { financeSectionHandler } from "@/lib/finance-control-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pengembalian modal (PRD §27).
export const GET = financeSectionHandler((dashboard) => ({ capital: dashboard.capital }));
