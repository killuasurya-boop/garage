"use client";

import {
ArrowRight,
Check,
ChevronDown,
Database,
RefreshCw,
Search
} from "lucide-react";
import Image from "next/image";
import { GARAGE_BRAND_ASSETS, GARAGE_BRAND_WORDMARK_SIZE } from "@/lib/garage-brand-assets";
import {
useEffect,
useRef,
useState
} from "react";
import { Alert,AlertDescription,AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
Card,
CardContent,
CardDescription,
CardHeader,
CardTitle,
} from "@/components/ui/card";
import {
Tooltip,
TooltipContent,
TooltipTrigger,
} from "@/components/ui/tooltip";
import { garageApi } from "@/lib/api-client";
import {
modules,
type ModuleId,
type Role
} from "@/lib/garage-data";
import {
canAccessModuleAs,
MANAGEMENT_ROLES,
type StaffCapabilityProfile,
} from "@/lib/role-access";


const GARAGE_BRAND_LOGO_SRC = GARAGE_BRAND_ASSETS.wordmark;
const GARAGE_BRAND_ICON_SRC = GARAGE_BRAND_ASSETS.icon;
const GARAGE_BRAND_LOGO_WIDTH = GARAGE_BRAND_WORDMARK_SIZE.width;
const GARAGE_BRAND_LOGO_HEIGHT = GARAGE_BRAND_WORDMARK_SIZE.height;

export function GarageLoading({ title, detail }: { title: string; detail: string }) {
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

export function BackendSetupScreen({ message }: { message: string }) {
  // Detail env & perintah npm hanya untuk developer; karyawan di production cukup
  // diberi tahu server belum siap.
  if (process.env.NODE_ENV === "production") {
    return (
      <GarageErrorScreen
        title="Server Garage belum siap"
        detail="Hubungi Owner atau admin sistem. Coba lagi beberapa saat lagi."
        onRetry={() => window.location.reload()}
      />
    );
  }
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

export function GarageErrorScreen({
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
            Coba lagi
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

type BrandBlockMode = "sidebar" | "compact" | "loading";

// Role yang boleh switch outlet — sinkron dengan server-side canSwitchOutlet
const OUTLET_SWITCH_ROLES: ReadonlyArray<Role> = MANAGEMENT_ROLES;

export function OutletSwitcher({
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
            Outlet aktif {canSwitch ? "· bisa switch" : ""}
          </p>
          <p className="truncate text-sm font-bold text-white">
            {activeOutlet.code} &middot; {activeOutlet.name}
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
                        &middot; {o.name}
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
                      Switch outlet butuh role Owner / Manajer.
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

export function BrandBlock({
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
          alt="Garage Coffee"
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
          Ops cockpit - Coffee · Tebing Tinggi
        </p>
      )}
    </div>
  );
}

export function PosHeaderBrand() {
  return (
    <div className="flex shrink-0 items-center">
      <div className="hidden h-11 w-[min(178px,24vw)] items-center sm:flex">
        <Image
          src={GARAGE_BRAND_LOGO_SRC}
          alt="Garage Coffee"
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

const NAV_COLLAPSE_KEY = "garage:nav-collapsed-groups";

const PAYROLL_V2_ROUTES: Partial<Record<ModuleId, string>> = {
  "absensi-v2": "/absen",
  "wallet-gaji": "/staff/wallet-gaji",
  "wallet-fee": "/staff/wallet-fee",
  "payroll-owner": "/owner/payroll/today",
};

export function ModuleNav({
  activeModule,
  profile,
  onChange,
  approvalBadgeCount = 0,
  recruitmentBadgeCount = 0,
  compact = false,
  desktopRail = false,
}: {
  activeModule: ModuleId;
  profile: StaffCapabilityProfile;
  onChange: (module: ModuleId) => void;
  approvalBadgeCount?: number;
  recruitmentBadgeCount?: number;
  compact?: boolean;
  desktopRail?: boolean;
}) {
  const accessibleModules = modules.filter((module) =>
    canAccessModuleAs(profile, module.id),
  );
  // Crystal V5 (Owner, Nov 2026): cari modul (Ctrl+K) + grup accordion yang diingat per perangkat.
  // Hanya visual/navigasi — daftar modul tetap dari canAccessModuleAs (izin tidak berubah).
  const showLabels = !compact;
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(NAV_COLLAPSE_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferensi per perangkat dibaca sekali
      if (Array.isArray(saved)) setCollapsedGroups(saved.filter((value) => typeof value === "string"));
    } catch {
      /* localStorage tidak tersedia */
    }
  }, []);
  useEffect(() => {
    if (!desktopRail) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        const input = searchRef.current;
        if (!input || input.offsetParent === null) return;
        event.preventDefault();
        input.focus();
        input.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktopRail]);
  function toggleGroup(title: string) {
    setCollapsedGroups((current) => {
      const next = current.includes(title) ? current.filter((value) => value !== title) : [...current, title];
      try {
        window.localStorage.setItem(NAV_COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* abaikan */
      }
      return next;
    });
  }

  // Pengelompokan sidebar (D1/D2) — murni visual, tidak mengubah route/logika.
  // Modul yang tidak masuk grup mana pun jatuh ke "Lainnya" supaya tak hilang.
  const NAV_GROUPS: Array<{ title: string; ids: ModuleId[] }> = [
    { title: "Ringkasan", ids: ["dashboard", "ops-center", "ai-agent"] },
    { title: "Absensi & Wallet", ids: ["absensi-v2", "wallet-gaji", "wallet-fee"] },
    { title: "Operasional", ids: ["pos", "kitchen", "waiter", "courier", "produk", "inventory", "smart-notif"] },
    { title: "Pelanggan & Penjualan", ids: ["crm", "membership", "marketing", "website", "events"] },
    { title: "Keuangan", ids: ["finance", "earnings", "payroll-owner", "approvals"] },
    {
      title: "Manajemen & Sistem",
      ids: ["team-management", "recruitment", "audit", "company-control", "settings", "chat", "training"],
    },
  ];

  type NavModule = (typeof accessibleModules)[number];
  const byId = new Map<ModuleId, NavModule>(
    accessibleModules.map((module) => [module.id, module]),
  );
  const groupedIds = new Set(NAV_GROUPS.flatMap((group) => group.ids));
  const grouped = NAV_GROUPS.map((group) => ({
    title: group.title,
    items: group.ids
      .map((id) => byId.get(id))
      .filter((module): module is NavModule => Boolean(module)),
  })).filter((group) => group.items.length > 0);
  const leftover = accessibleModules.filter((module) => !groupedIds.has(module.id));
  if (leftover.length) {
    grouped.push({ title: "Lainnya", items: leftover });
  }

  // Payroll V2 modules navigasi ke halaman terpisah (bukan internal state).
  const activateModule = (id: ModuleId) => {
    const externalRoute = PAYROLL_V2_ROUTES[id];
    if (externalRoute) window.location.assign(externalRoute);
    else onChange(id);
  };

  const renderModuleButton = (module: NavModule) => {
    const isActive = activeModule === module.id;
    const showApprovalBadge = module.id === "approvals" && approvalBadgeCount > 0;
    const showRecruitmentBadge = module.id === "recruitment" && recruitmentBadgeCount > 0;
    const showBadge = showApprovalBadge || showRecruitmentBadge;
    const badgeCount = showApprovalBadge ? approvalBadgeCount : recruitmentBadgeCount;
    const badgeLabel = showApprovalBadge
      ? `${approvalBadgeCount} approval pending`
      : `${recruitmentBadgeCount} pelamar baru`;
    const badgeColor = showRecruitmentBadge
      ? "bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.65)]"
      : "bg-[#d11a2a] shadow-[0_0_8px_rgba(209,26,42,0.65)]";
    return (
      <Tooltip key={module.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-module-nav-item={module.id}
            onClick={() => activateModule(module.id)}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive ? "true" : undefined}
            className={`gc-nav-item garage-press relative min-h-11 w-full min-w-0 items-center gap-2 rounded-xl border text-left text-sm transition-colors duration-150 ${
              compact
                ? "flex justify-center px-1 py-1.5"
                : desktopRail
                  ? "flex justify-center px-1 py-1.5 xl:grid xl:grid-cols-[2rem_minmax(0,1fr)_auto] xl:px-2.5"
                  : "grid grid-cols-[2rem_minmax(0,1fr)_auto] px-2.5 py-1.5"
            } ${
              isActive
                ? "border-[#ff2638]/55 bg-[linear-gradient(90deg,rgba(255,38,56,0.28),rgba(225,37,43,0.08))] text-white shadow-[0_0_22px_rgba(255,38,56,0.22)]"
                : "border-transparent text-[#d4d4da] hover:border-white/12 hover:bg-white/[0.07] hover:text-white"
            }`}
          >
            <span
              data-module-nav-icon={module.id}
              className={`flex h-8 w-8 min-w-8 items-center justify-center rounded-lg border ${
                isActive
                  ? "border-[#ff5362]/60 bg-[linear-gradient(160deg,#f0333a,#9b1218)] text-white shadow-[0_0_14px_rgba(255,38,56,0.5)]"
                  : "border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0.01))] text-[#d4d4da]"
              }`}
              aria-hidden="true"
            >
              <module.icon className="size-4" />
            </span>
            <span className={`min-w-0 truncate text-sm font-semibold leading-tight ${compact ? "sr-only" : desktopRail ? "sr-only xl:not-sr-only" : ""}`}>
              {module.label}
            </span>
            {showBadge ? (
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full ${badgeColor} px-1.5 text-[10px] font-extrabold text-white ${compact ? "absolute -right-1 -top-1" : desktopRail ? "absolute -right-1 -top-1 xl:static" : ""}`}
                aria-label={badgeLabel}
              >
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>

            ) : isActive && !compact ? (
              <ArrowRight className={`hidden size-4 shrink-0 text-[#ffccd1] ${desktopRail ? "xl:block" : "min-[420px]:block"}`} />
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{module.description}</TooltipContent>
      </Tooltip>
    );
  };

  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery
    ? accessibleModules.filter((module) =>
        `${module.label} ${module.description ?? ""}`.toLowerCase().includes(normalizedQuery),
      )
    : null;

  return (
    <nav aria-label="Navigasi Garage OS" className={`grid min-w-0 gap-3 ${compact ? "gap-1.5" : desktopRail ? "gap-1.5 xl:gap-3" : ""}`}>
      {showLabels ? (
        <label className={`gc-nav-search relative items-center ${desktopRail ? "hidden xl:flex" : "flex"}`}>
          <Search className="pointer-events-none absolute left-3 size-4 text-[#b8b8be]" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
              if (event.key === "Enter" && searchResults?.[0]) {
                event.preventDefault();
                const first = searchResults[0];
                setQuery("");
                activateModule(first.id);
              }
            }}
            placeholder="Cari menu atau fitur…"
            aria-label="Cari menu Garage OS"
            aria-keyshortcuts="Control+K Meta+K"
            data-testid="module-nav-search"
            className="h-10 w-full rounded-xl border border-white/12 bg-white/[0.04] pl-9 pr-12 text-[13px] text-white placeholder:text-[#9a9aa4] focus:border-[#ff2638]/60 focus:outline-none"
          />
          <kbd className="pointer-events-none absolute right-2.5 rounded-md border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-[#b8b8be]">⌘K</kbd>
        </label>
      ) : null}
      {searchResults ? (
        <div className="grid min-w-0 gap-1.5" data-testid="module-nav-search-results">
          {searchResults.length ? (
            searchResults.map(renderModuleButton)
          ) : (
            <p className="px-2.5 py-2 text-[13px] text-[#b8b8be]">Tidak ada menu &ldquo;{query.trim()}&rdquo;.</p>
          )}
        </div>
      ) : (
        grouped.map((group) => {
          const hasActive = group.items.some((module) => module.id === activeModule);
          const collapsed = showLabels && collapsedGroups.includes(group.title) && !hasActive;
          const groupId = `nav-group-${group.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
          return (
            <div key={group.title} className={`grid min-w-0 gap-1 ${compact ? "border-b border-[#34343c] pb-2 last:border-0" : desktopRail ? "border-b border-[#34343c] pb-2 xl:border-0 xl:pb-0" : ""}`}>
              {showLabels ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={!collapsed}
                  aria-controls={groupId}
                  className={`group/nav-head items-center justify-between gap-2 rounded-md px-2.5 pb-0.5 text-left ${desktopRail ? "hidden xl:flex" : "flex"}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-[#ff2638] shadow-[0_0_8px_rgba(255,38,56,0.8)]" aria-hidden />
                    <span className="garage-mono text-[10px] uppercase tracking-[0.18em] text-[#a1a1aa] group-hover/nav-head:text-white">{group.title}</span>
                  </span>
                  <ChevronDown className={`size-3.5 text-[#a1a1aa] transition-transform duration-200 motion-reduce:transition-none ${collapsed ? "-rotate-90" : ""}`} aria-hidden />
                </button>
              ) : (
                <p className="sr-only">{group.title}</p>
              )}
              <div id={groupId} className={`grid min-w-0 gap-1.5 ${collapsed ? (desktopRail ? "xl:hidden" : "hidden") : ""}`}>
                {group.items.map(renderModuleButton)}
              </div>
            </div>
          );
        })
      )}
    </nav>
  );
}
