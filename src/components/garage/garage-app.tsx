"use client";

import "@/components/crystal/crystal.css";
import {
Activity,
AlertTriangle,
Home,
ArrowUp,
BadgeCheck,
Fingerprint,
KeyRound,
Gauge,
Info,
LogOut,
Menu,
Monitor,
MoreHorizontal,
PanelLeft,
RefreshCw,
Settings,
ShieldCheck,
Signal,
Trash2
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
type SetStateAction
} from "react";

import { GarageAiAlertsBell } from "@/components/garage/garage-ai-alerts-bell";
import { usePartnerMenuRefresh } from "@/components/garage/partner-hub/use-partner-menu-refresh";
import { hasPartnerItems } from "@/lib/partner-menu-refresh";
import { StaffNotificationCenter } from "@/components/garage/staff-notification-center";
import { releasePushSubscriptionOnSignOut } from "@/lib/push-client";
import {
canViewKitchenPerformance,
fetchAuthSessionCheck,
hasActiveAuthSession
} from "@/components/garage/garage-app-helpers";
import {
normalizeCashierTheme,
type CashierThemeMode
} from "@/components/garage/garage-app-pickers";
import { Alert,AlertDescription,AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { WebsiteAtmosphereCard } from "@/components/garage/website-atmosphere-card";
import { Button } from "@/components/ui/button";
import {
Card,
CardContent,
CardDescription,
CardHeader,
CardTitle,
} from "@/components/ui/card";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuLabel,
DropdownMenuSeparator,
DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
SheetHeader,
SheetTitle,
SheetTrigger,
} from "@/components/ui/sheet";
import { garageApi } from "@/lib/api-client";
import { GARAGE_TAGS, subscribeGarageCache } from "@/lib/garage-cache";
import { authClient } from "@/lib/auth-client";
import type {
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
canAccessModuleAs,
canUseApi,
homeModuleFor,
modulesForProfile,
} from "@/lib/role-access";
// First-paint / selalu tampil / kecil → tetap statis (cepat).
import { ChatFab } from "@/components/garage/chat-fab";
import {
DateFilterBar,
DateFilterProvider,
} from "@/components/garage/date-filter";
import { useGarageTheme } from "@/components/garage/theme/garage-theme-provider";
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
  <div className="px-4 py-10 text-center text-sm text-zinc-400">Memuat modul…</div>
);

const AiPosAgentView = dynamic(
  () => import("@/components/garage/ai-agent/ai-pos-agent-view").then((m) => m.AiPosAgentView),
  { loading: ModuleChunkFallback },
);
const EarningsView = dynamic(
  () => import("@/components/garage/earnings-view").then((m) => m.EarningsView),
  { loading: ModuleChunkFallback },
);
const RecruitmentView = dynamic(
  () => import("@/components/garage/recruitment-view").then((m) => m.RecruitmentView),
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
const PartnerHubRedirect = dynamic(
  () => import("@/components/wms/warehouse-redirect").then((m) => m.PartnerHubRedirect),
  { loading: ModuleChunkFallback },
);
const WarehouseRedirect = dynamic(
  () => import("@/components/wms/warehouse-redirect").then((m) => m.WarehouseRedirect),
  { loading: ModuleChunkFallback },
);
const InventoryView = dynamic(
  () => import("@/components/garage/inventory-view").then((m) => m.InventoryView),
  { loading: ModuleChunkFallback },
);
const PartnerDashboardWidget = dynamic(
  () => import("@/components/garage/partner-hub/partner-dashboard-widget").then((m) => m.PartnerDashboardWidget),
  { ssr: false },
);
const WmsAlertWidget = dynamic(
  () => import("@/components/garage/wms-alert-widget").then((m) => m.WmsAlertWidget),
  { ssr: false },
);
const OpsCenterView = dynamic(
  () => import("@/components/garage/ops-center-view").then((m) => m.OpsCenterView),
  { loading: ModuleChunkFallback },
);
const EventsView = dynamic(
  () => import("@/components/garage/events/events-view").then((m) => m.EventsView),
  { loading: ModuleChunkFallback },
);
const CourierView = dynamic(
  () => import("@/components/garage/courier-view").then((m) => m.CourierView),
  { loading: ModuleChunkFallback },
);
const ProductionView = dynamic(
  () => import("@/components/garage/production-view").then((m) => m.ProductionView),
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
const GARAGE_CASHIER_THEME_STORAGE_KEY = "garage-cashier-theme";
type GarageThemeMode = "dark" | "bright";

// Pure helpers extract ke garage-app-helpers.ts untuk turunkan source size.
// Lihat: src/components/garage/garage-app-helpers.ts

const serviceRuleIcons = {
  "Cash gap": BadgeCheck,
  "POS SLA": Gauge,
  "Offline sync": Activity,
};

/** Preferensi "Perangkat ini bersuara" dari Pusat Notifikasi (default ON). */
function deviceSoundEnabled() {
  try {
    return window.localStorage.getItem("garage:device:notif-sound") !== "off";
  } catch {
    return true;
  }
}

export function GarageApp({
  initialModule = "dashboard",
}: {
  initialModule?: ModuleId;
}) {
  const [health, setHealth] = useState<{
    pending: boolean;
    configured: boolean;
    unreachable: boolean;
    message: string;
  }>({
    pending: true,
    configured: false,
    unreachable: false,
    message: "Memeriksa server Garage…",
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
          unreachable: false,
          message: healthData.database.status,
        });
      } catch (error) {
        if (!mounted) {
          return;
        }

        setHealth({
          pending: false,
          configured: false,
          // Jaringan putus / server 5xx ≠ "belum dikonfigurasi": jangan tampilkan
          // layar setup teknis ke karyawan.
          unreachable: true,
          message: error instanceof Error ? error.message : "Server tidak bisa dihubungi.",
        });
      }
    }

    void loadHealth();

    return () => {
      mounted = false;
    };
  }, []);

  if (health.pending) {
    return <GarageLoading title="Membuka Garage OS" detail="Menghubungkan ke server Garage." />;
  }

  if (health.unreachable) {
    return (
      <GarageErrorScreen
        title="Koneksi ke server terputus"
        detail="Periksa Wi-Fi atau data seluler perangkat ini, lalu coba lagi."
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!health.configured) {
    return <BackendSetupScreen message={health.message} />;
  }

  return <AuthenticatedGarageApp initialModule={initialModule} />;
}

export { GarageLogin as GaragePosLogin } from "./login/garage-login";
import { LoginScreen } from "./login/garage-login";
import { ModuleNav, OutletSwitcher, BrandBlock, PosHeaderBrand, GarageLoading, BackendSetupScreen, GarageErrorScreen } from "@/components/garage/shell/garage-shell-chrome";
import { CompanyControlBridge } from "@/components/garage/shell/company-control-bridge";

function AuthenticatedGarageApp({ initialModule }: { initialModule: ModuleId }) {
  const session = authClient.useSession();

  if (session.isPending) {
    return <GarageLoading title="Memeriksa sesi" detail="Memuat akun Anda." />;
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
  // Voice low-stock tracking — announce hanya saat SKU baru transition jadi "low",
  // bukan setiap fetch refresh (yang akan re-trigger untuk item yang udah lama low).
  const previousLowStockRef = useRef<Set<string> | null>(null);
  const [kitchenPerformance, setKitchenPerformance] =
    useState<KitchenPerformanceData | null>(null);
  const [kitchenPerformanceLoading, setKitchenPerformanceLoading] = useState(false);
  const [kitchenPerformanceError, setKitchenPerformanceError] = useState<string | null>(
    null,
  );
  const [activeModule, setActiveModule] = useState<ModuleId>(initialModule);
  const currentRole = data?.me.role;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [garageTheme] = useState<GarageThemeMode>("dark");
  const [cashierTheme, setCashierTheme] = useState<CashierThemeMode>(() => {
    if (typeof window === "undefined") {
      return "garage-signature";
    }

    return normalizeCashierTheme(window.localStorage.getItem(GARAGE_CASHIER_THEME_STORAGE_KEY));
  });
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutInFlight = useRef(false);
  // Badge counter pending approvals di nav module — polling 60s
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  // -1 = belum pernah dimuat (muat pertama tidak berbunyi; 0→1 tetap berbunyi).
  const lastPendingApprovalRef = useRef(-1);
  useEffect(() => {
    if (!data?.me) return;
    if (!canAccessModuleAs(data.me, "approvals")) return;
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
        if (prev >= 0 && nextCount > prev) {
          // V2: satu bunyi per perangkat walau beberapa tab membuka Garage OS.
          if (deviceSoundEnabled()) void voice.announce("approval_pending", {
            dedupKey: `approval-bump-${nextCount}`,
            soundTtlMs: 2 * 60_000,
          });
        }
        lastPendingApprovalRef.current = nextCount;
      } catch {
        /* silent fail, badge tetap stale */
      }
    };
    void load();
    // Interval dari Pengaturan → Notifikasi (default 60 dtk, min 15 dtk).
    const intervalSec = Math.max(15, Number(data.settings?.approvalPollIntervalSec) || 60);
    const id = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, intervalSec * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [data?.me, data?.settings?.approvalPollIntervalSec]);

  // Badge counter kandidat "Baru" di menu Recruitment — polling 90s.
  const [newRecruitmentCount, setNewRecruitmentCount] = useState(0);
  useEffect(() => {
    if (!data?.me) return;
    if (!canAccessModuleAs(data.me, "recruitment")) return;
    let cancelled = false;
    const loadRec = async () => {
      try {
        const res = await garageApi.get<{ stats: { byStatus: Record<string, number> } }>(
          "/api/recruitment/candidates?status=Baru&pageSize=1",
          { cache: "no-store" },
        );
        if (cancelled) return;
        setNewRecruitmentCount(res.stats?.byStatus?.["Baru"] ?? 0);
      } catch {
        /* silent fail */
      }
    };
    void loadRec();
    const id = window.setInterval(loadRec, 90_000);
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
        canAccessModuleAs(nextData.me, current)
          ? current
          : homeModuleFor(nextData.me.role, nextData.me.workstation),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load Garage data.");
    } finally {
      setReloading(false);
    }
  }

  // Snapshot tiket untuk modul lain (dashboard, notifikasi). Production Hub
  // mem-poll papannya sendiri via /api/production.
  const loadKitchenOrders = useCallback(async () => {
    try {
      const kitchenOrders = await garageApi.get<KitchenOrder[]>("/api/kitchen/orders", {
        cache: "no-store",
      });
      setData((current) => (current ? { ...current, kitchenOrders } : current));
    } catch {
      // Non-blocking: data tiket lama tetap dipakai sampai sinkron berikutnya.
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

  // Smart Partner Hub: status produk mitra (Buka/Jeda/Tutup, Tersedia/Habis dari Portal Mitra) ikut
  // berubah di POS/waiter tanpa muat ulang. Hanya produk mitra yang disentuh; tanpa perubahan = tanpa render.
  const setMenuItemsInData = useCallback((action: SetStateAction<MenuItem[]>) => {
    setData((current) => {
      if (!current) return current;
      const menuItems = typeof action === "function" ? action(current.menuItems) : action;
      return menuItems === current.menuItems ? current : { ...current, menuItems };
    });
  }, []);
  usePartnerMenuRefresh(
    hasPartnerItems(data?.menuItems ?? []),
    () => garageApi.get<MenuItem[]>("/api/menu", { cache: "no-store" }),
    setMenuItemsInData,
  );

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
            canAccessModuleAs(payload.me, current)
              ? current
              : homeModuleFor(payload.me.role, payload.me.workstation),
          );
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

  // Cross-module cache invalidation: saat mutation di modul lain (mis. POS submit/
  // void) memanggil invalidateGarageCache(tag), refetch data hub yang relevan
  // secara instan (tanpa nunggu polling). Idempoten — refetch ringan.
  useEffect(() => {
    const unsubKitchen = subscribeGarageCache(GARAGE_TAGS.kitchen, () => {
      void loadKitchenOrders();
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
    if (newlyLow.length > 0 && deviceSoundEnabled()) {
      // V2: satu pengumuman per gelombang (bukan per SKU) dan sekali per perangkat.
      const first = data.inventoryItems.find((entry) => entry.sku === newlyLow[0]);
      void voice.announce("warning_lowstock", {
        itemName: newlyLow.length === 1 ? (first?.name ?? null) : `${newlyLow.length} bahan`,
        dedupKey: `lowstock:${[...newlyLow].sort().join(",")}`,
      });
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
    // 60 detik cukup utk notifikasi low-stock; sebelumnya 15s = 4× lebih
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
      // V2: lepas push perangkat ini selagi sesi masih sah (perangkat bersama).
      await releasePushSubscriptionOnSignOut();
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
      // Tablet POS kembali ke login POS; OS/dashboard ke login Garage OS.
      window.location.replace(
        window.location.pathname.startsWith("/pos") ? "/pos-login" : "/login",
      );
    } catch {
      setSignOutError("Keluar gagal, coba lagi.");
    } finally {
      if (!redirected) {
        setSignOutPending(false);
        signOutInFlight.current = false;
      }
    }
  }

  // Klik notifikasi (pusat notifikasi / web push) → buka modul tujuan; tanda
  // tambahan (qr=1 / chat=1) diteruskan ke POS lewat event window.
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const raw = (event as CustomEvent<string>).detail;
      if (!raw) return;
      const url = new URL(raw, window.location.origin);
      const target = url.searchParams.get("module") as ModuleId | null;
      if (target && canAccessModuleAs(data?.me ?? { role: "Kasir" }, target)) {
        setActiveModule(target);
        setMobileOpen(false);
      }
      if (url.searchParams.get("qr") === "1") {
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("garage:open-qr")), 300);
      }
      if (url.searchParams.get("chat") === "1") {
        window.setTimeout(() => window.dispatchEvent(new CustomEvent("garage:open-chat")), 300);
      }
    };
    window.addEventListener("garage:navigate", onNavigate);
    // Dibuka dari notifikasi HP (tab baru): /os?module=pos&qr=1 → jalankan sekali.
    const params = new URLSearchParams(window.location.search);
    if (data?.me && (params.get("qr") === "1" || params.get("chat") === "1")) {
      onNavigate(new CustomEvent("garage:navigate", { detail: `${window.location.pathname}${window.location.search}` }));
      params.delete("qr");
      params.delete("chat");
      const rest = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    }
    return () => window.removeEventListener("garage:navigate", onNavigate);
  }, [data?.me]);

  function handleModuleChange(module: ModuleId) {
    if (!canAccessModuleAs(data?.me ?? { role: "Kasir" }, module)) {
      return;
    }

    setActiveModule(module);
    setMobileOpen(false);
  }

  // Aya (pet pengingat) meminta pindah modul tanpa muat ulang halaman.
  const handleModuleChangeRef = useRef(handleModuleChange);
  useEffect(() => {
    handleModuleChangeRef.current = handleModuleChange;
  });
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const target = (event as CustomEvent<{ module?: ModuleId }>).detail?.module;
      if (!target) return;
      event.preventDefault();
      handleModuleChangeRef.current(target);
    };
    window.addEventListener("garage:navigate-module", onNavigate);
    return () => window.removeEventListener("garage:navigate-module", onNavigate);
  }, []);

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

  const allowedModules = modulesForProfile(data.me);
  const roleHomeModule = homeModuleFor(data.me.role, data.me.workstation);
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
  const roleHomeLabel =
    modules.find((item) => item.id === roleHomeModule)?.label ?? "Beranda";

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
            data-nav-mode={!showDesktopSidebar ? "hidden" : sidebarOpen ? "expanded" : "compact"}
            className={`garage-scroll garage-side-panel garage-os-sidebar hidden h-full shrink-0 overflow-x-hidden overflow-y-auto gc-scroll border-r border-[#ff2638]/20 bg-[linear-gradient(180deg,#121317,#08090b_70%)] px-2 py-3 shadow-[18px_0_50px_rgba(0,0,0,0.28),inset_-1px_0_0_rgba(255,38,56,0.12)] transition-[width,padding,opacity] duration-200 md:block ${
              !showDesktopSidebar
                ? "w-0 border-0 p-0 opacity-0"
                : sidebarOpen
                  ? "md:w-[72px] xl:w-[264px] xl:px-3"
                  : "md:w-[72px]"
            }`}
            aria-hidden={!showDesktopSidebar}
          >
            <div className={`mb-3 flex items-center gap-2 ${sidebarOpen ? "justify-center xl:justify-between" : "justify-center"}`}>
              {sidebarOpen ? (
                <div className="hidden min-w-0 flex-1 xl:block">
                  <BrandBlock />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setSidebarOpen((value) => !value)}
                title={sidebarOpen ? "Ringkas navigasi" : "Perluas navigasi"}
                aria-label={sidebarOpen ? "Ringkas navigasi" : "Perluas navigasi"}
                aria-expanded={sidebarOpen}
                className="garage-press hidden size-11 shrink-0 items-center justify-center rounded-xl border border-[#34343c] bg-white/[0.06] transition-colors hover:border-[#d11a2a]/60 hover:bg-white/[0.1] xl:inline-flex"
              >
                {sidebarOpen ? (
                  <PanelLeft className="size-4 text-[#d0d0d6]" />
                ) : (
                  <Image
                    src="/garage-brand/garage-coffee-icon.png"
                    alt=""
                    aria-hidden="true"
                    width={40}
                    height={40}
                    className="size-9 object-contain"
                  />
                )}
              </button>
              <div className="flex size-11 items-center justify-center xl:hidden">
                <Image
                  src="/garage-brand/garage-coffee-icon.png"
                  alt="Garage Coffee"
                  width={40}
                  height={40}
                  className="size-9 object-contain"
                />
              </div>
            </div>

            {sidebarOpen ? (
              <div className="hidden xl:block">
                <OutletSwitcher
                  activeOutlet={data.me.outlet}
                  role={data.me.role}
                  onSwitched={() => loadBootstrap()}
                />
                <div className="garage-theme-card mt-3 rounded-xl border border-[#34343c] bg-white/[0.055] p-2">
                  <div className="mb-2 flex items-center justify-between gap-2 px-1">
                    <span className="garage-mono text-[10px]">Tema Garage OS</span>
                    <Badge className="border-[#f5a742]/35 bg-[#f5a742]/12 px-2 text-[10px] text-[#ffd08a]">
                      {themeLabel}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleModuleChange("settings")}
                    className="garage-press flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#4a4a54] bg-white/[0.045] px-3 text-xs font-semibold text-[#d4d4d8] transition-colors hover:border-[#d11a2a]/60 hover:bg-white/[0.075] hover:text-white"
                  >
                    <Settings className="size-3.5" />
                    Atur di Pengaturan
                  </button>
                </div>
                <Separator className="my-3 bg-[#34343c]" />
              </div>
            ) : null}

            <ModuleNav
              activeModule={safeActiveModule}
              profile={data.me}
              onChange={handleModuleChange}
              approvalBadgeCount={pendingApprovalCount}
              recruitmentBadgeCount={newRecruitmentCount}
              compact={!sidebarOpen}
              desktopRail
            />

            <div
              title={`${data.me.user.name} · ${data.me.role} · ${data.me.outlet.name}`}
              className={`mt-4 flex min-w-0 items-center gap-2 border-t border-[#34343c] pt-3 ${sidebarOpen ? "justify-center xl:justify-start" : "justify-center"}`}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#d11a2a]/35 bg-[#d11a2a]/15 text-xs font-extrabold text-[#ffccd1]">
                {data.me.user.name.slice(0, 2).toUpperCase()}
              </div>
              {sidebarOpen ? (
                <div className="hidden min-w-0 xl:block">
                  <p className="truncate text-xs font-semibold text-foreground">{data.me.user.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{data.me.role} · {data.me.outlet.code}</p>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!isPosMode && (
            <header
              className={`garage-os-toolbar shrink-0 border-b border-[#34343c] bg-[#0b0b0e] px-3 sm:px-5 ${
                isKitchenMode ? "py-2" : "py-3"
              }`}
            >
              <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
                <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="garage-press h-11 w-11 shrink-0 border-[#4a4a54] bg-white/[0.08] md:hidden"
                      aria-label="Buka navigasi Garage OS"
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
                        profile={data.me}
                        onChange={(value) => {
                          handleModuleChange(value);
                          setMobileOpen(false);
                        }}
                        approvalBadgeCount={pendingApprovalCount}
                        recruitmentBadgeCount={newRecruitmentCount}
                      />
                    </div>
                  </SheetContent>
                </Sheet>

                {/* HP & tablet potret: judul modul turun ke baris sendiri supaya tidak terpotong ("Dashb…"). */}
                <div aria-hidden className="flex-1 md:hidden" />
                <div className="order-last min-w-0 basis-full md:order-none md:flex-1 md:basis-auto">
                  <div className="flex items-center gap-2">
                    <active.icon className="size-4 text-[var(--gos-status-danger)]" />
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

                {canGoBackToRoleHome && (
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 shrink-0 gap-2 border-[#4a4a54] bg-white/[0.08] px-3 text-xs text-[#d4d4d8] hover:bg-white/[0.11]"
                    onClick={() => handleModuleChange(roleHomeModule)}
                    aria-label={`Kembali ke ${roleHomeLabel}`}
                    title={`Kembali ke ${roleHomeLabel}`}
                  >
                    <Home className="size-4" />
                    <span className="hidden sm:inline">{roleHomeLabel}</span>
                  </Button>
                )}

                {/* Absen = aksi kelas satu: selalu tampak, tanpa buka profil (NAV_ACTION_AUDIT §1.3). */}
                {canAccessModuleAs(data.me, "absensi-v2") && (
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-11 shrink-0 gap-2 border-[#f5a742]/50 bg-[#f5a742]/12 px-3 text-xs text-[#ffe9c7] hover:bg-[#f5a742]/20"
                    onClick={() => window.location.assign("/absen")}
                    aria-label="Absen kehadiran"
                    title="Absen kehadiran"
                  >
                    <Fingerprint className="size-4" />
                    <span className="hidden sm:inline">Absen</span>
                  </Button>
                )}

                <StaffNotificationCenter newOrderSound={data.settings?.newOrderSound} />
                <GarageAiAlertsBell
                  role={data.me.role}
                  onOpenAiModule={() => handleModuleChange("ai-agent")}
                />

                {/* Keluar = satu-satunya tombol logout (NAV_ACTION_AUDIT §1.1). */}
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press h-11 shrink-0 gap-2 border-[#d11a2a]/55 bg-[#d11a2a]/14 px-3 text-xs text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                  disabled={signOutPending}
                  onClick={() => void handleSignOut()}
                  aria-label="Keluar"
                >
                  <LogOut className="size-4" />
                  <span className="hidden sm:inline">
                    {signOutPending ? "Keluar..." : "Keluar"}
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
                    <DropdownMenuLabel>Aksi cepat</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {canAccessModuleAs(data.me, "absensi-v2") && (
                      <DropdownMenuItem onClick={() => window.location.assign("/absen")}>
                        <Fingerprint className="mr-2 size-4" />
                        Absen kehadiran
                      </DropdownMenuItem>
                    )}
                    {canAccessModuleAs(data.me, "pos") && (
                      <DropdownMenuItem onClick={() => handleModuleChange("pos")}>
                        Buka POS
                      </DropdownMenuItem>
                    )}
                    {canAccessModuleAs(data.me, "finance") && (
                      <DropdownMenuItem onClick={() => handleModuleChange("finance")}>
                        Mulai tutup buku
                      </DropdownMenuItem>
                    )}
                    {canAccessModuleAs(data.me, "approvals") && (
                      <DropdownMenuItem onClick={() => handleModuleChange("approvals")}>
                        Tinjau approval
                      </DropdownMenuItem>
                    )}
                    {(data.me.role === "Owner" || data.me.role === "Manajer") && (
                      <DropdownMenuItem onClick={() => window.location.assign("/account/pin")}>
                        <KeyRound className="mr-2 size-4" />
                        PIN persetujuan
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => void loadBootstrap()}>
                      Muat ulang data
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
              {/* Sheet "Garage Command" dihapus di POS: navigasi modul kini menyatu
                  di dalam satu menu "Menu Kasir" (NAV_ACTION_AUDIT §1.4 — satu sidebar
                  per konteks). */}
              <PosHeaderBrand />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <active.icon className="size-4 shrink-0 text-[var(--gos-status-danger)]" />
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
              <StaffNotificationCenter newOrderSound={data.settings?.newOrderSound} />
              <GarageAiAlertsBell
                role={data.me.role}
                onOpenAiModule={
                  canAccessModuleAs(data.me, "ai-agent")
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
                <AlertTitle>Keluar gagal</AlertTitle>
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
                  <WmsAlertWidget variant="card" />
                  <PartnerDashboardWidget role={data.me.role} />
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
                  cashSession={data.posCashSession ?? data.cashSession}
                  settings={data.settings}
                  onCashSessionOpened={() => loadBootstrap()}
                  onExit={() => handleModuleChange("dashboard")}
                  onOpenEarnings={() => handleModuleChange("earnings")}
                  // Order baru: refresh KDS saja. CashSession internal counters
                  // disinkron lewat shift report / close-shift fetch on-demand.
                  // Sebelumnya tiap order trigger /api/bootstrap (600-2000ms).
                  onOrderCreated={() => loadKitchenOrders()}
                  // Refetch menu (imageUrl/stok) setelah upload/hapus foto di POS
                  // supaya foto langsung tampil tanpa reload halaman.
                  onMenuChanged={loadMenu}
                  onSignOut={handleSignOut}
                  signOutPending={signOutPending}
                  signOutError={signOutError}
                  themeMode={garageTheme}
                    onThemeChange={() => undefined}
                  cashierTheme={cashierTheme}
                  onCashierThemeChange={setCashierTheme}
                  navModules={modules
                    .filter(
                      (m) =>
                        canAccessModuleAs(data.me, m.id) &&
                        m.id !== "pos" &&
                        !["absensi-v2", "wallet-gaji", "wallet-fee"].includes(m.id),
                    )
                    .map((m) => ({ id: m.id, label: m.label, icon: m.icon }))}
                  onNavigateModule={(id) => handleModuleChange(id as ModuleId)}
                />
              </DateFilterProvider>
            )}
            {safeActiveModule === "ops-center" && (
              <OpsCenterView me={data.me} onNavigate={handleModuleChange} />
            )}
            {safeActiveModule === "courier" && <CourierView me={data.me} />}
            {safeActiveModule === "events" && <EventsView canExport={data.me.role === "Owner"} />}
            {safeActiveModule === "ai-agent" && <AiPosAgentView me={data.me} />}
            {safeActiveModule === "kitchen" && (
              <div className="space-y-3">
                <WmsAlertWidget variant="banner" />
                <ProductionView
                  me={data.me}
                  menuItems={data.menuItems}
                  performance={kitchenPerformance}
                  performanceLoading={kitchenPerformanceLoading}
                  performanceError={kitchenPerformanceError}
                  canViewPerformance={canSeeKitchenPerformance}
                  onRefreshPerformance={() => loadKitchenPerformance()}
                  onNavigateModule={(id) => handleModuleChange(id as ModuleId)}
                />
              </div>
            )}
            {safeActiveModule === "waiter" && <WaiterView me={data.me} />}
            {safeActiveModule === "produk" && (
              <InventoryView
                role={data.me.role}
                menuItems={data.menuItems}
                inventoryItems={data.inventoryItems}
                stockMovements={data.stockMovements}
                onMenuChanged={loadMenu}
                onNavigateModule={handleModuleChange}
                productsOnly
              />
            )}
            {safeActiveModule === "inventory" && <WarehouseRedirect />}
            {safeActiveModule === "partners" && <PartnerHubRedirect />}
            {safeActiveModule === "finance" && (
              <DateFilterProvider>
                <div className="space-y-3">
                  <WmsAlertWidget variant="card" />
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
            {safeActiveModule === "training" && <GarageTrainingModule role={data.me.role} workstation={data.me.workstation} />}
            {safeActiveModule === "recruitment" && <RecruitmentView />}
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

// ApprovalsView lama (mock approval note + grid cards) sudah diganti dengan
// ApprovalsBoard di src/components/garage/approvals-board.tsx. Komponen baru
// punya: filter tabs, stats bar, detail modal, required reject reason,
// bulk decide, WA notify requester, saved reason templates.

const websiteManagerRoles = new Set<Role>(["Owner", "Manajer"]);

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
  const [alt, setAlt] = useState("Hero Garage Coffee");
  const [uploading, setUploading] = useState(false);

  // Business info (C10) — info bisnis editable untuk landing publik.
  type BusinessInfoForm = {
    tagline: string;
    whatsapp: string;
    instagram: string;
    email: string;
    address: string;
    hoursOpen: string;
    hoursClose: string;
    mapsUrl: string;
    aboutText: string;
  };
  const [bizInfo, setBizInfo] = useState<BusinessInfoForm | null>(null);
  const [bizSaving, setBizSaving] = useState(false);
  const [bizError, setBizError] = useState<string | null>(null);
  const [bizSuccess, setBizSuccess] = useState<string | null>(null);

  const loadBizInfo = useCallback(async () => {
    try {
      const info = await garageApi.get<BusinessInfoForm>("/api/site/business-info", {
        cache: "no-store",
      });
      setBizInfo(info);
    } catch {
      // Diam: form muncul saat data siap; error utama ditangani saat simpan.
    }
  }, []);

  async function submitBizInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!bizInfo) return;
    if (!canManageWebsite) {
      setBizError("Role ini hanya bisa melihat preview website.");
      return;
    }
    setBizSaving(true);
    setBizError(null);
    setBizSuccess(null);
    try {
      const saved = await garageApi.put<BusinessInfoForm>("/api/site/business-info", bizInfo);
      setBizInfo(saved);
      setBizSuccess("Info bisnis tersimpan & langsung dipakai landing.");
    } catch (error) {
      setBizError(error instanceof Error ? error.message : "Info bisnis gagal disimpan.");
    } finally {
      setBizSaving(false);
    }
  }

  // Testimoni landing (C6) — owner isi review ASLI.
  type TestimonialForm = { name: string; role: string; text: string; rating: number };
  const [testimonials, setTestimonials] = useState<TestimonialForm[]>([]);
  const [tstSaving, setTstSaving] = useState(false);
  const [tstError, setTstError] = useState<string | null>(null);
  const [tstSuccess, setTstSuccess] = useState<string | null>(null);

  const loadTestimonials = useCallback(async () => {
    try {
      const rows = await garageApi.get<TestimonialForm[]>("/api/site/testimonials", {
        cache: "no-store",
      });
      setTestimonials(Array.isArray(rows) ? rows : []);
    } catch {
      // diam
    }
  }, []);

  async function submitTestimonials() {
    if (!canManageWebsite) {
      setTstError("Role ini hanya bisa melihat preview website.");
      return;
    }
    const items = testimonials.filter((t) => t.text.trim());
    setTstSaving(true);
    setTstError(null);
    setTstSuccess(null);
    try {
      const saved = await garageApi.put<TestimonialForm[]>("/api/site/testimonials", { items });
      setTestimonials(Array.isArray(saved) ? saved : []);
      setTstSuccess(`${items.length} testimoni tersimpan & tampil di landing.`);
    } catch (error) {
      setTstError(error instanceof Error ? error.message : "Testimoni gagal disimpan.");
    } finally {
      setTstSaving(false);
    }
  }

  // Event website — jadwal berubah-ubah, diatur Owner/Manajer (maks 30).
  type SiteEventForm = {
    id?: string;
    title: string;
    tag: string;
    date: string;
    time: string;
    desc: string;
    capacity: string;
  };
  const [siteEvents, setSiteEvents] = useState<SiteEventForm[]>([]);
  const [evSaving, setEvSaving] = useState(false);
  const [evError, setEvError] = useState<string | null>(null);
  const [evSuccess, setEvSuccess] = useState<string | null>(null);
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

  const loadSiteEvents = useCallback(async () => {
    try {
      const rows = await garageApi.get<Array<Omit<SiteEventForm, "capacity"> & { capacity: number | null }>>(
        "/api/site/events?all=1",
        { cache: "no-store" },
      );
      setSiteEvents(
        (Array.isArray(rows) ? rows : []).map((row) => ({
          ...row,
          capacity: row.capacity ? String(row.capacity) : "",
        })),
      );
    } catch {
      // diam — role tanpa website:manage
    }
  }, []);

  async function submitSiteEvents() {
    if (!canManageWebsite) {
      setEvError("Role ini hanya bisa melihat preview website.");
      return;
    }
    const filled = siteEvents.filter((e) => e.title.trim() || e.date || e.desc.trim());
    const incomplete = filled.find((e) => !e.title.trim() || !e.date || !e.time);
    if (incomplete) {
      setEvError("Setiap event wajib punya judul, tanggal, dan jam.");
      return;
    }
    setEvSaving(true);
    setEvError(null);
    setEvSuccess(null);
    try {
      const saved = await garageApi.put<Array<Omit<SiteEventForm, "capacity"> & { capacity: number | null }>>(
        "/api/site/events",
        {
          items: filled.map((e) => ({
            ...(e.id ? { id: e.id } : {}),
            title: e.title.trim(),
            tag: e.tag.trim() || "Event",
            date: e.date,
            time: e.time,
            desc: e.desc.trim(),
            capacity: e.capacity ? Number(e.capacity) : null,
          })),
        },
      );
      const rows = Array.isArray(saved) ? saved : [];
      setSiteEvents(rows.map((row) => ({ ...row, capacity: row.capacity ? String(row.capacity) : "" })));
      const upcoming = rows.filter((row) => row.date >= todayKey).length;
      setEvSuccess(`${rows.length} event tersimpan · ${upcoming} tampil di website (yang sudah lewat otomatis disembunyikan).`);
    } catch (error) {
      setEvError(error instanceof Error ? error.message : "Event gagal disimpan.");
    } finally {
      setEvSaving(false);
    }
  }

  // Feed sosmed landing — owner tempel link postingan/video terbaru (maks 6).
  type SocialPostForm = { platform: "instagram" | "tiktok" | "youtube" | "facebook"; url: string; title: string };
  const [socialPosts, setSocialPosts] = useState<SocialPostForm[]>([]);
  const [spSaving, setSpSaving] = useState(false);
  const [spError, setSpError] = useState<string | null>(null);
  const [spSuccess, setSpSuccess] = useState<string | null>(null);

  const loadSocialPosts = useCallback(async () => {
    try {
      const rows = await garageApi.get<SocialPostForm[]>("/api/site/social-posts", { cache: "no-store" });
      setSocialPosts(Array.isArray(rows) ? rows : []);
    } catch {
      // diam
    }
  }, []);

  async function submitSocialPosts() {
    if (!canManageWebsite) {
      setSpError("Role ini hanya bisa melihat preview website.");
      return;
    }
    const items = socialPosts.filter((post) => post.url.trim());
    setSpSaving(true);
    setSpError(null);
    setSpSuccess(null);
    try {
      const saved = await garageApi.put<SocialPostForm[]>("/api/site/social-posts", { items });
      setSocialPosts(Array.isArray(saved) ? saved : []);
      setSpSuccess(`${items.length} postingan tersimpan & tampil di landing.`);
    } catch (error) {
      setSpError(error instanceof Error ? error.message : "Feed sosmed gagal disimpan.");
    } finally {
      setSpSaving(false);
    }
  }

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
      void loadBizInfo();
      void loadTestimonials();
      void loadSiteEvents();
      void loadSocialPosts();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadHero, loadBizInfo, loadTestimonials, loadSiteEvents, loadSocialPosts]);

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
                  alt={hero.alt || "Hero Garage Coffee"}
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
                  Upload hanya tersedia untuk Owner dan Manajer.
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
                  placeholder="Contoh: Empat gelas Garage Coffee"
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

      <WebsiteAtmosphereCard canManage={canManageWebsite} />

      {/* Info Bisnis editable (C10) — dipakai landing publik (SEO + kontak). */}
      <Card className="garage-panel garage-animate-in">
        <CardHeader>
          <CardTitle>Info Bisnis Landing</CardTitle>
          <CardDescription>
            Tagline, WhatsApp, alamat, jam buka, Instagram & Maps. Dipakai landing
            publik (SEO &amp; kontak). Tersimpan langsung dipakai tanpa redeploy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!bizInfo ? (
            <p className="text-sm text-[#9696a1]">Memuat info bisnis…</p>
          ) : (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={submitBizInfo}>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#d4d4d8]">Tagline</span>
                <Input
                  value={bizInfo.tagline}
                  onChange={(e) => setBizInfo({ ...bizInfo, tagline: e.target.value })}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="Tagline singkat"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Telepon & WhatsApp (62…)</span>
                <Input
                  value={bizInfo.whatsapp}
                  onChange={(e) => setBizInfo({ ...bizInfo, whatsapp: e.target.value.replace(/[^\d]/g, "") })}
                  className="border-[#34343c] bg-white/[0.06] font-mono"
                  placeholder="6285121552341"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Instagram (handle)</span>
                <Input
                  value={bizInfo.instagram}
                  onChange={(e) => setBizInfo({ ...bizInfo, instagram: e.target.value.replace(/^@/, "") })}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="garagecoffee"
                />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#d4d4d8]">Alamat</span>
                <Input
                  value={bizInfo.address}
                  onChange={(e) => setBizInfo({ ...bizInfo, address: e.target.value })}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="Jl. …"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Jam buka (00:00–23:59 = 24 jam)</span>
                <Input
                  value={bizInfo.hoursOpen}
                  onChange={(e) => setBizInfo({ ...bizInfo, hoursOpen: e.target.value })}
                  className="border-[#34343c] bg-white/[0.06] font-mono"
                  placeholder="00:00"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-[#d4d4d8]">Jam tutup</span>
                <Input
                  value={bizInfo.hoursClose}
                  onChange={(e) => setBizInfo({ ...bizInfo, hoursClose: e.target.value })}
                  className="border-[#34343c] bg-white/[0.06] font-mono"
                  placeholder="23:59"
                />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#d4d4d8]">Email</span>
                <Input
                  value={bizInfo.email}
                  onChange={(e) => setBizInfo({ ...bizInfo, email: e.target.value })}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="email@domain.com"
                />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#d4d4d8]">Google Maps URL (catatan — website selalu memakai profil Google resmi)</span>
                <Input
                  value={bizInfo.mapsUrl}
                  onChange={(e) => setBizInfo({ ...bizInfo, mapsUrl: e.target.value })}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="Otomatis: profil Google resmi (Place ID)"
                />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs font-semibold text-[#d4d4d8]">About / Story (landing)</span>
                <textarea
                  value={bizInfo.aboutText}
                  onChange={(e) => setBizInfo({ ...bizInfo, aboutText: e.target.value })}
                  className="garage-scroll min-h-[120px] rounded-md border border-[#34343c] bg-white/[0.06] p-2 text-sm text-white"
                  placeholder="Cerita singkat tentang Garage… (pisahkan paragraf dengan baris kosong)"
                  maxLength={2000}
                />
                <span className="text-[10px] text-[#a1a1aa]">Pisahkan antar-paragraf dengan baris kosong (Enter 2×).</span>
              </label>
              {bizError && (
                <p className="sm:col-span-2 text-sm text-[#ffb4bd]">{bizError}</p>
              )}
              {bizSuccess && (
                <p className="sm:col-span-2 text-sm text-[#bbf7d0]">{bizSuccess}</p>
              )}
              {canManageWebsite && (
                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    disabled={bizSaving}
                    className="garage-press bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                  >
                    {bizSaving ? "Menyimpan…" : "Simpan Info Bisnis"}
                  </Button>
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      {/* Testimoni landing (C6) — review asli, owner-managed */}
      <Card className="garage-panel garage-animate-in">
        <CardHeader>
          <CardTitle>Testimoni Landing</CardTitle>
          <CardDescription>
            Review pelanggan ASLI. Tampil di landing (section &ldquo;Kata mereka&rdquo;),
            tersembunyi otomatis bila kosong. Maks 20.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {testimonials.length === 0 ? (
            <p className="text-sm text-[#9696a1]">Belum ada testimoni. Tambah review asli pelanggan di bawah.</p>
          ) : (
            testimonials.map((t, idx) => (
              <div key={idx} className="grid gap-2 rounded-md border border-[#34343c] bg-black/15 p-3 sm:grid-cols-[1fr_1fr_90px_40px]">
                <Input
                  value={t.name}
                  onChange={(e) => setTestimonials(testimonials.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="Nama pelanggan"
                />
                <Input
                  value={t.role}
                  onChange={(e) => setTestimonials(testimonials.map((x, i) => i === idx ? { ...x, role: e.target.value } : x))}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="Mis. Member · Pelanggan tetap"
                />
                <Select
                  value={String(t.rating)}
                  onValueChange={(v) => setTestimonials(testimonials.map((x, i) => i === idx ? { ...x, rating: Number(v) } : x))}
                >
                  <SelectTrigger className="border-[#34343c] bg-white/[0.06]">
                    <SelectValue placeholder="★" />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 4, 3, 2, 1].map((r) => (
                      <SelectItem key={r} value={String(r)}>{r} ★</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press border-[#34343c] bg-white/[0.04] px-0"
                  onClick={() => setTestimonials(testimonials.filter((_, i) => i !== idx))}
                  aria-label="Hapus testimoni"
                >
                  <Trash2 className="size-4" />
                </Button>
                <textarea
                  value={t.text}
                  onChange={(e) => setTestimonials(testimonials.map((x, i) => i === idx ? { ...x, text: e.target.value } : x))}
                  className="garage-scroll min-h-[64px] rounded-md border border-[#34343c] bg-white/[0.06] p-2 text-sm text-white sm:col-span-4"
                  placeholder="Isi review pelanggan…"
                  maxLength={600}
                />
              </div>
            ))
          )}
          {tstError && <p className="text-sm text-[#ffb4bd]">{tstError}</p>}
          {tstSuccess && <p className="text-sm text-[#bbf7d0]">{tstSuccess}</p>}
          {canManageWebsite && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press border-[#34343c] bg-white/[0.04]"
                disabled={testimonials.length >= 20}
                onClick={() => setTestimonials([...testimonials, { name: "", role: "", text: "", rating: 5 }])}
              >
                + Tambah Testimoni
              </Button>
              <Button
                type="button"
                disabled={tstSaving}
                className="garage-press bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                onClick={() => void submitTestimonials()}
              >
                {tstSaving ? "Menyimpan…" : "Simpan Testimoni"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event website — jadwal berubah-ubah, owner-managed */}
      <Card className="garage-panel garage-animate-in">
        <CardHeader>
          <CardTitle>Event Website</CardTitle>
          <CardDescription>
            Jadwal event di section &ldquo;Event &amp; komunitas&rdquo; landing. Event yang sudah lewat
            otomatis disembunyikan dari website (tetap tersimpan di sini). Bila tidak ada event,
            landing menampilkan ajakan booking acara &amp; Instagram. Maks 30.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {siteEvents.length === 0 ? (
            <p className="text-sm text-[#9696a1]">Belum ada event. Tambah event di bawah.</p>
          ) : (
            siteEvents.map((ev, idx) => {
              const past = Boolean(ev.date) && ev.date < todayKey;
              const update = (patch: Partial<SiteEventForm>) =>
                setSiteEvents(siteEvents.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
              return (
                <div
                  key={ev.id ?? `new-${idx}`}
                  className={`grid gap-2 rounded-md border p-3 sm:grid-cols-[1.4fr_1fr_150px_110px_40px] ${
                    past ? "border-[#34343c] bg-black/30 opacity-75" : "border-[#34343c] bg-black/15"
                  }`}
                >
                  <Input
                    value={ev.title}
                    onChange={(e) => update({ title: e.target.value })}
                    className="border-[#34343c] bg-white/[0.06]"
                    placeholder="Judul event, mis. Kopdar Malam Minggu"
                    maxLength={80}
                    aria-label="Judul event"
                  />
                  <Input
                    value={ev.tag}
                    onChange={(e) => update({ tag: e.target.value })}
                    className="border-[#34343c] bg-white/[0.06]"
                    placeholder="Kategori, mis. Kopdar Motor"
                    maxLength={40}
                    aria-label="Kategori event"
                  />
                  <Input
                    type="date"
                    value={ev.date}
                    onChange={(e) => update({ date: e.target.value })}
                    className="border-[#34343c] bg-white/[0.06]"
                    aria-label="Tanggal event"
                  />
                  <Input
                    type="time"
                    value={ev.time}
                    onChange={(e) => update({ time: e.target.value })}
                    className="border-[#34343c] bg-white/[0.06]"
                    aria-label="Jam mulai"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press border-[#34343c] bg-white/[0.04] px-0"
                    onClick={() => setSiteEvents(siteEvents.filter((_, i) => i !== idx))}
                    aria-label="Hapus event"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <textarea
                    value={ev.desc}
                    onChange={(e) => update({ desc: e.target.value })}
                    className="garage-scroll min-h-[56px] rounded-md border border-[#34343c] bg-white/[0.06] p-2 text-sm text-white sm:col-span-3"
                    placeholder="Deskripsi singkat event…"
                    maxLength={400}
                    aria-label="Deskripsi event"
                  />
                  <div className="space-y-1 sm:col-span-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={5000}
                      value={ev.capacity}
                      onChange={(e) => update({ capacity: e.target.value })}
                      className="border-[#34343c] bg-white/[0.06]"
                      placeholder="Kapasitas (opsional)"
                      aria-label="Kapasitas orang"
                    />
                    {past ? (
                      <p className="text-[11px] font-semibold text-[#ffd08a]">Sudah lewat · tidak tampil</p>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
          {evError && <p className="text-sm text-[#ffb4bd]">{evError}</p>}
          {evSuccess && <p className="text-sm text-[#e4e4e7]">{evSuccess}</p>}
          {canManageWebsite && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press border-[#34343c] bg-white/[0.04]"
                disabled={siteEvents.length >= 30}
                onClick={() =>
                  setSiteEvents([
                    ...siteEvents,
                    { title: "", tag: "", date: todayKey, time: "19:00", desc: "", capacity: "" },
                  ])
                }
              >
                + Tambah Event
              </Button>
              <Button
                type="button"
                disabled={evSaving}
                className="garage-press bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                onClick={() => void submitSiteEvents()}
              >
                {evSaving ? "Menyimpan…" : "Simpan Event"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feed sosmed landing — link postingan/video terbaru, owner-managed */}
      <Card className="garage-panel garage-animate-in">
        <CardHeader>
          <CardTitle>Feed Sosmed Landing</CardTitle>
          <CardDescription>
            Tempel link postingan/video terbaru Instagram, TikTok, YouTube, atau Facebook (maks 6).
            Tampil di section sosmed landing; bila kosong, landing memakai profil sosmed biasa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {socialPosts.length === 0 ? (
            <p className="text-sm text-[#b8b8bf]">Belum ada postingan. Tambah link video/foto terbaru di bawah.</p>
          ) : (
            socialPosts.map((post, idx) => (
              <div key={idx} className="grid gap-2 rounded-md border border-[#34343c] bg-black/15 p-3 sm:grid-cols-[140px_1fr_1fr_40px]">
                <Select
                  value={post.platform}
                  onValueChange={(value) =>
                    setSocialPosts(socialPosts.map((x, i) => (i === idx ? { ...x, platform: value as SocialPostForm["platform"] } : x)))
                  }
                >
                  <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={post.url}
                  onChange={(e) => setSocialPosts(socialPosts.map((x, i) => (i === idx ? { ...x, url: e.target.value } : x)))}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="https://www.tiktok.com/@garage_tbt.id/video/…"
                  inputMode="url"
                />
                <Input
                  value={post.title}
                  onChange={(e) => setSocialPosts(socialPosts.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))}
                  className="border-[#34343c] bg-white/[0.06]"
                  placeholder="Judul singkat, mis. Latte art malam minggu"
                  maxLength={80}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="garage-press border-[#34343c] bg-white/[0.04] px-0"
                  onClick={() => setSocialPosts(socialPosts.filter((_, i) => i !== idx))}
                  aria-label="Hapus postingan"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))
          )}
          {spError && <p className="text-sm text-[#ffb4bd]">{spError}</p>}
          {spSuccess && <p className="text-sm text-[#bbf7d0]">{spSuccess}</p>}
          {canManageWebsite && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press border-[#34343c] bg-white/[0.04]"
                disabled={socialPosts.length >= 6}
                onClick={() => setSocialPosts([...socialPosts, { platform: "tiktok", url: "", title: "" }])}
              >
                + Tambah Postingan
              </Button>
              <Button
                type="button"
                disabled={spSaving}
                className="garage-press bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                onClick={() => void submitSocialPosts()}
              >
                {spSaving ? "Menyimpan…" : "Simpan Feed Sosmed"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// AuditView lama (static 3 KPI cards + read-only table) sudah diganti
// dengan AuditLogViewer di src/components/garage/audit-log-viewer.tsx.
// Komponen baru: live polling 15s, filter (status/date/actor/search),
// stats bar (events today, critical, warnings, top actor/module),
// modal detail dengan metadata JSON viewer.





