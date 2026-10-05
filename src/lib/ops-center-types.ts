// Tipe payload GET /api/ops-center (Garage Control Center). Client-safe.
// Sengaja TANPA nominal uang — layar ini dilihat semua staf.

import type { ProductionBatchSuggestionView } from "@/lib/garage-api-types";
import type {
  BatchScore,
  ForecastResult,
  NextBestAction,
  OpsAlert,
  OpsBottleneck,
  OpsInsight,
  OpsStation,
  OpsStatus,
} from "@/lib/ops-center-engine";

export type OpsKpiBlock = {
  /** Tiket siap dalam periode. */
  ready: number;
  /** Tiket siap ≤ target ÷ tiket siap × 100. */
  onTimePct: number | null;
  overSla: number;
  /** avg(readyAt − createdAt) menit. */
  avgPrepMinutes: number | null;
  /** avg(acceptedAt − createdAt) menit. */
  avgQueueMinutes: number | null;
  /** avg(deliveredAt − readyAt) menit. */
  avgServingDelayMinutes: number | null;
};

export type OpsStationView = {
  station: OpsStation;
  loadPct: number;
  loadLevel: string;
  staffOnShift: number;
  waiting: number;
  processing: number;
  ready: number;
  oldestWaitingMinutes: number | null;
  oldestTargetMinutes: number | null;
  slaRisk: number;
  overSla: number;
  runningBatches: number;
  nextBestAction: NextBestAction;
  suggestions: Array<ProductionBatchSuggestionView & { score: BatchScore; stockRisk: string[] }>;
  kpi: OpsKpiBlock & { batchEfficiencyPct: number | null };
};

export type OpsStockLine = { name: string; onHand: number; min: number; unit: string };

export type OpsCenterData = {
  generatedAt: string;
  batchWindowSec: number;
  status: OpsStatus;
  live: {
    activeOrders: number;
    waiting: number;
    inProduction: number;
    readyToServe: number;
    oldestWaitingMinutes: number | null;
    avgPrepMinutes: number | null;
    onTimePct: number | null;
    batchEfficiencyPct: number | null;
    batchOpportunities: number;
    batchSetupsSavable: number;
  };
  stations: OpsStationView[];
  serving: {
    loadPct: number;
    loadLevel: string;
    waitersOnShift: number;
    ready: Array<{
      ticketNo: string;
      orderNo: string | null;
      table: string;
      identity: string;
      station: OpsStation;
      items: number;
      readyAt: string;
      readyMinutes: number;
      called: boolean;
      delayed: boolean;
    }>;
    delayed: number;
    avgServingDelayMinutes: number | null;
  };
  queue: Array<{
    ticketNo: string;
    orderNo: string | null;
    table: string;
    identity: string;
    station: OpsStation;
    status: string;
    createdAt: string;
    waitingMinutes: number;
    targetMinutes: number;
    slaRisk: boolean;
    overSla: boolean;
    items: string[];
  }>;
  alerts: OpsAlert[];
  bottlenecks: OpsBottleneck[];
  team: {
    ordersToday: number;
    completedToday: number;
    cancelledToday: number;
    remakeToday: number;
    today: OpsKpiBlock & { batchEfficiencyPct: number | null };
    yesterday: OpsKpiBlock;
    week: OpsKpiBlock;
    trend: {
      avgPrepVsYesterdayPct: number | null;
      avgPrepVsWeekPct: number | null;
      onTimeVsWeekPts: number | null;
    };
  };
  me: {
    name: string;
    handled: number;
    served: number;
    onTimePct: number | null;
    avgPrepMinutes: number | null;
  };
  insights: OpsInsight[];
  forecast: ForecastResult;
  prep: { low: OpsStockLine[]; watch: OpsStockLine[] };
  canOperate: { Bar: boolean; Food: boolean };
};
