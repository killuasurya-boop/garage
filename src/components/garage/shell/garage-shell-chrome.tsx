"use client";

import {
ArrowRight,
Check,
Database,
RefreshCw
} from "lucide-react";
import Image from "next/image";
import {
useEffect,
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


const GARAGE_BRAND_LOGO_SRC = "/garage-brand/garage-coffee-logo.png";
const GARAGE_BRAND_ICON_SRC = "/garage-brand/garage-coffee-icon.png";
const GARAGE_BRAND_LOGO_WIDTH = 1200;
const GARAGE_BRAND_LOGO_HEIGHT = 282;

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

// Role yang boleh switch outlet â€” sinkron dengan server-side canSwitchOutlet
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

export function ModuleNav({
  activeModule,
  profile,
  onChange,
  approvalBadgeCount = 0,
  recruitmentBadgeCount = 0,
}: {
  activeModule: ModuleId;
  profile: StaffCapabilityProfile;
  onChange: (module: ModuleId) => void;
  approvalBadgeCount?: number;
  recruitmentBadgeCount?: number;
}) {
  const accessibleModules = modules.filter((module) =>
    canAccessModuleAs(profile, module.id),
  );

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
    // Payroll V2 modules navigasi ke halaman terpisah (bukan internal state).
    const PAYROLL_V2_ROUTES: Partial<Record<ModuleId, string>> = {
      "absensi-v2": "/absen",
      "wallet-gaji": "/staff/wallet-gaji",
      "wallet-fee": "/staff/wallet-fee",
      "payroll-owner": "/owner/payroll/today",
    };
    const externalRoute = PAYROLL_V2_ROUTES[module.id];
    return (
      <Tooltip key={module.id}>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-module-nav-item={module.id}
            onClick={() => {
              if (externalRoute) {
                window.location.assign(externalRoute);
              } else {
                onChange(module.id);
              }
            }}
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
                isActive ? "bg-[#d11a2a]/18 text-[#ff2a3a]" : "text-[#b8b8bf]"
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
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full ${badgeColor} px-1.5 text-[10px] font-extrabold text-white`}
                aria-label={badgeLabel}
              >
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>

            ) : isActive ? (
              <ArrowRight className="hidden size-4 shrink-0 text-[#ffccd1] min-[420px]:block" />
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{module.description}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <nav className="grid min-w-0 gap-3">
      {grouped.map((group) => (
        <div key={group.title} className="grid min-w-0 gap-1">
          <p className="garage-mono px-2.5 pb-0.5 text-[10px] uppercase tracking-[0.18em] text-[#7d7d87]">
            {group.title}
          </p>
          <div className="grid min-w-0 gap-1.5">
            {group.items.map(renderModuleButton)}
          </div>
        </div>
      ))}
    </nav>
  );
}
