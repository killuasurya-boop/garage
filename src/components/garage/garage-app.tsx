"use client";

import {
Activity,
AlertTriangle,
ArrowDown,
ArrowLeft,
ArrowRight,
ArrowUp,
BadgeCheck,
Bell,
Check,
Clock,
Database,
FileText,
Gauge,
Info,
LockKeyhole,
LogOut,
Menu,
Mic,
Monitor,
MoreHorizontal,
PanelLeft,
Paperclip,
Plus,
ReceiptText,
RefreshCw,
Search,
Settings,
ShieldAlert,
ShieldCheck,
Signal,
Sparkles,
Square,
Terminal,
Trash2,
Users,
Volume2,
Wrench,
type LucideIcon
} from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
FormEvent,
useCallback,
useEffect,
useMemo,
useRef,
useState,
type CSSProperties,
type RefObject
} from "react";

import { GarageAiAlertsBell } from "@/components/garage/garage-ai-alerts-bell";
import {
agentReportDateLabel,
agentReportInputType,
canViewKitchenPerformance,
defaultAgentReportDate,
fetchAuthSessionCheck,
hasActiveAuthSession
} from "@/components/garage/garage-app-helpers";
import {
isCashierThemeMode,
type CashierThemeMode
} from "@/components/garage/garage-app-pickers";
import { Alert,AlertDescription,AlertTitle } from "@/components/ui/alert";
import {
AlertDialog,
AlertDialogAction,
AlertDialogCancel,
AlertDialogContent,
AlertDialogDescription,
AlertDialogFooter,
AlertDialogHeader,
AlertDialogTitle,
AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
Card,
CardContent,
CardDescription,
CardHeader,
CardTitle,
} from "@/components/ui/card";
import {
Dialog,
DialogContent,
DialogDescription,
DialogHeader,
DialogTitle,
DialogTrigger,
} from "@/components/ui/dialog";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuLabel,
DropdownMenuSeparator,
DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
Select,
SelectContent,
SelectItem,
SelectTrigger,
SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
Sheet,
SheetContent,
SheetDescription,
SheetHeader,
SheetTitle,
SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
Tooltip,
TooltipContent,
TooltipTrigger,
} from "@/components/ui/tooltip";
import { garageApi } from "@/lib/api-client";
import { GARAGE_TAGS, subscribeGarageCache } from "@/lib/garage-cache";
import { authClient } from "@/lib/auth-client";
import type {
AiActionDecisionResponse,
AiActionDraft,
AiActionDraftRecord,
AiActionsResponse,
AiAgentConfigPublic,
AiAgentReportPeriod,
AiAgentReportResponse,
AiAgentsResponse,
AiAutonomyMode,
AiChatMode,
AiGarageAiHealthResponse,
AiJobsStatusResponse,
AiKnowledgeDeleteResponse,
AiKnowledgeFileRecord,
AiKnowledgeListResponse,
AiKnowledgeUploadResponse,
AiLogCleanupResponse,
AiOwnerChatHistoryListResponse,
AiOwnerChatHistoryMutationResponse,
AiOwnerChatHistoryRecord,
AiPosAgentResponse,
AiProviderAutoFixResponse,
AiProviderConnectionTestResult,
AiProviderPublicConfig,
AiProviderTemplate,
AiProviderTestResponse,
AiProvidersResponse,
AiRiskLevel,
AiShiftCopilotRunResponse,
AiSystemDoctorResponse,
AuditLog,
Customer,
GarageBootstrapData,
GarageMe,
HealthData,
InventoryItem,
KitchenOrder,
KitchenPerformanceData,
MenuItem,
SiteAsset
} from "@/lib/garage-api-types";
import {
modules,
type ModuleId,
type Role
} from "@/lib/garage-data";
import {
canAccessModule,
canUseApi,
firstModuleForRole,
modulesForRole,
} from "@/lib/role-access";
// First-paint / selalu tampil / kecil â†’ tetap statis (cepat).
import { ChatFab } from "@/components/garage/chat-fab";
import {
DateFilterBar,
DateFilterProvider,
} from "@/components/garage/date-filter";
import { useGarageTheme } from "@/components/garage/theme/garage-theme-provider";
import { textForExecutiveVoice } from "@/lib/garage-ai-persona";
import {
getPreset,
isLightGarageOsPreset,
isThemePresetId,
themeToGarageCssVars,
} from "@/lib/garage-theme";
import { voice } from "@/lib/garage-voice";

// Lazy-load modul berat: hanya diunduh saat modul dibuka. Ini mengecilkan bundle
// awal shell sehingga login + POS/Dashboard terasa cepat (anti-lelet). Setiap
// modul punya fallback skeleton kecil saat chunk-nya dimuat.
const ModuleChunkFallback = () => (
  <div className="px-4 py-10 text-center text-sm text-zinc-400">Memuat modulâ€¦</div>
);

const EarningsView = dynamic(
  () => import("@/components/garage/earnings-view").then((m) => m.EarningsView),
  { loading: ModuleChunkFallback },
);
const PosView = dynamic(
  () => import("@/components/garage/pos-view").then((m) => m.PosView),
  { loading: ModuleChunkFallback },
);
const CrmView = dynamic(
  () => import("@/components/garage/crm-view").then((m) => m.CrmView),
  { loading: ModuleChunkFallback },
);
const MembershipAdminView = dynamic(
  () => import("@/components/garage/membership-admin-view").then((m) => m.MembershipAdminView),
  { loading: ModuleChunkFallback },
);
const ApprovalsBoard = dynamic(
  () => import("@/components/garage/approvals-board").then((m) => m.ApprovalsBoard),
  { loading: ModuleChunkFallback },
);
const ApprovalsAutoSweepPanel = dynamic(
  () => import("@/components/garage/approvals-auto-sweep-panel").then((m) => m.ApprovalsAutoSweepPanel),
  { loading: ModuleChunkFallback },
);
const AuditLogViewer = dynamic(
  () => import("@/components/garage/audit-log-viewer").then((m) => m.AuditLogViewer),
  { loading: ModuleChunkFallback },
);
const AuditSuspiciousPanel = dynamic(
  () => import("@/components/garage/audit-suspicious-panel").then((m) => m.AuditSuspiciousPanel),
  { loading: ModuleChunkFallback },
);
const SmartAuditDashboard = dynamic(
  () => import("@/components/garage/smart-audit-dashboard").then((m) => m.SmartAuditDashboard),
  { loading: ModuleChunkFallback },
);
const FinanceView = dynamic(
  () => import("@/components/garage/finance/finance-view").then((m) => m.FinanceView),
  { loading: ModuleChunkFallback },
);
const WaiterView = dynamic(
  () => import("@/components/garage/waiter-view").then((m) => m.WaiterView),
  { loading: ModuleChunkFallback },
);
const ChatModule = dynamic(
  () => import("@/components/garage/chat-module").then((m) => m.ChatModule),
  { loading: ModuleChunkFallback },
);
const GarageMarketingView = dynamic(
  () => import("@/components/garage/garage-marketing").then((m) => m.GarageMarketingView),
  { loading: ModuleChunkFallback },
);
const TeamManagementDashboard = dynamic(
  () => import("@/components/garage/admin/team-management-dashboard").then((m) => m.TeamManagementDashboard),
  { loading: ModuleChunkFallback },
);
const GarageTrainingModule = dynamic(
  () => import("@/components/garage/garage-training-module").then((m) => m.GarageTrainingModule),
  { loading: ModuleChunkFallback },
);
const DashboardView = dynamic(
  () => import("@/components/garage/dashboard-view").then((m) => m.DashboardView),
  { loading: ModuleChunkFallback },
);
const SettingsView = dynamic(
  () => import("@/components/garage/settings-view").then((m) => m.SettingsView),
  { loading: ModuleChunkFallback },
);
const InventoryView = dynamic(
  () => import("@/components/garage/inventory-view").then((m) => m.InventoryView),
  { loading: ModuleChunkFallback },
);
const KitchenView = dynamic(
  () => import("@/components/garage/kitchen-view").then((m) => m.KitchenView),
  { loading: ModuleChunkFallback },
);
const SopTutorialWidget = dynamic(
  () => import("@/components/garage/sop-tutorial-widget").then((m) => m.SopTutorialWidget),
  { loading: ModuleChunkFallback },
);
const VoiceSettingsDialog = dynamic(
  () => import("@/components/garage/voice-settings-dialog").then((m) => m.VoiceSettingsDialog),
  { loading: ModuleChunkFallback },
);
const GarageAiSimpleView = dynamic(
  () => import("@/components/garage/garage-ai-simple-view").then((m) => m.GarageAiSimpleView),
  { loading: ModuleChunkFallback },
);

const GARAGE_BRAND_LOGO_SRC = "/garage-brand/logo-website.png";
const GARAGE_BRAND_ICON_SRC = "/garage-brand/logo-icon.png";
const GARAGE_BRAND_LOGO_WIDTH = 1024;
const GARAGE_BRAND_LOGO_HEIGHT = 325;
const GARAGE_CASHIER_THEME_STORAGE_KEY = "garage-cashier-theme";
type GarageThemeMode = "dark" | "bright";

// Pure helpers extract ke garage-app-helpers.ts untuk turunkan source size.
// Lihat: src/components/garage/garage-app-helpers.ts

const serviceRuleIcons = {
  "Cash gap": BadgeCheck,
  "POS SLA": Gauge,
  "Offline sync": Activity,
};

const statusClass: Record<string, string> = {
  ready: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  safe: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  healthy: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  info: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  warning: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  draft: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  critical: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  controlled: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  read_only: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  not_required: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  pending: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  pending_approval: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  pending_cashier: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  awaiting_payment: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  accepted: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  paid: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  sent: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  not_sent: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  qr_table: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  qr_takeaway: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  approved: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  applied: "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#dcfce7]",
  rejected: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  completed: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  planned: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  blocked: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  deterministic: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  fast: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  basic: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  limited: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  sold_out: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  watch: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  manager: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  operational: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  owner_free_chat: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  async: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  low: "border-[#ff2a3a]/45 bg-[#ff2a3a]/14 text-[#ffc2c8]",
  queue: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  cooking: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  delivered: "border-[#4a4a54] bg-[#222229] text-[#d0d0d6]",
  high: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  finance: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  financial: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  executive: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  medium: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  recorded: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  approval_required: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  missing: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  error: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  failed: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
  skipped: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
  untested: "border-[#9696a1]/45 bg-[#d4d4d8]/10 text-[#e8e8ec]",
};

export function GarageApp({
  initialModule = "dashboard",
}: {
  initialModule?: ModuleId;
}) {
  const [health, setHealth] = useState<{
    pending: boolean;
    configured: boolean;
    message: string;
  }>({
    pending: true,
    configured: false,
    message: "Checking Garage backend...",
  });

  useEffect(() => {
    let mounted = true;

    async function loadHealth() {
      try {
        const healthData = await garageApi.get<HealthData>("/api/health", {
          cache: "no-store",
        });

        if (!mounted) {
          return;
        }

        setHealth({
          pending: false,
          configured: healthData.database.configured,
          message: healthData.database.status,
        });
      } catch (error) {
        if (!mounted) {
          return;
        }

        setHealth({
          pending: false,
          configured: false,
          message: error instanceof Error ? error.message : "Backend unavailable.",
        });
      }
    }

    void loadHealth();

    return () => {
      mounted = false;
    };
  }, []);

  if (health.pending) {
    return <GarageLoading title="Starting Garage backend" detail={health.message} />;
  }

  if (!health.configured) {
    return <BackendSetupScreen message={health.message} />;
  }

  return <AuthenticatedGarageApp initialModule={initialModule} />;
}

type GaragePosLoginProps = {
  returnTo?: string;
  variant?: "os" | "pos";
  initialEmail?: string;
  includeOwnerPreset?: boolean;
};

export function GaragePosLogin({
  returnTo = "/os",
  variant = "pos",
  initialEmail,
  includeOwnerPreset = false,
}: GaragePosLoginProps) {
  const [health, setHealth] = useState<{
    pending: boolean;
    configured: boolean;
    message: string;
  }>({
    pending: true,
    configured: false,
    message: "Checking Garage backend...",
  });
  const session = authClient.useSession();
  const isSignedIn = Boolean(session.data?.user);
  useEffect(() => {
    let mounted = true;

    async function loadHealth() {
      try {
        const healthData = await garageApi.get<HealthData>("/api/health", {
          cache: "no-store",
        });
        if (mounted) {
          setHealth({
            pending: false,
            configured: healthData.database.configured,
            message: healthData.database.status,
          });
        }
      } catch (error) {
        if (mounted) {
          setHealth({
            pending: false,
            configured: false,
            message: error instanceof Error ? error.message : "Backend unavailable.",
          });
        }
      }
    }

    void loadHealth();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isSignedIn && session.data?.user?.id) {
      window.location.assign(returnTo);
    }
  }, [isSignedIn, returnTo, session.data?.user?.id]);

  if (health.pending || session.isPending) {
    return <GarageLoading title="Starting login" detail="Memuat sesi dan backend Garage." />;
  }

  if (!health.configured) {
    return <BackendSetupScreen message={health.message} />;
  }

  if (isSignedIn) {
    return <GarageLoading title="Opening Garage" detail="Mengalihkan ke area kerja." />;
  }

  return (
    <LoginScreen
      variant={variant}
      initialEmail={initialEmail}
      includeOwnerPreset={includeOwnerPreset}
      onSignedIn={async () => {
        await session.refetch();
        window.location.assign(returnTo);
      }}
    />
  );
}

function AuthenticatedGarageApp({ initialModule }: { initialModule: ModuleId }) {
  const session = authClient.useSession();

  if (session.isPending) {
    return <GarageLoading title="Checking session" detail="Memuat sesi Better Auth." />;
  }

  if (!session.data?.user) {
    return <LoginScreen onSignedIn={() => void session.refetch()} />;
  }

  return (
      <GarageWorkspace
        initialModule={initialModule}
        onSignOut={async () => {
          await Promise.resolve(session.refetch());
        }}
    />
  );
}

function GarageWorkspace({
  initialModule,
  onSignOut,
}: {
  initialModule: ModuleId;
  onSignOut: () => Promise<void> | void;
}) {
  const { theme: activeOsTheme, setPreset: setOsThemePreset } = useGarageTheme();
  const [data, setData] = useState<GarageBootstrapData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  // Voice low-stock tracking â€” announce hanya saat SKU baru transition jadi "low",
  // bukan setiap fetch refresh (yang akan re-trigger untuk item yang udah lama low).
  const previousLowStockRef = useRef<Set<string> | null>(null);
  const [kitchenSyncing, setKitchenSyncing] = useState(false);
  const [kitchenSyncError, setKitchenSyncError] = useState<string | null>(null);
  const [kitchenLastSyncedAt, setKitchenLastSyncedAt] = useState<Date | null>(null);
  const [kitchenPerformance, setKitchenPerformance] =
    useState<KitchenPerformanceData | null>(null);
  const [kitchenPerformanceLoading, setKitchenPerformanceLoading] = useState(false);
  const [kitchenPerformanceError, setKitchenPerformanceError] = useState<string | null>(
    null,
  );
  const [activeModule, setActiveModule] = useState<ModuleId>(initialModule);
  const currentRole = data?.me.role;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [garageTheme] = useState<GarageThemeMode>("dark");
  const [cashierTheme, setCashierTheme] = useState<CashierThemeMode>(() => {
    if (typeof window === "undefined") {
      return "garage-default";
    }

    const stored = window.localStorage.getItem(GARAGE_CASHIER_THEME_STORAGE_KEY);
    return isCashierThemeMode(stored) ? stored : "garage-default";
  });
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutInFlight = useRef(false);
  // Badge counter pending approvals di nav module â€” polling 60s
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const lastPendingApprovalRef = useRef(0);
  useEffect(() => {
    if (!data?.me) return;
    if (!canAccessModule(data.me.role, "approvals")) return;
    let cancelled = false;
    const load = async () => {
      try {
        const stats = await garageApi.get<{ pending: number }>(
          "/api/approvals/stats",
          { cache: "no-store" },
        );
        if (cancelled) return;
        const nextCount = stats.pending ?? 0;
        const prev = lastPendingApprovalRef.current;
        setPendingApprovalCount(nextCount);
        // Voice notification: bunyi hanya saat count naik (ada request baru),
        // bukan saat halaman pertama kali load atau saat count turun.
        if (prev > 0 && nextCount > prev) {
          void voice.announce("approval_pending", {
            dedupKey: `approval-bump-${nextCount}`,
          });
        }
        lastPendingApprovalRef.current = nextCount;
      } catch {
        /* silent fail, badge tetap stale */
      }
    };
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [data?.me]);

  async function loadBootstrap() {
    setReloading(true);
    setLoadError(null);

    try {
      const nextData = await garageApi.get<GarageBootstrapData>("/api/bootstrap", {
        cache: "no-store",
      });
      setData(nextData);
      setActiveModule((current) =>
        canAccessModule(nextData.me.role, current)
          ? current
          : firstModuleForRole(nextData.me.role),
      );
      setKitchenLastSyncedAt(new Date());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load Garage data.");
    } finally {
      setReloading(false);
    }
  }

  const loadKitchenOrders = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) {
      setKitchenSyncing(true);
    }
    setKitchenSyncError(null);

    try {
      const kitchenOrders = await garageApi.get<KitchenOrder[]>("/api/kitchen/orders", {
        cache: "no-store",
      });
      setData((current) => (current ? { ...current, kitchenOrders } : current));
      setKitchenLastSyncedAt(new Date());
    } catch (error) {
      setKitchenSyncError(
        error instanceof Error ? error.message : "Sinkron pesanan dapur gagal.",
      );
    } finally {
      if (!options.silent) {
        setKitchenSyncing(false);
      }
    }
  }, []);

  // Refresh menu saja (dipakai saat Inventory mengedit produk).
  // Lebih murah daripada loadBootstrap yang refetch semua domain.
  const loadMenu = useCallback(async () => {
    try {
      const menuItems = await garageApi.get<MenuItem[]>("/api/menu", {
        cache: "no-store",
      });
      setData((current) => (current ? { ...current, menuItems } : current));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Menu gagal di-refresh.",
      );
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const customers = await garageApi.get<Customer[]>("/api/customers", {
        cache: "no-store",
      });
      setData((current) => (current ? { ...current, customers } : current));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Customer list gagal di-refresh.",
      );
    }
  }, []);

  const loadInventoryForNotifications = useCallback(async () => {
    if (!currentRole || !canUseApi(currentRole, "inventory:read")) {
      return;
    }

    try {
      const inventoryItems = await garageApi.get<InventoryItem[]>("/api/inventory", {
        cache: "no-store",
      });
      setData((current) => (current ? { ...current, inventoryItems } : current));
    } catch {
      // Inventory polling is best-effort; existing dashboard data stays usable.
    }
  }, [currentRole]);

  const loadKitchenPerformance = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setKitchenPerformanceLoading(true);
      }
      setKitchenPerformanceError(null);

      try {
        const performance = await garageApi.get<KitchenPerformanceData>(
          "/api/kitchen/performance?range=month",
          { cache: "no-store" },
        );
        setKitchenPerformance(performance);
      } catch (error) {
        setKitchenPerformanceError(
          error instanceof Error ? error.message : "Analisa karyawan gagal dimuat.",
        );
      } finally {
        if (!options.silent) {
          setKitchenPerformanceLoading(false);
        }
      }
    },
    [],
  );

  const canSeeKitchenPerformance = data
    ? canViewKitchenPerformance(data.me.role)
    : false;

  useEffect(() => {
    let mounted = true;

    garageApi
      .get<GarageBootstrapData>("/api/bootstrap", { cache: "no-store" })
      .then((payload) => {
        if (mounted) {
          setData(payload);
          setActiveModule((current) =>
            canAccessModule(payload.me.role, current)
              ? current
              : firstModuleForRole(payload.me.role),
          );
          setKitchenLastSyncedAt(new Date());
        }
      })
      .catch((error) => {
        if (mounted) {
          setLoadError(
            error instanceof Error ? error.message : "Unable to load Garage data.",
          );
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const preset = data?.settings.garageOsThemePreset;
    if (typeof preset !== "string" || !isThemePresetId(preset)) return;
    setOsThemePreset(preset);
  }, [data?.settings.garageOsThemePreset, setOsThemePreset]);

  useEffect(() => {
    window.localStorage.setItem(GARAGE_CASHIER_THEME_STORAGE_KEY, cashierTheme);
  }, [cashierTheme]);

  useEffect(() => {
    if (activeModule !== "kitchen") {
      return;
    }

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadKitchenOrders({ silent: true });
    };
    const intervalId = window.setInterval(tick, 5000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeModule, loadKitchenOrders]);

  // Cross-module cache invalidation: saat mutation di modul lain (mis. POS submit/
  // void) memanggil invalidateGarageCache(tag), refetch data hub yang relevan
  // secara instan (tanpa nunggu polling). Idempoten — refetch ringan.
  useEffect(() => {
    const unsubKitchen = subscribeGarageCache(GARAGE_TAGS.kitchen, () => {
      void loadKitchenOrders({ silent: true });
    });
    const unsubInventory = subscribeGarageCache(GARAGE_TAGS.inventory, () => {
      void loadInventoryForNotifications();
    });
    const unsubCustomers = subscribeGarageCache(GARAGE_TAGS.customers, () => {
      void loadCustomers();
    });
    return () => {
      unsubKitchen();
      unsubInventory();
      unsubCustomers();
    };
  }, [loadKitchenOrders, loadInventoryForNotifications, loadCustomers]);

  // Voice low-stock alert: diff SKU yang baru transition jadi "low".
  // First load: cuma seed snapshot (jangan announce semua existing low).
  useEffect(() => {
    if (!data?.inventoryItems) return;
    const currentLow = new Set(
      data.inventoryItems
        .filter((item) => item.status === "low")
        .map((item) => item.sku),
    );
    const prev = previousLowStockRef.current;
    if (prev === null) {
      previousLowStockRef.current = currentLow;
      return;
    }
    const newlyLow = [...currentLow].filter((sku) => !prev.has(sku));
    if (newlyLow.length > 0) {
      // Announce satu per satu; queue di voice utility handle sequencing.
      for (const sku of newlyLow) {
        const item = data.inventoryItems.find((entry) => entry.sku === sku);
        if (!item) continue;
        void voice.announce("warning_lowstock", {
          itemName: item.name,
          dedupKey: `lowstock:${sku}`,
        });
      }
    }
    previousLowStockRef.current = currentLow;
  }, [data?.inventoryItems]);

  useEffect(() => {
    if (!currentRole || !canUseApi(currentRole, "inventory:read")) {
      return;
    }

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadInventoryForNotifications();
    };

    const timeoutId = window.setTimeout(tick, 0);
    // 60 detik cukup utk notifikasi low-stock; sebelumnya 15s = 4Ã— lebih
    // sering tanpa benefit. Polling juga di-pause saat tab tidak aktif.
    const intervalId = window.setInterval(tick, 60_000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currentRole, loadInventoryForNotifications]);

  const osThemeVars = useMemo(
    () =>
      ({
        ...themeToGarageCssVars(activeOsTheme),
        color: "var(--garage-fg)",
        fontFamily: "var(--garage-font-body)",
      }) as CSSProperties,
    [activeOsTheme],
  );

  useEffect(() => {
    if (activeModule !== "kitchen" || !canSeeKitchenPerformance) {
      return;
    }

    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void loadKitchenPerformance({ silent: true });
    };

    const timeoutId = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 15000);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeModule, canSeeKitchenPerformance, loadKitchenPerformance]);

  async function handleSignOut() {
    if (signOutInFlight.current) {
      return;
    }

    signOutInFlight.current = true;
    setSignOutPending(true);
    setSignOutError(null);

    let redirected = false;

    try {
      try {
        await authClient.signOut();
      } catch {
        // The direct API call below is the authoritative fallback.
      }

      const fallback = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: "{}",
      });

      if (!fallback.ok) {
        throw new Error("Fallback sign-out failed.");
      }

      await Promise.resolve(onSignOut());

      const sessionCheck = await fetchAuthSessionCheck();
      if (hasActiveAuthSession(sessionCheck)) {
        throw new Error("Session still active.");
      }

      redirected = true;
      window.location.replace("/pos-login");
    } catch {
      setSignOutError("Logout gagal, coba lagi.");
    } finally {
      if (!redirected) {
        setSignOutPending(false);
        signOutInFlight.current = false;
      }
    }
  }

  function handleModuleChange(module: ModuleId) {
    if (!canAccessModule(data?.me.role ?? "Kasir", module)) {
      return;
    }

    setActiveModule(module);
    setMobileOpen(false);
  }

  if (!data && !loadError) {
    return <GarageLoading title="Loading Garage OS" detail="Mengambil data outlet dari API." />;
  }

  if (!data && loadError) {
    return (
      <GarageErrorScreen
        title="Garage data belum bisa dimuat"
        detail={loadError}
        onRetry={() => void loadBootstrap()}
      />
    );
  }

  if (!data) {
    return null;
  }

  const allowedModules = modulesForRole(data.me.role);
  const roleHomeModule = firstModuleForRole(data.me.role);
  const safeActiveModule = allowedModules.includes(activeModule)
    ? activeModule
    : roleHomeModule;
  const active = modules.find((item) => item.id === safeActiveModule) ?? modules[0];
  const isPosMode = safeActiveModule === "pos";
  const isCashierPosMode = isPosMode && data.me.role === "Kasir";
  const isKitchenMode = safeActiveModule === "kitchen";
  const showDesktopSidebar = !isPosMode;
  const themeLabel = getPreset(activeOsTheme.presetId).label;
  const canGoBackToRoleHome = safeActiveModule !== roleHomeModule;

  return (
    <div
      className={`garage-shell garage-os-shell dark h-screen overflow-hidden text-foreground ${
        garageTheme === "bright" ? "garage-theme-bright" : ""
      }`}
      data-cashier-theme={isCashierPosMode ? cashierTheme : undefined}
      data-garage-os-surface={
        isLightGarageOsPreset(activeOsTheme.presetId) ? "light" : "dark"
      }
      data-garage-theme={garageTheme}
      data-garage-preset={activeOsTheme.presetId}
      style={osThemeVars}
    >
      <div className="garage-os-frame flex h-full min-h-0">
        {!isCashierPosMode ? (
          <aside
            className={`garage-scroll garage-side-panel garage-os-sidebar hidden h-full shrink-0 overflow-y-auto border-r border-[#34343c] bg-[#0b0b0e] p-4 shadow-[18px_0_50px_rgba(0,0,0,0.22)] transition-[width,padding,opacity,transform] duration-300 xl:block ${
              showDesktopSidebar && sidebarOpen
                ? "w-[292px] opacity-100 xl:w-[304px]"
                : "w-0 translate-x-[-10px] p-0 opacity-0"
            }`}
            aria-hidden={!showDesktopSidebar || !sidebarOpen}
          >
            <BrandBlock />
            <OutletSwitcher
              activeOutlet={data.me.outlet}
              role={data.me.role}
              onSwitched={() => loadBootstrap()}
            />
            <div className="garage-theme-card mt-4 rounded-md border border-[#34343c] bg-white/[0.055] p-2">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <span className="garage-mono text-[10px]">Tema Garage OS</span>
                <Badge className="border-[#f5a742]/35 bg-[#f5a742]/12 px-2 text-[10px] text-[#ffd08a]">
                  {themeLabel}
                </Badge>
              </div>
              <button
                type="button"
                onClick={() => handleModuleChange("settings")}
                className="garage-press flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#4a4a54] bg-white/[0.045] px-3 text-xs font-semibold text-[#d4d4d8] transition-colors hover:border-[#d11a2a]/60 hover:bg-white/[0.075] hover:text-white"
              >
                <Settings className="size-3.5" />
                Atur di Pengaturan
              </button>
            </div>
            <Separator className="my-4 bg-[#34343c]" />
            <ModuleNav
              activeModule={safeActiveModule}
              role={data.me.role}
              onChange={handleModuleChange}
              approvalBadgeCount={pendingApprovalCount}
            />
            <div className="garage-panel garage-animate-in mt-6 rounded-md p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[#f4f4f5]">
                <Signal className="size-4" />
                Garage bay online
              </div>
              <p className="mt-2 text-xs leading-5 text-[#d0d0d6]">
                {data.me.outlet.name} siap jalan. API route, auth, dan database aktif.
              </p>
            </div>
          </aside>
        ) : null}
        {showDesktopSidebar && !sidebarOpen ? (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="garage-sidebar-peek garage-press garage-os-sidebar-peek group hidden h-full w-12 shrink-0 border-r border-[#34343c] bg-[#0b0b0e] text-[#d4d4d8] transition-colors hover:bg-[#15151b] hover:text-white xl:flex xl:items-center xl:justify-center"
            aria-label="Tampilkan sidebar"
          >
            <span className="flex h-full w-full flex-col items-center justify-center gap-3">
              <PanelLeft className="size-4 text-[#f5a742] transition-transform group-hover:translate-x-0.5" />
              <span className="garage-sidebar-peek-label garage-mono text-[10px] tracking-[0.22em]">
                MENU
              </span>
            </span>
          </button>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!isPosMode && (
            <header
              className={`garage-os-toolbar shrink-0 border-b border-[#34343c] bg-[#0b0b0e] px-3 sm:px-5 ${
                isKitchenMode ? "py-2" : "py-3"
              }`}
            >
              <div className="flex items-center gap-3">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="garage-press h-11 w-11 shrink-0 border-[#4a4a54] bg-white/[0.08] lg:hidden"
                      aria-label="Open navigation"
                    >
                      <Menu className="size-4" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="garage-scroll garage-side-panel garage-pos-nav-sheet w-[min(88vw,320px)] border-[#34343c] bg-[#0b0b0e] p-4">
                    <SheetHeader className="text-left">
                      <SheetTitle>Garage Command</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4">
                      <BrandBlock compact />
                      <button
                        type="button"
                        onClick={() => {
                          handleModuleChange("settings");
                          setMobileOpen(false);
                        }}
                        className="garage-press mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#4a4a54] bg-white/[0.055] px-3 text-xs font-semibold text-[#d4d4d8] transition-colors hover:border-[#d11a2a]/60 hover:bg-white/[0.08] hover:text-white"
                      >
                        <Settings className="size-3.5" />
                        Tema: {themeLabel}
                      </button>
                      <Separator className="my-4 bg-[#34343c]" />
                      <ModuleNav
                        activeModule={safeActiveModule}
                        role={data.me.role}
                        onChange={(value) => {
                          handleModuleChange(value);
                        }}
                        approvalBadgeCount={pendingApprovalCount}
                      />
                    </div>
                  </SheetContent>
                </Sheet>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <active.icon className="size-4 text-[#d11a2a]" />
                    <p className="truncate text-sm text-[#d0d0d6]">
                      {active.description}
                    </p>
                  </div>
                  <h1
                    className={`garage-display garage-chrome truncate ${
                      isKitchenMode ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"
                    }`}
                  >
                    {active.label}
                  </h1>
                </div>

                {/* Sidebar toggle */}
                {!isPosMode && (
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setSidebarOpen((v) => !v)}
                    className="garage-press hidden h-11 w-11 shrink-0 border-[#4a4a54] bg-white/[0.08] xl:flex"
                    aria-label={sidebarOpen ? "Sembunyikan sidebar" : "Tampilkan sidebar"}
                  >
                    <PanelLeft className={`size-4 transition-transform duration-200 ${sidebarOpen ? "" : "rotate-180"}`} />
                  </Button>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 shrink-0 gap-2 border-[#4a4a54] bg-white/[0.08] px-3 text-xs text-[#d4d4d8] hover:bg-white/[0.11] disabled:opacity-45"
                  disabled={!canGoBackToRoleHome}
                  onClick={() => handleModuleChange(roleHomeModule)}
                  aria-label="Kembali ke modul utama"
                >
                  <ArrowLeft className="size-4" />
                  <span className="hidden sm:inline">Kembali</span>
                </Button>

                <GarageAiAlertsBell
                  role={data.me.role}
                  onOpenAiModule={() => handleModuleChange("ai-agent")}
                />

                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 shrink-0 gap-2 border-[#d11a2a]/55 bg-[#d11a2a]/14 px-3 text-xs text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                  disabled={signOutPending}
                  onClick={() => void handleSignOut()}
                  aria-label="Logout"
                >
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">
                    {signOutPending ? "Logout..." : "Logout"}
                  </span>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="garage-press border-[#4a4a54] bg-white/[0.08]"
                      aria-label="Open actions"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Quick action</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleModuleChange("pos")}>
                      Open POS tablet
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleModuleChange("finance")}>
                      Start closing review
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleModuleChange("approvals")}>
                      Review approvals
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void loadBootstrap()}>
                      Refresh API data
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={signOutPending}
                      onClick={() => void handleSignOut()}
                    >
                      <LogOut className="mr-2 size-4" />
                      {signOutPending ? "Logging out..." : "Sign out"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {isKitchenMode ? (
                <div className="garage-scroll-x mt-2 flex gap-2 pb-1">
                  <div className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-[#34343c] bg-white/[0.055] px-3 text-xs font-semibold text-white">
                    <Badge className="border-[#d11a2a]/40 bg-[#d11a2a]/12 text-[10px] text-white">
                      {data.me.device}
                    </Badge>
                    <span className="max-w-[14rem] truncate">
                      {data.me.outlet.name} - {data.me.shift}
                    </span>
                  </div>
                  {data.serviceRules.map((rule) => {
                    const RuleIcon =
                      serviceRuleIcons[rule.label as keyof typeof serviceRuleIcons] ??
                      ShieldCheck;

                    return (
                      <div
                        key={rule.label}
                        className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-[#34343c] bg-white/[0.045] px-3 text-xs text-[#d6d6dc]"
                      >
                        <RuleIcon className="size-3.5 text-[#f5a742]" />
                        <span className="garage-mono">{rule.label}</span>
                        <span className="font-black text-white">{rule.value}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 hidden gap-3 lg:grid xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="garage-panel garage-animate-in rounded-md p-3">
                    <p className="garage-mono">Shift context</p>
                    <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="min-w-0 flex-1 break-words text-sm leading-6 text-white">
                        {data.me.outlet.name} - {data.me.device}. {data.me.shift}. Login:
                        {" "}{data.me.user.name} / {data.me.role}.
                      </p>
                      <Badge className="w-fit border-[#d11a2a]/40 bg-[#d11a2a]/12 text-white">
                        {data.me.device}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {data.serviceRules.map((rule) => {
                      const RuleIcon =
                        serviceRuleIcons[rule.label as keyof typeof serviceRuleIcons] ??
                        ShieldCheck;

                      return (
                        <div
                          key={rule.label}
                          className="garage-surface garage-hover-lift min-w-0 rounded-md p-2"
                        >
                          <RuleIcon className="mb-2 size-4 text-[#f5a742]" />
                          <p className="garage-mono truncate">{rule.label}</p>
                          <p className="text-sm font-semibold text-white">{rule.value}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </header>
          )}

          {isPosMode && !isCashierPosMode && (
            <header className="garage-os-toolbar flex min-h-[68px] items-center gap-3 border-b border-[#34343c] bg-[#0b0b0e]/90 px-3 sm:px-4">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="garage-press h-11 w-11 shrink-0 border-[#4a4a54] bg-white/[0.08]"
                    aria-label="Open POS navigation"
                  >
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="garage-scroll garage-side-panel garage-pos-nav-sheet w-[min(88vw,320px)] border-[#34343c] bg-[#0b0b0e] p-4">
                  <SheetHeader className="text-left">
                    <SheetTitle>Garage Command</SheetTitle>
                  </SheetHeader>
                  <div className="mt-4">
                    <BrandBlock compact />
                    <button
                      type="button"
                      onClick={() => {
                        handleModuleChange("settings");
                        setMobileOpen(false);
                      }}
                      className="garage-press mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#4a4a54] bg-white/[0.055] px-3 text-xs font-semibold text-[#d4d4d8] transition-colors hover:border-[#d11a2a]/60 hover:bg-white/[0.08] hover:text-white"
                    >
                      <Settings className="size-3.5" />
                      Tema: {themeLabel}
                    </button>
                    <Separator className="my-4 bg-[#34343c]" />
                    <ModuleNav
                      activeModule={safeActiveModule}
                      role={data.me.role}
                      onChange={handleModuleChange}
                      approvalBadgeCount={pendingApprovalCount}
                    />
                  </div>
                </SheetContent>
              </Sheet>
              <PosHeaderBrand />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <active.icon className="size-4 shrink-0 text-[#d11a2a]" />
                  <p className="garage-mono truncate">{data.me.device}</p>
                </div>
                <h1 className="garage-display garage-chrome truncate text-2xl">
                  {active.label}
                </h1>
              </div>
              <button
                type="button"
                onClick={() => handleModuleChange("settings")}
                className="garage-press flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-[#4a4a54] bg-white/[0.08] px-3 text-xs font-semibold text-[#d4d4d8] transition-colors hover:border-[#d11a2a]/60 hover:bg-white/[0.11] hover:text-white"
                aria-label="Atur tema Garage OS"
              >
                <Settings className="size-4" />
                <span className="hidden sm:inline">Tema</span>
              </button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="garage-press h-11 w-11 shrink-0 border-[#4a4a54] bg-white/[0.08]"
                aria-label="Refresh POS data"
                onClick={() => void loadBootstrap()}
              >
                <RefreshCw className="size-4" />
              </Button>
              <GarageAiAlertsBell
                role={data.me.role}
                onOpenAiModule={
                  canAccessModule(data.me.role, "ai-agent")
                    ? () => handleModuleChange("ai-agent")
                    : undefined
                }
              />
            </header>
          )}

          <main
            className={`garage-scroll garage-os-content flex-1 overflow-x-hidden ${
              isPosMode
                ? "p-1.5 sm:p-2"
                : isKitchenMode
                  ? "p-2 sm:p-3 lg:p-4"
                  : "p-3 sm:p-5"
            }`}
          >
            {loadError && (
              <Alert className="garage-panel mb-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Refresh API gagal</AlertTitle>
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            )}

            {signOutError && (
              <Alert className="garage-panel mb-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Logout gagal</AlertTitle>
                <AlertDescription>{signOutError}</AlertDescription>
              </Alert>
            )}

            {reloading && (
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" />
                Refreshing API data...
              </div>
            )}

            {safeActiveModule === "dashboard" && (
              <DateFilterProvider>
                <div className="space-y-3">
                  <DateFilterBar />
                  <DashboardView
                    data={data.dashboard}
                    me={data.me}
                    onNavigateModule={handleModuleChange}
                  />
                </div>
              </DateFilterProvider>
            )}
            {safeActiveModule === "pos" && (
              <DateFilterProvider>
                <PosView
                  me={data.me}
                  menuItems={data.menuItems}
                  customers={data.customers}
                  cartSeed={data.cartSeed}
                  cashSession={data.cashSession}
                  settings={data.settings}
                  onCashSessionOpened={() => loadBootstrap()}
                  onExit={() => handleModuleChange("dashboard")}
                  onOpenEarnings={() => handleModuleChange("earnings")}
                  // Order baru: refresh KDS saja. CashSession internal counters
                  // disinkron lewat shift report / close-shift fetch on-demand.
                  // Sebelumnya tiap order trigger /api/bootstrap (600-2000ms).
                  onOrderCreated={() => loadKitchenOrders()}
                  onSignOut={handleSignOut}
                  signOutPending={signOutPending}
                  signOutError={signOutError}
                  themeMode={garageTheme}
                    onThemeChange={() => undefined}
                  cashierTheme={cashierTheme}
                  onCashierThemeChange={setCashierTheme}
                />
              </DateFilterProvider>
            )}
            {safeActiveModule === "ai-agent" && <AiPosAgentView me={data.me} />}
            {safeActiveModule === "kitchen" && (
              <DateFilterProvider>
                <div className="space-y-3">
                  <DateFilterBar />
                  <KitchenView
                    kitchenOrders={data.kitchenOrders}
                    role={data.me.role}
                    isSyncing={kitchenSyncing}
                    lastSyncedAt={kitchenLastSyncedAt}
                    syncError={kitchenSyncError}
                    performance={kitchenPerformance}
                    performanceLoading={kitchenPerformanceLoading}
                    performanceError={kitchenPerformanceError}
                    canViewPerformance={canSeeKitchenPerformance}
                    onRefresh={() => loadKitchenOrders()}
                    onRefreshPerformance={() => loadKitchenPerformance()}
                    onChanged={async () => {
                      await loadKitchenOrders();
                      if (canSeeKitchenPerformance) {
                        await loadKitchenPerformance({ silent: true });
                      }
                    }}
                  />
                </div>
              </DateFilterProvider>
            )}
            {safeActiveModule === "waiter" && <WaiterView me={data.me} />}
            {safeActiveModule === "inventory" && (
              <InventoryView
                role={data.me.role}
                menuItems={data.menuItems}
                inventoryItems={data.inventoryItems}
                stockMovements={data.stockMovements}
                onMenuChanged={loadMenu}
                onNavigateModule={handleModuleChange}
              />
            )}
            {safeActiveModule === "finance" && (
              <DateFilterProvider>
                <div className="space-y-3">
                  <DateFilterBar />
                  <FinanceView
                    cashSession={data.cashSession}
                    closingChecklist={data.closingChecklist}
                    paymentBreakdown={data.paymentBreakdown}
                    role={data.me.role}
                    onNavigateModule={handleModuleChange}
                  />
                </div>
              </DateFilterProvider>
            )}
            {safeActiveModule === "crm" && <CrmView customers={data.customers} settings={data.settings} me={data.me} />}
            {safeActiveModule === "membership" && (
              <MembershipAdminView
                customers={data.customers}
                role={data.me.role}
                onChanged={loadCustomers}
              />
            )}
            {safeActiveModule === "marketing" && (
              <GarageMarketingView
                customers={data.customers}
                settings={data.settings}
                me={data.me}
              />
            )}
            {safeActiveModule === "approvals" && (
              <DateFilterProvider>
                <div className="space-y-4">
                  <DateFilterBar />
                  <ApprovalsAutoSweepPanel />
                  <ApprovalsBoard
                    onOpenModule={handleModuleChange}
                    role={data.me.role}
                  />
                </div>
              </DateFilterProvider>
            )}
            {safeActiveModule === "website" && <WebsiteSettingsView me={data.me} />}
            {safeActiveModule === "company-control" && <CompanyControlBridge me={data.me} />}
            {safeActiveModule === "earnings" && (
              <DateFilterProvider>
                <div className="space-y-3">
                  <DateFilterBar />
                  <EarningsView role={data.me.role} />
                </div>
              </DateFilterProvider>
            )}
            {safeActiveModule === "audit" && (
              <DateFilterProvider>
                <div className="space-y-4">
                  <DateFilterBar />
                  <SmartAuditDashboard />
                  <AuditSuspiciousPanel />
                  <AuditLogViewer />
                </div>
              </DateFilterProvider>
            )}
            {safeActiveModule === "team-management" && <TeamManagementDashboard role={data.me.role} />}
            {safeActiveModule === "training" && <GarageTrainingModule />}
            {safeActiveModule === "settings" && <SettingsView me={data.me} />}
            {safeActiveModule === "smart-notif" && (
              <VoiceSettingsDialog embedded />
            )}
            {safeActiveModule === "chat" && (
              <DateFilterProvider>
                <div className="flex h-full flex-col gap-3">
                  <DateFilterBar />
                  <ChatModule
                    currentUserId={data.me.user.id}
                    currentUserName={data.me.user.name}
                    currentUserRole={data.me.role}
                  />
                </div>
              </DateFilterProvider>
            )}
          </main>
        </div>
      </div>
      <ChatFab
        currentUserId={data.me.user.id}
        currentUserName={data.me.user.name}
        currentUserRole={data.me.role}
        hidden={safeActiveModule === "chat"}
        compact={isPosMode || isKitchenMode}
      />
      {safeActiveModule !== "chat" && safeActiveModule !== "training" && (
        <SopTutorialWidget
          role={data.me.role}
          activeModule={safeActiveModule}
          compact={isPosMode || isKitchenMode}
          onOpenTraining={() => handleModuleChange("training")}
        />
      )}
    </div>
  );
}

function GarageLoading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="garage-shell dark flex min-h-screen items-center justify-center p-4 text-foreground">
      <div className="garage-panel garage-animate-in w-full max-w-md rounded-md p-5">
        <BrandBlock mode="loading" compact />
        <div className="mt-8 flex items-center gap-3">
          <RefreshCw className="size-5 animate-spin text-[#f5a742]" />
          <div>
            <h1 className="garage-display garage-chrome text-2xl">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackendSetupScreen({ message }: { message: string }) {
  return (
    <div className="garage-shell dark flex min-h-screen items-center justify-center p-4 text-foreground">
      <Card className="garage-panel garage-animate-in w-full max-w-xl">
        <CardHeader>
          <BrandBlock mode="loading" compact />
          <CardTitle className="mt-6">Backend belum dikonfigurasi</CardTitle>
          <CardDescription>
            Set `DATABASE_URL`, `BETTER_AUTH_SECRET`, dan `BETTER_AUTH_URL`, lalu jalankan
            migrate dan seed sebelum login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
            <Database className="size-4" />
            <AlertTitle>Status</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
          <div className="garage-surface rounded-md p-3 font-mono text-xs leading-6 text-zinc-100">
            npm run db:generate
            <br />
            npm run db:migrate
            <br />
            npm run db:seed
            <br />
            npm run dev
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GarageErrorScreen({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail: string;
  onRetry: () => void;
}) {
  return (
    <div className="garage-shell dark flex min-h-screen items-center justify-center p-4 text-foreground">
      <Card className="garage-panel garage-animate-in w-full max-w-lg">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{detail}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onRetry} className="garage-press">
            <RefreshCw className="mr-2 size-4" />
            Retry
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

type LoginRolePreset = {
  role: Role;
  label: string;
  email: string;
  station: string;
  summary: string;
  icon: LucideIcon;
  tone: string;
};

const loginRolePresets: LoginRolePreset[] = [
  {
    role: "Owner / CEO",
    label: "Owner",
    email: "owner@garage.local",
    station: "Command center",
    summary: "Dashboard lengkap, approval, laporan, dan Owner Brain.",
    icon: ShieldCheck,
    tone: "border-[#d11a2a]/60 bg-[#d11a2a]/16 text-[#ffb0b8]",
  },
  {
    role: "Admin",
    label: "Admin",
    email: "admin@garage.local",
    station: "Ops control",
    summary: "POS, KDS, inventory, finance review, and shift approval.",
    icon: Wrench,
    tone: "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd08a]",
  },
  {
    role: "Kasir",
    label: "Kasir",
    email: "kasir@garage.local",
    station: "POS counter",
    summary: "Transaksi, payment, cash session, and receipt flow.",
    icon: ReceiptText,
    tone: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-white",
  },
  {
    role: "Barista",
    label: "Barista",
    email: "barista@garage.local",
    station: "Coffee bar",
    summary: "Queue minuman, status station, and handoff service.",
    icon: Gauge,
    tone: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]",
  },
  {
    role: "Koki",
    label: "Koki",
    email: "koki@garage.local",
    station: "Kitchen line",
    summary: "Queue makanan, timing dapur, and ticket status.",
    icon: Activity,
    tone: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
  },
  {
    role: "Asisten Koki",
    label: "Asisten Koki",
    email: "asisten-koki@garage.local",
    station: "Kitchen prep",
    summary: "Bantu Koki: prep, plating, dan timing dapur.",
    icon: Activity,
    tone: "border-[#f5a742]/40 bg-[#f5a742]/10 text-[#ffd79a]",
  },
  {
    role: "Waiter 1",
    label: "Waiter 1",
    email: "waiter1@garage.local",
    station: "Floor A",
    summary: "Order meja, service handoff, and table flow.",
    icon: Bell,
    tone: "border-[#4a4a54] bg-white/[0.07] text-[#e8e8ec]",
  },
  {
    role: "Waiter 2",
    label: "Waiter 2",
    email: "waiter2@garage.local",
    station: "Floor B",
    summary: "Order meja, service handoff, and table flow.",
    icon: Signal,
    tone: "border-[#4a4a54] bg-white/[0.07] text-[#e8e8ec]",
  },
];

const visibleLoginRolePresets = loginRolePresets.filter(
  (preset) => preset.role !== "Owner / CEO",
);

const posLoginRolePresets = loginRolePresets.filter((preset) =>
  ["Kasir", "Waiter 1", "Waiter 2"].includes(preset.role),
);

const devLoginPassword =
  process.env.NODE_ENV === "production" ? null : "garage12345";

function LoginScreen({
  onSignedIn,
  variant = "os",
  initialEmail,
  includeOwnerPreset = false,
}: {
  onSignedIn: () => void;
  variant?: "os" | "pos";
  initialEmail?: string;
  includeOwnerPreset?: boolean;
}) {
  const isPosLogin = variant === "pos";
  // Helper preset/demo hanya untuk non-production. Di VPS/production layar login
  // bersih: cukup email + password, tanpa membocorkan akun internal.
  const showDemoHelpers = process.env.NODE_ENV !== "production";
  const rolePresets = isPosLogin
    ? posLoginRolePresets
    : includeOwnerPreset
      ? loginRolePresets
      : visibleLoginRolePresets;
  const [email, setEmail] = useState(
    initialEmail ?? (showDemoHelpers ? rolePresets[0]?.email ?? "" : ""),
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const selectedPreset =
    rolePresets.find((preset) => preset.email === email) ??
    loginRolePresets.find((preset) => preset.email === email) ??
    rolePresets[0] ??
    loginRolePresets[2];
  const SelectedPresetIcon = selectedPreset.icon;
  const loginStats = isPosLogin
    ? [
        ["POS ready", "Kasir counter"],
        ["Payment flow", "Cash / QRIS / transfer"],
        ["Receipt safe", "Thermal dan invoice"],
      ]
    : [
        ["POS ready", "Kasir dan waiter"],
        ["KDS live", "Barista dan koki"],
        ["Owner control", "Admin dan owner"],
      ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password) {
      setError("Masukkan password akun Garage.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      async function signInWithPassword(nextPassword: string) {
        const response = await fetch("/api/auth/sign-in/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password: nextPassword,
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | { twoFactorRedirect?: boolean; message?: string; error?: { message?: string } }
          | null;
        return {
          ok: response.ok,
          status: response.status,
          data,
          message:
            data?.message ??
            data?.error?.message ??
            (response.ok ? null : "Login gagal."),
        };
      }

      async function signInWithLocalDemo() {
        const response = await fetch("/api/dev/demo-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | { twoFactorRedirect?: boolean; message?: string; error?: { message?: string } }
          | null;
        return {
          ok: response.ok,
          status: response.status,
          data,
          message:
            data?.message ??
            data?.error?.message ??
            (response.ok ? null : "Login demo gagal."),
        };
      }

      let result = await signInWithPassword(password);
      if (!result.ok && devLoginPassword && password === devLoginPassword) {
        result = await signInWithLocalDemo();
      }

      if (!result.ok) {
        const message = result.message ?? "Login gagal.";
        setError(
          devLoginPassword
            ? `${message}. Demo lokal: klik Isi demo atau pakai ${devLoginPassword}.`
            : message,
        );
        return;
      }

      // Better Auth twoFactor plugin: kalau user punya 2FA aktif, response
      // balikin twoFactorRedirect=true (session belum dibuat). Redirect ke
      // page TOTP challenge untuk complete login.
      const responseData = result.data;
      if (responseData?.twoFactorRedirect) {
        const next = typeof window !== "undefined" ? window.location.search : "";
        window.location.href = `/login/2fa${next}`;
        return;
      }

      onSignedIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login gagal.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="garage-shell garage-login-shell dark flex min-h-screen flex-col text-foreground">
      <div className="garage-login-ambient" aria-hidden="true">
        <span className="garage-login-neon-rail garage-login-neon-rail-top" />
        <span className="garage-login-neon-rail garage-login-neon-rail-bottom" />
        <span className="garage-login-scanline" />
        <span className="garage-login-ember ember-1" />
        <span className="garage-login-ember ember-2" />
        <span className="garage-login-ember ember-3" />
        <span className="garage-login-ember ember-4" />
        <span className="garage-login-ember ember-5" />
        <span className="garage-login-ember ember-6" />
        <span className="garage-login-ember ember-7" />
        <span className="garage-login-ember ember-8" />
      </div>
      <header className="garage-login-grid mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 pt-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <p className="garage-mono">Garage staff portal</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">
            Login karyawan Garage
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          className="garage-press h-10 shrink-0 whitespace-nowrap border-[#4a4a54] bg-white/[0.06] px-3 text-xs"
        >
          <Link href="/">
            <ArrowRight className="mr-2 size-3.5 rotate-180" />
            Halaman Utama
          </Link>
        </Button>
      </header>
      <main className="garage-login-grid mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-7xl flex-1 items-center gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8">
        <section className="garage-login-hero garage-animate-in flex min-h-[520px] flex-col justify-between gap-8 rounded-md border border-[#34343c] bg-black/24 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)] sm:p-7 lg:p-8">
          <div className="max-w-[360px]">
            <BrandBlock mode="loading" compact className="garage-login-logo-crop mx-0" />
          </div>

          <div className="max-w-2xl space-y-5">
            <div className="garage-login-chip inline-flex items-center gap-2 rounded-full border border-[#d11a2a]/45 bg-[#d11a2a]/14 px-3 py-1 text-xs font-medium text-[#ffb0b8]">
              <Sparkles className="size-3.5" />
              Garage Coffee & Motor OS
            </div>
            <div className="space-y-3">
              <h1 className="garage-display garage-chrome max-w-[760px] text-5xl sm:text-6xl lg:text-7xl">
                {isPosLogin ? "Garage POS Login" : "Garage Command Login"}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[#d0d0d6] sm:text-lg">
                {isPosLogin
                  ? "Halaman khusus tablet kasir Garage untuk masuk langsung ke POS, membuka shift, memproses transaksi, payment, dan cetak struk."
                  : "Aplikasi point of sale dan pusat kendali operasional Garage untuk transaksi kasir, kitchen display, inventory, finance, approval, audit, dan dashboard owner."}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {loginStats.map(([value, label]) => (
                <div key={value} className="garage-login-stat garage-surface rounded-md p-3">
                  <p className="text-sm font-semibold text-white">{value}</p>
                  <p className="garage-mono mt-2">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 border-t border-[#34343c] pt-4 text-sm text-[#d0d0d6] sm:grid-cols-3">
            <div>
              <p className="garage-mono">Pembuat aplikasi</p>
              <p className="mt-1 font-semibold text-white">Killua Surya</p>
            </div>
            <div>
              <p className="garage-mono">Info pembuatan program</p>
              <p className="mt-1 font-semibold text-white">081396186251</p>
            </div>
            <div>
              <p className="garage-mono">Copyright</p>
              <p className="mt-1 font-semibold text-white">Killua Surya 2026</p>
            </div>
          </div>
        </section>

        <Card className="garage-login-card garage-panel garage-animate-in w-full">
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>Staff access</CardTitle>
                <CardDescription className="mt-2">
                  {isPosLogin
                    ? "Login khusus staf POS. Setelah berhasil masuk, sistem langsung membuka tablet kasir."
                    : "Better Auth session untuk struktur kerja Garage."}
                </CardDescription>
              </div>
              {showDemoHelpers ? (
                <Badge className={selectedPreset.tone}>{selectedPreset.label}</Badge>
              ) : null}
            </div>
            {showDemoHelpers ? (
              <div className="garage-surface rounded-md p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <SelectedPresetIcon className="size-5 shrink-0 text-[#f5a742]" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {selectedPreset.role}
                    </p>
                    <p className="truncate text-sm text-[#d0d0d6]">{selectedPreset.station}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-5">
            {showDemoHelpers ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {rolePresets.map((preset) => {
                const RoleIcon = preset.icon;
                const active = email === preset.email;

                return (
                  <button
                    key={preset.email}
                    type="button"
                    onClick={() => {
                      setEmail(preset.email);
                      setError(null);
                    }}
                    className={`garage-login-role-card garage-press min-h-11 w-full rounded-md border px-3 py-2 text-left transition ${
                      active
                        ? "garage-login-role-card-active garage-red-glow border-[#d11a2a]/70 bg-[#d11a2a]/18"
                        : "border-[#34343c] bg-[#202027] hover:border-[#4a4a54] hover:bg-white/[0.08]"
                    }`}
                    aria-pressed={active}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`flex size-8 shrink-0 items-center justify-center rounded-md border ${preset.tone}`}>
                        <RoleIcon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate whitespace-nowrap text-sm font-semibold text-white">
                          {preset.label}
                        </span>
                        <span className="garage-mono mt-0.5 block truncate whitespace-nowrap">
                          {preset.station}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            ) : null}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1.08fr_0.92fr]">
                <div className="space-y-1">
                  <p className="garage-mono flex h-6 items-center">Email</p>
                  <Input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-11 border-[#34343c] bg-white/[0.06]"
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex h-6 items-center justify-between gap-2">
                    <p className="garage-mono">Password</p>
                    {devLoginPassword ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPassword(devLoginPassword);
                          setError(null);
                        }}
                        className="garage-mono rounded border border-[#4a4a54] px-2 py-1 text-[10px] text-[#d4d4d8] transition hover:border-[#d11a2a]/70 hover:text-white"
                      >
                        Isi demo
                      </button>
                    ) : null}
                  </div>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11 border-[#34343c] bg-white/[0.06]"
                    autoComplete="current-password"
                  />
                </div>
              </div>
              {error && (
                <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Login gagal</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button disabled={pending} className="garage-login-submit garage-press h-11 w-full">
                {pending ? (
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                ) : (
                  <LockKeyhole className="mr-2 size-4" />
                )}
                <span className="truncate whitespace-nowrap">
                  {isPosLogin ? "Masuk POS" : "Masuk Garage OS"}
                </span>
              </Button>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#34343c] pt-4 text-xs text-[#9696a1]">
              <span className="whitespace-nowrap">Copyright Killua Surya 2026</span>
              <span className="whitespace-nowrap">Program info: 081396186251</span>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

type BrandBlockMode = "sidebar" | "compact" | "loading";

// Role yang boleh switch outlet â€” sinkron dengan server-side canSwitchOutlet
const OUTLET_SWITCH_ROLES: ReadonlyArray<Role> = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
];

function OutletSwitcher({
  activeOutlet,
  role,
  onSwitched,
}: {
  activeOutlet: { id: string; code: string; name: string; timezone: string };
  role: Role;
  onSwitched: () => void | Promise<void>;
}) {
  type OutletOption = {
    id: string;
    code: string;
    name: string;
    timezone: string;
    status: string;
  };
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const canSwitch = OUTLET_SWITCH_ROLES.includes(role);

  useEffect(() => {
    if (!open || outlets.length > 0) return;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      garageApi
        .get<{ outlets: OutletOption[] }>("/api/outlets/list")
        .then((data) => {
          if (!cancelled) setOutlets(data.outlets);
        })
        .catch(() => {
          if (!cancelled) setOutlets([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, outlets.length]);

  async function switchTo(outletId: string) {
    if (!canSwitch) return;
    if (outletId === activeOutlet.id) return;
    setSwitchingId(outletId);
    setSwitchError(null);
    try {
      await garageApi.post("/api/me/active-outlet", { outletId });
      // Soft reload bootstrap supaya data POS/dashboard refresh ke outlet baru
      await onSwitched();
      setOpen(false);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Switch outlet gagal.");
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-[#34343c] bg-white/[0.04] p-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="garage-press flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-white/[0.06]"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className="garage-mono text-[10px] uppercase tracking-wide text-[#b8b8bf]">
            Outlet aktif {canSwitch ? "Â· bisa switch" : ""}
          </p>
          <p className="truncate text-sm font-bold text-white">
            {activeOutlet.code} Â· {activeOutlet.name}
          </p>
        </div>
        <ArrowRight
          className={`size-3.5 shrink-0 text-[#b8b8bf] transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="mt-2 space-y-1 border-t border-[#34343c] pt-2">
          {switchError ? (
            <p className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-2 py-1 text-[10px] text-[#ffc2c8]">
              {switchError}
            </p>
          ) : null}
          {loading ? (
            <p className="px-1 text-[11px] text-[#8f8f99]">Memuat outlet...</p>
          ) : outlets.length === 0 ? (
            <p className="px-1 text-[11px] text-[#8f8f99]">
              Belum ada outlet lain.
            </p>
          ) : (
            outlets.map((o) => {
              const isActive = o.id === activeOutlet.id;
              const switching = switchingId === o.id;
              const disabled = isActive || !canSwitch || switching;
              return (
                <Tooltip key={o.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => void switchTo(o.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                        isActive
                          ? "border-[#22c55e]/45 bg-[#22c55e]/12 text-[#dcfce7]"
                          : !canSwitch
                            ? "cursor-not-allowed border-[#34343c] bg-white/[0.02] text-[#8f8f99] opacity-60"
                            : "border-[#34343c] bg-white/[0.04] text-[#d6d6dc] hover:border-[#f5a742]/45 hover:bg-[#f5a742]/8"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="garage-mono font-bold">{o.code}</span>{" "}
                        Â· {o.name}
                      </span>
                      {isActive ? (
                        <Check className="size-3 shrink-0 text-[#4ade80]" />
                      ) : switching ? (
                        <RefreshCw className="size-3 shrink-0 animate-spin text-[#ffd08a]" />
                      ) : null}
                    </button>
                  </TooltipTrigger>
                  {!isActive && !canSwitch ? (
                    <TooltipContent side="right">
                      Switch outlet butuh role Owner / Admin / Manager Ops.
                      Hubungi atasan untuk akses.
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

function BrandBlock({
  compact = false,
  mode,
  className = "",
}: {
  compact?: boolean;
  mode?: BrandBlockMode;
  className?: string;
}) {
  const brandMode = mode ?? (compact ? "compact" : "sidebar");
  const isLoading = brandMode === "loading";
  const containerClass = [
    "garage-logo-wrap",
    "garage-logo-global",
    isLoading
        ? "garage-logo-loading mx-auto w-full max-w-[340px]"
        : compact
          ? "garage-logo-compact mx-auto w-full max-w-[300px]"
          : "garage-logo-sidebar w-full max-w-[292px] space-y-2",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const frameClass = "garage-logo-frame";
  const imageClass = "garage-logo-image";
  const shouldPrioritize = brandMode === "sidebar" || isLoading;
  const imageSizes = isLoading
      ? "(min-width: 640px) 340px, 280px"
      : compact
        ? "(min-width: 1024px) 300px, 260px"
        : "292px";

  return (
    <div className={containerClass}>
      <div className={frameClass}>
        <Image
          src={GARAGE_BRAND_LOGO_SRC}
          alt="Garage Coffee & Motor"
          width={GARAGE_BRAND_LOGO_WIDTH}
          height={GARAGE_BRAND_LOGO_HEIGHT}
          priority={shouldPrioritize}
          loading={shouldPrioritize ? undefined : "lazy"}
          sizes={imageSizes}
          className={imageClass}
        />
      </div>
      {brandMode === "sidebar" && (
        <p className="garage-mono truncate px-1">
          Ops cockpit - Coffee & Motor
        </p>
      )}
    </div>
  );
}

function PosHeaderBrand() {
  return (
    <div className="flex shrink-0 items-center">
      <div className="hidden h-11 w-[min(178px,24vw)] items-center sm:flex">
        <Image
          src={GARAGE_BRAND_LOGO_SRC}
          alt="Garage Coffee & Motor"
          width={GARAGE_BRAND_LOGO_WIDTH}
          height={GARAGE_BRAND_LOGO_HEIGHT}
          priority
          sizes="(min-width: 1024px) 178px, 150px"
          className="h-auto max-h-10 w-full object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.48)]"
        />
      </div>
      <div className="flex size-10 items-center justify-center sm:hidden">
        <Image
          src={GARAGE_BRAND_ICON_SRC}
          alt="Garage"
          width={512}
          height={512}
          priority
          sizes="40px"
          className="size-8 object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.38)]"
        />
      </div>
    </div>
  );
}

function ModuleNav({
  activeModule,
  role,
  onChange,
  approvalBadgeCount = 0,
}: {
  activeModule: ModuleId;
  role: Role;
  onChange: (module: ModuleId) => void;
  approvalBadgeCount?: number;
}) {
  const accessibleModules = modules.filter((module) =>
    canAccessModule(role, module.id),
  );

  return (
    <nav className="grid min-w-0 gap-1.5">
      {accessibleModules.map((module) => {
        const isActive = activeModule === module.id;
        const showBadge =
          module.id === "approvals" && approvalBadgeCount > 0;
        return (
          <Tooltip key={module.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-module-nav-item={module.id}
                onClick={() => onChange(module.id)}
                aria-current={isActive ? "page" : undefined}
                className={`garage-press grid min-h-11 w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm transition-colors ${
                  isActive
                    ? "border-[#ff2a3a]/45 bg-[#d11a2a]/18 text-white shadow-[inset_3px_0_0_rgba(255,42,58,0.95)]"
                    : "border-transparent text-[#d0d0d6] hover:border-white/10 hover:bg-white/[0.075] hover:text-white"
                }`}
              >
                <span
                  data-module-nav-icon={module.id}
                  className={`flex h-8 w-8 min-w-8 items-center justify-center rounded-md ${
                    isActive
                      ? "bg-[#d11a2a]/18 text-[#ff2a3a]"
                      : "text-[#b8b8bf]"
                  }`}
                  aria-hidden="true"
                >
                  <module.icon className="size-4" />
                </span>
                <span className="min-w-0 truncate text-sm font-semibold leading-tight">
                  {module.label}
                </span>
                {showBadge ? (
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d11a2a] px-1.5 text-[10px] font-extrabold text-white shadow-[0_0_8px_rgba(209,26,42,0.65)]"
                    aria-label={`${approvalBadgeCount} approval pending`}
                  >
                    {approvalBadgeCount > 99 ? "99+" : approvalBadgeCount}
                  </span>
                ) : isActive ? (
                  <ArrowRight className="hidden size-4 shrink-0 text-[#ffccd1] min-[420px]:block" />
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{module.description}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

type AiProviderEditor = AiProviderPublicConfig & {
  apiKeyInput: string;
  clearApiKey?: boolean;
};

type AiAgentTab =
  | "chat"
  | "staff"
  | "setup"
  | "agents"
  | "actions"
  | "doctor"
  | "providers"
  | "log";

type AiConversationMessage = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  time: string;
  status?: string;
  response?: AiPosAgentResponse;
};

function createOwnerWelcomeMessage(): AiConversationMessage {
  return {
    id: "owner-chat-welcome",
    role: "assistant",
    content:
      "Halo Owner. Owner Brain siap membaca kondisi GARAGE dari data POS live, finance, stok, kitchen, approval, aktivitas agent, report, dan Knowledge Base. Jawaban dibuat ringkas, berbasis data, dan aksi kritis tetap berupa draft/approval.",
    time: "GARAGE AI",
    status: "ready",
  };
}

type OwnerChatProfile = "auto" | "fast" | "manager" | "finance" | "deep";

type OwnerChatToolId =
  | "none"
  | "pos_agent"
  | "inventory_agent"
  | "kitchen_agent"
  | "finance_guard_agent"
  | "approval_agent"
  | "sop_knowledge_agent"
  | "report_builder"
  | "ssh_codex_bridge";

type AiLogEntry = {
  id: string;
  time: string;
  title: string;
  detail: string;
  status: string;
};

function providerConnected(provider: AiProviderPublicConfig) {
  return (
    provider.enabled &&
    provider.keyStatus === "configured" &&
    provider.lastStatus === "ready"
  );
}

type ProviderIndicatorKind =
  | "ready"
  | "limit"
  | "off"
  | "missing"
  | "untested"
  | "error";

function providerIndicatorKind(provider: AiProviderPublicConfig): ProviderIndicatorKind {
  if (providerConnected(provider)) {
    return "ready";
  }

  if (!provider.enabled) {
    return "off";
  }

  if (provider.keyStatus !== "configured") {
    return "missing";
  }

  if (provider.lastStatus === "limited") {
    return "limit";
  }

  if (provider.lastStatus === "untested") {
    return "untested";
  }

  return "error";
}

function providerIndicatorMeta(kind: ProviderIndicatorKind) {
  const meta: Record<
    ProviderIndicatorKind,
    { label: string; dot: string; text: string; border: string; bg: string }
  > = {
    ready: {
      label: "Aktif",
      dot: "bg-emerald-300",
      text: "text-emerald-200",
      border: "border-emerald-400/25",
      bg: "bg-emerald-400/8",
    },
    limit: {
      label: "Limit",
      dot: "bg-[#f5a742]",
      text: "text-[#ffd08a]",
      border: "border-[#f5a742]/28",
      bg: "bg-[#f5a742]/8",
    },
    off: {
      label: "Off",
      dot: "bg-[#8f8f99]",
      text: "text-[#c8c8cc]",
      border: "border-[#4a4a54]",
      bg: "bg-white/[0.04]",
    },
    missing: {
      label: "No key",
      dot: "bg-[#8f8f99]",
      text: "text-[#c8c8cc]",
      border: "border-[#4a4a54]",
      bg: "bg-white/[0.04]",
    },
    untested: {
      label: "Untested",
      dot: "bg-[#c89444]",
      text: "text-[#eac27a]",
      border: "border-[#f5a742]/22",
      bg: "bg-[#f5a742]/6",
    },
    error: {
      label: "Error",
      dot: "bg-[#ff4d5a]",
      text: "text-[#ffb0b8]",
      border: "border-[#d11a2a]/30",
      bg: "bg-[#d11a2a]/8",
    },
  };

  return meta[kind];
}

function ProviderConnectionBadge({
  provider,
  label,
}: {
  provider: AiProviderPublicConfig;
  label?: string;
}) {
  const meta = providerIndicatorMeta(providerIndicatorKind(provider));

  return (
    <span
      className={`garage-mono inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.border} ${meta.bg} ${meta.text}`}
    >
      <span className={`size-1.5 rounded-full ${meta.dot}`} />
      {label ?? meta.label}
    </span>
  );
}

function ProviderActiveBadge() {
  return (
    <span className="garage-mono inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/55 bg-emerald-400/16 px-2.5 py-1 text-[10px] font-semibold text-emerald-100">
      <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.75)]" />
      AKTIF DIPAKAI
    </span>
  );
}

function healthColorMeta(color?: "green" | "yellow" | "red") {
  if (color === "green") {
    return {
      label: "Sehat",
      dot: "bg-emerald-300",
      className: "border-emerald-400/35 bg-emerald-400/12 text-emerald-100",
    };
  }

  if (color === "red") {
    return {
      label: "Critical/Error",
      dot: "bg-[#ff4d5a]",
      className: "border-[#d11a2a]/45 bg-[#d11a2a]/14 text-[#ffb0b8]",
    };
  }

  return {
    label: "Ringan",
    dot: "bg-[#f5a742]",
    className: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  };
}

function toProviderEditors(providers: AiProviderPublicConfig[]): AiProviderEditor[] {
  return providers.map((provider) => ({
    ...provider,
    apiKeyInput: "",
    clearApiKey: false,
  }));
}

function providerWillClearKey(provider: AiProviderEditor) {
  return Boolean(provider.clearApiKey && !provider.apiKeyInput.trim());
}

function providerHasUsableKey(provider: AiProviderEditor) {
  return (
    provider.keyStatus === "configured" ||
    provider.keyStatus === "locked" ||
    Boolean(provider.apiKeyInput.trim()) ||
    provider.provider === "ollama"
  );
}

function providerSetupStepStatus(
  complete: boolean,
  blocked = false,
): "ready" | "watch" | "error" {
  if (blocked) {
    return "error";
  }

  return complete ? "ready" : "watch";
}

function providerErrorAdvice(message: string) {
  const text = message.toLowerCase();

  if (text.includes("401") || text.includes("403") || text.includes("auth")) {
    return `${message} Cek API key, project, dan izin provider.`;
  }

  if (text.includes("quota") || text.includes("billing") || text.includes("limit")) {
    return `${message} Cek kuota/billing provider atau pindahkan priority fallback.`;
  }

  if (text.includes("model") || text.includes("not found")) {
    return `${message} Cek nama model pada field Model.`;
  }

  if (text.includes("json")) {
    return `${message} Provider menjawab tidak sesuai schema JSON GARAGE AI. Coba model lain atau test ulang.`;
  }

  if (text.includes("timeout") || text.includes("network") || text.includes("fetch")) {
    return `${message} Cek base URL dan koneksi jaringan server POS.`;
  }

  return message;
}

function normalizeProviderId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function formatAgentIntent(value: string) {
  return value === "*" ? "Semua intent" : value.replace(/_/g, " ");
}

function aiDraftRisk(draft: AiActionDraft | AiActionDraftRecord) {
  if ("riskLevel" in draft && draft.riskLevel) {
    return draft.riskLevel;
  }

  return "risk" in draft ? draft.risk : "low";
}

function aiDraftNeedsApproval(draft: AiActionDraft | AiActionDraftRecord) {
  if ("approvalRequired" in draft) {
    return draft.approvalRequired;
  }

  return draft.approvalStatus === "pending";
}

function AgentStatusPopup({
  agent,
  triggerLabel = "Detail",
  className,
}: {
  agent: AiAgentConfigPublic;
  triggerLabel?: string;
  className?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`garage-press border-[#4a4a54] ${className ?? ""}`}
        >
          <Info className="mr-2 size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{agent.label}</DialogTitle>
          <DialogDescription>{agent.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={`garage-mono text-[10px] ${
                agent.enabled ? statusClass.ready : statusClass.rejected
              }`}
            >
              {agent.enabled ? "aktif" : "nonaktif"}
            </Badge>
            <Badge
              className={`garage-mono text-[10px] ${
                statusClass[agent.autonomyMode] ?? statusClass.untested
              }`}
            >
              {agent.autonomyMode}
            </Badge>
            <Badge
              className={`garage-mono text-[10px] ${
                statusClass[agent.maxRiskLevel] ?? statusClass.untested
              }`}
            >
              max {agent.maxRiskLevel}
            </Badge>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["Agent ID", agent.agentId],
              ["Mode autonomy", agent.autonomyMode],
              ["Batas risiko", agent.maxRiskLevel],
              ["Status", agent.enabled ? "Aktif" : "Nonaktif"],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
              >
                <span className="garage-mono block text-[10px] text-[#8f8f99]">
                  {label}
                </span>
                <p className="mt-1 break-words text-sm font-semibold text-white">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-[#3a3a42] bg-[#202027] p-3">
            <p className="garage-mono text-[11px] text-[#b8b8bf]">
              Intent yang ditangani
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {agent.allowedIntents.map((intent) => (
                <Badge
                  key={intent}
                  className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]"
                >
                  {formatAgentIntent(intent)}
                </Badge>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-[#3a3a42] bg-[#202027] p-3">
            <p className="garage-mono text-[11px] text-[#b8b8bf]">Penyimpanan</p>
            <p className="mt-2 text-xs leading-5 text-[#d6d6dc]">
              Status ini dibaca dari konfigurasi publik `ai_agent_configs`. UI tidak
              membuka API key, token, atau data sensitif provider.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ownerChatProfiles: Array<{
  id: OwnerChatProfile;
  label: string;
  instruction: string;
}> = [
  {
    id: "auto",
    label: "Auto",
    instruction: "Pilih gaya jawaban terbaik sesuai pertanyaan Owner.",
  },
  {
    id: "fast",
    label: "Fast",
    instruction: "Jawab cepat, sangat ringkas, fokus keputusan praktis.",
  },
  {
    id: "manager",
    label: "Manager",
    instruction: "Jawab seperti manager operasional: prioritas, risiko, next step.",
  },
  {
    id: "finance",
    label: "Finance",
    instruction:
      "Fokus finance guard, cash gap, refund, void, discount risk; jangan eksekusi aksi finance.",
  },
  {
    id: "deep",
    label: "Deep",
    instruction:
      "Analisa lebih dalam, susun alasan, tradeoff, dan rencana implementasi ringkas.",
  },
];

const ownerChatTools: Array<{
  id: OwnerChatToolId;
  label: string;
  instruction: string;
}> = [
  {
    id: "none",
    label: "Auto tools",
    instruction: "Pilih tool/agent yang paling relevan secara otomatis.",
  },
  {
    id: "pos_agent",
    label: "POS Agent",
    instruction: "Fokus POS, cart, transaksi, kasir, payment flow, dan pengalaman outlet.",
  },
  {
    id: "inventory_agent",
    label: "Inventory Agent",
    instruction: "Fokus stok, reorder, waste risk, dan purchase signal.",
  },
  {
    id: "kitchen_agent",
    label: "Kitchen Agent",
    instruction: "Fokus kitchen delay, station risk, dan expeditor recommendation.",
  },
  {
    id: "finance_guard_agent",
    label: "Finance Guard",
    instruction: "Fokus cash gap, refund, void, discount abnormal, dan closing risk.",
  },
  {
    id: "approval_agent",
    label: "Approval Agent",
    instruction: "Fokus approval summary, risk assessment, dan draft keputusan.",
  },
  {
    id: "sop_knowledge_agent",
    label: "SOP Knowledge",
    instruction: "Fokus SOP, PRD, policy, resep, dan knowledge base.",
  },
  {
    id: "report_builder",
    label: "Report Builder",
    instruction: "Fokus laporan Excel, daily/monthly/yearly brief, dan format owner report.",
  },
  {
    id: "ssh_codex_bridge",
    label: "SSH Codex Bridge",
    instruction:
      "Fokus setup SSH, perintah draft, preflight, verifikasi, rollback, dan handoff aman ke Codex/engineer.",
  },
];

const ownerCeoQuickPrompts: Array<{
  label: string;
  prompt: string;
  tool?: OwnerChatToolId;
}> = [
  {
    label: "Kondisi hari ini",
    prompt:
      "Ringkas kondisi GARAGE hari ini untuk Owner. Pisahkan Data, Analisa, Risiko, Rekomendasi, dan Prioritas. Tolak asumsi tanpa data.",
  },
  {
    label: "Review keputusan",
    prompt:
      "Evaluasi keputusan operasional terpenting hari ini. Gunakan format STATUS KEPUTUSAN (APPROVED/REJECTED/NEED REVIEW), ALASAN, ANALISA, REKOMENDASI, PRIORITAS.",
  },
  {
    label: "Masalah urgent",
    prompt:
      "Apa masalah paling urgent di GARAGE hari ini? Urutkan prioritas dan tindakan berikutnya.",
  },
  {
    label: "Omzet besok",
    prompt:
      "Beri rekomendasi peningkatan omzet besok berdasarkan data sales, menu, stok, dan operasional terbaru.",
  },
  {
    label: "Stok kritis",
    prompt:
      "Analisa stok kritis dan risiko menu. Beri rekomendasi reorder atau substitusi yang masih aman.",
  },
  {
    label: "Finance guard",
    prompt:
      "Cek finance guard hari ini: cash gap, refund, void, discount risk, payment anomaly, dan next action.",
  },
  {
    label: "Laporan Owner",
    prompt:
      "Buat ringkasan laporan profesional untuk Owner dari kondisi GARAGE terbaru, singkat dan siap dibaca.",
  },
  {
    label: "SSH Codex",
    tool: "ssh_codex_bridge",
    prompt:
      "Siapkan koneksi SSH untuk Codex/engineer. Cek status konfigurasi, buat command draft aman dengan placeholder, preflight, approval gate, verifikasi, dan rollback. Jangan minta atau tampilkan private key/password/API key.",
  },
];

type AiAutopilotMode = "assist" | "watch" | "draft" | "safe";
type AiVoiceMode = "mute" | "push" | "standby";
type AiAutopilotAlertTone = "ready" | "watch" | "warning" | "error";
type StaffMonitorGroup = "control" | "floor" | "production" | "inventory";
type StaffMonitorFilter = "all" | StaffMonitorGroup;

type StaffRoleAgentConfig = {
  role: Role;
  label: string;
  agentId: string;
  tool: OwnerChatToolId;
  focus: string;
  scope: string;
  autopilot: string;
  voiceBrief: string;
  prompt: string;
};

type AiAutopilotAlert = {
  id: string;
  title: string;
  detail: string;
  status: AiAutopilotAlertTone;
};

type StaffMonitorItem = {
  role: Role;
  label: string;
  group: StaffMonitorGroup;
  status: "ready" | "watch" | "critical";
  score: number;
  pendingDrafts: number;
  criticalDrafts: number;
  signalCount: number;
  summary: string;
  lastSignal: string;
  risks: string[];
  nextActions: string[];
  agent: StaffRoleAgentConfig;
  drafts: AiActionDraftRecord[];
};

const autopilotModeMeta: Record<
  AiAutopilotMode,
  { label: string; detail: string; badge: string }
> = {
  assist: {
    label: "Assist",
    detail: "Manual. AI menyiapkan saran saat diminta.",
    badge: "Manual assist",
  },
  watch: {
    label: "Watch",
    detail: "Pantau log, doctor, jobs, dan draft tanpa eksekusi.",
    badge: "Auto watch",
  },
  draft: {
    label: "Draft",
    detail: "AI boleh menyiapkan draft action yang tetap butuh approval.",
    badge: "Draft only",
  },
  safe: {
    label: "Safe",
    detail: "Mode paling aman untuk staff: baca, ingatkan, dan eskalasi.",
    badge: "Safe guard",
  },
};

const voiceModeMeta: Record<AiVoiceMode, { label: string; detail: string }> = {
  mute: {
    label: "Mute",
    detail: "AI tidak bicara dan mic tidak standby.",
  },
  push: {
    label: "Push talk",
    detail: "Mic aktif hanya saat tombol ditekan.",
  },
  standby: {
    label: "Standby",
    detail: "Mic bisa mendengar perintah singkat setelah diaktifkan.",
  },
};

const staffMonitorFilterOptions: Array<{
  value: StaffMonitorFilter;
  label: string;
}> = [
  { value: "all", label: "Semua role" },
  { value: "control", label: "Control" },
  { value: "floor", label: "Floor" },
  { value: "production", label: "Kitchen/Bar" },
  { value: "inventory", label: "Gudang" },
];

const staffMonitorGroupMeta: Record<
  StaffMonitorGroup,
  { label: string; detail: string }
> = {
  control: {
    label: "Control",
    detail: "Owner, admin, manager, finance, supervisor.",
  },
  floor: {
    label: "Floor",
    detail: "Kasir, waiter, delivery, dan pelayanan tamu.",
  },
  production: {
    label: "Kitchen/Bar",
    detail: "KDS makanan, minuman, delay, dan station queue.",
  },
  inventory: {
    label: "Gudang",
    detail: "Stok, opname, receiving, transfer, dan reorder.",
  },
};

const staffRoleAgentConfigs: StaffRoleAgentConfig[] = [
  {
    role: "Owner / CEO",
    label: "GARAGE Owner Brain",
    agentId: "role-owner-ceo",
    tool: "report_builder",
    focus: "Keputusan strategis, approval, risiko, profit, dan efisiensi operasional.",
    scope: "Semua modul; aksi kritis tetap approval manusia di sistem.",
    autopilot: "Analisa realtime outlet; tolak keputusan lemah; rekomendasikan tindakan terbaik.",
    voiceBrief:
      "GARAGE Owner Brain siap. Saya analisa data outlet sebelum memberi keputusan.",
    prompt:
      "Bertindak sebagai GARAGE Owner Brain. Analisa kondisi outlet dari data live. Untuk keputusan bisnis gunakan format STATUS/APPROVED/REJECTED/NEED REVIEW. Jangan setuju jika tidak logis atau tidak ada data.",
  },
  {
    role: "Admin",
    label: "Admin Ops Agent",
    agentId: "role-admin-ops",
    tool: "pos_agent",
    focus: "Operasional harian, POS, shift, kasir, dan koordinasi outlet.",
    scope: "Bantu admin membaca kondisi dan membuat draft instruksi shift.",
    autopilot: "Pantau antrian operasional, log, dan draft tindakan admin.",
    voiceBrief: "Admin Ops aktif. Saya bantu koordinasi operasional harian.",
    prompt:
      "Bertindak sebagai Admin Ops. Prioritaskan masalah shift, POS, kasir, order, dan koordinasi outlet tanpa eksekusi kritis.",
  },
  {
    role: "Manager Operasional",
    label: "Ops Manager Agent",
    agentId: "role-ops-manager",
    tool: "report_builder",
    focus: "SOP, bottleneck, shift handover, incident, dan target outlet.",
    scope: "Buat keputusan operasional berbasis data dan draft eskalasi.",
    autopilot: "Pantau issue lintas modul dan buat action plan shift.",
    voiceBrief: "Ops Manager aktif. Saya pantau bottleneck dan prioritas shift.",
    prompt:
      "Bertindak sebagai Manager Operasional. Susun prioritas operasional, bottleneck, SOP, incident, dan handover berikutnya.",
  },
  {
    role: "Finance / CFO",
    label: "Finance Guard Agent",
    agentId: "role-finance-cfo",
    tool: "finance_guard_agent",
    focus: "Cash gap, refund, void, discount, expense, dan closing.",
    scope: "Baca risiko finance dan siapkan draft approval finance.",
    autopilot: "Pantau anomali finance dan cash control.",
    voiceBrief: "Finance Guard aktif. Saya pantau kas dan transaksi berisiko.",
    prompt:
      "Bertindak sebagai Finance Guard. Cek cash gap, refund, void, discount abnormal, closing, dan draft keputusan aman.",
  },
  {
    role: "Kasir",
    label: "Cashier Copilot",
    agentId: "role-cashier",
    tool: "pos_agent",
    focus: "POS, pembayaran, receipt, table payment, dan member lookup.",
    scope: "Bantu kasir cepat, tetapi void/refund tetap approval.",
    autopilot: "Pantau transaksi tertunda, payment risk, dan antrian bayar.",
    voiceBrief: "Cashier Copilot aktif. Saya bantu transaksi dan pembayaran.",
    prompt:
      "Bertindak sebagai Cashier Copilot. Fokus POS, pembayaran, receipt, meja belum bayar, dan eskalasi void/refund.",
  },
  {
    role: "Barista",
    label: "Barista Station Agent",
    agentId: "role-barista",
    tool: "kitchen_agent",
    focus: "KDS minuman, queue coffee, stock bahan minuman, dan timing.",
    scope: "Bantu prioritas station dan peringatan stok minuman.",
    autopilot: "Pantau delay minuman dan item coffee berisiko.",
    voiceBrief: "Barista Station aktif. Saya pantau queue dan stok minuman.",
    prompt:
      "Bertindak sebagai Barista Station Agent. Fokus queue minuman, delay, item coffee, dan stok bahan minuman.",
  },
  {
    role: "Koki",
    label: "Kitchen Station Agent",
    agentId: "role-koki",
    tool: "kitchen_agent",
    focus: "KDS makanan, station kitchen, prep time, dan bahan makanan.",
    scope: "Bantu prioritas masak dan eskalasi bottleneck dapur.",
    autopilot: "Pantau delay kitchen dan order yang perlu diprioritaskan.",
    voiceBrief: "Kitchen Station aktif. Saya pantau order makanan dan delay.",
    prompt:
      "Bertindak sebagai Kitchen Station Agent. Fokus KDS makanan, delay dapur, prep time, dan prioritas order.",
  },
  {
    role: "Waiter 1",
    label: "Waiter Floor Agent",
    agentId: "role-waiter-1",
    tool: "pos_agent",
    focus: "Meja, order tamu, handoff kasir, dan service issue.",
    scope: "Bantu waiter membaca meja aktif dan eskalasi komplain.",
    autopilot: "Pantau meja pending, order delay, dan service follow-up.",
    voiceBrief: "Waiter Floor aktif. Saya bantu pantau meja dan order tamu.",
    prompt:
      "Bertindak sebagai Waiter Floor Agent. Fokus meja aktif, order tamu, service issue, dan handoff ke kasir.",
  },
  {
    role: "Waiter 2",
    label: "Waiter Floor Agent",
    agentId: "role-waiter-2",
    tool: "pos_agent",
    focus: "Meja, order tamu, handoff kasir, dan service issue.",
    scope: "Bantu waiter membaca meja aktif dan eskalasi komplain.",
    autopilot: "Pantau meja pending, order delay, dan service follow-up.",
    voiceBrief: "Waiter Floor aktif. Saya bantu pantau meja dan order tamu.",
    prompt:
      "Bertindak sebagai Waiter Floor Agent. Fokus meja aktif, order tamu, service issue, dan handoff ke kasir.",
  },
  {
    role: "Kitchen / Barista",
    label: "Station Hybrid Agent",
    agentId: "role-kitchen-barista",
    tool: "kitchen_agent",
    focus: "KDS gabungan, station queue, stok bahan, dan handoff order.",
    scope: "Bantu station hybrid menjaga timing dan prioritas order.",
    autopilot: "Pantau bottleneck station makanan/minuman.",
    voiceBrief: "Station Hybrid aktif. Saya pantau queue makanan dan minuman.",
    prompt:
      "Bertindak sebagai Station Hybrid Agent. Fokus KDS makanan/minuman, queue, stok station, dan order prioritas.",
  },
  {
    role: "Gudang",
    label: "Inventory Guard Agent",
    agentId: "role-gudang",
    tool: "inventory_agent",
    focus: "Stok, opname, receiving, transfer, waste, dan reorder.",
    scope: "Bantu gudang membaca stok kritis dan draft reorder.",
    autopilot: "Pantau stok rendah, selisih opname, dan waste risk.",
    voiceBrief: "Inventory Guard aktif. Saya pantau stok dan reorder.",
    prompt:
      "Bertindak sebagai Inventory Guard. Fokus stok kritis, opname, receiving, waste, dan draft reorder aman.",
  },
  {
    role: "Supervisor Shift",
    label: "Shift Supervisor Agent",
    agentId: "role-supervisor-shift",
    tool: "approval_agent",
    focus: "Checklist shift, approval operasional, handover, dan incident.",
    scope: "Bantu supervisor memutuskan prioritas dan draft approval.",
    autopilot: "Pantau checklist, action pending, dan handover shift.",
    voiceBrief: "Shift Supervisor aktif. Saya pantau checklist dan approval.",
    prompt:
      "Bertindak sebagai Shift Supervisor. Fokus checklist shift, approval operasional, handover, incident, dan eskalasi aman.",
  },
  {
    role: "Delivery Admin",
    label: "Delivery Ops Agent",
    agentId: "role-delivery-admin",
    tool: "pos_agent",
    focus: "Delivery queue, status order, complaint, dan dispatch.",
    scope: "Bantu delivery admin memantau order luar dan komplain.",
    autopilot: "Pantau delivery pending, delay, dan follow-up komplain.",
    voiceBrief: "Delivery Ops aktif. Saya pantau delivery dan komplain.",
    prompt:
      "Bertindak sebagai Delivery Ops Agent. Fokus delivery queue, status order, complaint, dan dispatch follow-up.",
  },
];

function staffRoleAgentFor(role: Role) {
  return (
    staffRoleAgentConfigs.find((agent) => agent.role === role) ??
    staffRoleAgentConfigs[0]
  );
}

type SpeechRecognitionAlternativeLike = {
  transcript?: string;
};

type SpeechRecognitionResultLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike | undefined;
};

type SpeechRecognitionResultListLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike | undefined;
};

type SpeechRecognitionEventLike = {
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognitionConstructor() {
  const speechWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };

  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function sanitizeVoiceText(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 260);
}

function readSpeechTranscript(event: SpeechRecognitionEventLike) {
  const transcripts: string[] = [];

  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript;

    if (transcript) {
      transcripts.push(transcript);
    }
  }

  return sanitizeVoiceText(transcripts.join(" "));
}

function staffMonitorGroupFor(role: Role): StaffMonitorGroup {
  if (["Barista", "Koki", "Kitchen / Barista"].includes(role)) {
    return "production";
  }

  if (role === "Gudang") {
    return "inventory";
  }

  if (["Kasir", "Waiter 1", "Waiter 2", "Delivery Admin"].includes(role)) {
    return "floor";
  }

  return "control";
}

function staffMonitorActionAgents(role: Role) {
  const mapping: Record<Role, string[]> = {
    "Owner / CEO": ["supervisor", "daily_brief_agent", "approval_agent"],
    Admin: ["supervisor", "pos_agent", "approval_agent"],
    "Manager Operasional": ["supervisor", "approval_agent", "daily_brief_agent"],
    "Finance / CFO": ["finance_guard_agent", "approval_agent"],
    Kasir: ["pos_agent", "approval_agent"],
    Barista: ["kitchen_agent"],
    Koki: ["kitchen_agent"],
    "Asisten Koki": ["kitchen_agent"],
    "Waiter 1": ["pos_agent"],
    "Waiter 2": ["pos_agent"],
    "Kitchen / Barista": ["kitchen_agent"],
    Gudang: ["inventory_agent"],
    "Supervisor Shift": ["supervisor", "approval_agent"],
    "Delivery Admin": ["pos_agent"],
  };

  return mapping[role];
}

function staffMonitorKeywords(agent: StaffRoleAgentConfig) {
  const baseWords = [
    agent.role,
    agent.label,
    agent.tool,
    agent.agentId,
    agent.role.replace(/\s*\/\s*/g, " "),
  ];

  return baseWords
    .join(" ")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function staffMonitorStatus(
  criticalDrafts: number,
  pendingDrafts: number,
  signalCount: number,
  systemStatus?: AiSystemDoctorResponse["status"] | null,
) {
  if (criticalDrafts > 0 || systemStatus === "critical") {
    return "critical" as const;
  }

  if (pendingDrafts > 0 || signalCount > 0 || systemStatus === "watch") {
    return "watch" as const;
  }

  return "ready" as const;
}

function staffMonitorScore(
  status: StaffMonitorItem["status"],
  pendingDrafts: number,
  criticalDrafts: number,
  signalCount: number,
) {
  const base = status === "critical" ? 72 : status === "watch" ? 86 : 96;
  return Math.max(
    48,
    Math.min(100, base - pendingDrafts * 3 - criticalDrafts * 8 - signalCount * 2),
  );
}

function buildAiProgressSteps(message: string, mode: AiChatMode) {
  if (mode === "owner_free_chat") {
    const text = message.toLowerCase();
    return [
      "Validasi Owner",
      "Bangun Owner Brain",
      ...(text.includes("ssh") || text.includes("codex")
        ? ["Cek SSH/Codex guardrail"]
        : []),
      "Ambil data terbaru",
      "Cek Knowledge Base",
      "Pilih provider AI",
      "Validasi output",
      "Simpan log",
    ];
  }

  const text = message.toLowerCase();
  const moduleStep = text.includes("stok") || text.includes("stock") || text.includes("inventory")
    ? "Cek inventory"
    : text.includes("kitchen") || text.includes("dapur") || text.includes("barista")
      ? "Cek kitchen"
      : text.includes("finance") ||
          text.includes("kas") ||
          text.includes("cash") ||
          text.includes("refund") ||
          text.includes("void")
        ? "Cek finance"
        : text.includes("approval") || text.includes("approve")
          ? "Cek approval"
          : text.includes("sop") || text.includes("resep") || text.includes("policy")
            ? "Cek SOP knowledge"
            : text.includes("brief") || text.includes("laporan") || text.includes("shift")
              ? "Cek snapshot outlet"
              : "Cek context POS";

  return [
    "Klasifikasi intent",
    "Ambil context role",
    moduleStep,
    "Pilih provider AI",
    "Validasi output",
  ];
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCostUsd(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "-";
  }

  return `$${value.toFixed(value >= 0.01 ? 2 : 4)}`;
}

function formatFreshnessTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function ScrollJumpControls({
  targetRef,
  watchKey,
  className = "",
}: {
  targetRef: RefObject<HTMLElement | null>;
  watchKey?: string | number;
  className?: string;
}) {
  const [state, setState] = useState({
    canScroll: false,
    canScrollUp: false,
    canScrollDown: false,
  });

  const update = useCallback(() => {
    const target = targetRef.current;
    if (!target) {
      setState({ canScroll: false, canScrollUp: false, canScrollDown: false });
      return;
    }

    const canScroll = target.scrollHeight - target.clientHeight > 8;
    const canScrollUp = target.scrollTop > 8;
    const canScrollDown =
      target.scrollTop + target.clientHeight < target.scrollHeight - 8;

    setState((current) =>
      current.canScroll === canScroll &&
      current.canScrollUp === canScrollUp &&
      current.canScrollDown === canScrollDown
        ? current
        : { canScroll, canScrollUp, canScrollDown },
    );
  }, [targetRef]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;

    update();
    target.addEventListener("scroll", update, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    resizeObserver?.observe(target);

    return () => {
      target.removeEventListener("scroll", update);
      resizeObserver?.disconnect();
    };
  }, [targetRef, update]);

  useEffect(() => {
    const frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [update, watchKey]);

  if (!state.canScroll) {
    return null;
  }

  return (
    <div
      className={`pointer-events-none absolute right-3 bottom-3 z-20 flex items-center gap-1 rounded-full border border-[#34343c] bg-[#111116] p-1 shadow-[0_10px_28px_rgba(0,0,0,0.38)] ${className}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="pointer-events-auto text-[#d6d6dc] hover:bg-white/[0.08] hover:text-white"
        disabled={!state.canScrollUp}
        aria-label="Scroll ke atas"
        onClick={() =>
          targetRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        }
      >
        <ArrowUp className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="pointer-events-auto text-[#d6d6dc] hover:bg-white/[0.08] hover:text-white"
        disabled={!state.canScrollDown}
        aria-label="Scroll ke terbaru"
        onClick={() => {
          const target = targetRef.current;
          target?.scrollTo({ top: target.scrollHeight, behavior: "smooth" });
        }}
      >
        <ArrowDown className="size-3.5" />
      </Button>
    </div>
  );
}

function AiPosAgentView({ me }: { me: GarageMe }) {
  const canManageProviders = me.role === "Owner / CEO";
  const canManageSetup = canManageProviders;
  const canUseOwnerFreeChat = me.role === "Owner / CEO";
  const canManageAgents =
    me.role === "Owner / CEO" || me.role === "Admin" || me.role === "Manager Operasional";
  const useSimpleAiHome = !canManageAgents && !canUseOwnerFreeChat;
  const [activeTab, setActiveTab] = useState<AiAgentTab>("chat");
  const [showAdvancedChat, setShowAdvancedChat] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatMode, setChatMode] = useState<AiChatMode>("operational");
  const [prompt, setPrompt] = useState(
    "Analisa kondisi outlet sekarang: prioritas operasional, risiko stok, kitchen delay, finance, dan approval.",
  );
  const [pending, setPending] = useState(false);
  const [progressMessage, setProgressMessage] = useState(prompt);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiPosAgentResponse | null>(null);
  const [ownerChatInput, setOwnerChatInput] = useState("");
  const [ownerPlanMode, setOwnerPlanMode] = useState(false);
  const [ownerChatProfile, setOwnerChatProfile] =
    useState<OwnerChatProfile>("auto");
  const [ownerChatTool, setOwnerChatTool] = useState<OwnerChatToolId>("none");
  const [ownerToolsMenuOpen, setOwnerToolsMenuOpen] = useState(false);
  const [ownerReviewOpen, setOwnerReviewOpen] = useState(false);
  const [ownerHistoryOpen, setOwnerHistoryOpen] = useState(false);
  const [selectedRoleAgentRole, setSelectedRoleAgentRole] = useState<Role>(me.role);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [autopilotMode, setAutopilotMode] = useState<AiAutopilotMode>("watch");
  const [voiceMode, setVoiceMode] = useState<AiVoiceMode>("mute");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSupport, setVoiceSupport] = useState({
    recognition: false,
    speech: false,
  });
  const [voiceStatus, setVoiceStatus] = useState("Voice belum aktif.");
  const [staffMonitorFilter, setStaffMonitorFilter] =
    useState<StaffMonitorFilter>("all");
  const [ownerHistoryItems, setOwnerHistoryItems] = useState<
    AiOwnerChatHistoryRecord[]
  >([]);
  const [ownerHistoryLoading, setOwnerHistoryLoading] = useState(false);
  const [ownerHistoryError, setOwnerHistoryError] = useState<string | null>(null);
  const [ownerHistorySearch, setOwnerHistorySearch] = useState("");
  const [selectedOwnerHistoryId, setSelectedOwnerHistoryId] = useState<
    string | null
  >(null);
  const [ownerKnowledgeUploading, setOwnerKnowledgeUploading] = useState(false);
  const [knowledgeBase, setKnowledgeBase] =
    useState<AiKnowledgeListResponse | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [deletingKnowledgeFile, setDeletingKnowledgeFile] = useState<string | null>(null);
  const [ownerChatMessages, setOwnerChatMessages] = useState<
    AiConversationMessage[]
  >([createOwnerWelcomeMessage()]);
  const ownerChatEndRef = useRef<HTMLDivElement | null>(null);
  const ownerChatScrollRef = useRef<HTMLDivElement | null>(null);
  const ownerHistoryScrollRef = useRef<HTMLDivElement | null>(null);
  const logScrollRef = useRef<HTMLDivElement | null>(null);
  const ownerChatAbortRef = useRef<AbortController | null>(null);
  const ownerKnowledgeInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastSpokenAlertRef = useRef<string | null>(null);
  const [providers, setProviders] = useState<AiProviderEditor[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerAccessOpen, setProviderAccessOpen] = useState(false);
  const [providerLoading, setProviderLoading] = useState(canManageProviders);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [providerConnectionTest, setProviderConnectionTest] =
    useState<AiProviderConnectionTestResult | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerAutoFixing, setProviderAutoFixing] = useState(false);
  const [garageAiHealth, setGarageAiHealth] =
    useState<AiGarageAiHealthResponse | null>(null);
  const [garageAiHealthLoading, setGarageAiHealthLoading] =
    useState(canManageProviders);
  const [garageAiHealthError, setGarageAiHealthError] = useState<string | null>(null);
  const [agents, setAgents] = useState<AiAgentConfigPublic[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(canManageAgents);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [savingAgents, setSavingAgents] = useState(false);
  const [agentReportLoading] = useState(false);
  const [agentReportError, setAgentReportError] = useState<string | null>(null);
  const [agentReport] = useState<AiAgentReportResponse | null>(null);
  const [agentReportPeriod, setAgentReportPeriod] =
    useState<AiAgentReportPeriod>("daily");
  const [agentReportDate, setAgentReportDate] = useState(() =>
    defaultAgentReportDate("daily"),
  );
  const [jobsStatus, setJobsStatus] = useState<AiJobsStatusResponse | null>(null);
  const [jobsStatusLoading, setJobsStatusLoading] = useState(canManageAgents);
  const [jobsStatusError, setJobsStatusError] = useState<string | null>(null);
  const [systemDoctor, setSystemDoctor] =
    useState<AiSystemDoctorResponse | null>(null);
  const [systemDoctorLoading, setSystemDoctorLoading] = useState(canManageAgents);
  const [systemDoctorError, setSystemDoctorError] = useState<string | null>(null);
  const [systemDoctorHealing, setSystemDoctorHealing] = useState(false);
  const [shiftCopilotRunning, setShiftCopilotRunning] = useState(false);
  const [actions, setActions] = useState<AiActionDraftRecord[]>([]);
  const [actionLoading, setActionLoading] = useState(canManageAgents);
  const [actionError, setActionError] = useState<string | null>(null);
  const [decidingAction, setDecidingAction] = useState<string | null>(null);
  const [logs, setLogs] = useState<AiLogEntry[]>([]);
  const [persistedLogs, setPersistedLogs] = useState<AiLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logCleanupLoading, setLogCleanupLoading] = useState(false);
  const [logCleanupResult, setLogCleanupResult] =
    useState<AiLogCleanupResponse["result"] | null>(null);
  const [providerTemplates, setProviderTemplates] = useState<AiProviderTemplate[]>([]);
  const progressSteps = useMemo(
    () => buildAiProgressSteps(progressMessage, chatMode),
    [chatMode, progressMessage],
  );
  const availableRoleAgents = useMemo(
    () =>
      canManageAgents
        ? staffRoleAgentConfigs
        : staffRoleAgentConfigs.filter((agent) => agent.role === me.role),
    [canManageAgents, me.role],
  );
  const selectedRoleAgentRoleIsAvailable = availableRoleAgents.some(
    (agent) => agent.role === selectedRoleAgentRole,
  );
  const effectiveSelectedRoleAgentRole = selectedRoleAgentRoleIsAvailable
    ? selectedRoleAgentRole
    : me.role;
  const selectedRoleAgent = useMemo(
    () => staffRoleAgentFor(effectiveSelectedRoleAgentRole),
    [effectiveSelectedRoleAgentRole],
  );
  const selectedAutopilotMeta = autopilotModeMeta[autopilotMode];
  const selectedProvider =
    providers.find((provider) => provider.provider === selectedProviderId) ??
    providers[0] ??
    null;
  const activeProvider = useMemo(
    () =>
      [...providers]
        .filter(providerConnected)
        .sort((a, b) => a.priority - b.priority)[0] ?? null,
    [providers],
  );
  const providerStatusSummary = useMemo(
    () =>
      providers.reduce(
        (summary, provider) => {
          const kind = providerIndicatorKind(provider);

          if (kind === "ready") {
            summary.ready += 1;
          } else if (kind === "limit") {
            summary.limit += 1;
          } else if (kind === "error") {
            summary.error += 1;
          } else {
            summary.off += 1;
          }

          return summary;
        },
        { ready: 0, limit: 0, off: 0, error: 0 },
      ),
    [providers],
  );
  const selectedProviderIsActive =
    Boolean(activeProvider && selectedProvider) &&
    activeProvider?.provider === selectedProvider?.provider;
  const selectedProviderConnectionTest =
    providerConnectionTest && selectedProvider?.provider === providerConnectionTest.provider
      ? providerConnectionTest
      : null;
  const selectedProviderTemplate =
    providerTemplates.find(
      (template) => template.provider === selectedProvider?.provider,
    ) ?? null;
  const selectedProviderReadyForConnect = selectedProvider
    ? providerHasUsableKey(selectedProvider) &&
      Boolean(selectedProvider.baseUrl.trim()) &&
      Boolean(selectedProvider.model.trim()) &&
      !providerWillClearKey(selectedProvider)
    : false;
  const providerSetupSteps = selectedProvider
    ? [
        {
          label: "Pilih provider",
          detail: selectedProvider.label,
          status: providerSetupStepStatus(Boolean(selectedProvider.provider)),
        },
        {
          label: "Key aman",
          detail:
            selectedProvider.keyStatus === "configured"
              ? "Key tersimpan terenkripsi"
              : selectedProvider.keyStatus === "locked"
                ? "Key dari env/server"
                : selectedProvider.apiKeyInput.trim()
                  ? "Key baru siap dites"
                  : "Key belum diisi",
          status: providerSetupStepStatus(
            providerHasUsableKey(selectedProvider),
            providerWillClearKey(selectedProvider),
          ),
        },
        {
          label: "Connect",
          detail:
            selectedProvider.lastStatus === "ready"
              ? `${selectedProvider.lastLatencyMs ?? "-"} ms`
              : selectedProviderConnectionTest?.status === "ready"
                ? `${selectedProviderConnectionTest.latencyMs ?? "-"} ms`
                : selectedProvider.lastStatus,
          status: providerSetupStepStatus(
            selectedProvider.lastStatus === "ready" ||
              selectedProviderConnectionTest?.status === "ready",
            selectedProviderConnectionTest?.status === "failed" ||
              selectedProvider.lastStatus === "error",
          ),
        },
      ]
    : [];
  const selectedOwnerTool =
    ownerChatTools.find((tool) => tool.id === ownerChatTool) ?? ownerChatTools[0];
  const activeAgentCount = agents.filter((agent) => agent.enabled).length;
  const controlledAgentCount = agents.filter(
    (agent) => agent.autonomyMode === "controlled",
  ).length;
  const highRiskAgentCount = agents.filter(
    (agent) => agent.maxRiskLevel === "high",
  ).length;
  const visibleLogs = useMemo(() => {
    const seen = new Set<string>();

    return [...logs, ...persistedLogs]
      .filter((log) => {
        const key = `${log.time}-${log.title}-${log.detail}-${log.status}`;
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .slice(0, 100);
  }, [logs, persistedLogs]);

  const quickPrompts = [
    {
      label: "Smart Cart",
      detail: "Upsell dan substitusi item",
      prompt: "Analisa cart saat ini: upsell, substitusi stok rendah, dan warning item lambat.",
    },
    {
      label: "Pengawasan Shift",
      detail: "Kesalahan karyawan & yang perlu dibenahi",
      prompt:
        "Ringkas kesalahan operasional karyawan hari ini, siapa yang perlu diingatkan, dan 3 perbaikan paling aman.",
    },
    {
      label: "Inventory Forecaster",
      detail: "Stok kritis dan reorder",
      prompt: "Cek risiko stok rendah, reorder priority, dan dampaknya ke penjualan hari ini.",
    },
    {
      label: "Kitchen Expeditor",
      detail: "Delay dan station risk",
      prompt: "Cek potensi bottleneck kitchen dan rekomendasi tindakan shift.",
    },
    {
      label: "Finance Guard",
      detail: "Cash gap, refund, discount",
      prompt: "Cek finance: cash gap, refund, void, discount abnormal, dan payment risk.",
    },
    {
      label: "Approval Assistant",
      detail: "Ringkas request pending",
      prompt: "Ringkas approval pending, nilai risiko, dan siapkan draft keputusan.",
    },
    {
      label: "Daily Brief",
      detail: "Laporan owner hari ini",
      prompt: "Buat daily brief owner: revenue, top issue, stok, kitchen, finance, dan action besok.",
    },
    {
      label: "SOP Knowledge",
      detail: "Jawab dari SOP/PRD",
      prompt: "Cari SOP atau policy yang relevan untuk aturan refund, void, discount, dan approval.",
    },
  ];
  const autopilotAlerts = useMemo<AiAutopilotAlert[]>(() => {
    const alerts: AiAutopilotAlert[] = [];

    if (actions.length > 0) {
      alerts.push({
        id: "pending-actions",
        title: "Approval pending",
        detail: `${actions.length} draft action menunggu keputusan manusia.`,
        status: "watch",
      });
    }

    if (systemDoctor?.status === "critical") {
      alerts.push({
        id: "system-critical",
        title: "System Doctor critical",
        detail: `Score ${systemDoctor.score}. Buka Doctor sebelum menaikkan autonomy.`,
        status: "error",
      });
    } else if (systemDoctor?.status === "watch") {
      alerts.push({
        id: "system-warning",
        title: "System Doctor warning",
        detail: `Score ${systemDoctor.score}. Ada item yang perlu dicek.`,
        status: "warning",
      });
    }

    if (providerStatusSummary.error > 0) {
      alerts.push({
        id: "provider-error",
        title: "Provider AI error",
        detail: `${providerStatusSummary.error} provider butuh test atau fallback.`,
        status: "warning",
      });
    }

    if (actionError || systemDoctorError || jobsStatusError || logError) {
      alerts.push({
        id: "loader-error",
        title: "Refresh otomatis terganggu",
        detail: actionError ?? systemDoctorError ?? jobsStatusError ?? logError ?? "",
        status: "error",
      });
    }

    const latestWarningLog = visibleLogs.find((log) =>
      ["error", "warning", "watch"].includes(log.status),
    );
    if (latestWarningLog) {
      alerts.push({
        id: `log-${latestWarningLog.id}`,
        title: latestWarningLog.title,
        detail: latestWarningLog.detail,
        status: latestWarningLog.status === "error" ? "error" : "watch",
      });
    }

    if (!alerts.length) {
      alerts.push({
        id: "ready",
        title: "Outlet watch aman",
        detail: "Belum ada alert baru dari action, doctor, provider, atau log.",
        status: "ready",
      });
    }

    return alerts.slice(0, 4);
  }, [
    actionError,
    actions.length,
    jobsStatusError,
    logError,
    providerStatusSummary.error,
    systemDoctor?.score,
    systemDoctor?.status,
    systemDoctorError,
    visibleLogs,
  ]);
  const staffMonitorItems = useMemo<StaffMonitorItem[]>(
    () =>
      staffRoleAgentConfigs.map((agent) => {
        const actionAgentIds = staffMonitorActionAgents(agent.role);
        const roleDrafts = actions.filter((action) =>
          actionAgentIds.includes(action.agentId),
        );
        const keywords = staffMonitorKeywords(agent);
        const roleSignals = visibleLogs.filter((log) => {
          const text = `${log.title} ${log.detail} ${log.status}`.toLowerCase();
          return keywords.some((keyword) => text.includes(keyword));
        });
        const criticalDrafts = roleDrafts.filter(
          (draft) => draft.riskLevel === "high" || draft.safetyLevel === "critical",
        ).length;
        const warningSignals = roleSignals.filter((log) =>
          ["error", "warning", "watch", "failed"].includes(log.status),
        );
        const status = staffMonitorStatus(
          criticalDrafts,
          roleDrafts.length,
          warningSignals.length,
          staffMonitorGroupFor(agent.role) === "control" ? systemDoctor?.status : null,
        );
        const score = staffMonitorScore(
          status,
          roleDrafts.length,
          criticalDrafts,
          warningSignals.length,
        );
        const risks = [
          criticalDrafts
            ? `${criticalDrafts} draft high/critical butuh approval.`
            : null,
          roleDrafts.length
            ? `${roleDrafts.length} draft action menunggu keputusan.`
            : null,
          warningSignals[0]
            ? `${warningSignals[0].title}: ${warningSignals[0].detail}`
            : null,
          staffMonitorGroupFor(agent.role) === "control" &&
          systemDoctor?.status === "critical"
            ? `System Doctor critical, score ${systemDoctor.score}.`
            : null,
          staffMonitorGroupFor(agent.role) === "control" &&
          jobsStatus &&
          (!jobsStatus.auth.configured || jobsStatus.drive.lastStatus === "error")
            ? "Job/export automation perlu dicek."
            : null,
        ].filter(Boolean) as string[];
        const nextActions = [
          roleDrafts.length ? "Review draft action terkait role ini." : null,
          status === "critical" ? "Eskalasi ke Owner/Manager sebelum eksekusi." : null,
          agent.tool !== "none" ? `Gunakan ${agent.tool.replace(/_/g, " ")}.` : null,
          "Aksi kritis tetap draft/approval, bukan auto eksekusi.",
        ].filter(Boolean) as string[];
        const lastSignal =
          roleDrafts[0]?.title ??
          warningSignals[0]?.title ??
          roleSignals[0]?.title ??
          "Belum ada signal baru.";

        return {
          role: agent.role,
          label: agent.label,
          group: staffMonitorGroupFor(agent.role),
          status,
          score,
          pendingDrafts: roleDrafts.length,
          criticalDrafts,
          signalCount: warningSignals.length,
          summary:
            status === "ready"
              ? "Aman. Tidak ada draft atau alert role yang mendesak."
              : status === "critical"
                ? "Butuh perhatian cepat sebelum autonomy dinaikkan."
                : "Ada signal yang perlu dipantau atau direview.",
          lastSignal,
          risks: risks.length ? risks.slice(0, 4) : ["Tidak ada risiko aktif."],
          nextActions: nextActions.slice(0, 4),
          agent,
          drafts: roleDrafts.slice(0, 4),
        };
      }),
    [actions, jobsStatus, systemDoctor?.score, systemDoctor?.status, visibleLogs],
  );
  const filteredStaffMonitorItems = useMemo(
    () =>
      staffMonitorFilter === "all"
        ? staffMonitorItems
        : staffMonitorItems.filter((item) => item.group === staffMonitorFilter),
    [staffMonitorFilter, staffMonitorItems],
  );
  const staffMonitorSummary = useMemo(
    () =>
      staffMonitorItems.reduce(
        (summary, item) => {
          summary[item.status] += 1;
          summary.pendingDrafts += item.pendingDrafts;
          summary.criticalDrafts += item.criticalDrafts;
          return summary;
        },
        { ready: 0, watch: 0, critical: 0, pendingDrafts: 0, criticalDrafts: 0 },
      ),
    [staffMonitorItems],
  );

  const speakGarage = useCallback(
    (text: string, options?: { executive?: boolean }) => {
      const cleanText = sanitizeVoiceText(
        options?.executive ? textForExecutiveVoice(text) : text,
      );
      if (!cleanText) {
        return;
      }

      // Semua suara dinamis (executive & non-executive) routing ke server-side
      // Edge TTS (Gadis Neural id-ID). Tidak pernah pakai browser TTS langsung
      // supaya Windows tanpa voice Indonesia tidak fallback ke Zira/David/Mark.
      setVoiceStatus(
        options?.executive
          ? "Owner Brain sedang berbicara..."
          : "GARAGE AI sedang berbicaraâ€¦",
      );
      void voice.speakExecutive(cleanText).then(() => {
        setVoiceStatus(
          options?.executive
            ? "Owner Brain selesai berbicara."
            : "Voice selesai.",
        );
      });
    },
    [],
  );

  const stopVoiceCapture = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      recognitionRef.current?.abort();
    }

    recognitionRef.current = null;
    setVoiceListening(false);
    setVoiceStatus("Voice berhenti.");
  }, []);

  const startVoiceCapture = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const Recognition = speechRecognitionConstructor();
    if (!Recognition) {
      setVoiceStatus("Mic speech recognition belum didukung browser ini.");
      return;
    }

    const activeVoiceMode = voiceMode === "mute" ? "push" : voiceMode;
    if (voiceMode === "mute") {
      setVoiceMode("push");
    }

    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.lang = "id-ID";
    recognition.interimResults = false;
    recognition.continuous = activeVoiceMode === "standby";
    recognition.onresult = (event) => {
      const transcript = readSpeechTranscript(event);
      if (!transcript) {
        return;
      }

      if (canUseOwnerFreeChat && chatMode === "owner_free_chat") {
        setOwnerChatInput(transcript);
      } else {
        setPrompt(transcript);
      }
      setVoiceStatus(`Terdengar: ${transcript}`);
      void voice.announce("voice_command_ack", { force: true });
    };
    recognition.onerror = (event) => {
      setVoiceListening(false);
      setVoiceStatus(`Voice error: ${event.error ?? "tidak dikenal"}.`);
    };
    recognition.onend = () => {
      setVoiceListening(false);
    };

    try {
      recognitionRef.current = recognition;
      recognition.start();
      setVoiceListening(true);
      setVoiceStatus("Mendengar perintah...");
    } catch (requestError) {
      recognitionRef.current = null;
      setVoiceListening(false);
      setVoiceStatus(
        requestError instanceof Error
          ? requestError.message
          : "Voice gagal dimulai.",
      );
    }
  }, [
    canUseOwnerFreeChat,
    chatMode,
    voiceMode,
  ]);

  function changeVoiceMode(nextMode: AiVoiceMode) {
    setVoiceMode(nextMode);

    if (nextMode === "mute") {
      stopVoiceCapture();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setVoiceStatus("Voice mute.");
      return;
    }

    setVoiceStatus(voiceModeMeta[nextMode].detail);
  }

  function appendLog(title: string, detail: string, status = "recorded") {
    const time = new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());

    setLogs((current) =>
      [
        {
          id: `${Date.now()}-${current.length}`,
          time,
          title,
          detail,
          status,
        },
        ...current,
      ].slice(0, 30),
    );
  }

  async function loadPersistedLogs() {
    setLogLoading(true);
    setLogError(null);

    try {
      const params = new URLSearchParams({ module: "GARAGE AI" });
      if (!canManageAgents) {
        params.set("actor", me.user.name || me.user.email);
      }

      const payload = await garageApi.get<AuditLog[]>(
        `/api/audit?${params.toString()}`,
        { cache: "no-store" },
      );
      setPersistedLogs(
        payload.map((entry, index) => ({
          id: `persisted-${entry.time}-${entry.actor}-${entry.action}-${index}`,
          time: entry.time,
          title: entry.action,
          detail: `${entry.actor} / ${entry.object} / ${entry.device}`,
          status: entry.status,
        })),
      );
    } catch (requestError) {
      setLogError(
        requestError instanceof Error
          ? requestError.message
          : "Log GARAGE AI belum bisa dimuat.",
      );
    } finally {
      setLogLoading(false);
    }
  }

  async function cleanupOldLogs() {
    if (!canManageAgents) {
      return;
    }

    setLogCleanupLoading(true);
    setLogError(null);

    try {
      const payload = await garageApi.post<AiLogCleanupResponse>(
        "/api/ai/logs/cleanup",
        { retentionDays: 7 },
      );
      setLogCleanupResult(payload.result ?? null);
      appendLog(
        "Log lama dibersihkan",
        `Hapus ${payload.result?.totalDeleted ?? 0} baris; retention ${payload.policy.retentionDays} hari.`,
        "completed",
      );
      await loadPersistedLogs();
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Clear log gagal.";
      setLogError(message);
      appendLog("Clear log gagal", message, "error");
    } finally {
      setLogCleanupLoading(false);
    }
  }

  useEffect(() => {
    if (!canManageProviders) {
      return;
    }

    let mounted = true;

    garageApi
      .get<AiProvidersResponse>("/api/ai/providers", { cache: "no-store" })
      .then((payload) => {
        if (mounted) {
          const editors = toProviderEditors(payload.providers);
          setProviders(editors);
          setProviderTemplates(payload.templates ?? []);
          setSelectedProviderId((current) => current ?? editors[0]?.provider ?? null);
        }
      })
      .catch((requestError) => {
        if (mounted) {
          setProviderError(
            requestError instanceof Error
              ? requestError.message
              : "Provider AI belum bisa dimuat.",
          );
        }
      })
      .finally(() => {
        if (mounted) {
          setProviderLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [canManageProviders]);

  useEffect(() => {
    if (!canManageSetup) {
      return;
    }

    void loadGarageAiHealth();
    void loadKnowledgeBase();
    // Setup Center data is refreshed by explicit buttons after first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageSetup]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPersistedLogs();
    }, 0);

    return () => window.clearTimeout(timer);
    // Load persisted audit logs once on entry; refresh is available in the Log tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => {
      setVoiceSupport({
        recognition: Boolean(speechRecognitionConstructor()),
        speech:
          "speechSynthesis" in window &&
          typeof SpeechSynthesisUtterance !== "undefined",
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    [],
  );

  useEffect(() => {
    if (!canManageAgents) {
      return;
    }

    void loadAgents();
    void loadActions();
    void loadJobsStatus();
    void loadSystemDoctor();
    // Agent setup loads once when the role has access; the loaders are event handlers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageAgents]);

  useEffect(() => {
    if (!autopilotEnabled || autopilotMode === "assist") {
      return;
    }

    const refreshAutopilot = () => {
      void loadPersistedLogs();
      if (canManageAgents) {
        void loadActions();
        void loadJobsStatus();
        void loadSystemDoctor();
      }
    };

    const firstRefreshTimer = window.setTimeout(refreshAutopilot, 0);
    const timer = window.setInterval(
      refreshAutopilot,
      autopilotMode === "safe" ? 45000 : 30000,
    );

    return () => {
      window.clearTimeout(firstRefreshTimer);
      window.clearInterval(timer);
    };
    // The loader functions are declarations in this component; schedule only tracks mode/access.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autopilotEnabled, autopilotMode, canManageAgents]);

  useEffect(() => {
    if (!pending) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, progressSteps.length - 1));
    }, 700);

    return () => window.clearInterval(timer);
  }, [pending, progressSteps.length]);

  useEffect(() => {
    if (chatMode !== "owner_free_chat") {
      return;
    }

    ownerChatEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chatMode, ownerChatMessages, pending]);

  useEffect(() => {
    if (!ownerHistoryOpen || !canUseOwnerFreeChat) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadOwnerChatHistory(ownerHistorySearch);
    }, 180);

    return () => window.clearTimeout(timer);
    // The loader is a stable function declaration below; this effect tracks dialog/search state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerHistoryOpen, canUseOwnerFreeChat, ownerHistorySearch]);

  useEffect(() => {
    if (!autopilotEnabled || voiceMode === "mute" || !voiceSupport.speech) {
      return;
    }

    const alert = autopilotAlerts.find((item) => item.status !== "ready");
    if (!alert) {
      return;
    }

    const alertKey = `${alert.id}-${alert.detail}`;
    if (lastSpokenAlertRef.current === alertKey) {
      return;
    }

    lastSpokenAlertRef.current = alertKey;
    void voice.announce("role_alert", { force: true });
  }, [autopilotAlerts, autopilotEnabled, voiceMode, voiceSupport.speech]);

  async function loadAgents() {
    if (!canManageAgents) {
      return;
    }

    setAgentsLoading(true);
    setAgentsError(null);

    try {
      const payload = await garageApi.get<AiAgentsResponse>("/api/ai/agents", {
        cache: "no-store",
      });
      setAgents(payload.agents);
    } catch (requestError) {
      setAgentsError(
        requestError instanceof Error
          ? requestError.message
          : "Konfigurasi agent belum bisa dimuat.",
      );
    } finally {
      setAgentsLoading(false);
    }
  }

  async function loadJobsStatus() {
    if (!canManageAgents) {
      return;
    }

    setJobsStatusLoading(true);
    setJobsStatusError(null);

    try {
      const payload = await garageApi.get<AiJobsStatusResponse>(
        "/api/ai/jobs/status",
        { cache: "no-store" },
      );
      setJobsStatus(payload);
    } catch (requestError) {
      setJobsStatusError(
        requestError instanceof Error
          ? requestError.message
          : "Status otomatis belum bisa dimuat.",
      );
    } finally {
      setJobsStatusLoading(false);
    }
  }

  async function loadSystemDoctor() {
    if (!canManageAgents) {
      return;
    }

    setSystemDoctorLoading(true);
    setSystemDoctorError(null);

    try {
      const payload = await garageApi.get<AiSystemDoctorResponse>(
        "/api/ai/system-doctor",
        { cache: "no-store" },
      );
      setSystemDoctor(payload);
    } catch (requestError) {
      setSystemDoctorError(
        requestError instanceof Error
          ? requestError.message
          : "System Doctor belum bisa dimuat.",
      );
    } finally {
      setSystemDoctorLoading(false);
    }
  }

  async function runSystemDoctorAutoHeal() {
    if (!canManageAgents) {
      return;
    }

    setSystemDoctorHealing(true);
    setSystemDoctorError(null);

    try {
      const payload = await garageApi.post<AiSystemDoctorResponse>(
        "/api/ai/system-doctor",
        { autoHeal: true },
      );
      setSystemDoctor(payload);
      appendLog(
        "System Doctor auto-heal",
        `Status ${payload.status}; score ${payload.score}; fix ${payload.fixes.length}; issue ${payload.issues.length}.`,
        payload.status === "critical" ? "warning" : "completed",
      );
      await Promise.all([loadPersistedLogs(), loadAgents(), loadActions(), loadJobsStatus()]);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "System Doctor gagal auto-heal.";
      setSystemDoctorError(message);
      appendLog("System Doctor gagal", message, "error");
    } finally {
      setSystemDoctorHealing(false);
    }
  }

  async function runShiftCopilotManual() {
    if (!canManageAgents) {
      return;
    }

    setShiftCopilotRunning(true);

    try {
      const result = await garageApi.post<AiShiftCopilotRunResponse>(
        "/api/ai/shift-copilot/run",
        {},
      );
      appendLog(
        "Shift Copilot autopilot",
        `${result.created} alert baru, ${result.skipped} duplikat, ${result.signalCount} sinyal.`,
        "completed",
      );
      await Promise.all([loadActions(), loadPersistedLogs()]);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Shift Copilot gagal dijalankan.";
      appendLog("Shift Copilot gagal", message, "error");
    } finally {
      setShiftCopilotRunning(false);
    }
  }

  function updateAgent(
    agentId: AiAgentConfigPublic["agentId"],
    patch: Partial<Pick<AiAgentConfigPublic, "enabled" | "autonomyMode" | "maxRiskLevel">>,
  ) {
    setAgents((current) =>
      current.map((agent) => (agent.agentId === agentId ? { ...agent, ...patch } : agent)),
    );
  }

  async function saveAgents() {
    setSavingAgents(true);
    setAgentsError(null);

    try {
      const payload = await garageApi.put<AiAgentsResponse>("/api/ai/agents", {
        agents: agents.map((agent) => ({
          agentId: agent.agentId,
          enabled: agent.enabled,
          autonomyMode: agent.autonomyMode,
          maxRiskLevel: agent.maxRiskLevel,
        })),
      });
      setAgents(payload.agents);
      appendLog("Agent config disimpan", `${payload.agents.length} agent diperbarui.`);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Konfigurasi agent gagal disimpan.";
      setAgentsError(message);
      appendLog("Agent config gagal", message, "error");
    } finally {
      setSavingAgents(false);
    }
  }

  function downloadAgentReport() {
    setAgentReportError(null);
    const params = new URLSearchParams({
      period: agentReportPeriod,
      date: agentReportDate,
    });

    window.open(
      `/api/ai/agents/report?${params.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
    appendLog(
      "Agent report exported",
      `${agentReportPeriod} ${agentReportDate} dibuka sebagai file Excel.`,
      "recorded",
    );
  }

  function changeAgentReportPeriod(period: AiAgentReportPeriod) {
    setAgentReportPeriod(period);
    setAgentReportDate(defaultAgentReportDate(period));
  }

  async function loadActions() {
    if (!canManageAgents) {
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      const payload = await garageApi.get<AiActionsResponse>(
        "/api/ai/actions?status=pending",
        { cache: "no-store" },
      );
      setActions(payload.actions);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Action draft belum bisa dimuat.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function loadGarageAiHealth() {
    if (!canManageSetup) {
      return;
    }

    setGarageAiHealthLoading(true);
    setGarageAiHealthError(null);

    try {
      const payload = await garageApi.get<AiGarageAiHealthResponse>(
        "/api/ai/health",
        { cache: "no-store" },
      );
      setGarageAiHealth(payload);
    } catch (requestError) {
      setGarageAiHealthError(
        requestError instanceof Error
          ? requestError.message
          : "Health GARAGE AI belum bisa dimuat.",
      );
    } finally {
      setGarageAiHealthLoading(false);
    }
  }

  async function loadKnowledgeBase() {
    if (!canUseOwnerFreeChat) {
      return;
    }

    setKnowledgeLoading(true);
    setKnowledgeError(null);

    try {
      const payload = await garageApi.get<AiKnowledgeListResponse>(
        "/api/ai/knowledge",
        { cache: "no-store" },
      );
      setKnowledgeBase(payload);
    } catch (requestError) {
      setKnowledgeError(
        requestError instanceof Error
          ? requestError.message
          : "Knowledge Base belum bisa dimuat.",
      );
    } finally {
      setKnowledgeLoading(false);
    }
  }

  async function deleteKnowledgeFile(file: AiKnowledgeFileRecord) {
    setDeletingKnowledgeFile(file.vectorStoreFileId);
    setKnowledgeError(null);

    try {
      await garageApi.delete<AiKnowledgeDeleteResponse>("/api/ai/knowledge", {
        body: JSON.stringify({
          vectorStoreFileId: file.vectorStoreFileId,
          openAiFileId: file.openAiFileId,
        }),
      });
      appendLog("Knowledge Base dokumen dihapus", file.fileName, "ready");
      await loadKnowledgeBase();
      void loadGarageAiHealth();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Dokumen Knowledge Base gagal dihapus.";
      setKnowledgeError(message);
      appendLog("Knowledge Base delete gagal", message, "error");
    } finally {
      setDeletingKnowledgeFile(null);
    }
  }

  async function decideAction(action: AiActionDraftRecord, status: "approved" | "rejected") {
    setDecidingAction(action.id);
    setActionError(null);

    try {
      const payload = await garageApi.post<AiActionDecisionResponse>(
        `/api/ai/actions/${action.id}/${status === "approved" ? "approve" : "reject"}`,
        {},
      );
      setActions((current) => current.filter((item) => item.id !== payload.action.id));
      appendLog(
        status === "approved" ? "Action draft approved" : "Action draft rejected",
        `${payload.action.actionType}: ${payload.action.title}`,
        status,
      );
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Action draft gagal diproses.";
      setActionError(message);
      appendLog("Action draft gagal", message, "error");
    } finally {
      setDecidingAction(null);
    }
  }

  async function loadProviders() {
    if (!canManageProviders) {
      return;
    }

    setProviderLoading(true);
    setProviderError(null);
    setProviderConnectionTest(null);

    try {
      const payload = await garageApi.get<AiProvidersResponse>("/api/ai/providers", {
        cache: "no-store",
      });
      const editors = toProviderEditors(payload.providers);
      setProviders(editors);
      setProviderTemplates(payload.templates ?? []);
      setSelectedProviderId((current) =>
        current && editors.some((provider) => provider.provider === current)
          ? current
          : editors[0]?.provider ?? null,
      );
    } catch (requestError) {
      setProviderError(
        requestError instanceof Error
          ? requestError.message
          : "Provider AI belum bisa dimuat.",
      );
    } finally {
      setProviderLoading(false);
    }
  }

  function updateProvider(providerId: string, patch: Partial<AiProviderEditor>) {
    setProviders((current) =>
      current.map((provider) =>
        provider.provider === providerId ? { ...provider, ...patch } : provider,
      ),
    );
  }

  function applyProviderTemplate(template: AiProviderTemplate) {
    const providerId = normalizeProviderId(template.provider);
    const existingProvider = providers.find(
      (provider) => provider.provider === providerId,
    );

    if (existingProvider) {
      updateProvider(existingProvider.provider, {
        label: template.label,
        baseUrl: template.baseUrl,
        model: template.model,
        priority: template.priority,
      });
    } else {
      setProviders((current) => [
        {
          provider: providerId,
          label: template.label,
          baseUrl: template.baseUrl,
          model: template.model,
          enabled: false,
          priority: template.priority,
          keyStatus: "missing",
          maskedKey: null,
          lastStatus: "untested",
          lastError: null,
          lastLatencyMs: null,
          updatedAt: null,
          isBuiltIn: false,
          apiKeyInput: "",
          clearApiKey: false,
        },
        ...current,
      ]);
    }

    setSelectedProviderId(providerId);
  }

  function addCustomProvider() {
    const nextIndex = providers.filter((provider) =>
      provider.provider.startsWith("custom"),
    ).length + 1;
    const providerId = normalizeProviderId(`custom-${nextIndex}`);
    const priority =
      providers.length > 0
        ? Math.max(...providers.map((provider) => provider.priority)) + 10
        : 950;

    setProviders((current) => {
      if (current.some((provider) => provider.provider === providerId)) {
        return current;
      }

      return [
        {
          provider: providerId,
          label: "Custom Provider",
          baseUrl: "https://api.example.com/v1",
          model: "custom-model",
          enabled: false,
          priority,
          keyStatus: "missing",
          maskedKey: null,
          lastStatus: "untested",
          lastError: null,
          lastLatencyMs: null,
          updatedAt: null,
          isBuiltIn: false,
          apiKeyInput: "",
          clearApiKey: false,
        },
        ...current,
      ];
    });
    setSelectedProviderId(providerId);
    setProviderDialogOpen(true);
  }

  function providerPayload(provider: AiProviderEditor) {
    const apiKey = provider.apiKeyInput.trim();
    const willClearKey = providerWillClearKey(provider);

    return {
      provider: normalizeProviderId(provider.provider),
      label: provider.label.trim(),
      baseUrl: provider.baseUrl.trim(),
      model: provider.model.trim(),
      enabled: willClearKey ? false : provider.enabled || Boolean(apiKey),
      priority: Number(provider.priority) || 100,
      apiKey: apiKey || undefined,
      clearApiKey: willClearKey || undefined,
    };
  }

  async function saveProvider(provider: AiProviderEditor) {
    setSavingProvider(provider.provider);
    setProviderError(null);
    setProviderConnectionTest(null);
    const willClearKey = providerWillClearKey(provider);

    try {
      const payload = await garageApi.put<AiProvidersResponse>(
        "/api/ai/providers",
        providerPayload(provider),
      );
      const editors = toProviderEditors(payload.providers);
      setProviders(editors);
      setSelectedProviderId(normalizeProviderId(provider.provider));
      setProviderConnectionTest(payload.connectionTest ?? null);

      if (willClearKey) {
        appendLog(
          "Provider AI dinonaktifkan",
          `${provider.label}: key tersimpan dihapus. Isi key baru lalu simpan & connect untuk mengaktifkan lagi.`,
        );
      } else if (payload.connectionTest?.status === "ready") {
        appendLog(
          "Provider AI connected",
          `${provider.label} / ${payload.connectionTest.model} / ${
            payload.connectionTest.latencyMs ?? "-"
          } ms. Agent dan chat memakai provider aktif otomatis.`,
          "ready",
        );
      } else if (payload.connectionTest?.status === "failed") {
        appendLog(
          "Provider AI tersimpan, connect gagal",
          `${provider.label}: ${providerErrorAdvice(payload.connectionTest.message)}`,
          "error",
        );
      } else {
        appendLog(
          "Provider AI disimpan",
          `${provider.label} / ${provider.model} / priority ${provider.priority}. Provider nonaktif atau belum dites.`,
        );
      }
      void loadGarageAiHealth();
    } catch (requestError) {
      const message = providerErrorAdvice(
        requestError instanceof Error
          ? requestError.message
          : "Provider AI gagal disimpan.",
      );
      setProviderError(message);
      appendLog("Provider AI gagal disimpan", message, "error");
    } finally {
      setSavingProvider(null);
    }
  }

  async function runProviderAutoFix() {
    if (!canManageProviders) {
      return;
    }

    setProviderAutoFixing(true);
    setProviderError(null);
    setProviderConnectionTest(null);

    try {
      const payload = await garageApi.post<AiProviderAutoFixResponse>(
        "/api/ai/providers/auto-fix",
        {},
      );
      const editors = toProviderEditors(payload.providers);
      const completed = payload.fixes.filter((fix) => fix.status === "completed").length;
      setProviders(editors);
      setSelectedProviderId((current) =>
        current && editors.some((provider) => provider.provider === current)
          ? current
          : editors[0]?.provider ?? null,
      );
      appendLog(
        "Provider Auto Fix",
        completed
          ? `${completed} provider dinormalisasi. API key tidak diubah.`
          : "Semua provider sudah normal.",
        completed ? "completed" : "ready",
      );
      await Promise.all([loadGarageAiHealth(), loadSystemDoctor()]);
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Auto Fix Provider gagal dijalankan.";
      setProviderError(message);
      appendLog("Provider Auto Fix gagal", message, "error");
    } finally {
      setProviderAutoFixing(false);
    }
  }

  async function testProvider(provider: AiProviderEditor) {
    if (providerWillClearKey(provider)) {
      const message =
        "Provider sedang ditandai hapus key. Isi key baru atau simpan penghapusan dulu sebelum test.";
      setProviderError(message);
      appendLog("Provider AI belum dites", `${provider.label}: ${message}`, "warning");
      return;
    }

    setTestingProvider(provider.provider);
    setProviderError(null);
    setProviderConnectionTest(null);

    try {
      const test = await garageApi.post<AiProviderTestResponse>(
        "/api/ai/providers/test",
        providerPayload(provider),
      );
      const connectionTest: AiProviderConnectionTestResult = {
        provider: test.provider,
        status: "ready",
        ok: true,
        providerStatus: test.status,
        latencyMs: test.latencyMs,
        message: test.message,
        model: test.model,
      };
      appendLog(
        "Provider AI ready",
        `${provider.label} / ${test.model} / ${test.latencyMs ?? "-"} ms`,
        test.status,
      );
      await loadProviders();
      void loadGarageAiHealth();
      setProviderConnectionTest(connectionTest);
    } catch (requestError) {
      const message = providerErrorAdvice(
        requestError instanceof Error ? requestError.message : "Provider AI gagal dites.",
      );
      const connectionTest: AiProviderConnectionTestResult = {
        provider: normalizeProviderId(provider.provider),
        status: "failed",
        ok: false,
        providerStatus: "error",
        latencyMs: null,
        message,
        model: provider.model,
      };
      setProviderError(message);
      appendLog("Provider AI gagal dites", `${provider.label}: ${message}`, "error");
      await loadProviders();
      void loadGarageAiHealth();
      setProviderConnectionTest(connectionTest);
    } finally {
      setTestingProvider(null);
    }
  }

  function currentChatTime() {
    return new Intl.DateTimeFormat("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  }

  function buildOwnerChatContext(toolOverride?: OwnerChatToolId) {
    return {
      planMode: ownerPlanMode,
      profile: ownerChatProfile,
      tool: toolOverride ?? ownerChatTool,
      historyId: selectedOwnerHistoryId ?? undefined,
    };
  }

  async function loadOwnerChatHistory(search = ownerHistorySearch) {
    if (!canUseOwnerFreeChat) {
      return;
    }

    setOwnerHistoryLoading(true);
    setOwnerHistoryError(null);

    try {
      const query = search.trim()
        ? `?q=${encodeURIComponent(search.trim())}`
        : "";
      const payload = await garageApi.get<AiOwnerChatHistoryListResponse>(
        `/api/ai/owner-chat/history${query}`,
        { cache: "no-store" },
      );
      setOwnerHistoryItems(payload.history);
    } catch (requestError) {
      setOwnerHistoryError(
        requestError instanceof Error
          ? requestError.message
          : "Riwayat Owner Brain belum bisa dimuat.",
      );
    } finally {
      setOwnerHistoryLoading(false);
    }
  }

  function openOwnerHistory(record: AiOwnerChatHistoryRecord) {
    setSelectedOwnerHistoryId(record.id);
    setResult(null);
    setOwnerChatMessages([
      createOwnerWelcomeMessage(),
      {
        id: `owner-history-user-${record.id}`,
        role: "user",
        content: record.prompt,
        time: formatFreshnessTime(record.createdAt),
        status: "sent",
      },
      {
        id: `owner-history-assistant-${record.id}`,
        role: "assistant",
        content: record.response,
        time: formatFreshnessTime(record.createdAt),
        status: "ready",
      },
    ]);
    setOwnerHistoryOpen(false);
  }

  async function deleteOwnerHistory(recordId: string) {
    if (!canUseOwnerFreeChat) {
      return;
    }

    setOwnerHistoryError(null);

    try {
      await garageApi.delete<AiOwnerChatHistoryMutationResponse>(
        `/api/ai/owner-chat/history/${recordId}`,
      );
      setOwnerHistoryItems((current) =>
        current.filter((record) => record.id !== recordId),
      );
      if (selectedOwnerHistoryId === recordId) {
        setSelectedOwnerHistoryId(null);
      }
      appendLog("Riwayat Owner Brain dihapus", recordId, "ready");
    } catch (requestError) {
      setOwnerHistoryError(
        requestError instanceof Error
          ? requestError.message
          : "Riwayat Owner Brain gagal dihapus.",
      );
    }
  }

  async function clearOwnerHistory() {
    if (!canUseOwnerFreeChat) {
      return;
    }

    setOwnerHistoryError(null);

    try {
      const payload = await garageApi.delete<AiOwnerChatHistoryMutationResponse>(
        "/api/ai/owner-chat/history",
      );
      setOwnerHistoryItems([]);
      setSelectedOwnerHistoryId(null);
      appendLog(
        "Riwayat Owner Brain dibersihkan",
        `${payload.deleted} item dihapus`,
        "ready",
      );
    } catch (requestError) {
      setOwnerHistoryError(
        requestError instanceof Error
          ? requestError.message
          : "Riwayat Owner Brain gagal dibersihkan.",
      );
    }
  }

  function appendAiSuccessLog(response: AiPosAgentResponse, requestMode: AiChatMode) {
    const tokenText = response.tokenUsage?.totalTokens
      ? ` / ${response.tokenUsage.totalTokens} token`
      : "";

    appendLog(
      "GARAGE AI menjawab",
      `${response.providerUsed ?? "provider"} / ${response.modelUsed ?? "model"} / ${
        response.latencyMs ?? "-"
      } ms / ${response.profile ?? "profile"} / ${
        response.dataAccessLevel ?? "access"
      } / ${response.mode ?? requestMode} / risk ${response.riskLevel ?? response.urgency}${
        response.fallbackUsed ? " / fallback" : ""
      }${tokenText}`,
      response.fallbackUsed ? "watch" : "ready",
    );
  }

  function stopOwnerFreeChat() {
    ownerChatAbortRef.current?.abort();
    ownerChatAbortRef.current = null;
    setPending(false);
    setOwnerChatMessages((current) => [
      ...current,
      {
        id: `owner-stopped-${Date.now()}`,
        role: "system",
        content: "Request dihentikan di UI. Tidak ada aksi POS yang dieksekusi.",
        time: currentChatTime(),
        status: "watch",
      },
    ]);
  }

  function addOwnerSystemMessage(content: string, status = "watch") {
    setOwnerChatMessages((current) => [
      ...current,
      {
        id: `owner-system-${Date.now()}-${current.length}`,
        role: "system",
        content,
        time: currentChatTime(),
        status,
      },
    ]);
  }

  async function uploadOwnerKnowledgeFiles(fileList: FileList | null) {
    const allowedExtensions = [".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md"];
    const selectedFiles = Array.from(fileList ?? []);
    const rejectedFiles = selectedFiles.filter((file) => {
      const name = file.name.toLowerCase();
      return !allowedExtensions.some((extension) => name.endsWith(extension));
    });
    const files = selectedFiles
      .filter((file) => !rejectedFiles.includes(file))
      .slice(0, 5);

    if (rejectedFiles.length) {
      addOwnerSystemMessage(
        `File ditolak: ${rejectedFiles
          .map((file) => file.name)
          .join(", ")}. Knowledge Base v1 hanya menerima PDF, Word, Excel, CSV, TXT, dan MD.`,
        "watch",
      );
    }

    if (!files.length) {
      return;
    }

    setOwnerKnowledgeUploading(true);
    setError(null);
    addOwnerSystemMessage(
      `Upload ${files.length} dokumen Office ke Knowledge Base dimulai. Server akan upload dan indexing ke OpenAI Vector Store.`,
      "watch",
    );

    const body = new FormData();
    for (const file of files) {
      body.append("files", file);
    }

    try {
      const response = await fetch("/api/ai/knowledge/upload", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        data?: AiKnowledgeUploadResponse;
        error?: { message?: string };
      };

      if (!response.ok || payload.error || !payload.data) {
        throw new Error(
          payload.error?.message ?? "Upload Knowledge Base gagal.",
        );
      }

      const summary = payload.data.files
        .map((file) => `${file.fileName}: ${file.status} - ${file.message}`)
        .join("\n");
      const status = payload.data.failedCount ? "watch" : "ready";
      addOwnerSystemMessage(
        [
          `Knowledge Base update selesai: ${payload.data.uploadedCount} sukses, ${payload.data.failedCount} gagal.`,
          summary,
          "File yang sukses sudah bisa ditanyakan di Owner Brain atau SOP Knowledge.",
        ].join("\n"),
        status,
      );
      appendLog(
        "Knowledge Base upload",
        `${payload.data.uploadedCount} sukses / ${payload.data.failedCount} gagal`,
        status,
      );
      await loadKnowledgeBase();
      void loadGarageAiHealth();
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Upload Knowledge Base gagal.";
      setError(message);
      addOwnerSystemMessage(message, "error");
      appendLog("Knowledge Base upload gagal", message, "error");
    } finally {
      setOwnerKnowledgeUploading(false);
      if (ownerKnowledgeInputRef.current) {
        ownerKnowledgeInputRef.current.value = "";
      }
    }
  }

  function handleOwnerOfficeUpload() {
    ownerKnowledgeInputRef.current?.click();
  }

  function handleOwnerToolSelect(toolId: OwnerChatToolId) {
    const tool = ownerChatTools.find((entry) => entry.id === toolId) ?? ownerChatTools[0];
    setOwnerChatTool(tool.id);
    setOwnerToolsMenuOpen(false);
    addOwnerSystemMessage(`Tool focus diset ke ${tool.label}.`, "ready");
  }

  function buildRoleAgentPrompt(agent = selectedRoleAgent) {
    return [
      agent.prompt,
      `Autopilot: ${selectedAutopilotMeta.label}. ${selectedAutopilotMeta.detail}`,
      "Fokus pengawasan: sebutkan kesalahan operasional, karyawan/role yang perlu diingatkan, dan langkah perbaikan. Jangan eksekusi void/refund/delete/ubah stok langsung.",
    ].join("\n");
  }

  function buildRoleScopedMessage(message: string) {
    return [
      `Role agent aktif: ${selectedRoleAgent.role} - ${selectedRoleAgent.label}.`,
      `Scope: ${selectedRoleAgent.scope}`,
      `Autopilot: ${selectedAutopilotMeta.label}.`,
      "Guardrail: aksi kritis hanya berupa draft/approval, bukan eksekusi langsung.",
      `Perintah: ${message}`,
    ].join("\n");
  }

  function activateStaffMonitorRole(item: StaffMonitorItem) {
    setSelectedRoleAgentRole(item.role);
    if (canUseOwnerFreeChat) {
      setOwnerChatTool(item.agent.tool);
    }
    setChatMode("operational");
    setPrompt(buildRoleAgentPrompt(item.agent));
    setActiveTab("chat");
    appendLog(
      "Staff Monitor role dipakai",
      `${item.label} / score ${item.score} / ${item.status}`,
      item.status,
    );
  }

  function speakStaffMonitor() {
    void voice.announce("staff_monitor", { force: true });
  }

  async function sendOwnerFreeChat(
    messageOverride?: string,
    toolOverride?: OwnerChatToolId,
  ) {
    if (!canUseOwnerFreeChat) {
      setError("Chat bebas hanya tersedia untuk Owner.");
      return;
    }

    const cleanMessage = (messageOverride ?? ownerChatInput).trim();
    if (!cleanMessage) {
      setError("Pesan chat tidak boleh kosong.");
      return;
    }

    const userMessage: AiConversationMessage = {
      id: `owner-user-${Date.now()}`,
      role: "user",
      content: cleanMessage,
      time: currentChatTime(),
      status: "sent",
    };

    if (toolOverride) {
      setOwnerChatTool(toolOverride);
    }
    const ownerChatContext = buildOwnerChatContext(toolOverride);
    setOwnerChatMessages((current) => [...current, userMessage]);
    if (!messageOverride) {
      setOwnerChatInput("");
    }
    setProgressMessage(cleanMessage);
    setActiveStep(0);
    setPending(true);
    setError(null);
    const controller = new AbortController();
    ownerChatAbortRef.current = controller;

    try {
      const response = await garageApi.post<AiPosAgentResponse>("/api/ai/pos-agent", {
        mode: "owner_free_chat",
        message: cleanMessage,
        orderType: "dine-in",
        cart: [],
        ownerChatContext,
      }, {
        signal: controller.signal,
      });
      setResult(response);
      setOwnerChatMessages((current) => [
        ...current,
        {
          id: `owner-assistant-${response.runId ?? Date.now()}`,
          role: "assistant",
          content: response.response,
          time: currentChatTime(),
          status: response.fallbackUsed ? "watch" : "ready",
          response,
        },
      ]);
      if (voiceMode !== "mute") {
        speakGarage(response.response, { executive: true });
      }
      appendAiSuccessLog(response, "owner_free_chat");
      if (response.ownerChatHistoryId) {
        setSelectedOwnerHistoryId(response.ownerChatHistoryId);
        void loadOwnerChatHistory(ownerHistorySearch);
      }
      if (canManageAgents) {
        void loadActions();
      }
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") {
        return;
      }

      const message =
        requestError instanceof Error
          ? requestError.message
          : "GARAGE AI gagal merespons.";
      setError(message);
      setOwnerChatMessages((current) => [
        ...current,
        {
          id: `owner-error-${Date.now()}`,
          role: "system",
          content: message,
          time: currentChatTime(),
          status: "error",
        },
      ]);
      appendLog("GARAGE AI gagal", message, "error");
    } finally {
      if (ownerChatAbortRef.current === controller) {
        ownerChatAbortRef.current = null;
      }
      setPending(false);
    }
  }

  async function askAgent(message = prompt, modeOverride?: AiChatMode) {
    const cleanMessage = message.trim();
    if (!cleanMessage) {
      setError("Pertanyaan AI tidak boleh kosong.");
      return;
    }

    const requestMode = canUseOwnerFreeChat
      ? (modeOverride ?? chatMode)
      : "operational";
    setProgressMessage(cleanMessage);
    setActiveStep(0);
    setPending(true);
    setError(null);

    try {
      const requestMessage =
        requestMode === "owner_free_chat"
          ? cleanMessage
          : buildRoleScopedMessage(cleanMessage);
      const response = await garageApi.post<AiPosAgentResponse>("/api/ai/pos-agent", {
        mode: requestMode,
        message: requestMessage,
        orderType: "dine-in",
        cart: [],
      });
      setResult(response);
      setPrompt(cleanMessage);
      if (voiceMode !== "mute") {
        speakGarage(response.response, {
          executive: requestMode === "owner_free_chat",
        });
      }
      appendAiSuccessLog(response, requestMode);
      if (canManageAgents) {
        void loadActions();
      }
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "GARAGE AI gagal merespons.";
      setError(message);
      appendLog("GARAGE AI gagal", message, "error");
    } finally {
      setPending(false);
    }
  }

  if (useSimpleAiHome) {
    return (
      <section className="garage-animate-in p-3 sm:p-4">
        <GarageAiSimpleView me={me} />
      </section>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="garage-panel garage-animate-in min-w-0 rounded-md p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="garage-mono text-[11px] text-[#b8b8bf]">Manajemen outlet</p>
            <h2 className="garage-display garage-chrome text-2xl leading-tight sm:text-3xl">
              GARAGE AI
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d6d6dc]">
              Pengawasan tim, tanya data, dan review approval â€” {me.outlet.name}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {activeProvider && canManageProviders && (
              <div className="hidden max-w-[280px] items-center gap-2 rounded-full border border-[#34343c] bg-[#15151b]/90 px-3 py-1.5 text-xs text-[#d6d6dc] lg:flex">
                <span className="truncate font-semibold text-white">
                  {activeProvider.label}
                </span>
                <ProviderConnectionBadge provider={activeProvider} />
              </div>
            )}
            {(canManageSetup || canManageAgents || canManageProviders) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-9 border-[#4a4a54] px-3 text-xs"
                  >
                    <MoreHorizontal className="mr-2 size-4" />
                    Manage
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>GARAGE AI</DropdownMenuLabel>
                  {canManageSetup && (
                    <DropdownMenuItem
                      onClick={() => {
                        setSettingsOpen(true);
                        void loadGarageAiHealth();
                        void loadSystemDoctor();
                        void loadJobsStatus();
                        void loadKnowledgeBase();
                      }}
                    >
                      <Settings className="mr-2 size-4" />
                      Setup Center
                    </DropdownMenuItem>
                  )}
                  {canManageAgents && (
                    <DropdownMenuItem
                      onClick={() => {
                        setActiveTab("agents");
                        void loadAgents();
                        void loadJobsStatus();
                      }}
                    >
                      <Sparkles className="mr-2 size-4" />
                      Agents & report
                    </DropdownMenuItem>
                  )}
                  {(canManageProviders || canManageAgents) && (
                    <DropdownMenuItem
                      onClick={() => {
                        if (!canManageProviders) {
                          setProviderAccessOpen(true);
                          return;
                        }

                        setActiveTab("providers");
                        void loadProviders();
                      }}
                    >
                      <LockKeyhole className="mr-2 size-4" />
                      Provider AI{canManageProviders ? "" : " (Owner)"}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {canManageAgents && (
                    <DropdownMenuItem
                      onClick={() => {
                        setActiveTab("actions");
                        void loadActions();
                      }}
                    >
                      <ShieldAlert className="mr-2 size-4" />
                      Review actions
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={() => setActiveTab("log")}>
                    <FileText className="mr-2 size-4" />
                    Activity log
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Dialog open={providerAccessOpen} onOpenChange={setProviderAccessOpen}>
              <DialogContent className="max-h-[88vh] overflow-y-auto border-[#34343c] bg-[#111116] text-[#f4f4f5] sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Provider AI dikunci Owner</DialogTitle>
                  <DialogDescription>
                    Menu provider sekarang terlihat, tetapi setup API key hanya boleh
                    dilakukan oleh role Owner / CEO.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                    <p className="garage-mono text-[10px] text-[#8f8f99]">
                      Role saat ini
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">
                      {me.role}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                    <p className="text-sm font-semibold text-white">
                      Cara membuka Provider AI
                    </p>
                    <p className="mt-2 text-xs leading-5 text-[#d6d6dc]">
                      Logout dari sesi ini lalu masuk memakai akun Owner / CEO.
                      Setelah itu buka GARAGE AI, klik Manage, lalu pilih Provider AI.
                    </p>
                  </div>
                  <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]">
                    <LockKeyhole className="size-4" />
                    <AlertTitle>API key tetap aman</AlertTitle>
                    <AlertDescription>
                      Admin dan Manager boleh memantau Agents, Actions, Doctor, dan Log,
                      tetapi tidak bisa melihat, test, menghapus, atau mengganti key provider.
                    </AlertDescription>
                  </Alert>
                </div>
                <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 flex justify-end border-t border-[#34343c] bg-[#111116] px-6 py-3">
                  <Button
                    type="button"
                    className="garage-press"
                    onClick={() => setProviderAccessOpen(false)}
                  >
                    Mengerti
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            {canManageSetup && (
              <Sheet
                open={settingsOpen}
                onOpenChange={(open) => {
                  setSettingsOpen(open);
                  if (open) {
                    void loadGarageAiHealth();
                    void loadSystemDoctor();
                    void loadJobsStatus();
                    void loadKnowledgeBase();
                  }
                }}
              >
                <SheetContent
                  side="right"
                  className="garage-shell dark w-full overflow-y-auto border-[#34343c] bg-[#111116] text-[#f4f4f5] sm:max-w-xl"
                >
                  <SheetHeader>
                    <SheetTitle>Pengaturan GARAGE AI</SheetTitle>
                    <SheetDescription className="text-xs leading-5 text-[#b8b8bf]">
                      Setup satu pintu untuk provider aktif, knowledge, export, cron,
                      database, dan System Doctor.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="garage-mono text-[10px] uppercase text-[#8f8f99]">
                            Provider aktif
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-white">
                            {activeProvider
                              ? `${activeProvider.label} - ${activeProvider.model}`
                              : "Belum ada provider ready"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                            {activeProvider
                              ? `Priority ${activeProvider.priority}; latency ${
                                  activeProvider.lastLatencyMs ?? "-"
                                } ms.`
                              : "Isi key dan klik Simpan & connect dari Provider AI."}
                          </p>
                        </div>
                        {activeProvider ? (
                          <ProviderConnectionBadge provider={activeProvider} />
                        ) : (
                          <span className="garage-mono rounded-full border border-[#4a4a54] bg-white/[0.04] px-2 py-0.5 text-[10px] text-[#c8c8cc]">
                            No ready
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            System Doctor
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                            {systemDoctor
                              ? `Score ${systemDoctor.score}/100; ${systemDoctor.issues.length} issue.`
                              : "Belum ada scan terbaru."}
                          </p>
                        </div>
                        {(() => {
                          const meta = healthColorMeta(systemDoctor?.healthColor);

                          return (
                            <Badge className={`garage-mono text-[10px] ${meta.className}`}>
                              <span className={`mr-1.5 inline-block size-1.5 rounded-full ${meta.dot}`} />
                              {systemDoctor ? meta.label : "Ringan"}
                            </Badge>
                          );
                        })()}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="garage-press h-8 border-[#4a4a54] text-xs"
                          disabled={systemDoctorLoading}
                          onClick={() => void loadSystemDoctor()}
                        >
                          Scan
                        </Button>
                        <Button
                          type="button"
                          className="garage-press h-8 text-xs"
                          disabled={systemDoctorHealing || providerAutoFixing}
                          onClick={async () => {
                            await runProviderAutoFix();
                            await runSystemDoctorAutoHeal();
                          }}
                        >
                          Auto Fix aman
                        </Button>
                      </div>
                    </div>

                    {garageAiHealth ? (
                      <div className="space-y-2">
                        {garageAiHealth.setup.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-md border border-[#34343c] bg-[#15151b] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-white">
                                  {item.label}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                                  {item.detail}
                                </p>
                              </div>
                              <Badge
                                className={`garage-mono shrink-0 text-[10px] ${
                                  item.status === "ready"
                                    ? healthColorMeta("green").className
                                    : item.status === "error"
                                      ? healthColorMeta("red").className
                                      : healthColorMeta("yellow").className
                                }`}
                              >
                                {item.status === "ready"
                                  ? "Sehat"
                                  : item.status === "error"
                                    ? "Critical/Error"
                                    : "Ringan"}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-[#8f8f99]">
                              Next: {item.nextStep}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-[#4a4a54] bg-[#202027] p-3 text-xs leading-5 text-[#b8b8bf]">
                        Setup Center belum dimuat. Klik Refresh untuk membaca status.
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press border-[#4a4a54]"
                        disabled={garageAiHealthLoading}
                        onClick={() => void loadGarageAiHealth()}
                      >
                        <RefreshCw
                          className={`mr-2 size-4 ${
                            garageAiHealthLoading ? "animate-spin" : ""
                          }`}
                        />
                        Refresh
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press border-[#4a4a54]"
                        onClick={() => {
                          setSettingsOpen(false);
                          setActiveTab("providers");
                        }}
                      >
                        Buka Provider
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press border-[#4a4a54]"
                        onClick={() => {
                          setSettingsOpen(false);
                          setActiveTab("doctor");
                        }}
                      >
                        Buka Doctor
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as AiAgentTab)}
          className="mt-5"
        >
          <div className="garage-scroll-x -mx-1 overflow-x-auto px-1 pb-1">
            <TabsList className="inline-flex w-max min-w-full justify-start gap-1 bg-[#202027] p-1">
              <TabsTrigger value="chat" className="min-w-20 px-3 text-sm">
                Tanya AI
              </TabsTrigger>
              {canManageAgents && (
                <TabsTrigger value="staff" className="min-w-20 px-3 text-sm">
                  Tim
                </TabsTrigger>
              )}
              {canManageAgents && (
                <TabsTrigger value="actions" className="min-w-20 px-3 text-sm">
                  Approval
                </TabsTrigger>
              )}
              {canManageAgents && (
                <TabsTrigger value="doctor" className="min-w-20 px-3 text-sm">
                  Doctor
                </TabsTrigger>
              )}
              <TabsTrigger value="log" className="min-w-20 px-3 text-sm">
                Riwayat
              </TabsTrigger>
            </TabsList>
          </div>

          {canManageSetup && (
            <TabsContent value="setup" className="mt-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Setup Center</p>
                  <p className="text-xs leading-5 text-[#b8b8bf]">
                    Status satu pintu untuk provider, Knowledge Base, export report, cron, database, dan Auto Fix.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press border-[#4a4a54]"
                    disabled={garageAiHealthLoading}
                    onClick={() => {
                      void loadGarageAiHealth();
                    }}
                  >
                    <RefreshCw
                      className={`mr-2 size-4 ${
                        garageAiHealthLoading ? "animate-spin" : ""
                      }`}
                    />
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press border-[#4a4a54]"
                    disabled={shiftCopilotRunning}
                    onClick={() => void runShiftCopilotManual()}
                  >
                    {shiftCopilotRunning ? (
                      <RefreshCw className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 size-4" />
                    )}
                    Scan pengawasan karyawan
                  </Button>
                  <Button
                    type="button"
                    className="garage-press"
                    disabled={systemDoctorHealing || providerAutoFixing || shiftCopilotRunning}
                    onClick={async () => {
                      await runProviderAutoFix();
                      await runSystemDoctorAutoHeal();
                    }}
                  >
                    {systemDoctorHealing || providerAutoFixing ? (
                      <RefreshCw className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Wrench className="mr-2 size-4" />
                    )}
                    Auto Fix aman
                  </Button>
                </div>
              </div>

              {garageAiHealthError && (
                <Alert className="mb-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Setup Center gagal</AlertTitle>
                  <AlertDescription>{garageAiHealthError}</AlertDescription>
                </Alert>
              )}

              {garageAiHealthLoading && !garageAiHealth ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map((item) => (
                    <Skeleton key={item} className="h-32 rounded-md bg-white/[0.08]" />
                  ))}
                </div>
              ) : garageAiHealth ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          GARAGE AI Health
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                          Update {new Date(garageAiHealth.generatedAt).toLocaleString("id-ID")}.
                        </p>
                      </div>
                      <Badge
                        className={`garage-mono text-[10px] ${
                          statusClass[garageAiHealth.status] ?? statusClass.untested
                        }`}
                      >
                        {garageAiHealth.status}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      {[
                        {
                          label: "Provider ready",
                          value: `${garageAiHealth.providers.ready}/${garageAiHealth.providers.total}`,
                        },
                        {
                          label: "Request AI",
                          value: garageAiHealth.observability.providerRequestCount,
                        },
                        {
                          label: "Fallback",
                          value: garageAiHealth.observability.providerFallbackCount,
                        },
                        {
                          label: "Token",
                          value: garageAiHealth.observability.tokenUsageTotal,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                        >
                          <p className="garage-mono text-[10px] uppercase text-[#8f8f99]">
                            {item.label}
                          </p>
                          <p className="garage-mono mt-1 text-xl font-semibold text-white">
                            {item.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {garageAiHealth.setup.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-md border border-[#34343c] bg-[#15151b] p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {item.label}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#d6d6dc]">
                              {item.detail}
                            </p>
                          </div>
                          <Badge
                            className={`garage-mono shrink-0 text-[10px] ${
                              item.status === "ready"
                                ? statusClass.ready
                                : item.status === "error"
                                  ? statusClass.error
                                  : statusClass.watch
                            }`}
                          >
                            {item.status === "setup" ? "perlu setup" : item.status}
                          </Badge>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-[#b8b8bf]">
                          Next: {item.nextStep}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.id === "provider" && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className="garage-press h-8 border-[#4a4a54] text-xs"
                                onClick={() => setActiveTab("providers")}
                              >
                                Buka Provider
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="garage-press h-8 border-[#4a4a54] text-xs"
                                disabled={providerAutoFixing}
                                onClick={() => void runProviderAutoFix()}
                              >
                                Auto Fix Provider
                              </Button>
                            </>
                          )}
                          {item.id === "knowledge" && (
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-8 border-[#4a4a54] text-xs"
                              onClick={() => {
                                setActiveTab("chat");
                                setChatMode("owner_free_chat");
                              }}
                            >
                              Buka Owner Brain
                            </Button>
                          )}
                          {item.id === "drive" && (
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-8 border-[#4a4a54] text-xs"
                              onClick={() => setActiveTab("agents")}
                            >
                              Buka Export
                            </Button>
                          )}
                          {(item.id === "auto_fix" || item.id === "database") && (
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-8 border-[#4a4a54] text-xs"
                              onClick={() => setActiveTab("doctor")}
                            >
                              Buka Doctor
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                      <p className="text-sm font-semibold text-white">
                        Observability
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {[
                          [
                            "Error rate",
                            `${Math.round(garageAiHealth.observability.providerErrorRate * 100)}%`,
                          ],
                          [
                            "P95 latency",
                            `${garageAiHealth.observability.p95LatencyMs ?? "-"} ms`,
                          ],
                          [
                            "Report generated",
                            garageAiHealth.observability.reportGeneratedCount,
                          ],
                          [
                            "Knowledge upload",
                            garageAiHealth.observability.knowledgeUploadCount,
                          ],
                          [
                            "Auto Fix event",
                            garageAiHealth.observability.autoFixEventCount,
                          ],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="rounded-md border border-[#3a3a42] bg-[#202027] p-2"
                          >
                            <p className="garage-mono text-[10px] text-[#8f8f99]">
                              {label}
                            </p>
                            <p className="garage-mono mt-1 text-sm font-semibold text-white">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                      <p className="text-sm font-semibold text-white">
                        Export & Knowledge
                      </p>
                      <div className="mt-3 space-y-2 text-xs leading-5 text-[#d6d6dc]">
                        <p>
                          Export Excel: aktif untuk download manual dari panel Agents.
                        </p>
                        <p>Google Drive: dinonaktifkan sesuai mode export saja.</p>
                        <p>
                          Knowledge:{" "}
                          {garageAiHealth.knowledgeBase.configured
                            ? garageAiHealth.knowledgeBase.vectorStoreId
                            : "missing"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-[#3a3a42] bg-[#202027] p-4">
                  <p className="text-sm font-semibold text-white">
                    Setup Center belum dimuat.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                    Klik Refresh untuk membaca status GARAGE AI.
                  </p>
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value="chat" className="mt-4">
            <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">Tanya data outlet</p>
                  <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                    Jawaban AI untuk analisa. Pengingat harian tim ada di lonceng header.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="garage-press h-9 shrink-0 border-[#4a4a54] text-xs"
                  onClick={() => setShowAdvancedChat((current) => !current)}
                >
                  {showAdvancedChat ? "Sembunyikan lanjutan" : "Pengaturan lanjutan"}
                </Button>
              </div>

              {showAdvancedChat ? (
              <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(0,1fr)_160px_150px_auto] xl:items-end">
                <label className="block min-w-0 text-xs text-[#b8b8bf]">
                  Role karyawan
                  {canManageAgents ? (
                    <Select
                      value={selectedRoleAgent.role}
                      onValueChange={(value) => {
                        const nextRole = value as Role;
                        const nextAgent = staffRoleAgentFor(nextRole);
                        setSelectedRoleAgentRole(nextRole);
                        if (canUseOwnerFreeChat) {
                          setOwnerChatTool(nextAgent.tool);
                        }
                      }}
                    >
                      <SelectTrigger className="mt-1 h-10 border-[#34343c] bg-white/[0.06]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableRoleAgents.map((agent) => (
                          <SelectItem key={agent.role} value={agent.role}>
                            {agent.role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="mt-1 flex h-10 items-center rounded-md border border-[#34343c] bg-white/[0.04] px-3 text-sm font-semibold text-white">
                      {me.role}
                    </div>
                  )}
                </label>

                <label className="block text-xs text-[#b8b8bf]">
                  Autopilot
                  <Select
                    value={autopilotMode}
                    onValueChange={(value) => setAutopilotMode(value as AiAutopilotMode)}
                  >
                    <SelectTrigger className="mt-1 h-10 border-[#34343c] bg-white/[0.06]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(autopilotModeMeta).map(([mode, meta]) => (
                        <SelectItem key={mode} value={mode}>
                          {meta.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="block text-xs text-[#b8b8bf]">
                  Voice
                  <Select
                    value={voiceMode}
                    onValueChange={(value) => changeVoiceMode(value as AiVoiceMode)}
                  >
                    <SelectTrigger className="mt-1 h-10 border-[#34343c] bg-white/[0.06]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(voiceModeMeta).map(([mode, meta]) => (
                        <SelectItem key={mode} value={mode}>
                          {meta.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={autopilotEnabled ? "default" : "outline"}
                    className="garage-press h-10 border-[#4a4a54] px-3 text-xs"
                    onClick={() => setAutopilotEnabled((current) => !current)}
                  >
                    <Signal className="mr-2 size-4" />
                    {autopilotEnabled ? "Auto aktif" : "Auto kerja"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press size-10 border-[#4a4a54] p-0"
                    title={voiceListening ? "Stop mic" : "Mulai mic"}
                    disabled={!voiceSupport.recognition}
                    onClick={voiceListening ? stopVoiceCapture : startVoiceCapture}
                  >
                    <Mic className={`size-4 ${voiceListening ? "text-[#ffd08a]" : ""}`} />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press size-10 border-[#4a4a54] p-0"
                    title="AI bicara"
                    disabled={!voiceSupport.speech || voiceMode === "mute"}
                    onClick={() =>
                      void voice.announce("autopilot_alert", { force: true })
                    }
                  >
                    <Volume2 className="size-4" />
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-10 border-[#4a4a54] px-3 text-xs"
                      >
                        Detail
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[88vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>{selectedRoleAgent.label}</DialogTitle>
                        <DialogDescription>
                          Role agent mengikuti akses karyawan dan tidak menjalankan aksi
                          kritis tanpa approval.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-3 text-sm leading-6 text-[#d6d6dc]">
                        <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                          <p className="garage-mono text-[11px] text-[#8f8f99]">
                            Scope
                          </p>
                          <p className="mt-1">{selectedRoleAgent.scope}</p>
                        </div>
                        <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                          <p className="garage-mono text-[11px] text-[#8f8f99]">
                            Autopilot
                          </p>
                          <p className="mt-1">{selectedRoleAgent.autopilot}</p>
                        </div>
                        <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                          <p className="garage-mono text-[11px] text-[#8f8f99]">
                            Voice
                          </p>
                          <p className="mt-1">
                            {voiceSupport.recognition || voiceSupport.speech
                              ? voiceStatus
                              : "Browser belum mendukung mic/speech untuk Web Speech API."}
                          </p>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              ) : null}
            </div>

            {canUseOwnerFreeChat && (
              <div className="mt-4 rounded-md border border-[#34343c] bg-[#15151b] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Mode chat</p>
                    <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                      Owner Brain hanya untuk Owner. Operasional POS tetap memakai context role.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-md border border-[#34343c] bg-[#0f0f14] p-1 sm:w-[330px]">
                    {[
                      ["operational", "Operasional POS"],
                      ["owner_free_chat", "Owner Brain"],
                    ].map(([mode, label]) => (
                      <Button
                        key={mode}
                        type="button"
                        variant={chatMode === mode ? "default" : "ghost"}
                        className={`garage-press h-9 px-2 text-xs ${
                          chatMode === mode
                            ? ""
                            : "text-[#b8b8bf] hover:bg-[#202027] hover:text-white"
                        }`}
                        onClick={() => {
                          const nextMode = mode as AiChatMode;
                          setChatMode(nextMode);
                          setError(null);
                          if (nextMode === "owner_free_chat") {
                            setResult(null);
                          }
                        }}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {chatMode !== "owner_free_chat" && (
              <>
                <div className="mt-4 space-y-3">
                  <div className="garage-scroll-x flex gap-2 overflow-x-auto pb-1">
                    {quickPrompts.slice(0, 4).map((item) => (
                      <Button
                        key={item.label}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="garage-press h-9 shrink-0 border-[#4a4a54] text-xs"
                        disabled={pending}
                        onClick={() => void askAgent(item.prompt, "operational")}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>

                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    className="min-h-28 resize-none border-[#34343c] bg-[#111116] text-sm leading-6"
                    placeholder="Contoh: Apa yang harus diprioritaskan di shift ini?"
                  />
                  <Button
                    type="button"
                    className="garage-press h-11 w-full text-sm font-semibold sm:w-auto sm:min-w-[160px]"
                    disabled={pending}
                    onClick={() => void askAgent()}
                  >
                    {pending ? (
                      <RefreshCw className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 size-4" />
                    )}
                    Kirim pertanyaan
                  </Button>
                </div>
              </>
            )}

            {chatMode === "owner_free_chat" && (
              <div className="mt-4 rounded-md border border-[#32323a] bg-[#131419] p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">GARAGE Owner Brain</p>
                    <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                      Analisa owner berbasis data live. Keputusan penting tetap masuk draft dan approval.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="garage-mono border-[#f5a742]/40 bg-[#f5a742]/12 text-[10px] text-[#ffd08a]">
                      Owner only
                    </Badge>
                    {result?.businessFreshness && (
                      <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                        Data update {formatFreshnessTime(result.businessFreshness.generatedAt)}
                      </Badge>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-9 border-[#4a4a54]"
                      onClick={() => setOwnerReviewOpen(true)}
                    >
                      Approval
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-9 border-[#4a4a54]"
                      onClick={() => setOwnerHistoryOpen(true)}
                    >
                      <Clock className="mr-2 size-4" />
                      Riwayat
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-9 border-[#4a4a54]"
                      disabled={pending}
                      onClick={() => {
                        setOwnerChatMessages([createOwnerWelcomeMessage()]);
                        setSelectedOwnerHistoryId(null);
                        setError(null);
                      }}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Bersihkan
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-md border border-[#303038] bg-[#0f1015] p-3">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-semibold text-white">
                          Template Owner
                        </p>
                        <p className="text-[11px] leading-5 text-[#9a9aa3]">
                          Prompt singkat, berbasis data, dan siap dibawakan cepat.
                        </p>
                      </div>
                      <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                        Data + analisa + risiko + saran
                      </Badge>
                    </div>
                    <div className="garage-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                      {ownerCeoQuickPrompts.map((item) => (
                        <Button
                          key={item.label}
                          type="button"
                          variant="outline"
                          className="garage-press h-8 shrink-0 border-[#4a4a54] px-2 text-xs"
                          disabled={pending}
                          onClick={() =>
                            void sendOwnerFreeChat(item.prompt, item.tool)
                          }
                        >
                          {item.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-md border border-[#303038] bg-[#0f1015] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white">
                          Knowledge Base
                        </p>
                        <p className="mt-1 truncate text-[11px] leading-5 text-[#9a9aa3]">
                          {knowledgeLoading
                            ? "Memuat dokumen..."
                            : knowledgeBase?.message ?? "Status belum dimuat."}
                        </p>
                      </div>
                      <Badge
                        className={`garage-mono shrink-0 text-[10px] ${
                          knowledgeBase?.status === "ready"
                            ? statusClass.ready
                            : knowledgeBase?.status === "error"
                              ? statusClass.error
                              : statusClass.watch
                        }`}
                      >
                        {knowledgeBase?.status ?? "pending"}
                      </Badge>
                    </div>
                    {knowledgeError && (
                      <p className="mt-2 rounded-md border border-[#d11a2a]/35 bg-[#d11a2a]/10 px-2 py-1 text-[11px] leading-5 text-[#ffb0b8]">
                        {knowledgeError}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-8 border-[#4a4a54] px-2 text-xs"
                        disabled={knowledgeLoading}
                        onClick={() => void loadKnowledgeBase()}
                      >
                        <RefreshCw
                          className={`mr-2 size-3.5 ${
                            knowledgeLoading ? "animate-spin" : ""
                          }`}
                        />
                        Refresh
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-8 border-[#4a4a54] px-2 text-xs"
                        disabled={ownerKnowledgeUploading}
                        onClick={handleOwnerOfficeUpload}
                      >
                        <Paperclip className="mr-2 size-3.5" />
                        Upload
                      </Button>
                    </div>
                    {knowledgeBase?.files.length ? (
                      <div className="garage-scroll mt-3 max-h-28 space-y-2 overflow-y-auto pr-1">
                        {knowledgeBase.files.slice(0, 5).map((file) => (
                          <div
                            key={file.vectorStoreFileId}
                            className="flex items-center justify-between gap-2 rounded-md border border-[#34343c] bg-[#1b1d24] px-2 py-1.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-semibold text-white">
                                {file.fileName}
                              </p>
                              <p className="garage-mono text-[10px] text-[#8f8f99]">
                                {file.status}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-7 border-[#4a4a54] px-2 text-[10px]"
                              disabled={deletingKnowledgeFile === file.vectorStoreFileId}
                              onClick={() => void deleteKnowledgeFile(file)}
                            >
                              Hapus
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="relative mt-3">
                  <div
                    ref={ownerChatScrollRef}
                    className="garage-scroll max-h-[52vh] min-h-[340px] overflow-y-auto rounded-md border border-[#303038] bg-[#0e0f13] p-3"
                  >
                    <div className="space-y-3">
                      {ownerChatMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${
                            message.role === "user" ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[84%] rounded-md border px-3 py-2.5 shadow-sm sm:max-w-[78%] ${
                              message.role === "user"
                                ? "border-[#8f2f38]/40 bg-[#2a171b] text-[#f7f3f3]"
                                : message.role === "system"
                                  ? "border-[#6f5a34]/45 bg-[#241f15] text-[#f2d89f]"
                                  : "border-[#343640] bg-[#1b1d24] text-[#f4f4f5]"
                            }`}
                          >
                            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                              <Badge
                                className={`garage-mono text-[10px] ${
                                  message.role === "user"
                                    ? "border-[#d11a2a]/45 bg-[#d11a2a]/20 text-[#ffd2d6]"
                                    : statusClass[message.status ?? "ready"] ??
                                      statusClass.untested
                                }`}
                              >
                                {message.role === "user"
                                  ? "Owner"
                                  : message.role === "system"
                                    ? "System"
                                    : "GARAGE AI"}
                              </Badge>
                              <span className="garage-mono text-[10px] text-[#b8b8bf]">
                                {message.time}
                              </span>
                              {message.response?.businessFreshness && (
                                <span className="garage-mono text-[10px] text-[#b8b8bf]">
                                  data {formatFreshnessTime(message.response.businessFreshness.generatedAt)}
                                </span>
                              )}
                            </div>
                            <p className="whitespace-pre-wrap text-[13px] leading-6 text-inherit">
                              {message.content}
                            </p>
                            {message.response?.nextStep && (
                              <p className="mt-2 border-t border-white/10 pt-2 text-xs leading-5 text-[#b8b8bf]">
                                Next: {message.response.nextStep}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}

                      {pending && chatMode === "owner_free_chat" && (
                        <div className="flex justify-start">
                          <div className="max-w-[84%] rounded-md border border-[#343640] bg-[#1b1d24] p-3 text-[#f4f4f5] sm:max-w-[78%]">
                            <div className="mb-2 flex items-center gap-2">
                              <RefreshCw className="size-4 animate-spin text-[#d4d4d8]" />
                              <span className="garage-mono text-[10px] text-[#b8b8bf]">
                                GARAGE AI sedang menjawab
                              </span>
                            </div>
                            <p className="text-[13px] leading-6 text-[#d6d6dc]">
                              Membaca data terbaru, Knowledge Base, dan menyusun jawaban singkat.
                            </p>
                          </div>
                        </div>
                      )}
                      <div ref={ownerChatEndRef} />
                    </div>
                  </div>
                  <ScrollJumpControls
                    targetRef={ownerChatScrollRef}
                    watchKey={`${ownerChatMessages.length}-${pending ? "pending" : "idle"}`}
                  />
                </div>

                <form
                  className="sticky bottom-2 z-10 mt-3 rounded-md border border-[#32323a] bg-[#15161c] p-2 shadow-[0_-10px_32px_rgba(0,0,0,0.32)]"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    void sendOwnerFreeChat();
                  }}
                >
                  <Textarea
                    value={ownerChatInput}
                    onChange={(event) => setOwnerChatInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendOwnerFreeChat();
                      }
                    }}
                    className="min-h-[68px] resize-none border-0 bg-transparent text-[13px] leading-6 text-[#f4f4f5] shadow-none placeholder:text-[#8e8f98] focus-visible:ring-0"
                    placeholder="Tulis instruksi owner. Enter kirim, Shift+Enter baris baru."
                    disabled={pending}
                  />
                  <div className="mt-2 flex flex-col gap-2 border-t border-white/10 pt-2 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-9 border-[#4a4a54] px-2 text-xs text-[#d6d6dc] sm:px-3"
                        disabled={pending || ownerKnowledgeUploading}
                        title="Upload Office"
                        onClick={handleOwnerOfficeUpload}
                      >
                        <Paperclip className="size-4 sm:mr-2" />
                        <span className="hidden sm:inline">Upload</span>
                      </Button>
                      <input
                        ref={ownerKnowledgeInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.docx,.xlsx,.csv,.txt,.md"
                        className="hidden"
                        onChange={(event) =>
                          void uploadOwnerKnowledgeFiles(event.currentTarget.files)
                        }
                      />

                      <DropdownMenu
                        open={ownerToolsMenuOpen}
                        onOpenChange={setOwnerToolsMenuOpen}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="garage-press h-9 border-[#4a4a54] px-3 text-xs"
                          >
                            <Wrench className="mr-2 size-4" />
                            Mode
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-64">
                          <DropdownMenuLabel>Mode jawaban</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => {
                              setChatMode("owner_free_chat");
                              setResult(null);
                              setError(null);
                              setOwnerToolsMenuOpen(false);
                            }}
                          >
                            Owner Brain
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setChatMode("operational");
                              setOwnerToolsMenuOpen(false);
                            }}
                          >
                            Operasional POS
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setOwnerPlanMode((current) => !current);
                              setOwnerToolsMenuOpen(false);
                            }}
                          >
                            <Check className="mr-2 size-4" />
                            {ownerPlanMode ? "Matikan Plan Mode" : "Aktifkan Plan Mode"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Tool</DropdownMenuLabel>
                          {ownerChatTools.map((tool) => (
                            <DropdownMenuItem
                              key={tool.id}
                              onClick={() => handleOwnerToolSelect(tool.id)}
                            >
                              {tool.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                        {ownerPlanMode ? "Plan ON" : selectedOwnerTool.label}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={ownerChatProfile}
                        onValueChange={(value) =>
                          setOwnerChatProfile(value as OwnerChatProfile)
                        }
                      >
                        <SelectTrigger className="h-9 w-[138px] border-[#34343c] bg-[#111116]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ownerChatProfiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press size-9 border-[#4a4a54] p-0"
                        title={voiceListening ? "Stop mic" : "Voice input"}
                        disabled={!voiceSupport.recognition}
                        onClick={voiceListening ? stopVoiceCapture : startVoiceCapture}
                      >
                        <Mic className={`size-4 ${voiceListening ? "text-[#ffd08a]" : ""}`} />
                      </Button>

                      {pending ? (
                        <Button
                          type="button"
                          className="garage-press h-9 w-24"
                          onClick={stopOwnerFreeChat}
                        >
                          <Square className="mr-2 size-4" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          className="garage-press h-9 w-24"
                          disabled={!ownerChatInput.trim()}
                        >
                          <ArrowRight className="mr-2 size-4" />
                          Kirim
                        </Button>
                      )}
                    </div>
                  </div>
                  {ownerKnowledgeUploading && (
                    <div className="mt-2 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 px-3 py-2 text-xs leading-5 text-[#ffd08a]">
                      Upload dan indexing Knowledge Base sedang berjalan.
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#9a9aa3]">
                    <span className="garage-mono">
                      Data update: {formatFreshnessTime(result?.businessFreshness?.generatedAt)}
                    </span>
                    <span className="garage-mono">POS live</span>
                    <span className="garage-mono">
                      {result?.businessFreshness
                        ? result.businessFreshness.knowledgeBaseConfigured
                          ? "Knowledge ready"
                          : "Knowledge belum setup"
                      : "Knowledge status menunggu"}
                    </span>
                  </div>
                </form>

                <Dialog open={ownerHistoryOpen} onOpenChange={setOwnerHistoryOpen}>
                  <DialogContent className="max-h-[88vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Riwayat Owner Brain</DialogTitle>
                      <DialogDescription>
                        Pertanyaan dan jawaban Owner disimpan agar bisa dibuka lagi tanpa mengirim ulang chat panjang.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8e8f98]" />
                          <Input
                            value={ownerHistorySearch}
                            onChange={(event) =>
                              setOwnerHistorySearch(event.target.value)
                            }
                            className="h-10 border-[#34343c] bg-[#111116] pl-9 text-sm"
                            placeholder="Cari pertanyaan atau jawaban"
                          />
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-10 border-[#4a4a54]"
                              disabled={ownerHistoryLoading || !ownerHistoryItems.length}
                            >
                              <Trash2 className="mr-2 size-4" />
                              Hapus semua
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="border-[#34343c] bg-[#111116] text-[#f4f4f5]">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hapus semua riwayat?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Semua riwayat Owner Brain akan dihapus permanen.
                                Chat yang sedang tampil tidak akan dikirim ulang.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-[#4a4a54] bg-transparent text-[#f4f4f5] hover:bg-white/[0.08]">
                                Batal
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-[#d11a2a] text-white hover:bg-[#b51524]"
                                onClick={() => void clearOwnerHistory()}
                              >
                                Hapus semua
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>

                      {ownerHistoryError && (
                        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]">
                          <AlertTriangle className="size-4" />
                          <AlertTitle>Riwayat gagal</AlertTitle>
                          <AlertDescription>{ownerHistoryError}</AlertDescription>
                        </Alert>
                      )}

                      <div className="relative">
                        <div
                          ref={ownerHistoryScrollRef}
                          className="garage-scroll max-h-[52vh] space-y-2 overflow-y-auto pr-1"
                        >
                          {ownerHistoryLoading ? (
                            <div className="rounded-md border border-[#34343c] bg-[#202027] p-3 text-sm text-[#b8b8bf]">
                              Memuat riwayat...
                            </div>
                          ) : ownerHistoryItems.length ? (
                            ownerHistoryItems.map((record) => (
                              <div
                                key={record.id}
                                className="rounded-md border border-[#34343c] bg-[#1b1d24] p-3"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <button
                                    type="button"
                                    className="min-w-0 flex-1 text-left"
                                    onClick={() => openOwnerHistory(record)}
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                        {formatFreshnessTime(record.createdAt)}
                                      </Badge>
                                      {record.provider && (
                                        <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                          {record.provider}
                                        </Badge>
                                      )}
                                      {record.tokenUsage?.totalTokens && (
                                        <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                          {record.tokenUsage.totalTokens} token
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-white">
                                      {record.prompt}
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#b8b8bf]">
                                      {record.response}
                                    </p>
                                  </button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="garage-press h-9 border-[#4a4a54] px-3"
                                      >
                                        <Trash2 className="mr-2 size-4" />
                                        Hapus
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="border-[#34343c] bg-[#111116] text-[#f4f4f5]">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Hapus riwayat ini?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          Item riwayat Owner Brain ini akan dihapus permanen dari daftar history.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel className="border-[#4a4a54] bg-transparent text-[#f4f4f5] hover:bg-white/[0.08]">
                                          Batal
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          className="bg-[#d11a2a] text-white hover:bg-[#b51524]"
                                          onClick={() => void deleteOwnerHistory(record.id)}
                                        >
                                          Hapus
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-md border border-[#34343c] bg-[#202027] p-3 text-sm text-[#b8b8bf]">
                              Belum ada riwayat Owner Brain.
                            </div>
                          )}
                        </div>
                        <ScrollJumpControls
                          targetRef={ownerHistoryScrollRef}
                          watchKey={`${ownerHistoryItems.length}-${ownerHistoryLoading ? "loading" : "idle"}`}
                        />
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={ownerReviewOpen} onOpenChange={setOwnerReviewOpen}>
                  <DialogContent className="max-h-[88vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-xl">
                    <DialogHeader>
                      <DialogTitle>Approval Owner</DialogTitle>
                      <DialogDescription>
                        Ringkasan response terakhir, data source, freshness, draft action, agent, dan provider.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                        <p className="garage-mono text-[11px] text-[#b8b8bf]">
                          Response terakhir
                        </p>
                        {result ? (
                          <div className="mt-2 space-y-2 text-sm leading-6 text-[#d6d6dc]">
                            <p>{result.response}</p>
                            <div className="flex flex-wrap gap-2">
                              {[
                                result.providerUsed,
                                result.modelUsed,
                                result.profile,
                                result.dataAccessLevel,
                                result.riskLevel,
                              ]
                                .filter(Boolean)
                                .map((item) => (
                                  <Badge
                                    key={item}
                                    className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]"
                                  >
                                    {item}
                                  </Badge>
                                ))}
                              {typeof result.latencyMs === "number" && (
                                <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                  {result.latencyMs} ms
                                </Badge>
                              )}
                              {result.tokenUsage?.totalTokens && (
                                <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                  {result.tokenUsage.totalTokens} token
                                </Badge>
                              )}
                              {(result.requiresApproval || result.requiresHumanApproval) && (
                                <Badge className="garage-mono border-[#f5a742]/45 bg-[#f5a742]/14 text-[10px] text-[#ffd08a]">
                                  perlu approval
                                </Badge>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-[#b8b8bf]">
                            Belum ada response terakhir.
                          </p>
                        )}
                      </div>

                      <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                        <p className="garage-mono text-[11px] text-[#b8b8bf]">
                          Sumber data & freshness
                        </p>
                        {result?.businessFreshness ? (
                          <div className="mt-2 space-y-2 text-sm leading-6 text-[#d6d6dc]">
                            <div className="flex flex-wrap gap-2">
                              <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                updated {formatFreshnessTime(result.businessFreshness.generatedAt)}
                              </Badge>
                              <Badge
                                className={`garage-mono text-[10px] ${
                                  result.businessFreshness.knowledgeBaseConfigured
                                    ? statusClass.ready
                                    : statusClass.watch
                                }`}
                              >
                                {result.businessFreshness.knowledgeBaseConfigured
                                  ? "knowledge ready"
                                  : "knowledge missing"}
                              </Badge>
                              {result.businessFreshness.lastAgentRunAt && (
                                <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                  last AI {formatFreshnessTime(result.businessFreshness.lastAgentRunAt)}
                                </Badge>
                              )}
                              {result.businessFreshness.lastReportGeneratedAt && (
                                <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                  last report {result.businessFreshness.lastReportGeneratedAt}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs leading-5 text-[#b8b8bf]">
                              Sources: {result.businessFreshness.dataSourcesUsed.join(", ")}
                            </p>
                            {result.businessFreshness.staleSources.length > 0 && (
                              <p className="text-xs leading-5 text-[#ffd08a]">
                                Attention: {result.businessFreshness.staleSources.join(", ")}
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-[#b8b8bf]">
                            Belum ada metadata data terbaru.
                          </p>
                        )}
                      </div>

                      <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                        <p className="garage-mono text-[11px] text-[#b8b8bf]">
                          Draft action
                        </p>
                        <div className="mt-2 space-y-2">
                          {(result?.actionDrafts?.length
                            ? result.actionDrafts
                            : actions.slice(0, 3)
                          ).length ? (
                            (result?.actionDrafts?.length
                              ? result.actionDrafts
                              : actions.slice(0, 3)
                            ).map((draft, index) => (
                              <div
                                key={`${draft.title}-${index}`}
                                className="rounded-md border border-[#3a3a42] bg-[#15151b] p-2"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    className={`garage-mono text-[10px] ${
                                      statusClass[aiDraftRisk(draft)] ??
                                      statusClass.untested
                                    }`}
                                  >
                                    {aiDraftRisk(draft)}
                                  </Badge>
                                  {aiDraftNeedsApproval(draft) && (
                                    <Badge className="garage-mono border-[#f5a742]/45 bg-[#f5a742]/14 text-[10px] text-[#ffd08a]">
                                      approval
                                    </Badge>
                                  )}
                                </div>
                                <p className="mt-2 text-sm font-semibold text-white">
                                  {draft.title}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                                  {draft.detail}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-[#b8b8bf]">
                              Belum ada action draft.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                        <p className="garage-mono text-[11px] text-[#b8b8bf]">
                          Agent dipakai
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {result?.agentsUsed?.length ? (
                            result.agentsUsed.map((agentId) => (
                              <Badge
                                key={agentId}
                                className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]"
                              >
                                {agentId}
                              </Badge>
                            ))
                          ) : (
                            <p className="text-sm text-[#b8b8bf]">
                              Belum ada agent activity pada response terakhir.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            {pending && (
              <div className="mt-4 rounded-md border border-[#34343c] bg-[#202027] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">GARAGE AI processing</p>
                    <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                      {chatMode === "owner_free_chat"
                        ? "Server memvalidasi Owner, mengambil context bisnis terbaru, lalu memanggil provider."
                        : "Context dikirim sesuai intent dan role aktif."}
                    </p>
                  </div>
                  <Badge className="garage-mono w-fit border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                    step {activeStep + 1}/{progressSteps.length}
                  </Badge>
                </div>
                <Progress
                  value={((activeStep + 1) / progressSteps.length) * 100}
                  className="mt-3 h-2"
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-5">
                  {progressSteps.map((step, index) => (
                    <div
                      key={step}
                      className={`rounded-md border p-2 text-xs leading-5 ${
                        index <= activeStep
                          ? "border-[#d4d4d8]/35 bg-[#d4d4d8]/10 text-[#f4f4f5]"
                          : "border-[#3a3a42] bg-[#15151b] text-[#8f8f99]"
                      }`}
                    >
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <Alert className="mt-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>AI belum tersedia</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {result && chatMode !== "owner_free_chat" && (
              <div className="mt-4 rounded-md border border-[#34343c] bg-[#202027] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge className={`${statusClass[result.urgency] ?? statusClass.watch}`}>
                        {result.urgency}
                      </Badge>
                      <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                        confidence {Math.round(result.confidence * 100)}%
                      </Badge>
                      {result.contextIntent && (
                        <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                          {result.contextIntent}
                        </Badge>
                      )}
                      {result.profile && (
                        <Badge
                          className={`garage-mono text-[10px] ${
                            statusClass[result.profile] ?? statusClass.untested
                          }`}
                        >
                          {result.profile}
                        </Badge>
                      )}
                      {result.mode && (
                        <Badge
                          className={`garage-mono text-[10px] ${
                            statusClass[result.mode] ?? statusClass.untested
                          }`}
                        >
                          {result.mode === "owner_free_chat"
                            ? "Owner Brain"
                            : "operasional POS"}
                        </Badge>
                      )}
                      {result.dataAccessLevel && (
                        <Badge
                          className={`garage-mono text-[10px] ${
                            statusClass[result.dataAccessLevel] ?? statusClass.untested
                          }`}
                        >
                          {result.dataAccessLevel}
                        </Badge>
                      )}
                      {result.riskLevel && (
                        <Badge
                          className={`garage-mono text-[10px] ${
                            statusClass[result.riskLevel] ?? statusClass.untested
                          }`}
                        >
                          risk {result.riskLevel}
                        </Badge>
                      )}
                      {result.approvalStatus && (
                        <Badge
                          className={`garage-mono text-[10px] ${
                            statusClass[result.approvalStatus] ?? statusClass.untested
                          }`}
                        >
                          {result.approvalStatus}
                        </Badge>
                      )}
                      {result.providerUsed && (
                        <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                          {result.providerUsed}
                        </Badge>
                      )}
                      {result.runId && (
                        <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                          run {result.runId.slice(0, 8)}
                        </Badge>
                      )}
                      {typeof result.latencyMs === "number" && (
                        <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                          {result.latencyMs} ms
                        </Badge>
                      )}
                      {result.fallbackUsed && (
                        <Badge className="garage-mono border-[#f5a742]/45 bg-[#f5a742]/14 text-[10px] text-[#ffd08a]">
                          fallback
                        </Badge>
                      )}
                      {(result.requiresApproval || result.requiresHumanApproval) && (
                        <Badge className="garage-mono border-[#f5a742]/45 bg-[#f5a742]/14 text-[10px] text-[#ffd08a]">
                          approval required
                        </Badge>
                      )}
                      {result.tokenUsage?.totalTokens && (
                        <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                          {result.tokenUsage.totalTokens} token
                        </Badge>
                      )}
                    </div>
                    <p className="mt-3 text-base leading-7 text-white">{result.response}</p>
                    {result.modelUsed && (
                      <p className="garage-mono mt-2 break-words text-[11px] text-[#b8b8bf]">
                        model {result.modelUsed}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-md border border-[#3a3a42] bg-[#15151b] p-3">
                    <p className="garage-mono text-[11px] text-[#b8b8bf]">Warnings</p>
                    <div className="mt-2 space-y-2">
                      {result.operationalWarnings.length ? (
                        result.operationalWarnings.map((warning) => (
                          <p key={warning} className="text-sm leading-6 text-[#ffd08a]">
                            {warning}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-[#d6d6dc]">Tidak ada warning kritis.</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border border-[#3a3a42] bg-[#15151b] p-3">
                    <p className="garage-mono text-[11px] text-[#b8b8bf]">Actions</p>
                    <div className="mt-2 space-y-2">
                      {result.suggestedActions.length ? (
                        result.suggestedActions.map((action) => (
                          <p key={action} className="text-sm leading-6 text-[#d6d6dc]">
                            {action}
                          </p>
                        ))
                      ) : (
                        <p className="text-sm text-[#d6d6dc]">Belum ada action lanjutan.</p>
                      )}
                    </div>
                  </div>
                </div>

                {(result.agentsUsed?.length || result.agentPlan?.length) ? (
                  <div className="mt-3 rounded-md border border-[#3a3a42] bg-[#15151b] p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="garage-mono text-[11px] text-[#b8b8bf]">
                          Agent Activity
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#d6d6dc]">
                          Supervisor memilih sub-agent dan approval gate untuk request ini.
                        </p>
                      </div>
                      <Badge className="garage-mono border-[#f5a742]/45 bg-[#f5a742]/14 text-[10px] text-[#ffd08a]">
                        controlled
                      </Badge>
                    </div>
                    {result.agentsUsed?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {result.agentsUsed.map((agent) => (
                          <Badge
                            key={agent}
                            className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]"
                          >
                            {agent}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {result.agentPlan?.length ? (
                      <div className="mt-3 grid gap-2 lg:grid-cols-2">
                        {result.agentPlan.map((step) => (
                          <div
                            key={`${step.agentId}-${step.title}`}
                            className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                {step.agentId}
                              </Badge>
                              <Badge
                                className={`garage-mono text-[10px] ${
                                  statusClass[step.status] ?? statusClass.untested
                                }`}
                              >
                                {step.status}
                              </Badge>
                            </div>
                            <p className="mt-2 text-sm font-semibold leading-5 text-white">
                              {step.title}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#d6d6dc]">
                              {step.detail}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {result.handoffs?.length ? (
                      <div className="mt-3 space-y-2">
                        {result.handoffs.map((handoff) => (
                          <p
                            key={`${handoff.from}-${handoff.to}-${handoff.reason}`}
                            className="text-xs leading-5 text-[#b8b8bf]"
                          >
                            {handoff.from} {"->"} {handoff.to}: {handoff.reason}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {result.actionDrafts?.length ? (
                  <div className="mt-3 rounded-md border border-[#3a3a42] bg-[#15151b] p-3">
                    <p className="garage-mono text-[11px] text-[#b8b8bf]">
                      Action drafts
                    </p>
                    <div className="mt-2 grid gap-2 lg:grid-cols-2">
                      {result.actionDrafts.map((draft) => (
                        <div
                          key={draft.id ?? `${draft.type}-${draft.title}`}
                          className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                              {draft.actionType ?? draft.type}
                            </Badge>
                            <Badge
                              className={`garage-mono text-[10px] ${
                                statusClass[draft.riskLevel ?? draft.risk] ?? statusClass.watch
                              }`}
                            >
                              {draft.riskLevel ?? draft.risk}
                            </Badge>
                            {draft.safetyLevel && (
                              <Badge
                                className={`garage-mono text-[10px] ${
                                  statusClass[draft.safetyLevel] ?? statusClass.untested
                                }`}
                              >
                                {draft.safetyLevel}
                              </Badge>
                            )}
                            {draft.approvalStatus && (
                              <Badge
                                className={`garage-mono text-[10px] ${
                                  statusClass[draft.approvalStatus] ?? statusClass.untested
                                }`}
                              >
                                {draft.approvalStatus}
                              </Badge>
                            )}
                            {draft.approvalRequired && (
                              <Badge className="garage-mono border-[#f5a742]/45 bg-[#f5a742]/14 text-[10px] text-[#ffd08a]">
                                approval
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 text-sm font-semibold leading-5 text-white">
                            {draft.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#d6d6dc]">
                            {draft.detail}
                          </p>
                          {draft.id && canManageAgents && (
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press mt-3 h-8 border-[#4a4a54] text-xs"
                              onClick={() => {
                                setActiveTab("actions");
                                void loadActions();
                              }}
                            >
                              Review gate
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 rounded-md border border-[#3a3a42] bg-[#15151b] p-3">
                  <p className="garage-mono text-[11px] text-[#b8b8bf]">Next step</p>
                  <p className="mt-2 text-sm leading-6 text-[#f4f4f5]">{result.nextStep}</p>
                </div>
              </div>
            )}
          </TabsContent>

          {canManageAgents && (
            <TabsContent value="agents" className="mt-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Agents</p>
                  <p className="text-xs leading-5 text-[#b8b8bf]">
                    Control ringkas untuk sub-agent GARAGE AI.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press border-[#4a4a54]"
                    disabled={agentsLoading || jobsStatusLoading}
                    onClick={() => {
                      void loadAgents();
                      void loadJobsStatus();
                    }}
                  >
                    <RefreshCw
                      className={`mr-2 size-4 ${
                        agentsLoading || jobsStatusLoading ? "animate-spin" : ""
                      }`}
                    />
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    className="garage-press"
                    disabled={savingAgents || agentsLoading || !agents.length}
                    onClick={() => void saveAgents()}
                  >
                    {savingAgents && <RefreshCw className="mr-2 size-4 animate-spin" />}
                    Simpan
                  </Button>
                </div>
              </div>

              {agentsError && (
                <Alert className="mb-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Agent config error</AlertTitle>
                  <AlertDescription>{agentsError}</AlertDescription>
                </Alert>
              )}

              {agentReportError && (
                <Alert className="mb-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Laporan agent gagal</AlertTitle>
                  <AlertDescription>{agentReportError}</AlertDescription>
                </Alert>
              )}

              {jobsStatusError && (
                <Alert className="mb-4 border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Status otomatis belum lengkap</AlertTitle>
                  <AlertDescription>{jobsStatusError}</AlertDescription>
                </Alert>
              )}

              <div className="mb-4 rounded-md border border-[#34343c] bg-[#15151b] p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      Master Excel Report
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                      Penjualan, finance, stok, kitchen, approval, dan GARAGE AI.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[150px_180px_auto_auto] sm:items-end">
                    <label className="block text-xs text-[#b8b8bf]">
                      Periode
                      <Select
                        value={agentReportPeriod}
                        onValueChange={(value) =>
                          changeAgentReportPeriod(value as AiAgentReportPeriod)
                        }
                      >
                        <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.06]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Harian</SelectItem>
                          <SelectItem value="monthly">Bulanan</SelectItem>
                          <SelectItem value="yearly">Tahunan</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="block text-xs text-[#b8b8bf]">
                      {agentReportDateLabel(agentReportPeriod)}
                      <Input
                        type={agentReportInputType(agentReportPeriod)}
                        min={agentReportPeriod === "yearly" ? "2020" : undefined}
                        max={agentReportPeriod === "yearly" ? "2100" : undefined}
                        value={agentReportDate}
                        onChange={(event) => setAgentReportDate(event.target.value)}
                        className="mt-1 border-[#34343c] bg-white/[0.06]"
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press border-[#4a4a54]"
                      disabled={agentReportLoading || !agentReportDate}
                      onClick={downloadAgentReport}
                    >
                      <ReceiptText className="mr-2 size-4" />
                      Export Excel
                    </Button>
                  </div>
                </div>
                <p className="mt-2 rounded-md border border-[#3a3a42] bg-[#202027]/72 px-3 py-2 text-xs leading-5 text-[#d6d6dc]">
                  Mode laporan saat ini: export/download Excel manual. Google Drive
                  dinonaktifkan.
                </p>
              </div>

              {agentReport && (
                <div className="mb-4 rounded-md border border-[#3a3a42] bg-[#202027] p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {agentReport.fileName}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                        {agentReport.periodLabel} - {agentReport.drive.message}
                      </p>
                      <p className="garage-mono mt-2 text-[11px] text-[#8f8f99]">
                        orders {agentReport.rowCounts.orders} / payments{" "}
                        {agentReport.rowCounts.payments} / stock{" "}
                        {agentReport.rowCounts.inventory} / ai runs{" "}
                        {agentReport.rowCounts.runs}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-8 border-[#4a4a54] text-xs"
                        onClick={() =>
                          window.open(
                            agentReport.downloadUrl,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4 rounded-md border border-[#34343c] bg-[#15151b] p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Otomatisasi laporan
                    </p>
                    <p className="text-xs leading-5 text-[#b8b8bf]">
                      Status export, cron, dan retensi log.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-8 border-[#4a4a54] text-xs"
                    disabled={jobsStatusLoading}
                    onClick={() => void loadJobsStatus()}
                  >
                    <RefreshCw
                      className={`mr-2 size-3.5 ${
                        jobsStatusLoading ? "animate-spin" : ""
                      }`}
                    />
                    Cek status
                  </Button>
                </div>
                {jobsStatusLoading && !jobsStatus ? (
                  <div className="grid gap-2 md:grid-cols-4">
                    {[1, 2, 3, 4].map((item) => (
                      <Skeleton key={item} className="h-24 rounded-md bg-white/[0.08]" />
                    ))}
                  </div>
                ) : jobsStatus ? (
                  <div className="grid gap-2 md:grid-cols-4">
                    {[
                      {
                        label: "Export report",
                        value: "Manual",
                        detail: "Download Excel dari panel laporan",
                        ready: true,
                        readyLabel: "ready",
                      },
                      {
                        label: "Cron secret",
                        value: jobsStatus.auth.configured ? "Configured" : "Missing",
                        detail: "GARAGE_JOB_SECRET / CRON_SECRET",
                        ready: jobsStatus.auth.configured,
                        readyLabel: jobsStatus.auth.configured ? "ready" : "missing",
                      },
                      {
                        label: "Cleanup log",
                        value: jobsStatus.cleanup.localTimeLabel,
                        detail: `retensi ${jobsStatus.cleanup.retentionDays} hari`,
                        ready: jobsStatus.auth.configured,
                        readyLabel: jobsStatus.auth.configured ? "ready" : "manual",
                      },
                      {
                        label: "System Doctor",
                        value: jobsStatus.doctor.localTimeLabel,
                        detail: jobsStatus.doctor.path,
                        ready: jobsStatus.auth.configured,
                        readyLabel: jobsStatus.auth.configured ? "auto" : "manual",
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="garage-mono text-[11px] text-[#8f8f99]">
                            {item.label}
                          </p>
                          <Badge
                            className={`garage-mono text-[10px] ${
                              item.ready ? statusClass.ready : statusClass.watch
                            }`}
                          >
                            {item.readyLabel}
                          </Badge>
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold text-white">
                          {item.value}
                        </p>
                        <p className="mt-1 truncate text-xs text-[#b8b8bf]">
                          {item.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-[#b8b8bf]">
                    Klik cek status untuk memuat konfigurasi otomatis.
                  </p>
                )}
              </div>

              {agentsLoading && !agents.length ? (
                <div className="garage-scroll max-h-[56vh] space-y-2 overflow-y-auto pr-1">
                  {[1, 2, 3, 4, 5, 6].map((item) => (
                    <Skeleton key={item} className="h-28 rounded-md bg-white/[0.08]" />
                  ))}
                </div>
              ) : !agents.length ? (
                <div className="rounded-md border border-[#3a3a42] bg-[#202027] p-4">
                  <p className="text-sm font-semibold text-white">Agent belum tersedia.</p>
                  <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                    Refresh untuk memuat konfigurasi agent dari database.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-4">
                    {[
                      { label: "Total", value: agents.length },
                      { label: "Aktif", value: activeAgentCount },
                      { label: "Controlled", value: controlledAgentCount },
                      { label: "High risk", value: highRiskAgentCount },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                      >
                        <p className="garage-mono text-[11px] text-[#8f8f99]">
                          {item.label}
                        </p>
                        <p className="garage-mono mt-1 text-2xl font-bold text-white">
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">Daftar agent</p>
                      <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                        {activeAgentCount}/{agents.length} aktif
                      </Badge>
                    </div>
                    <div className="garage-scroll max-h-[56vh] space-y-2 overflow-y-auto pr-1">
                      {agents.map((agent) => (
                        <div
                          key={agent.agentId}
                          className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                        >
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0 xl:max-w-[340px] xl:flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {agent.label}
                                  </p>
                                  <p className="garage-mono mt-1 truncate text-[11px] text-[#8f8f99]">
                                    {agent.agentId}
                                  </p>
                                </div>
                                <span
                                  className={`mt-1 size-2.5 shrink-0 rounded-full ${
                                    agent.enabled ? "bg-emerald-300" : "bg-[#ff4d5a]"
                                  }`}
                                />
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <Badge
                                  className={`garage-mono text-[10px] ${
                                    agent.enabled ? statusClass.ready : statusClass.rejected
                                  }`}
                                >
                                  {agent.enabled ? "aktif" : "nonaktif"}
                                </Badge>
                                <Badge
                                  className={`garage-mono text-[10px] ${
                                    statusClass[agent.autonomyMode] ?? statusClass.untested
                                  }`}
                                >
                                  {agent.autonomyMode}
                                </Badge>
                                <Badge
                                  className={`garage-mono text-[10px] ${
                                    statusClass[agent.maxRiskLevel] ?? statusClass.untested
                                  }`}
                                >
                                  max {agent.maxRiskLevel}
                                </Badge>
                              </div>
                            </div>

                            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:w-[380px]">
                              <label className="block text-xs text-[#b8b8bf]">
                                Autonomy
                                <Select
                                  value={agent.autonomyMode}
                                  onValueChange={(value) =>
                                    updateAgent(agent.agentId, {
                                      autonomyMode: value as AiAutonomyMode,
                                    })
                                  }
                                >
                                  <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.06]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="read_only">Read-only</SelectItem>
                                    <SelectItem value="draft">Draft</SelectItem>
                                    <SelectItem value="controlled">Controlled</SelectItem>
                                  </SelectContent>
                                </Select>
                              </label>
                              <label className="block text-xs text-[#b8b8bf]">
                                Max risk
                                <Select
                                  value={agent.maxRiskLevel}
                                  onValueChange={(value) =>
                                    updateAgent(agent.agentId, {
                                      maxRiskLevel: value as AiRiskLevel,
                                    })
                                  }
                                >
                                  <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.06]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                  </SelectContent>
                                </Select>
                              </label>
                            </div>

                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:w-[220px] xl:justify-end">
                              <label className="flex items-center gap-2 text-xs font-semibold text-white">
                                <input
                                  type="checkbox"
                                  checked={agent.enabled}
                                  onChange={(event) =>
                                    updateAgent(agent.agentId, {
                                      enabled: event.target.checked,
                                    })
                                  }
                                  className="size-4 accent-[#d11a2a]"
                                />
                                Aktif
                              </label>
                              <AgentStatusPopup
                                agent={agent}
                                triggerLabel="Keterangan"
                                className="h-8 text-xs sm:w-36"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3">
                      <p className="garage-mono text-[11px] text-[#8f8f99]">
                        Tersimpan di ai_agent_configs.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          )}

          {canManageAgents && (
            <TabsContent value="staff" className="mt-4">
              <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    Staff AI Monitor
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                    Pantau role karyawan dari signal AI yang sudah ada. MVP ini
                    membaca draft, log, doctor, dan jobs tanpa schema/API baru.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    value={staffMonitorFilter}
                    onValueChange={(value) =>
                      setStaffMonitorFilter(value as StaffMonitorFilter)
                    }
                  >
                    <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06] sm:w-[170px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {staffMonitorFilterOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-10 border-[#4a4a54]"
                    disabled={actionLoading || systemDoctorLoading || jobsStatusLoading}
                    onClick={() => {
                      void loadActions();
                      void loadSystemDoctor();
                      void loadJobsStatus();
                      void loadPersistedLogs();
                    }}
                  >
                    <RefreshCw
                      className={`mr-2 size-4 ${
                        actionLoading || systemDoctorLoading || jobsStatusLoading
                          ? "animate-spin"
                          : ""
                      }`}
                    />
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-10 border-[#4a4a54]"
                    disabled={!voiceSupport.speech || voiceMode === "mute"}
                    onClick={() =>
                      void voice.announce("staff_monitor", { force: true })
                    }
                  >
                    <Volume2 className="mr-2 size-4" />
                    Bicara
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ["Ready", staffMonitorSummary.ready, "ready"],
                  ["Watch", staffMonitorSummary.watch, "watch"],
                  ["Critical", staffMonitorSummary.critical, "critical"],
                  ["Draft", staffMonitorSummary.pendingDrafts, "draft"],
                ].map(([label, value, status]) => (
                  <div
                    key={label}
                    className="rounded-md border border-[#34343c] bg-[#15151b] p-3"
                  >
                    <p className="garage-mono text-[10px] uppercase text-[#8f8f99]">
                      {label}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-2xl font-semibold text-white">{value}</p>
                      <Badge
                        className={`garage-mono text-[10px] ${
                          statusClass[String(status)] ?? statusClass.untested
                        }`}
                      >
                        {status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-md border border-[#34343c] bg-[#15151b] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Role karyawan aktif
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                      {staffMonitorFilter === "all"
                        ? "Semua role ditampilkan."
                        : staffMonitorGroupMeta[staffMonitorFilter].detail}
                    </p>
                  </div>
                  <Badge className="garage-mono w-fit border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                    {filteredStaffMonitorItems.length} role
                  </Badge>
                </div>

                <div className="garage-scroll-x -mx-1 mt-3 flex gap-3 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-3">
                  {filteredStaffMonitorItems.map((item) => (
                    <div
                      key={item.role}
                      className="min-w-[284px] rounded-md border border-[#303038] bg-[#0f1015] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              className={`garage-mono text-[10px] ${
                                statusClass[item.status] ?? statusClass.untested
                              }`}
                            >
                              {item.status}
                            </Badge>
                            <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                              {staffMonitorGroupMeta[item.group].label}
                            </Badge>
                          </div>
                          <p className="mt-2 truncate text-sm font-semibold text-white">
                            {item.label}
                          </p>
                          <p className="garage-mono mt-1 text-[10px] text-[#8f8f99]">
                            {item.role}
                          </p>
                        </div>
                        <Users className="size-4 shrink-0 text-[#d4d4d8]" />
                      </div>

                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#d6d6dc]">
                        {item.summary}
                      </p>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          ["Score", item.score],
                          ["Draft", item.pendingDrafts],
                          ["Signal", item.signalCount],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-md border border-[#303038] bg-[#171820] p-2"
                          >
                            <p className="garage-mono text-[9px] text-[#8f8f99]">
                              {label}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-white">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 rounded-md border border-[#303038] bg-[#171820] p-2">
                        <p className="garage-mono text-[10px] text-[#8f8f99]">
                          Last signal
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#d6d6dc]">
                          {item.lastSignal}
                        </p>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="garage-press h-8 border-[#4a4a54] px-2 text-xs"
                          onClick={() => activateStaffMonitorRole(item)}
                        >
                          Pakai role
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="garage-press h-8 border-[#4a4a54] px-2 text-xs"
                          disabled={!voiceSupport.speech || voiceMode === "mute"}
                          onClick={() => speakStaffMonitor()}
                        >
                          <Volume2 className="mr-2 size-3.5" />
                          Voice
                        </Button>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="garage-press h-8 border-[#4a4a54] px-2 text-xs"
                            >
                              Detail
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-h-[88vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>{item.label}</DialogTitle>
                              <DialogDescription>
                                Monitor role {item.role}. Detail ini hanya membaca signal
                                dan menyiapkan draft kerja aman.
                              </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-3 pb-16">
                              <div className="grid gap-2 sm:grid-cols-4">
                                {[
                                  ["Status", item.status],
                                  ["Score", item.score],
                                  ["Draft", item.pendingDrafts],
                                  ["Critical", item.criticalDrafts],
                                ].map(([label, value]) => (
                                  <div
                                    key={label}
                                    className="rounded-md border border-[#34343c] bg-[#202027] p-3"
                                  >
                                    <p className="garage-mono text-[10px] text-[#8f8f99]">
                                      {label}
                                    </p>
                                    <p className="mt-1 text-sm font-semibold text-white">
                                      {value}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                                <p className="garage-mono text-[11px] text-[#8f8f99]">
                                  Focus
                                </p>
                                <p className="mt-2 text-sm leading-6 text-[#d6d6dc]">
                                  {item.agent.focus}
                                </p>
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                                  <p className="text-sm font-semibold text-white">
                                    Risiko aktif
                                  </p>
                                  <div className="mt-2 space-y-2">
                                    {item.risks.map((risk) => (
                                      <p
                                        key={risk}
                                        className="text-xs leading-5 text-[#d6d6dc]"
                                      >
                                        {risk}
                                      </p>
                                    ))}
                                  </div>
                                </div>

                                <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                                  <p className="text-sm font-semibold text-white">
                                    Next action
                                  </p>
                                  <div className="mt-2 space-y-2">
                                    {item.nextActions.map((action) => (
                                      <p
                                        key={action}
                                        className="text-xs leading-5 text-[#d6d6dc]"
                                      >
                                        {action}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                                <p className="text-sm font-semibold text-white">
                                  Draft terkait
                                </p>
                                <div className="garage-scroll mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                                  {item.drafts.length ? (
                                    item.drafts.map((draft) => (
                                      <div
                                        key={draft.id}
                                        className="rounded-md border border-[#303038] bg-[#15151b]/90 p-2"
                                      >
                                        <div className="flex flex-wrap gap-2">
                                          <Badge
                                            className={`garage-mono text-[10px] ${
                                              statusClass[draft.riskLevel] ??
                                              statusClass.untested
                                            }`}
                                          >
                                            {draft.riskLevel}
                                          </Badge>
                                          <Badge
                                            className={`garage-mono text-[10px] ${
                                              statusClass[draft.safetyLevel] ??
                                              statusClass.untested
                                            }`}
                                          >
                                            {draft.safetyLevel}
                                          </Badge>
                                        </div>
                                        <p className="mt-2 text-xs font-semibold text-white">
                                          {draft.title}
                                        </p>
                                        <p className="mt-1 text-[11px] leading-5 text-[#b8b8bf]">
                                          {draft.detail}
                                        </p>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-xs leading-5 text-[#b8b8bf]">
                                      Belum ada draft action untuk role ini.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col gap-2 border-t border-[#34343c] bg-[#111116] px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <p className="text-[11px] leading-5 text-[#9a9aa3]">
                                Voice dan role prompt tetap mengikuti guardrail approval.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="garage-press h-9 border-[#4a4a54]"
                                  disabled={!voiceSupport.speech || voiceMode === "mute"}
                                  onClick={() => speakStaffMonitor()}
                                >
                                  <Volume2 className="mr-2 size-4" />
                                  Bicara
                                </Button>
                                <Button
                                  type="button"
                                  className="garage-press h-9"
                                  onClick={() => activateStaffMonitorRole(item)}
                                >
                                  Pakai role
                                </Button>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          )}

          {canManageAgents && (
            <TabsContent value="actions" className="mt-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Action Drafts</p>
                  <p className="text-xs leading-5 text-[#b8b8bf]">
                    Draft critical menunggu approval manusia dan belum dieksekusi.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press border-[#4a4a54]"
                  disabled={actionLoading}
                  onClick={() => void loadActions()}
                >
                  <RefreshCw
                    className={`mr-2 size-4 ${actionLoading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
              </div>

              {actionError && (
                <Alert className="mb-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Action gate error</AlertTitle>
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              )}

              {actionLoading && !actions.length ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-32 rounded-md bg-white/[0.08]" />
                  ))}
                </div>
              ) : actions.length ? (
                <div className="space-y-3">
                  {actions.map((action) => (
                    <div
                      key={action.id}
                      className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-2">
                            <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                              {action.actionType}
                            </Badge>
                            <Badge
                              className={`garage-mono text-[10px] ${
                                statusClass[action.safetyLevel] ?? statusClass.untested
                              }`}
                            >
                              {action.safetyLevel}
                            </Badge>
                            <Badge
                              className={`garage-mono text-[10px] ${
                                statusClass[action.riskLevel] ?? statusClass.untested
                              }`}
                            >
                              risk {action.riskLevel}
                            </Badge>
                            <Badge
                              className={`garage-mono text-[10px] ${
                                statusClass[action.approvalStatus] ?? statusClass.untested
                              }`}
                            >
                              {action.approvalStatus}
                            </Badge>
                            <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                              {action.agentId}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm font-semibold leading-5 text-white">
                            {action.title}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#d6d6dc]">
                            {action.detail}
                          </p>
                          <p className="garage-mono mt-2 text-[11px] text-[#8f8f99]">
                            run {action.runId?.slice(0, 8) ?? "-"} /{" "}
                            {new Date(action.createdAt).toLocaleString("id-ID")}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="garage-press border-[#4a4a54]"
                            disabled={decidingAction === action.id}
                            onClick={() => void decideAction(action, "rejected")}
                          >
                            Tolak
                          </Button>
                          <Button
                            type="button"
                            className="garage-press"
                            disabled={decidingAction === action.id}
                            onClick={() => void decideAction(action, "approved")}
                          >
                            {decidingAction === action.id && (
                              <RefreshCw className="mr-2 size-4 animate-spin" />
                            )}
                            Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-[#3a3a42] bg-[#202027] p-4">
                  <p className="text-sm font-semibold text-white">Tidak ada draft pending.</p>
                  <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                    Prompt refund, void, stock adjustment, atau approval akan membuat draft
                    di gate ini.
                  </p>
                </div>
              )}
            </TabsContent>
          )}

          {canManageAgents && (
            <TabsContent value="doctor" className="mt-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">System Doctor</p>
                  <p className="text-xs leading-5 text-[#b8b8bf]">
                    Diagnosis otomatis untuk provider, agent, job, log, Knowledge Base, dan guardrail.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press border-[#4a4a54]"
                    disabled={systemDoctorLoading || systemDoctorHealing}
                    onClick={() => void loadSystemDoctor()}
                  >
                    <RefreshCw
                      className={`mr-2 size-4 ${
                        systemDoctorLoading ? "animate-spin" : ""
                      }`}
                    />
                    Scan
                  </Button>
                  <Button
                    type="button"
                    className="garage-press"
                    disabled={systemDoctorHealing}
                    onClick={() => void runSystemDoctorAutoHeal()}
                  >
                    {systemDoctorHealing ? (
                      <RefreshCw className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Wrench className="mr-2 size-4" />
                    )}
                    Auto heal aman
                  </Button>
                </div>
              </div>

              {systemDoctorError && (
                <Alert className="mb-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>System Doctor gagal</AlertTitle>
                  <AlertDescription>{systemDoctorError}</AlertDescription>
                </Alert>
              )}

              {systemDoctorLoading && !systemDoctor ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-28 rounded-md bg-white/[0.08]" />
                  ))}
                </div>
              ) : systemDoctor ? (
                <div className="space-y-3">
                  {(() => {
                    const meta = healthColorMeta(systemDoctor.healthColor);

                    return (
                      <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              Doctor status
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                              Safe Auto-Heal aktif untuk konfigurasi, provider, log,
                              registry, health, dan audit. Source code produksi tidak
                              diubah otomatis.
                            </p>
                          </div>
                          <Badge
                            className={`garage-mono w-fit text-[10px] ${meta.className}`}
                          >
                            <span className={`mr-1.5 inline-block size-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="grid gap-3 md:grid-cols-4">
                    {[
                      ["Health", `${systemDoctor.score}/100`, systemDoctor.status],
                      ["Provider ready", systemDoctor.summary.providerReady, "ready"],
                      ["Agent aktif", systemDoctor.summary.agentActive, "controlled"],
                      [
                        "Critical draft",
                        systemDoctor.summary.pendingCriticalActions,
                        systemDoctor.summary.pendingCriticalActions ? "critical" : "ready",
                      ],
                    ].map(([label, value, status]) => (
                      <div
                        key={label}
                        className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                      >
                        <p className="garage-mono text-[10px] uppercase text-[#8f8f99]">
                          {label}
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <p className="text-lg font-semibold text-white">{value}</p>
                          <Badge
                            className={`garage-mono text-[10px] ${
                              statusClass[String(status)] ?? statusClass.untested
                            }`}
                          >
                            {status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            Diagnosis
                          </p>
                          <p className="text-xs leading-5 text-[#b8b8bf]">
                            Data updated{" "}
                            {new Date(systemDoctor.generatedAt).toLocaleString("id-ID")}
                          </p>
                        </div>
                        <Badge
                          className={`garage-mono text-[10px] ${
                            statusClass[systemDoctor.status] ?? statusClass.untested
                          }`}
                        >
                          {systemDoctor.status}
                        </Badge>
                      </div>

                      <div className="garage-scroll mt-3 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
                        {systemDoctor.issues.length ? (
                          systemDoctor.issues.map((issue) => (
                            <div
                              key={issue.id}
                              className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap gap-2">
                                    <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                      {issue.area}
                                    </Badge>
                                    <Badge
                                      className={`garage-mono text-[10px] ${
                                        statusClass[issue.severity] ??
                                        statusClass.untested
                                      }`}
                                    >
                                      {issue.severity}
                                    </Badge>
                                    {issue.autoFixAvailable && (
                                      <Badge
                                        className={`garage-mono text-[10px] ${
                                          issue.autoFixed
                                            ? statusClass.completed
                                            : statusClass.planned
                                        }`}
                                      >
                                        {issue.autoFixed ? "auto fixed" : "auto ready"}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-2 text-sm font-semibold text-white">
                                    {issue.title}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-[#d6d6dc]">
                                    {issue.detail}
                                  </p>
                                  <p className="mt-2 text-xs leading-5 text-[#b8b8bf]">
                                    Next: {issue.nextStep}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md border border-[#3a3a42] bg-[#202027] p-4">
                            <p className="text-sm font-semibold text-white">
                              Tidak ada penyakit aktif.
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                              Provider, agent, job, dan guardrail berada dalam kondisi sehat.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-md border border-[#34343c] bg-[#0d0d11] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Terminal className="size-4 text-[#d4d4d8]" />
                            <p className="text-sm font-semibold text-white">
                              Doctor sedang bekerja
                            </p>
                          </div>
                          <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                            execution log
                          </Badge>
                        </div>
                        <div className="garage-scroll mt-3 max-h-64 space-y-2 overflow-y-auto rounded-md border border-[#202027] bg-black/35 p-2">
                          {systemDoctor.executionLog?.length ? (
                            systemDoctor.executionLog.map((entry, index) => (
                              <div
                                key={`${entry.step}-${entry.timestamp}-${index}`}
                                className="garage-mono grid gap-1 rounded-sm border border-white/5 bg-white/[0.03] px-2 py-1.5 text-[10px]"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-[#f4f4f5]">
                                    {entry.step}
                                  </span>
                                  <span
                                    className={
                                      entry.status === "completed"
                                        ? "text-emerald-200"
                                        : entry.status === "failed"
                                          ? "text-[#ffb0b8]"
                                          : entry.status === "skipped"
                                            ? "text-[#c8c8cc]"
                                            : "text-[#ffd08a]"
                                    }
                                  >
                                    {entry.status}
                                  </span>
                                </div>
                                <span className="text-[#8f8f99]">{entry.detail}</span>
                              </div>
                            ))
                          ) : (
                            <p className="garage-mono text-[10px] leading-5 text-[#8f8f99]">
                              Jalankan Scan atau Auto heal untuk melihat proses kerja.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                        <p className="text-sm font-semibold text-white">
                          Developer diagnosis
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                          Rekomendasi perbaikan teknis. Patch kode tetap dilakukan oleh
                          engineer/Codex, bukan auto-heal produksi.
                        </p>
                        <div className="mt-3 space-y-2">
                          {systemDoctor.developerDiagnosis?.length ? (
                            systemDoctor.developerDiagnosis.map((item, index) => (
                              <div
                                key={`${item.area}-${index}`}
                                className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                              >
                                <div className="flex flex-wrap gap-2">
                                  <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                    {item.area}
                                  </Badge>
                                  <Badge
                                    className={`garage-mono text-[10px] ${
                                      statusClass[item.severity] ??
                                      statusClass.untested
                                    }`}
                                  >
                                    {item.severity}
                                  </Badge>
                                </div>
                                <p className="mt-2 text-xs font-semibold text-white">
                                  {item.finding}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                                  {item.recommendedFix}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="rounded-md border border-[#3a3a42] bg-[#202027] p-3 text-xs leading-5 text-[#b8b8bf]">
                              Tidak ada diagnosis developer yang perlu ditindaklanjuti.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                        <p className="text-sm font-semibold text-white">Auto heal</p>
                        <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                          Tindakan aman saja. Aksi POS kritis tetap approval-gated.
                        </p>
                        <div className="mt-3 space-y-2">
                          {systemDoctor.fixes.length ? (
                            systemDoctor.fixes.map((fix) => (
                              <div
                                key={fix.id}
                                className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-white">
                                    {fix.title}
                                  </p>
                                  <Badge
                                    className={`garage-mono text-[10px] ${
                                      statusClass[fix.status] ?? statusClass.untested
                                    }`}
                                  >
                                    {fix.status}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                                  {fix.detail}
                                </p>
                              </div>
                            ))
                          ) : (
                            <p className="rounded-md border border-[#3a3a42] bg-[#202027] p-3 text-xs leading-5 text-[#b8b8bf]">
                              Belum ada auto-heal pada scan ini.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                        <p className="text-sm font-semibold text-white">Guardrail</p>
                        <div className="mt-3 space-y-2">
                          {systemDoctor.guardrails.map((item) => (
                            <div key={item} className="flex items-start gap-2">
                              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#d4d4d8]" />
                              <p className="text-xs leading-5 text-[#b8b8bf]">{item}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-[#3a3a42] bg-[#202027] p-4">
                  <p className="text-sm font-semibold text-white">
                    System Doctor belum discan.
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                    Klik Scan untuk membaca kesehatan GARAGE AI saat ini.
                  </p>
                </div>
              )}
            </TabsContent>
          )}

          {canManageProviders && (
            <TabsContent value="providers" className="mt-4">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Provider AI</p>
                  <p className="text-xs leading-5 text-[#b8b8bf]">
                    Pilih provider, isi key, test, lalu simpan. Key tetap terenkripsi di server.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press border-[#4a4a54]"
                    disabled={providerAutoFixing}
                    onClick={() => void runProviderAutoFix()}
                  >
                    {providerAutoFixing ? (
                      <RefreshCw className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Wrench className="mr-2 size-4" />
                    )}
                    Auto Fix Provider
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press border-[#4a4a54]"
                    onClick={addCustomProvider}
                  >
                    <Plus className="mr-2 size-4" />
                    Tambah custom
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press border-[#4a4a54]"
                    disabled={providerLoading}
                    onClick={() => void loadProviders()}
                  >
                    <RefreshCw
                      className={`mr-2 size-4 ${providerLoading ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </Button>
                </div>
              </div>

              {providerError && (
                <Alert className="mb-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                  <AlertTriangle className="size-4" />
                  <AlertTitle>Provider AI error</AlertTitle>
                  <AlertDescription>{providerError}</AlertDescription>
                </Alert>
              )}

              {!providerLoading && (providers.length || providerTemplates.length) ? (
                <div className="mb-4 rounded-md border border-[#34343c] bg-[#15151b] p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="garage-mono border-[#d4d4d8]/35 bg-[#d4d4d8]/10 text-[10px] text-[#f4f4f5]">
                          MVP setup
                        </Badge>
                        <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                          key hidden
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">
                        Setup Provider MVP
                      </p>
                      <p className="mt-1 max-w-2xl text-xs leading-5 text-[#b8b8bf]">
                        Pilih preset, isi API key di sheet, lalu test. Provider dengan
                        priority paling kecil dan status ready akan dipakai otomatis.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                      <Select
                        value={selectedProvider?.provider}
                        onValueChange={(value) => {
                          const template = providerTemplates.find(
                            (item) => item.provider === value,
                          );

                          if (template) {
                            applyProviderTemplate(template);
                            return;
                          }

                          setSelectedProviderId(value);
                        }}
                      >
                        <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06] sm:w-[220px]">
                          <SelectValue placeholder="Pilih provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {providerTemplates.map((template) => (
                            <SelectItem key={template.provider} value={template.provider}>
                              {template.label}
                            </SelectItem>
                          ))}
                          {providers
                            .filter(
                              (provider) =>
                                !providerTemplates.some(
                                  (template) =>
                                    template.provider === provider.provider,
                                ),
                            )
                            .map((provider) => (
                              <SelectItem key={provider.provider} value={provider.provider}>
                                {provider.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="garage-press h-10"
                        disabled={!selectedProvider}
                        onClick={() => setProviderDialogOpen(true)}
                      >
                        <LockKeyhole className="mr-2 size-4" />
                        Isi key
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-10 border-[#4a4a54]"
                        disabled={!selectedProvider || !selectedProviderReadyForConnect}
                        onClick={() =>
                          selectedProvider && void testProvider(selectedProvider)
                        }
                      >
                        {testingProvider === selectedProvider?.provider ? (
                          <RefreshCw className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Signal className="mr-2 size-4" />
                        )}
                        Test
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {(providerSetupSteps.length
                      ? providerSetupSteps
                      : [
                          {
                            label: "Pilih provider",
                            detail: "Pilih preset di dropdown.",
                            status: "watch" as const,
                          },
                          {
                            label: "Key aman",
                            detail: "Isi API key di sheet.",
                            status: "watch" as const,
                          },
                          {
                            label: "Connect",
                            detail: "Klik Test atau Simpan & connect.",
                            status: "watch" as const,
                          },
                        ]
                    ).map((step, index) => (
                      <div
                        key={step.label}
                        className="rounded-md border border-[#303038] bg-[#0f1015] p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="garage-mono text-[10px] text-[#8f8f99]">
                            Step {index + 1}
                          </p>
                          <Badge
                            className={`garage-mono text-[10px] ${
                              statusClass[step.status] ?? statusClass.untested
                            }`}
                          >
                            {step.status}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-white">
                          {step.label}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#b8b8bf]">
                          {step.detail}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="garage-scroll-x -mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1">
                      {providerTemplates.slice(0, 8).map((template) => (
                        <Button
                          key={template.provider}
                          type="button"
                          variant={
                            selectedProvider?.provider === template.provider
                              ? "default"
                              : "outline"
                          }
                          className="garage-press h-8 shrink-0 border-[#4a4a54] px-2 text-xs"
                          onClick={() => applyProviderTemplate(template)}
                        >
                          {template.label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="garage-press h-9 border-[#4a4a54] px-3 text-xs"
                          >
                            Safety
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[88vh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Provider safety MVP</DialogTitle>
                            <DialogDescription>
                              Aturan aman setup provider GARAGE AI.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-3 text-sm leading-6 text-[#d6d6dc]">
                            <p>
                              API key hanya dikirim saat save/test dan tidak pernah
                              ditampilkan ulang di UI.
                            </p>
                            <p>
                              Provider ready dengan priority terkecil dipakai otomatis.
                              Provider error akan dilewati oleh fallback router.
                            </p>
                            <p>
                              Aksi POS kritis tetap approval-gated walaupun provider AI
                              sudah aktif.
                            </p>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-9 border-[#4a4a54] px-3 text-xs"
                        disabled={providerAutoFixing}
                        onClick={() => void runProviderAutoFix()}
                      >
                        <Wrench className="mr-2 size-4" />
                        Auto Fix
                      </Button>
                      <Button
                        type="button"
                        className="garage-press h-9 px-3 text-xs"
                        disabled={!selectedProvider || !selectedProviderReadyForConnect}
                        onClick={() =>
                          selectedProvider && void saveProvider(selectedProvider)
                        }
                      >
                        {savingProvider === selectedProvider?.provider ? (
                          <RefreshCw className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 size-4" />
                        )}
                        Save & connect
                      </Button>
                    </div>
                  </div>

                  {selectedProviderTemplate && (
                    <p className="mt-3 rounded-md border border-[#303038] bg-[#0f1015] px-3 py-2 text-xs leading-5 text-[#b8b8bf]">
                      {selectedProviderTemplate.category}: {selectedProviderTemplate.note}
                    </p>
                  )}
                </div>
              ) : null}

              {!providerLoading && providers.length ? (
                <div className="mb-4 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["Ready", providerStatusSummary.ready, "ready"],
                      ["Limit", providerStatusSummary.limit, "limit"],
                      ["Off/No key", providerStatusSummary.off, "off"],
                      ["Error", providerStatusSummary.error, "error"],
                    ].map(([label, value, kind]) => {
                      const meta = providerIndicatorMeta(kind as ProviderIndicatorKind);

                      return (
                        <span
                          key={label}
                          className={`garage-mono inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${meta.border} ${meta.bg} ${meta.text}`}
                        >
                          <span className={`size-1.5 rounded-full ${meta.dot}`} />
                          {label}: {value}
                        </span>
                      );
                    })}
                  </div>

                  <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="garage-mono text-[11px] text-[#8f8f99]">
                          Provider aktif saat ini
                        </p>
                        {activeProvider ? (
                          <>
                            <p className="mt-1 truncate text-sm font-semibold text-white">
                              {activeProvider.label}
                            </p>
                            <p className="garage-mono mt-1 truncate text-[11px] text-[#b8b8bf]">
                              priority {activeProvider.priority} / {activeProvider.model}
                            </p>
                          </>
                        ) : (
                          <p className="mt-1 text-sm leading-6 text-[#d6d6dc]">
                            Belum ada provider ready. Isi key, aktifkan provider, lalu klik
                            Simpan & connect.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {activeProvider ? (
                          <>
                            <ProviderActiveBadge />
                            <ProviderConnectionBadge provider={activeProvider} />
                          </>
                        ) : (
                          <ProviderConnectionBadge
                            provider={{
                              provider: "none",
                              label: "Belum aktif",
                              baseUrl: "",
                              model: "",
                              enabled: false,
                              priority: 999,
                              keyStatus: "missing",
                              maskedKey: null,
                              lastStatus: "missing",
                              lastError: null,
                              lastLatencyMs: null,
                              updatedAt: null,
                            }}
                            label="belum aktif"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {providerLoading && !providers.length ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-28 rounded-md bg-white/[0.08]" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            Setup provider
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                            Satu form untuk provider yang sedang dipilih.
                          </p>
                        </div>
                        {selectedProvider && (
                          <div className="flex flex-wrap justify-end gap-2">
                            {selectedProviderIsActive && <ProviderActiveBadge />}
                            <ProviderConnectionBadge provider={selectedProvider} />
                          </div>
                        )}
                      </div>

                      {selectedProviderConnectionTest && (
                        <div
                          className={`mt-3 rounded-md border p-3 ${
                            selectedProviderConnectionTest.status === "ready"
                              ? "border-[#d4d4d8]/45 bg-[#d4d4d8]/12"
                              : "border-[#d11a2a]/45 bg-[#d11a2a]/12"
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {selectedProviderConnectionTest.status === "ready"
                                  ? "Auto-connect ready"
                                  : "Auto-connect gagal"}
                              </p>
                              <p className="mt-1 text-xs leading-5 text-[#d6d6dc]">
                                {selectedProviderConnectionTest.status === "ready"
                                  ? selectedProviderConnectionTest.message
                                  : providerErrorAdvice(selectedProviderConnectionTest.message)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Badge
                                className={`garage-mono text-[10px] ${
                                  selectedProviderConnectionTest.status === "ready"
                                    ? statusClass.ready
                                    : statusClass.error
                                }`}
                              >
                                {selectedProviderConnectionTest.status}
                              </Badge>
                              <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                {selectedProviderConnectionTest.model}
                              </Badge>
                              <Badge className="garage-mono border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                                {selectedProviderConnectionTest.latencyMs ?? "-"} ms
                              </Badge>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 grid gap-3">
                        <label className="block text-xs text-[#b8b8bf]">
                          Pilih provider aktif
                          <Select
                            value={selectedProvider?.provider}
                            onValueChange={setSelectedProviderId}
                          >
                            <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.06]">
                              <SelectValue placeholder="Pilih provider" />
                            </SelectTrigger>
                            <SelectContent>
                              {providers.map((provider) => (
                                <SelectItem key={provider.provider} value={provider.provider}>
                                  {provider.label}
                                  {activeProvider?.provider === provider.provider
                                    ? " - aktif"
                                    : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                      </div>

                      {selectedProvider ? (
                        <div className="mt-3 rounded-md border border-[#3a3a42] bg-[#202027] p-3">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white">
                                {selectedProvider.label}
                              </p>
                              <p className="garage-mono mt-1 break-words text-[11px] text-[#b8b8bf]">
                                {selectedProvider.provider} / priority{" "}
                                {selectedProvider.priority}
                              </p>
                              <p className="mt-2 break-words text-xs leading-5 text-[#d6d6dc]">
                                {selectedProvider.model}
                              </p>
                            </div>
                            <Button
                              type="button"
                              className="garage-press shrink-0"
                              onClick={() => setProviderDialogOpen(true)}
                            >
                              Setup API
                            </Button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {selectedProviderIsActive && <ProviderActiveBadge />}
                            <ProviderConnectionBadge provider={selectedProvider} />
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 rounded-md border border-dashed border-[#4a4a54] bg-[#202027] p-4">
                          <p className="text-sm font-semibold text-white">
                            Belum ada provider.
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                            Klik Tambah custom untuk mulai setup provider baru.
                          </p>
                        </div>
                      )}
                    </div>

                    <Sheet
                      open={providerDialogOpen}
                      onOpenChange={setProviderDialogOpen}
                    >
                      <SheetContent
                        side="right"
                        className="garage-shell w-full overflow-y-auto border-[#34343c] bg-[#111116] text-[#f4f4f5] sm:max-w-2xl"
                      >
                        <SheetHeader className="p-0">
                          <SheetTitle className="text-white">
                            Provider AI Control Center
                          </SheetTitle>
                          <SheetDescription>
                            Setup penuh untuk provider, model, fallback, key, test aktif, dan health.
                            Raw key tetap terenkripsi server-side dan tidak dikirim balik ke browser.
                          </SheetDescription>
                        </SheetHeader>

                        {selectedProvider ? (
                          <div className="space-y-3">
                            <div className="grid gap-2 sm:grid-cols-3">
                              {providerSetupSteps.map((step, index) => (
                                <div
                                  key={step.label}
                                  className="rounded-md border border-[#34343c] bg-[#202027] p-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="garage-mono text-[10px] text-[#8f8f99]">
                                      MVP {index + 1}
                                    </p>
                                    <Badge
                                      className={`garage-mono text-[10px] ${
                                        statusClass[step.status] ?? statusClass.untested
                                      }`}
                                    >
                                      {step.status}
                                    </Badge>
                                  </div>
                                  <p className="mt-2 text-xs font-semibold text-white">
                                    {step.label}
                                  </p>
                                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#b8b8bf]">
                                    {step.detail}
                                  </p>
                                </div>
                              ))}
                            </div>

                            <div className="rounded-md border border-[#34343c] bg-[#202027] p-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-white">
                                    {selectedProvider.label}
                                  </p>
                                  <p className="garage-mono mt-1 text-[11px] text-[#b8b8bf]">
                                    {selectedProvider.provider} / {selectedProvider.model}
                                  </p>
                                </div>
                                <div className="flex flex-wrap justify-end gap-2">
                                  {selectedProviderIsActive && <ProviderActiveBadge />}
                                  <ProviderConnectionBadge provider={selectedProvider} />
                                </div>
                              </div>
                              <div className="mt-3 grid gap-2 text-xs leading-5 text-[#d6d6dc] sm:grid-cols-4">
                                <div className="rounded-md border border-[#3a3a42] bg-[#15151b] p-2">
                                  <span className="garage-mono block text-[10px] text-[#8f8f99]">
                                    Key
                                  </span>
                                  {selectedProvider.maskedKey ?? selectedProvider.keyStatus}
                                </div>
                                <div className="rounded-md border border-[#3a3a42] bg-[#15151b] p-2">
                                  <span className="garage-mono block text-[10px] text-[#8f8f99]">
                                    Status
                                  </span>
                                  {selectedProvider.lastStatus}
                                </div>
                                <div className="rounded-md border border-[#3a3a42] bg-[#15151b] p-2">
                                  <span className="garage-mono block text-[10px] text-[#8f8f99]">
                                    Latency
                                  </span>
                                  {selectedProvider.lastLatencyMs ?? "-"} ms
                                </div>
                                <div className="rounded-md border border-[#3a3a42] bg-[#15151b] p-2">
                                  <span className="garage-mono block text-[10px] text-[#8f8f99]">
                                    Priority
                                  </span>
                                  {selectedProvider.priority}
                                </div>
                              </div>
                              {selectedProvider.lastError && (
                                <p className="mt-2 rounded-md border border-[#d11a2a]/35 bg-[#d11a2a]/10 px-2 py-1 text-xs leading-5 text-[#ffb0b8]">
                                  {providerErrorAdvice(selectedProvider.lastError)}
                                </p>
                              )}
                              {selectedProvider.provider === "deepseek" && (
                                <p className="mt-2 rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 px-2 py-1 text-xs leading-5 text-[#ffd08a]">
                                  DeepSeek disarankan memakai base URL https://api.deepseek.com,
                                  model configurable, dan JSON mode otomatis lewat router GARAGE AI.
                                </p>
                              )}
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="block text-xs text-[#b8b8bf]">
                                Provider ID
                                <Input
                                  value={selectedProvider.provider}
                                  onChange={(event) => {
                                    const nextId = normalizeProviderId(event.target.value);
                                    updateProvider(selectedProvider.provider, {
                                      provider: nextId,
                                    });
                                    setSelectedProviderId(nextId);
                                  }}
                                  className="garage-mono mt-1 border-[#34343c] bg-white/[0.06]"
                                />
                              </label>
                              <label className="block text-xs text-[#b8b8bf]">
                                Nama tampil
                                <Input
                                  value={selectedProvider.label}
                                  onChange={(event) =>
                                    updateProvider(selectedProvider.provider, {
                                      label: event.target.value,
                                    })
                                  }
                                  className="mt-1 border-[#34343c] bg-white/[0.06]"
                                />
                              </label>
                            </div>
                            <label className="block text-xs text-[#b8b8bf]">
                              Base URL
                              <Input
                                value={selectedProvider.baseUrl}
                                onChange={(event) =>
                                  updateProvider(selectedProvider.provider, {
                                    baseUrl: event.target.value,
                                  })
                                }
                                className="mt-1 border-[#34343c] bg-white/[0.06]"
                              />
                            </label>
                            <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
                              <label className="block text-xs text-[#b8b8bf]">
                                Model
                                <Input
                                  value={selectedProvider.model}
                                  onChange={(event) =>
                                    updateProvider(selectedProvider.provider, {
                                      model: event.target.value,
                                    })
                                  }
                                  className="mt-1 border-[#34343c] bg-white/[0.06]"
                                />
                              </label>
                              <label className="block text-xs text-[#b8b8bf]">
                                Priority
                                <Input
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={selectedProvider.priority}
                                  onChange={(event) =>
                                    updateProvider(selectedProvider.provider, {
                                      priority: Number(event.target.value) || 100,
                                    })
                                  }
                                  className="mt-1 border-[#34343c] bg-white/[0.06]"
                                />
                              </label>
                            </div>
                            <label className="block text-xs text-[#b8b8bf]">
                              API key baru
                              <Input
                                type="password"
                                value={selectedProvider.apiKeyInput}
                                onChange={(event) => {
                                  const apiKeyInput = event.target.value;
                                  updateProvider(selectedProvider.provider, {
                                    apiKeyInput,
                                    clearApiKey: false,
                                    enabled: apiKeyInput.trim()
                                      ? true
                                      : selectedProvider.enabled,
                                  });
                                }}
                                placeholder={
                                  selectedProvider.keyStatus === "configured"
                                    ? "Kosongkan jika tidak diganti"
                                    : "Masukkan API key"
                                }
                                className="mt-1 border-[#34343c] bg-white/[0.06]"
                              />
                            </label>
                            <div className="flex flex-col gap-2 rounded-md border border-[#34343c] bg-[#202027]/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-xs leading-5 text-[#b8b8bf]">
                                <p className="font-semibold text-[#f4f4f5]">
                                  Key management aman
                                </p>
                                <p>
                                  Token asli tidak ditampilkan. Isi key baru untuk replace, atau hapus key tersimpan.
                                </p>
                                {selectedProvider.clearApiKey && (
                                  <p className="mt-1 text-[#ffd08a]">
                                    Key tersimpan akan dihapus dan provider dinonaktifkan saat disimpan.
                                  </p>
                                )}
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="garage-press border-[#4a4a54]"
                                  onClick={() =>
                                    updateProvider(selectedProvider.provider, {
                                      apiKeyInput: "",
                                      clearApiKey: false,
                                    })
                                  }
                                >
                                  <LockKeyhole className="mr-2 size-4" />
                                  Ganti key
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="garage-press border-[#d11a2a]/45 text-[#ffb0b8]"
                                      disabled={
                                        selectedProvider.keyStatus === "missing" &&
                                        !selectedProvider.apiKeyInput
                                      }
                                    >
                                      <Trash2 className="mr-2 size-4" />
                                      Hapus key
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent className="border-[#34343c] bg-[#111116] text-[#f4f4f5]">
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Hapus key provider?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Key tersimpan untuk {selectedProvider.label} akan ditandai untuk dihapus
                                        saat konfigurasi provider disimpan. Provider juga akan dinonaktifkan.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="border-[#4a4a54] bg-transparent text-[#f4f4f5] hover:bg-white/[0.08]">
                                        Batal
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-[#d11a2a] text-white hover:bg-[#b51524]"
                                        onClick={() =>
                                          updateProvider(selectedProvider.provider, {
                                            apiKeyInput: "",
                                            clearApiKey: true,
                                            enabled: false,
                                          })
                                        }
                                      >
                                        Tandai hapus
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <label className="flex items-center gap-2 text-sm text-[#f4f4f5]">
                                <input
                                  type="checkbox"
                                  checked={selectedProvider.enabled}
                                  onChange={(event) =>
                                    updateProvider(selectedProvider.provider, {
                                      enabled: event.target.checked,
                                    })
                                  }
                                  className="size-4 accent-[#d11a2a]"
                                />
                                Aktifkan provider ini
                              </label>
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="garage-press border-[#4a4a54]"
                                  disabled={
                                    testingProvider === selectedProvider.provider ||
                                    providerWillClearKey(selectedProvider) ||
                                    !selectedProviderReadyForConnect
                                  }
                                  onClick={() => void testProvider(selectedProvider)}
                                >
                                  {testingProvider === selectedProvider.provider && (
                                    <RefreshCw className="mr-2 size-4 animate-spin" />
                                  )}
                                  Test key
                                </Button>
                                <Button
                                  type="button"
                                  className="garage-press"
                                  disabled={savingProvider === selectedProvider.provider}
                                  onClick={() => void saveProvider(selectedProvider)}
                                >
                                  {savingProvider === selectedProvider.provider && (
                                    <RefreshCw className="mr-2 size-4 animate-spin" />
                                  )}
                                  Simpan & connect
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed border-[#4a4a54] bg-[#202027] p-4">
                            <p className="text-sm font-semibold text-white">
                              Belum ada provider dipilih.
                            </p>
                          </div>
                        )}
                      </SheetContent>
                    </Sheet>

                    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                      <p className="text-sm font-semibold text-white">Urutan fallback</p>
                      <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                        Pilih provider dari dropdown, lalu atur priority. Angka kecil dipakai dulu.
                      </p>
                      <div className="mt-3 space-y-3">
                        <label className="block text-xs text-[#b8b8bf]">
                          Provider
                          <Select
                            value={selectedProvider?.provider}
                            onValueChange={setSelectedProviderId}
                          >
                            <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.06]">
                              <SelectValue placeholder="Pilih provider" />
                            </SelectTrigger>
                            <SelectContent>
                              {[...providers]
                                .sort((a, b) => a.priority - b.priority)
                                .map((provider) => (
                                  <SelectItem
                                    key={provider.provider}
                                    value={provider.provider}
                                  >
                                    {provider.priority}. {provider.label}
                                    {activeProvider?.provider === provider.provider
                                      ? " - aktif"
                                      : ""}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </label>
                        {selectedProvider ? (
                          <div className="rounded-md border border-[#3a3a42] bg-[#202027] p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {selectedProviderIsActive && <ProviderActiveBadge />}
                              <ProviderConnectionBadge provider={selectedProvider} />
                            </div>
                            <label className="mt-3 block text-xs text-[#b8b8bf]">
                              Priority fallback
                              <Input
                                type="number"
                                min={1}
                                max={999}
                                value={selectedProvider.priority}
                                onChange={(event) =>
                                  updateProvider(selectedProvider.provider, {
                                    priority: Number(event.target.value) || 100,
                                  })
                                }
                                className="mt-1 border-[#34343c] bg-white/[0.06]"
                              />
                            </label>
                            <p className="mt-2 text-xs leading-5 text-[#8f8f99]">
                              Simpan provider setelah mengubah priority.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {selectedProvider ? (
                    <div className="rounded-md border border-[#34343c] bg-[#15151b] p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="garage-mono text-[11px] text-[#b8b8bf]">
                            Status terakhir
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#d6d6dc]">
                            {selectedProvider.lastLatencyMs ?? "-"} ms
                            {selectedProvider.lastError
                              ? ` / ${selectedProvider.lastError}`
                              : ""}
                          </p>
                        </div>
                        <Badge className="garage-mono w-fit border-[#4a4a54] bg-[#202027] text-[10px] text-[#d4d4d8]">
                          Supabase-safe config
                        </Badge>
                      </div>
                      {selectedProvider.health ? (
                        <div className="mt-3 grid gap-2 text-xs leading-5 text-[#d6d6dc] sm:grid-cols-3 xl:grid-cols-6">
                          {[
                            ["Requests", selectedProvider.health.requestCount],
                            ["Error rate", formatPercent(selectedProvider.health.errorRate)],
                            ["Fallback", selectedProvider.health.fallbackCount],
                            ["Rate limit", selectedProvider.health.rateLimitCount],
                            [
                              "P50 / P95",
                              `${selectedProvider.health.p50LatencyMs ?? "-"} / ${
                                selectedProvider.health.p95LatencyMs ?? "-"
                              } ms`,
                            ],
                            [
                              "Est. cost",
                              formatCostUsd(selectedProvider.health.estimatedCostUsd),
                            ],
                          ].map(([label, value]) => (
                            <div
                              key={label}
                              className="rounded-md border border-[#3a3a42] bg-[#202027] p-2"
                            >
                              <span className="garage-mono block text-[10px] text-[#8f8f99]">
                                {label}
                              </span>
                              {value}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs leading-5 text-[#8f8f99]">
                          Belum ada run log untuk provider ini.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value="log" className="mt-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">GARAGE AI Log</p>
                <p className="text-xs leading-5 text-[#b8b8bf]">
                  Auto cek 3 hari sekali; log GARAGE AI lebih dari 7 hari dibersihkan.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManageAgents && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press border-[#4a4a54]"
                        disabled={logCleanupLoading}
                      >
                        {logCleanupLoading ? (
                          <RefreshCw className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 size-4" />
                        )}
                        Clear &gt;7 hari
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-[#34343c] bg-[#111116] text-[#f4f4f5]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear log lama?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Log GARAGE AI lebih dari 7 hari akan dibersihkan dari audit aktif.
                          Data baru dan log terbaru tetap tersimpan.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-[#4a4a54] bg-transparent text-[#f4f4f5] hover:bg-white/[0.08]">
                          Batal
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-[#d11a2a] text-white hover:bg-[#b51524]"
                          onClick={() => void cleanupOldLogs()}
                        >
                          Clear log
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press border-[#4a4a54]"
                  disabled={logLoading}
                  onClick={() => void loadPersistedLogs()}
                >
                  <RefreshCw className={`mr-2 size-4 ${logLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {logError && (
              <Alert className="mb-4 border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Log gagal dimuat</AlertTitle>
                <AlertDescription>{logError}</AlertDescription>
              </Alert>
            )}

            {logCleanupResult && (
              <div className="mb-3 rounded-md border border-[#3a3a42] bg-[#202027] p-3 text-xs leading-5 text-[#d6d6dc]">
                Clear terakhir: {logCleanupResult.totalDeleted} baris dihapus
                {" "}({logCleanupResult.deleted.agentRuns} run,
                {" "}{logCleanupResult.deleted.agentEvents} event,
                {" "}{logCleanupResult.deleted.auditLogs} audit,
                {" "}{logCleanupResult.deleted.expiredSnapshots} snapshot).
              </div>
            )}

            <div className="relative">
              <div
                ref={logScrollRef}
                className="garage-scroll max-h-[15rem] space-y-3 overflow-y-auto pr-1"
              >
                {logLoading && !visibleLogs.length ? (
                  <>
                    {[1, 2, 3].map((item) => (
                      <Skeleton key={item} className="h-20 rounded-md bg-white/[0.08]" />
                    ))}
                  </>
                ) : visibleLogs.length ? (
                  visibleLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-md border border-[#3a3a42] bg-[#202027] p-3"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">{log.title}</p>
                          <p className="mt-1 break-words text-xs leading-5 text-[#b8b8bf]">
                            {log.detail}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            className={`garage-mono text-[10px] ${
                              statusClass[log.status] ?? statusClass.recorded
                            }`}
                          >
                            {log.status}
                          </Badge>
                          <span className="garage-mono text-[11px] text-[#b8b8bf]">
                            {log.time}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-md border border-[#3a3a42] bg-[#202027] p-4">
                    <p className="text-sm font-semibold text-white">Belum ada log GARAGE AI.</p>
                    <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
                      Chat, fallback, test provider, update config, dan approval gate akan
                      tersimpan sebagai audit log.
                    </p>
                  </div>
                )}
              </div>
              <ScrollJumpControls
                targetRef={logScrollRef}
                watchKey={`${visibleLogs.length}-${logLoading ? "loading" : "idle"}`}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {canManageAgents ? (
        <aside className="garage-panel garage-animate-in hidden h-fit rounded-md p-4 xl:block">
          <p className="text-sm font-semibold text-white">Ringkasan</p>
          <p className="mt-2 text-xs leading-5 text-[#b8b8bf]">
            Pengingat tim â†’ lonceng header. Tanya AI â†’ tab ini. Approval kritis tetap manual.
          </p>
          <Separator className="my-4 bg-[#34343c]" />
          <ul className="space-y-2 text-xs leading-5 text-[#d6d6dc]">
            <li>Â· Void/refund/diskon besar butuh approval</li>
            <li>Â· AI tidak mengubah transaksi sendiri</li>
            <li>Â· Data mengikuti role login</li>
          </ul>
        </aside>
      ) : null}
    </section>
  );
}

// ApprovalsView lama (mock approval note + grid cards) sudah diganti dengan
// ApprovalsBoard di src/components/garage/approvals-board.tsx. Komponen baru
// punya: filter tabs, stats bar, detail modal, required reject reason,
// bulk decide, WA notify requester, saved reason templates.

const websiteManagerRoles = new Set<Role>(["Owner / CEO", "Admin"]);

function CompanyControlBridge({ me }: { me: GarageMe }) {
  if (me.role !== "Owner / CEO") {
    return (
      <section className="space-y-4">
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <Badge className="border-[#d11a2a]/40 bg-[#d11a2a]/12 text-[#ffe1e5]">
              Restricted
            </Badge>
            <CardTitle className="mt-4 text-2xl">CEO Control Only</CardTitle>
            <CardDescription>
              Pusat kontrol perusahaan hanya tersedia untuk akun Owner / CEO.
              Silakan kembali ke modul kerja role Anda.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <Card className="garage-panel garage-animate-in overflow-hidden">
        <CardHeader className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:42px_42px]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge className="border-[#f5a742]/40 bg-[#f5a742]/12 text-[#f5a742]">
                Internal Company Control
              </Badge>
              <CardTitle className="mt-4 text-3xl">
                CEO Control Dashboard
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl">
                Pusat arsip dokumen perusahaan, SOP, training, struktur direksi,
                playbook manajemen, approval, audit, dan full control GARAGE.
              </CardDescription>
            </div>
            <Button asChild className="garage-press">
              <Link href="/control">
                <FileText className="mr-2 size-4" />
                Buka Control Center
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {[
            ["Role aktif", me.role],
            ["Dokumen", "Private vault"],
            ["Control", "CEO only"],
            ["Audit", "Upload & approval"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-[#34343c] bg-white/[0.04] p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {label}
              </div>
              <div className="mt-2 text-sm font-semibold text-white">{value}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function formatAssetBytes(value: number | null | undefined) {
  if (!value) return "-";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function WebsiteSettingsView({ me }: { me: GarageMe }) {
  const canManageWebsite = websiteManagerRoles.has(me.role);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [hero, setHero] = useState<SiteAsset | null>(null);
  const [heroLoading, setHeroLoading] = useState(true);
  const [heroError, setHeroError] = useState<string | null>(null);
  const [heroSuccess, setHeroSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("Hero Garage Coffee & Motor");
  const [uploading, setUploading] = useState(false);

  const loadHero = useCallback(async () => {
    setHeroLoading(true);
    setHeroError(null);

    try {
      const currentHero = await garageApi.get<SiteAsset | null>(
        "/api/site/landing-hero",
        { cache: "no-store" },
      );
      setHero(currentHero);
      if (currentHero?.alt) {
        setAlt(currentHero.alt);
      }
    } catch (error) {
      setHeroError(
        error instanceof Error ? error.message : "Status hero landing gagal dimuat.",
      );
    } finally {
      setHeroLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHero();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadHero]);

  function handleFileChange(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    setSelectedFile(file);
    setHeroSuccess(null);
    setHeroError(null);
  }

  async function submitHero(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageWebsite) {
      setHeroError("Role ini hanya bisa melihat preview website.");
      return;
    }

    if (!selectedFile) {
      setHeroError("Pilih file gambar terlebih dahulu.");
      return;
    }

    if (selectedFile.size > 8 * 1024 * 1024) {
      setHeroError("Ukuran gambar maksimal 8 MB.");
      return;
    }

    const body = new FormData();
    body.append("image", selectedFile);
    body.append("alt", alt);

    setUploading(true);
    setHeroError(null);
    setHeroSuccess(null);

    try {
      const response = await fetch("/api/site/landing-hero", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const payload = (await response.json()) as {
        data?: SiteAsset;
        error?: { message?: string };
      };

      if (!response.ok || payload.error || !payload.data) {
        throw new Error(payload.error?.message ?? "Upload hero landing gagal.");
      }

      setHero(payload.data);
      setAlt(payload.data.alt);
      setSelectedFile(null);
      setHeroSuccess("Hero landing berhasil diganti. Gambar sudah dikompres ke WebP.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setHeroError(error instanceof Error ? error.message : "Upload hero landing gagal.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="garage-panel garage-animate-in overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Hero landing website</CardTitle>
                <CardDescription>
                  Visual utama di halaman publik. File aktif disimpan lokal dan berversi.
                </CardDescription>
              </div>
              <Badge className="border-[#22c55e]/40 bg-[#22c55e]/12 text-[#dcfce7]">
                {hero ? "Aktif" : "Fallback lama"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative min-h-[280px] overflow-hidden rounded-md border border-[#34343c] bg-black/20 sm:min-h-[420px]">
              {hero ? (
                <Image
                  src={hero.publicUrl}
                  alt={hero.alt || "Hero Garage Coffee & Motor"}
                  fill
                  sizes="(max-width: 768px) 92vw, 720px"
                  quality={75}
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full min-h-[280px] items-center justify-center p-6 text-center text-sm text-muted-foreground sm:min-h-[420px]">
                  Belum ada gambar aktif. Landing tetap memakai hero lama.
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="garage-surface rounded-md p-3">
                <p className="garage-mono">Ukuran</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {hero ? `${hero.width} x ${hero.height}` : "-"}
                </p>
              </div>
              <div className="garage-surface rounded-md p-3">
                <p className="garage-mono">File</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {formatAssetBytes(hero?.sizeBytes)}
                </p>
              </div>
              <div className="garage-surface rounded-md p-3">
                <p className="garage-mono">Format</p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {hero?.mimeType ?? "-"}
                </p>
              </div>
              <div className="garage-surface rounded-md p-3">
                <p className="garage-mono">Versi</p>
                <p className="mt-1 truncate text-sm font-semibold text-white">
                  {hero?.version ?? "-"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Pengaturan Website</CardTitle>
            <CardDescription>
              {canManageWebsite
                ? "Upload JPG, PNG, atau WebP. Server otomatis membuat WebP ringan."
                : "Role ini hanya bisa melihat status dan preview."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {heroLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" />
                Memuat hero aktif...
              </div>
            )}

            {heroError && (
              <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Website</AlertTitle>
                <AlertDescription>{heroError}</AlertDescription>
              </Alert>
            )}

            {heroSuccess && (
              <Alert className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
                <ShieldCheck className="size-4" />
                <AlertTitle>Website</AlertTitle>
                <AlertDescription>{heroSuccess}</AlertDescription>
              </Alert>
            )}

            {!canManageWebsite && (
              <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
                <Info className="size-4" />
                <AlertTitle>Read-only</AlertTitle>
                <AlertDescription>
                  Upload hanya tersedia untuk Owner / CEO dan Admin.
                </AlertDescription>
              </Alert>
            )}

            <form className="space-y-4" onSubmit={submitHero}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-white" htmlFor="website-hero-alt">
                  Alt text singkat
                </label>
                <Input
                  id="website-hero-alt"
                  value={alt}
                  onChange={(event) => setAlt(event.target.value)}
                  maxLength={140}
                  disabled={!canManageWebsite || uploading}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="Contoh: Empat gelas Garage Coffee & Motor"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-white" htmlFor="website-hero-file">
                  File gambar
                </label>
                <Input
                  ref={fileInputRef}
                  id="website-hero-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!canManageWebsite || uploading}
                  onChange={(event) => handleFileChange(event.currentTarget.files)}
                  className="border-[#34343c] bg-white/[0.06]"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Maksimal 8 MB. Output disimpan lokal sebagai WebP berversi.
                </p>
              </div>

              {selectedFile && (
                <div className="rounded-md border border-[#34343c] bg-white/[0.045] p-3 text-sm text-[#d0d0d6]">
                  <p className="font-semibold text-white">{selectedFile.name}</p>
                  <p>{formatAssetBytes(selectedFile.size)}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={!canManageWebsite || uploading || !selectedFile}
                className="garage-press w-full"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Mengompres...
                  </>
                ) : (
                  <>
                    <ArrowUp className="mr-2 size-4" />
                    Upload / Ganti Hero
                  </>
                )}
              </Button>
            </form>

            {hero?.publicUrl && (
              <Button asChild variant="outline" className="garage-press w-full border-[#4a4a54]">
                <Link href="/" target="_blank">
                  <Monitor className="mr-2 size-4" />
                  Lihat landing
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

// AuditView lama (static 3 KPI cards + read-only table) sudah diganti
// dengan AuditLogViewer di src/components/garage/audit-log-viewer.tsx.
// Komponen baru: live polling 15s, filter (status/date/actor/search),
// stats bar (events today, critical, warnings, top actor/module),
// modal detail dengan metadata JSON viewer.







