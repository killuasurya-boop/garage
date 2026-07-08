"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  FileText,
  Info,
  Megaphone,
  Palette,
  Printer,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
  Volume2,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { garageApi } from "@/lib/api-client";
import { printThermal } from "@/lib/print-client";
import { currency } from "@/lib/garage-data";
import type { AppSettings, GarageMe } from "@/lib/garage-api-types";
import { useGarageTheme } from "@/components/garage/theme/garage-theme-provider";
import { voice } from "@/lib/garage-voice";
import {
  garageOsThemePresetOptionsFor,
  getPreset,
  isLegacyGarageOsThemePreset,
  isMvpGarageOsPreset,
  isThemePresetId,
  themeFromPreset,
} from "@/lib/garage-theme";

const SettingsModuleFallback = () => (
  <div className="px-4 py-10 text-center text-sm text-zinc-400">Memuat settings...</div>
);

const DatabasePurgePanel = dynamic(
  () => import("@/components/garage/database-purge-panel").then((m) => m.DatabasePurgePanel),
  { loading: SettingsModuleFallback },
);
const GlobalSettingsPanel = dynamic(
  () => import("@/components/garage/admin/global-settings-panel").then((m) => m.GlobalSettingsPanel),
  { loading: SettingsModuleFallback },
);
const IntegrationControlCenter = dynamic(
  () =>
    import("@/components/garage/integration-control-center").then(
      (module) => module.IntegrationControlCenter,
    ),
  { loading: SettingsModuleFallback },
);
type AppSettingsClient = AppSettings;

type SettingsTab =
  | "theme"
  | "pos"
  | "approval"
  | "fee"
  | "branding"
  | "notif"
  | "ai"
  | "printer"
  | "loyalty"
  | "marketing";

export function SettingsView({ me }: { me: GarageMe }) {
  const { theme: activeOsTheme, setPreset: setOsThemePreset } = useGarageTheme();
  const [settings, setSettings] = useState<AppSettingsClient | null>(null);
  const [defaults, setDefaults] = useState<AppSettingsClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsAction, setSettingsAction] = useState<null | "sound" | "print">(null);
  const [draft, setDraft] = useState<Partial<AppSettingsClient>>({});
  const [activeTab, setActiveTab] = useState<SettingsTab>("pos");
  const [settingsQuery, setSettingsQuery] = useState("");
  // Scope toggle: "operational" (per outlet, default) vs "global" (sistem,
  // Owner/Admin only). Initial value bisa di-deep-link via ?scope=global.
  const [settingsScope, setSettingsScope] = useState<
    "operational" | "global" | "integrations"
  >(
    () => {
      if (typeof window === "undefined") return "operational";
      const param = new URLSearchParams(window.location.search).get("scope");
      return param === "global" || param === "integrations" ? param : "operational";
    },
  );

  const canWrite =
    me.role === "Owner / CEO" ||
    me.role === "Admin" ||
    me.role === "Manager Operasional" ||
    me.role === "Finance / CFO";
  const canSeeGlobalScope = me.role === "Owner / CEO" || me.role === "Admin";

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await garageApi.get<{
        settings: AppSettingsClient;
        defaults: AppSettingsClient;
      }>("/api/settings");
      setSettings(data.settings);
      setDefaults(data.defaults);
      if (isThemePresetId(data.settings.garageOsThemePreset)) {
        setOsThemePreset(data.settings.garageOsThemePreset);
      }
      setDraft({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pengaturan.");
    } finally {
      setLoading(false);
    }
  }, [setOsThemePreset]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSettings]);

  const merged: AppSettingsClient | null = useMemo(() => {
    if (!settings) return null;
    return { ...settings, ...draft };
  }, [settings, draft]);

  const dirty = Object.keys(draft).length > 0;

  // Guard: peringatkan saat reload/tutup tab kalau masih ada perubahan unsaved.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const themeDirty =
    typeof draft.garageOsThemePreset === "string" &&
    settings?.garageOsThemePreset !== draft.garageOsThemePreset;
  const savedThemePreset = settings?.garageOsThemePreset ?? defaults?.garageOsThemePreset ?? "industrial-garage";
  const themePresetOptions = useMemo(
    () => garageOsThemePresetOptionsFor(merged?.garageOsThemePreset),
    [merged?.garageOsThemePreset],
  );
  const sampleSubtotal = 100_000;
  const sampleServiceChargePct = merged?.serviceChargePct ?? 0;
  const sampleTaxPct = merged?.taxPct ?? 0;
  const samplePointsPerThousand = merged?.pointsPerThousand ?? 0;
  const sampleService = Math.round(sampleSubtotal * (sampleServiceChargePct / 100));
  const sampleTax = Math.round((sampleSubtotal + sampleService) * (sampleTaxPct / 100));
  const sampleDiscount = Math.round(sampleSubtotal * 0.1);
  const sampleTotal = sampleSubtotal + sampleService + sampleTax - sampleDiscount;
  const samplePoints = Math.floor((50_000 / 1000) * samplePointsPerThousand);
  const riskSettingLabels: Partial<Record<keyof AppSettingsClient, string>> = {
    serviceChargePct: "Service Charge",
    taxPct: "PB1 / Pajak Restoran",
    manualDiscountMaxPct: "Max Diskon Kasir",
    manualDiscountApprovalPct: "Threshold Approval Diskon",
    expenseApprovalThreshold: "Threshold Approval Expense",
    autoPrintReceipt: "Auto-Print Struk",
    pointsPerThousand: "Poin Loyalty",
    voucherMaxDiscountPct: "Max Discount Voucher",
    marketingMonthlyBudget: "Budget Marketing Bulanan",
    aiAutopilotEnabled: "GARAGE AI Autopilot",
    aiAutopilotStartHour: "Jam Mulai Autopilot",
    aiAutopilotEndHour: "Jam Selesai Autopilot",
    aiWhatsappHighAlerts: "WhatsApp Alert Prioritas Tinggi",
  };

  function setField<K extends keyof AppSettingsClient>(
    key: K,
    value: AppSettingsClient[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setThemePresetField(value: string) {
    if (!isThemePresetId(value) || !isMvpGarageOsPreset(value)) return;
    setDraft((current) => {
      const next = { ...current };
      if (settings?.garageOsThemePreset === value) {
        delete next.garageOsThemePreset;
      } else {
        next.garageOsThemePreset = value;
      }
      return next;
    });
    setOsThemePreset(value);
  }

  function cancelSettingsDraft() {
    setDraft({});
    if (settings && isThemePresetId(settings.garageOsThemePreset)) {
      setOsThemePreset(settings.garageOsThemePreset);
    }
  }

  async function saveSettings() {
    if (!dirty) return;
    const riskyChanges = Object.keys(draft)
      .filter((key): key is keyof AppSettingsClient => key in riskSettingLabels)
      .map((key) => riskSettingLabels[key])
      .filter(Boolean);

    if (
      riskyChanges.length > 0 &&
      !window.confirm(
        `Perubahan ini memengaruhi transaksi/laporan: ${riskyChanges.join(", ")}. Simpan sekarang?`,
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const result = await garageApi.patch<{ settings: AppSettingsClient }>(
        "/api/settings",
        draft,
      );
      setSettings(result.settings);
      if (isThemePresetId(result.settings.garageOsThemePreset)) {
        setOsThemePreset(result.settings.garageOsThemePreset);
      }
      setDraft({});
      setNotice(`${Object.keys(draft).length} pengaturan disimpan.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  function resetField<K extends keyof AppSettingsClient>(key: K) {
    if (!defaults) return;
    if (key === "garageOsThemePreset" && isThemePresetId(defaults.garageOsThemePreset)) {
      setThemePresetField(defaults.garageOsThemePreset);
      return;
    }
    setField(key, defaults[key]);
  }

  function playSettingsTestSound() {
    setSettingsAction("sound");
    setNotice(null);
    setError(null);
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        setError("Browser tidak mendukung test sound.");
        return;
      }

      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, context.currentTime);
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.24, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.38);
      window.setTimeout(() => void context.close(), 500);
      setNotice("Test sound QR order diputar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memutar test sound.");
    } finally {
      window.setTimeout(() => setSettingsAction(null), 450);
    }
  }

  async function testPrinter() {
    if (!merged) return;

    setSettingsAction("print");
    setNotice(null);
    setError(null);
    try {
      const response = await printThermal({
        printerName: merged.defaultPrinterName || undefined,
        copies: merged.receiptCopies,
        receipt: {
          invoiceNo: "TEST-SETTINGS",
          orderNo: "TEST-PRINT",
          createdAt: new Date().toISOString(),
          outlet: { name: me.outlet.name, code: me.outlet.code },
          cashier: { name: me.user.name },
          payment: { method: "TEST" },
          items: [
            {
              name: "Test Print GARAGE",
              variant: "Settings",
              qty: 1,
              unitPrice: 1000,
              lineTotal: 1000,
            },
          ],
          subtotal: 1000,
          service: 0,
          tax: 0,
          discount: 0,
          total: 1000,
        },
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; printer?: string; error?: { message?: string; hint?: string } }
        | null;

      if (!response.ok || payload?.error) {
        throw new Error(payload?.error?.hint || payload?.error?.message || "Test print gagal.");
      }

      setNotice(`Test print terkirim${payload?.printer ? ` ke ${payload.printer}` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal test print.");
      void voice.announce("warning_printer", {
        dedupKey: "settings-test-print",
      });
    } finally {
      setSettingsAction(null);
    }
  }

  const saveDraftLabel = useMemo(() => {
    const keys = Object.keys(draft);
    if (keys.length === 1 && keys[0] === "garageOsThemePreset") {
      return "Simpan tema";
    }
    return `Simpan ${keys.length} perubahan`;
  }, [draft]);

  if (loading || !merged || !defaults) {
    return (
      <section className="flex h-64 items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto size-6 animate-spin text-[#f5a742]" />
          <p className="mt-2 text-sm text-[#b8b8bf]">Memuat pengaturan...</p>
        </div>
      </section>
    );
  }

  const tabs: Array<{
    id: SettingsTab;
    label: string;
    icon: LucideIcon;
    group: string;
    keywords: string;
  }> = [
    { id: "pos", label: "POS Billing", icon: ShoppingCart, group: "Transaksi", keywords: "billing pajak pb1 service charge diskon kasir total struk pembayaran" },
    { id: "approval", label: "Approval", icon: ShieldCheck, group: "Transaksi", keywords: "approval persetujuan threshold diskon expense void" },
    { id: "fee", label: "Fee Staf", icon: Wallet, group: "Transaksi", keywords: "fee tarif insentif bonus gaji waiter koki barista kasir antar earning" },
    { id: "loyalty", label: "Loyalty", icon: Users, group: "Transaksi", keywords: "loyalty poin member reward point" },
    { id: "notif", label: "Notifikasi", icon: Bell, group: "Operasional", keywords: "notifikasi alert suara sound bell pemberitahuan" },
    { id: "printer", label: "Printer", icon: Printer, group: "Operasional", keywords: "printer cetak struk auto-print kertas" },
    { id: "ai", label: "GARAGE AI", icon: Sparkles, group: "Operasional", keywords: "garage ai autopilot whatsapp agent kecerdasan" },
    { id: "theme", label: "Tema OS", icon: Palette, group: "Brand & Tampilan", keywords: "tema warna preset tampilan os palette" },
    { id: "branding", label: "Branding", icon: FileText, group: "Brand & Tampilan", keywords: "branding logo nama outlet struk footer" },
    { id: "marketing", label: "Marketing", icon: Megaphone, group: "Brand & Tampilan", keywords: "marketing voucher budget promo kampanye diskon" },
  ];
  const settingsGroups = ["Transaksi", "Operasional", "Brand & Tampilan"];
  const normalizedSettingsQuery = settingsQuery.trim().toLowerCase();
  const matchesSettingsQuery = (tab: (typeof tabs)[number]) =>
    normalizedSettingsQuery.length === 0 ||
    tab.label.toLowerCase().includes(normalizedSettingsQuery) ||
    tab.keywords.includes(normalizedSettingsQuery);
  const visibleTabs = tabs.filter(matchesSettingsQuery);
  // Peta field→tab untuk indikator "perubahan belum disimpan" per kategori.
  const tabFieldKeys: Record<SettingsTab, Array<keyof AppSettingsClient>> = {
    theme: ["garageOsThemePreset"],
    pos: ["serviceChargePct", "taxPct", "manualDiscountMaxPct", "manualDiscountApprovalPct", "receiptHistoryMax"],
    approval: ["expenseApprovalThreshold"],
    fee: [
      "feeWaiterDeliveredPerItem",
      "feeKitchenReadyPerItem",
      "feeBaristaReadyPerItem",
      "feePackagingReadyPerItem",
      "feeCashierPaidPerItem",
    ],
    branding: ["brandName", "brandTagline", "outletAddress", "outletPhone", "npwp", "receiptFooter"],
    notif: ["approvalPollIntervalSec", "qrSoundOn", "autoPrintReceipt"],
    ai: [
      "aiAutopilotEnabled", "aiAutopilotStartHour", "aiAutopilotEndHour", "aiWhatsappHighAlerts",
      "aiWhatsappAlertTemplate", "aiWhatsappPhonesCashier", "aiWhatsappPhonesKitchen",
      "aiWhatsappPhonesGudang", "aiWhatsappPhonesManagement",
    ],
    printer: ["defaultPrinterName", "receiptCopies"],
    loyalty: ["pointsPerThousand", "voucherMaxDiscountPct"],
    marketing: [
      "marketingCampaignName", "marketingMonthlyBudget", "marketingDefaultSegment", "marketingUtmSource",
      "marketingAutoLogEnabled", "marketingWhatsappTemplate", "marketingDefaultChannel",
      "marketingDefaultDurationDays", "marketingApprovalThreshold", "marketingDefaultVoucherType",
      "marketingDefaultVoucherValue", "marketingQuietHoursStart", "marketingQuietHoursEnd",
    ],
  };
  const tabDirtyCount = (tabId: SettingsTab) =>
    tabFieldKeys[tabId].filter((key) => key in draft).length;
  const showThemeDebug =
    process.env.NODE_ENV !== "production" ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("themeDebug") === "1");

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="garage-display garage-chrome text-2xl">Pengaturan</h1>
          <p className="mt-1 text-sm text-[#b8b8bf]">
            {settingsScope === "global"
              ? "Konfigurasi sistem global Garage OS â€” POS, receipt, tax, security, AI, shift, dll. Owner / Admin only."
              : "Konfigurasi billing, branding, notifikasi, GARAGE AI, printer, loyalty, dan marketing per outlet. Perubahan tersimpan langsung ke DB."}
          </p>
        </div>
        {settingsScope === "operational" && dirty && canWrite ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
              onClick={cancelSettingsDraft}
              disabled={saving}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="garage-press h-10"
              onClick={() => void saveSettings()}
              disabled={saving}
            >
              {saving ? (
                <>
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Check className="mr-2 size-4" />
                  {saveDraftLabel}
                </>
              )}
            </Button>
          </div>
        ) : null}
      </div>

      {canSeeGlobalScope ? (
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#8a8a93]">
            Cakupan pengaturan
          </p>
          <div className={`grid gap-1 rounded-lg border border-[#34343c] bg-white/[0.04] p-1 ${me.role === "Owner / CEO" ? "grid-cols-3" : "grid-cols-2"}`}>
            <button
              type="button"
              onClick={() => setSettingsScope("operational")}
              aria-pressed={settingsScope === "operational"}
              className={`flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors ${
                settingsScope === "operational"
                  ? "bg-[#d11a2a] text-white shadow-[0_1px_8px_rgba(209,26,42,0.35)]"
                  : "text-[#d4d4d8] hover:bg-white/[0.06]"
              }`}
            >
              <Settings className="size-3.5 shrink-0" />
              <span className="truncate">Outlet ({me.outlet.code})</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsScope("global")}
              aria-pressed={settingsScope === "global"}
              className={`flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors ${
                settingsScope === "global"
                  ? "bg-[#d11a2a] text-white shadow-[0_1px_8px_rgba(209,26,42,0.35)]"
                  : "text-[#d4d4d8] hover:bg-white/[0.06]"
              }`}
            >
              <ShieldCheck className="size-3.5 shrink-0" />
              <span className="truncate">Global Sistem</span>
            </button>
            {me.role === "Owner / CEO" ? (
              <button
                type="button"
                onClick={() => setSettingsScope("integrations")}
                aria-pressed={settingsScope === "integrations"}
                className={`flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors ${
                  settingsScope === "integrations"
                    ? "bg-[#d11a2a] text-white shadow-[0_1px_8px_rgba(209,26,42,0.35)]"
                    : "text-[#d4d4d8] hover:bg-white/[0.06]"
                }`}
              >
                <PlugZap className="size-3.5 shrink-0" />
                <span className="truncate">Integrasi</span>
              </button>
            ) : null}
          </div>
          {/* Penjelas cakupan — hilangkan kesan "pengaturan dobel": ini scope beda,
              bukan menu terpisah yang sama (NAV_ACTION_AUDIT §1.8). */}
          <p className="text-[11px] leading-4 text-[#8a8a93]">
            {settingsScope === "operational"
              ? `Pengaturan khusus outlet ${me.outlet.code} — menimpa (override) default global untuk outlet ini saja.`
              : settingsScope === "global"
                ? "Default sistem untuk SEMUA outlet. Nilai di sini dipakai bila outlet tidak punya override sendiri."
                : "Koneksi & webhook eksternal (integrasi), bukan pengaturan operasional."}
          </p>
        </div>
      ) : null}

      {settingsScope === "global" ? (
        <GlobalSettingsPanel />
      ) : settingsScope === "integrations" && me.role === "Owner / CEO" ? (
        <IntegrationControlCenter />
      ) : (
        <>
      {error ? (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Settings</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
          <Check className="size-4" />
          <AlertTitle>Tersimpan</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {!canWrite ? (
        <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
          <Info className="size-4" />
          <AlertTitle>Read-only</AlertTitle>
          <AlertDescription>
            Role kamu cuma bisa lihat pengaturan. Untuk ubah, butuh Owner /
            Admin / Manager Ops / Finance.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8a8a93]" />
          <Input
            value={settingsQuery}
            onChange={(e) => {
              const value = e.target.value;
              setSettingsQuery(value);
              const q = value.trim().toLowerCase();
              if (q.length === 0) return;
              const hit = (t: (typeof tabs)[number]) =>
                t.label.toLowerCase().includes(q) || t.keywords.includes(q);
              const activeStillMatches = tabs.some((t) => t.id === activeTab && hit(t));
              if (!activeStillMatches) {
                const firstMatch = tabs.find(hit);
                if (firstMatch) setActiveTab(firstMatch.id);
              }
            }}
            placeholder="Cari pengaturanâ€¦ (pajak, diskon, struk, tema)"
            className="h-10 border-[#34343c] bg-white/[0.06] pl-9 pr-9"
          />
          {settingsQuery ? (
            <button
              type="button"
              onClick={() => setSettingsQuery("")}
              aria-label="Bersihkan pencarian"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#8a8a93] transition-colors hover:text-white"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Mobile / tablet: dropdown kategori */}
          <div className="lg:hidden">
            <Select
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as SettingsTab)}
            >
              <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                <SelectValue placeholder="Pilih kategori" />
              </SelectTrigger>
              <SelectContent>
                {settingsGroups.map((group) => {
                  const groupTabs = visibleTabs.filter((t) => t.group === group);
                  if (groupTabs.length === 0) return null;
                  return (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {groupTabs.map((tab) => (
                        <SelectItem key={tab.id} value={tab.id}>
                          {tab.label}
                          {tabDirtyCount(tab.id) > 0
                            ? ` · ${tabDirtyCount(tab.id)} unsaved`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: sidebar kategori berkelompok */}
          <nav className="hidden self-start lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4">
            {settingsGroups.map((group) => {
              const groupTabs = visibleTabs.filter((t) => t.group === group);
              if (groupTabs.length === 0) return null;
              return (
                <div key={group} className="space-y-1">
                  <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-[#7c7c85]">
                    {group}
                  </p>
                  {groupTabs.map((tab) => {
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        aria-current={active ? "page" : undefined}
                        className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                          active
                            ? "bg-[#d11a2a] text-white shadow-[0_1px_8px_rgba(209,26,42,0.35)]"
                            : "text-[#d4d4d8] hover:bg-white/[0.06]"
                        }`}
                      >
                        <tab.icon className="size-4 shrink-0" />
                        <span className="truncate">{tab.label}</span>
                        {tabDirtyCount(tab.id) > 0 ? (
                          <span
                            className={`ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                              active ? "bg-white text-[#d11a2a]" : "bg-amber-500 text-[#1a1416]"
                            }`}
                          >
                            {tabDirtyCount(tab.id)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            {visibleTabs.length === 0 ? (
              <p className="px-2 text-xs text-[#8a8a93]">
                Tidak ada pengaturan yang cocok.
              </p>
            ) : null}
          </nav>

          <Card className="garage-panel garage-animate-in min-w-0">
        <CardContent className="space-y-4 p-5">
          {activeTab === "theme" ? (
            <>
              <div className="space-y-1 border-b border-[#34343c] pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black text-white">Tema Garage OS</p>
                  <Badge
                    className={`garage-theme-status-badge px-2 text-[10px] ${
                      themeDirty
                        ? "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]"
                        : "border-[#22c55e]/35 bg-[#22c55e]/12 text-[#dcfce7]"
                    }`}
                  >
                    {themeDirty ? "Preview â€” belum disimpan" : "Tersimpan"}
                  </Badge>
                </div>
                <p className="text-xs leading-5 text-[#b8b8bf]">
                  Empat tema operasional MVP untuk dashboard, POS, kitchen, dan admin.
                  Klik kartu untuk preview, lalu gunakan{" "}
                  <span className="font-semibold text-white">Simpan</span> di kanan atas halaman.
                </p>
              </div>

              {merged && isLegacyGarageOsThemePreset(merged.garageOsThemePreset) ? (
                <div className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/12 px-4 py-3 text-xs leading-5 text-[#fed7aa]">
                  Outlet masih memakai tema arsip{" "}
                  <span className="font-semibold text-white">
                    {getPreset(merged.garageOsThemePreset).label}
                  </span>
                  . Pilih tema MVP di bawah, lalu simpan dari toolbar atas.
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {themePresetOptions.map((option) => {
                  const preset = getPreset(option.value);
                  const previewTheme = themeFromPreset(option.value);
                  const active = merged.garageOsThemePreset === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => setThemePresetField(option.value)}
                      className={`garage-theme-preset-card garage-press rounded-md border p-3 text-left transition ${
                        active ? "is-active" : ""
                      } ${!canWrite ? "cursor-not-allowed opacity-60" : ""}`}
                      aria-pressed={active}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-white">{preset.label}</p>
                          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f5a742]">
                            {option.hint}
                          </p>
                        </div>
                        {active ? <Check className="size-4 shrink-0 text-[#22c55e]" /> : null}
                      </div>
                      <div className="mt-3 grid grid-cols-5 overflow-hidden rounded border border-black/20">
                        {[
                          preset.colors.bg0,
                          preset.colors.bg2,
                          preset.colors.primary,
                          preset.colors.accent,
                          preset.colors.fg,
                        ].map((color) => (
                          <span
                            key={color}
                            className="h-7"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <div
                        className="mt-3 rounded-md border px-2.5 py-2"
                        style={{
                          background: previewTheme.components.cardBg,
                          borderColor: preset.colors.line,
                          boxShadow: previewTheme.effects.raisedShadow,
                        }}
                      >
                        <p
                          className="truncate text-sm leading-none"
                          style={{
                            color: preset.colors.fg,
                            fontFamily: previewTheme.typography.displayFont,
                            textTransform: previewTheme.typography.displayTransform,
                            fontWeight: previewTheme.typography.headingWeight,
                          }}
                        >
                          Garage OS
                        </p>
                        <p className="mt-1 truncate text-[10px]" style={{ color: preset.colors.dim }}>
                          {preset.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {canWrite &&
              defaults &&
              merged.garageOsThemePreset !== defaults.garageOsThemePreset ? (
                <div className="flex justify-end border-t border-[#34343c] pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="garage-press h-9 text-[#b8b8bf] hover:text-white"
                    onClick={() => resetField("garageOsThemePreset")}
                    disabled={saving}
                  >
                    <RefreshCw className="mr-2 size-3.5" />
                    Reset ke {getPreset(defaults.garageOsThemePreset).label}
                  </Button>
                </div>
              ) : null}

              {showThemeDebug ? (
                <ThemeDebugCard
                  activePresetId={activeOsTheme.presetId}
                  previewPresetId={merged.garageOsThemePreset}
                  savedPresetId={savedThemePreset}
                  dirty={themeDirty}
                />
              ) : null}
            </>
          ) : null}

          {activeTab === "pos" ? (
            <>
              <SettingsField
                label="Service Charge (%)"
                description="Persentase service charge yang dihitung dari subtotal."
                defaultValue={defaults.serviceChargePct}
                currentValue={merged.serviceChargePct}
                onReset={() => resetField("serviceChargePct")}
                disabled={!canWrite}
              >
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step="0.5"
                  value={merged.serviceChargePct}
                  onChange={(e) =>
                    setField("serviceChargePct", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="PB1 / Pajak Restoran (%)"
                description="Pajak Pembangunan I â€” dihitung dari (subtotal + service)."
                defaultValue={defaults.taxPct}
                currentValue={merged.taxPct}
                onReset={() => resetField("taxPct")}
                disabled={!canWrite}
              >
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step="0.5"
                  value={merged.taxPct}
                  onChange={(e) => setField("taxPct", Number(e.target.value))}
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Max Diskon Kasir (%)"
                description="Batas keras diskon manual per bill (di atas ini ditolak sistem)."
                defaultValue={defaults.manualDiscountMaxPct}
                currentValue={merged.manualDiscountMaxPct}
                onReset={() => resetField("manualDiscountMaxPct")}
                disabled={!canWrite}
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={merged.manualDiscountMaxPct}
                  onChange={(e) =>
                    setField("manualDiscountMaxPct", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Threshold Approval Diskon (%)"
                description="Diskon manual di atas % bill ini wajib approval supervisor di modul Approvals."
                defaultValue={defaults.manualDiscountApprovalPct}
                currentValue={merged.manualDiscountApprovalPct}
                onReset={() => resetField("manualDiscountApprovalPct")}
                disabled={!canWrite}
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={merged.manualDiscountApprovalPct}
                  onChange={(e) =>
                    setField("manualDiscountApprovalPct", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Receipt History Max"
                description="Jumlah struk terakhir disimpan di device untuk reprint."
                defaultValue={defaults.receiptHistoryMax}
                currentValue={merged.receiptHistoryMax}
                onReset={() => resetField("receiptHistoryMax")}
                disabled={!canWrite}
              >
                <Input
                  type="number"
                  min={5}
                  max={200}
                  value={merged.receiptHistoryMax}
                  onChange={(e) =>
                    setField("receiptHistoryMax", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Preview hitungan POS</p>
                    <p className="mt-1 text-[11px] text-[#b8b8bf]">
                      Simulasi subtotal Rp 100.000 dengan diskon contoh 10%.
                    </p>
                  </div>
                  <Badge className="border-[#f5a742]/35 bg-[#f5a742]/12 text-[#ffd08a]">
                    Total {currency.format(sampleTotal)}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  {[
                    ["Subtotal", sampleSubtotal],
                    [`Service ${merged.serviceChargePct}%`, sampleService],
                    [`PB1 ${merged.taxPct}%`, sampleTax],
                    ["Diskon contoh", -sampleDiscount],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="flex items-center justify-between rounded border border-[#34343c] bg-black/15 px-3 py-2"
                    >
                      <span className="text-[#d6d6dc]">{label}</span>
                      <span className="garage-mono text-xs font-semibold text-white">
                        {currency.format(Number(value))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {activeTab === "approval" ? (
            <SettingsField
              label="Threshold Approval Expense (Rp)"
              description="Pengeluaran â‰¥ nominal ini masuk antrian approval manager."
              defaultValue={defaults.expenseApprovalThreshold}
              currentValue={merged.expenseApprovalThreshold}
              onReset={() => resetField("expenseApprovalThreshold")}
              disabled={!canWrite}
              displayValue={currency.format(merged.expenseApprovalThreshold)}
            >
              <Input
                type="number"
                min={0}
                step="100000"
                value={merged.expenseApprovalThreshold}
                onChange={(e) =>
                  setField("expenseApprovalThreshold", Number(e.target.value))
                }
                disabled={!canWrite}
                className="h-10 border-[#34343c] bg-white/[0.06]"
              />
            </SettingsField>
          ) : null}

          {activeTab === "fee" ? (
            <>
              <p className="mb-1 rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-xs leading-5 text-[#cdcdd4]">
                Tarif fee per item (Rupiah). Fee dihitung otomatis: waiter saat
                mengantar (masuk ke yang klaim), Koki/Asisten & Barista saat tiket
                ready, kasir saat order lunas. Tarif berlaku untuk semua staf di
                role tersebut.
              </p>
              {(
                [
                  [
                    "feeWaiterDeliveredPerItem",
                    "Fee Waiter (antar) / item",
                    "Untuk Waiter 1/2 saat menandai pesanan diantar. Masuk ke yang klaim & antar.",
                  ],
                  [
                    "feeKitchenReadyPerItem",
                    "Fee Dapur (Koki/Asisten) / item",
                    "Saat tiket makanan ditandai ready.",
                  ],
                  [
                    "feeBaristaReadyPerItem",
                    "Fee Barista (minuman) / item",
                    "Saat tiket minuman ditandai ready.",
                  ],
                  [
                    "feePackagingReadyPerItem",
                    "Fee Packing / item",
                    "Untuk station packing saat tiket ready.",
                  ],
                  [
                    "feeCashierPaidPerItem",
                    "Fee Kasir / item",
                    "Saat kasir menandai order lunas (paid).",
                  ],
                ] as Array<
                  [
                    (
                      | "feeWaiterDeliveredPerItem"
                      | "feeKitchenReadyPerItem"
                      | "feeBaristaReadyPerItem"
                      | "feePackagingReadyPerItem"
                      | "feeCashierPaidPerItem"
                    ),
                    string,
                    string,
                  ]
                >
              ).map(([key, label, desc]) => (
                <SettingsField
                  key={key}
                  label={label}
                  description={desc}
                  defaultValue={defaults[key]}
                  currentValue={merged[key]}
                  onReset={() => resetField(key)}
                  disabled={!canWrite}
                  displayValue={currency.format(merged[key])}
                >
                  <Input
                    type="number"
                    min={0}
                    step="50"
                    value={merged[key]}
                    onChange={(e) => setField(key, Number(e.target.value))}
                    disabled={!canWrite}
                    className="h-10 border-[#34343c] bg-white/[0.06]"
                  />
                </SettingsField>
              ))}
            </>
          ) : null}

          {activeTab === "branding" ? (
            <>
              <SettingsField
                label="Nama Brand"
                description="Tampil di header struk thermal."
                defaultValue={defaults.brandName}
                currentValue={merged.brandName}
                onReset={() => resetField("brandName")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.brandName}
                  onChange={(e) => setField("brandName", e.target.value)}
                  disabled={!canWrite}
                  maxLength={40}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Tagline"
                description="Baris kedua di header struk."
                defaultValue={defaults.brandTagline}
                currentValue={merged.brandTagline}
                onReset={() => resetField("brandTagline")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.brandTagline}
                  onChange={(e) => setField("brandTagline", e.target.value)}
                  disabled={!canWrite}
                  maxLength={60}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Alamat Outlet"
                description="Tampil di header struk (opsional)."
                defaultValue={defaults.outletAddress}
                currentValue={merged.outletAddress}
                onReset={() => resetField("outletAddress")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.outletAddress}
                  onChange={(e) => setField("outletAddress", e.target.value)}
                  disabled={!canWrite}
                  maxLength={200}
                  placeholder="Jl. Garage No. 1, Jakarta"
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="No. Telp Outlet"
                description="Tampil di struk untuk customer service."
                defaultValue={defaults.outletPhone}
                currentValue={merged.outletPhone}
                onReset={() => resetField("outletPhone")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.outletPhone}
                  onChange={(e) => setField("outletPhone", e.target.value)}
                  disabled={!canWrite}
                  maxLength={40}
                  placeholder="0813xxx"
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="NPWP"
                description="Nomor pajak (opsional). Tampil di struk untuk customer corporate."
                defaultValue={defaults.npwp}
                currentValue={merged.npwp}
                onReset={() => resetField("npwp")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.npwp}
                  onChange={(e) => setField("npwp", e.target.value)}
                  disabled={!canWrite}
                  maxLength={40}
                  placeholder="00.000.000.0-000.000"
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Footer Struk"
                description="Pesan terakhir di struk."
                defaultValue={defaults.receiptFooter}
                currentValue={merged.receiptFooter}
                onReset={() => resetField("receiptFooter")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.receiptFooter}
                  onChange={(e) => setField("receiptFooter", e.target.value)}
                  disabled={!canWrite}
                  maxLength={120}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <div className="rounded-md border border-[#34343c] bg-[#f4f4f5] p-4 font-mono text-xs text-[#111116]">
                <div className="mx-auto max-w-[280px] space-y-1">
                  <p className="text-center text-sm font-black">{merged.brandName || "GARAGE"}</p>
                  <p className="text-center">{merged.brandTagline || "Coffee & Motor"}</p>
                  {merged.outletAddress ? <p className="text-center">{merged.outletAddress}</p> : null}
                  {merged.outletPhone ? <p className="text-center">{merged.outletPhone}</p> : null}
                  {merged.npwp ? <p className="text-center">NPWP {merged.npwp}</p> : null}
                  <div className="border-t border-dashed border-[#111116]/45 pt-2">
                    <div className="flex justify-between">
                      <span>1x Test Menu</span>
                      <span>{currency.format(25_000)}</span>
                    </div>
                    <div className="mt-2 flex justify-between">
                      <span>TOTAL</span>
                      <span>{currency.format(25_000)}</span>
                    </div>
                  </div>
                  <p className="border-t border-dashed border-[#111116]/45 pt-2 text-center">
                    {merged.receiptFooter || "TERIMA KASIH"}
                  </p>
                </div>
              </div>
            </>
          ) : null}

          {activeTab === "notif" ? (
            <>
              <SettingsField
                label="Approval Polling Interval (detik)"
                description="Seberapa sering badge approval di nav refresh."
                defaultValue={defaults.approvalPollIntervalSec}
                currentValue={merged.approvalPollIntervalSec}
                onReset={() => resetField("approvalPollIntervalSec")}
                disabled={!canWrite}
              >
                <Input
                  type="number"
                  min={10}
                  max={600}
                  value={merged.approvalPollIntervalSec}
                  onChange={(e) =>
                    setField("approvalPollIntervalSec", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsToggle
                label="Sound QR Order Masuk"
                description="Bunyikan tone saat ada order baru dari QR meja."
                checked={merged.qrSoundOn}
                onChange={(v) => setField("qrSoundOn", v)}
                disabled={!canWrite}
              />
              <SettingsToggle
                label="Auto-Print Struk Setelah Bayar"
                description="Cetak struk otomatis begitu transaksi sukses (jika printer terkonek)."
                checked={merged.autoPrintReceipt}
                onChange={(v) => setField("autoPrintReceipt", v)}
                disabled={!canWrite}
              />
              <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Test sound QR order</p>
                    <p className="mt-1 text-[11px] text-[#b8b8bf]">
                      Pastikan volume perangkat kasir aktif sebelum pilot.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
                    onClick={playSettingsTestSound}
                    disabled={settingsAction === "sound"}
                  >
                    <Volume2 className="mr-2 size-4" />
                    {settingsAction === "sound" ? "Testing..." : "Test Sound"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          {activeTab === "ai" ? (
            <>
              <SettingsToggle
                label="Autopilot pengawasan karyawan"
                description="Scan kesalahan operasional (QR, kitchen, stok, approval, audit) dan kirim pengingat ke role terkait."
                checked={merged.aiAutopilotEnabled}
                onChange={(value) => setField("aiAutopilotEnabled", value)}
                disabled={!canWrite}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <SettingsField
                  label="Jam mulai autopilot (WIB)"
                  description="Pengawasan otomatis tidak jalan sebelum jam ini."
                  defaultValue={defaults.aiAutopilotStartHour}
                  currentValue={merged.aiAutopilotStartHour}
                  onReset={() => resetField("aiAutopilotStartHour")}
                  disabled={!canWrite}
                >
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={merged.aiAutopilotStartHour}
                    onChange={(event) =>
                      setField("aiAutopilotStartHour", Number(event.target.value))
                    }
                    disabled={!canWrite}
                    className="h-10 border-[#34343c] bg-white/[0.06]"
                  />
                </SettingsField>
                <SettingsField
                  label="Jam selesai autopilot (WIB)"
                  description="Pengawasan otomatis berhenti setelah jam ini."
                  defaultValue={defaults.aiAutopilotEndHour}
                  currentValue={merged.aiAutopilotEndHour}
                  onReset={() => resetField("aiAutopilotEndHour")}
                  disabled={!canWrite}
                >
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={merged.aiAutopilotEndHour}
                    onChange={(event) =>
                      setField("aiAutopilotEndHour", Number(event.target.value))
                    }
                    disabled={!canWrite}
                    className="h-10 border-[#34343c] bg-white/[0.06]"
                  />
                </SettingsField>
              </div>
              <SettingsToggle
                label="WhatsApp untuk alert prioritas tinggi"
                description="Membuat link wa.me siap kirim untuk alert high. Bukan API WhatsApp Business."
                checked={merged.aiWhatsappHighAlerts}
                onChange={(value) => setField("aiWhatsappHighAlerts", value)}
                disabled={!canWrite}
              />
              <SettingsField
                label="Template pesan WhatsApp alert"
                description="Placeholder: {brand}, {title}, {detail}, {priority}, {role}"
                defaultValue={defaults.aiWhatsappAlertTemplate}
                currentValue={merged.aiWhatsappAlertTemplate}
                onReset={() => resetField("aiWhatsappAlertTemplate")}
                disabled={!canWrite}
              >
                <Textarea
                  value={merged.aiWhatsappAlertTemplate}
                  onChange={(event) =>
                    setField("aiWhatsappAlertTemplate", event.target.value)
                  }
                  disabled={!canWrite}
                  rows={4}
                  className="border-[#34343c] bg-white/[0.06] text-sm"
                />
              </SettingsField>
              <SettingsField
                label="HP Kasir / Waiter / Supervisor"
                description="Pisahkan dengan koma. Contoh: 081300000001,081300000002"
                defaultValue={defaults.aiWhatsappPhonesCashier || "(kosong)"}
                currentValue={merged.aiWhatsappPhonesCashier || "(kosong)"}
                onReset={() => resetField("aiWhatsappPhonesCashier")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.aiWhatsappPhonesCashier}
                  onChange={(event) =>
                    setField("aiWhatsappPhonesCashier", event.target.value)
                  }
                  disabled={!canWrite}
                  placeholder="08xxxxxxxxxx,08xxxxxxxxxx"
                  className="h-10 border-[#34343c] bg-white/[0.06] font-mono text-xs"
                />
              </SettingsField>
              <SettingsField
                label="HP Kitchen / Barista / Koki"
                description="Nomor untuk alert delay dapur."
                defaultValue={defaults.aiWhatsappPhonesKitchen || "(kosong)"}
                currentValue={merged.aiWhatsappPhonesKitchen || "(kosong)"}
                onReset={() => resetField("aiWhatsappPhonesKitchen")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.aiWhatsappPhonesKitchen}
                  onChange={(event) =>
                    setField("aiWhatsappPhonesKitchen", event.target.value)
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06] font-mono text-xs"
                />
              </SettingsField>
              <SettingsField
                label="HP Gudang / Inventory"
                description="Nomor untuk alert stok kritis."
                defaultValue={defaults.aiWhatsappPhonesGudang || "(kosong)"}
                currentValue={merged.aiWhatsappPhonesGudang || "(kosong)"}
                onReset={() => resetField("aiWhatsappPhonesGudang")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.aiWhatsappPhonesGudang}
                  onChange={(event) =>
                    setField("aiWhatsappPhonesGudang", event.target.value)
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06] font-mono text-xs"
                />
              </SettingsField>
              <SettingsField
                label="HP Management / Finance"
                description="Owner, admin, manager, finance untuk approval & shift gate."
                defaultValue={defaults.aiWhatsappPhonesManagement || "(kosong)"}
                currentValue={merged.aiWhatsappPhonesManagement || "(kosong)"}
                onReset={() => resetField("aiWhatsappPhonesManagement")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.aiWhatsappPhonesManagement}
                  onChange={(event) =>
                    setField("aiWhatsappPhonesManagement", event.target.value)
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06] font-mono text-xs"
                />
              </SettingsField>
            </>
          ) : null}

          {activeTab === "printer" ? (
            <>
              <SettingsField
                label="Nama Printer Default"
                description="Override env DEFAULT_PRINTER_NAME. Kosongkan untuk auto-detect."
                defaultValue={defaults.defaultPrinterName || "(auto-detect)"}
                currentValue={merged.defaultPrinterName || "(auto-detect)"}
                onReset={() => resetField("defaultPrinterName")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.defaultPrinterName}
                  onChange={(e) =>
                    setField("defaultPrinterName", e.target.value)
                  }
                  disabled={!canWrite}
                  maxLength={80}
                  placeholder="RPP02N_Thermal"
                  className="h-10 border-[#34343c] bg-white/[0.06] font-mono"
                />
              </SettingsField>
              <SettingsField
                label="Copies per Struk"
                description="Jumlah lembar struk yang dicetak per transaksi."
                defaultValue={defaults.receiptCopies}
                currentValue={merged.receiptCopies}
                onReset={() => resetField("receiptCopies")}
                disabled={!canWrite}
              >
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={merged.receiptCopies}
                  onChange={(e) =>
                    setField("receiptCopies", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Status printer & test print</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#b8b8bf]">
                      Mengirim struk test ke printer default. Print server dan driver Windows harus aktif.
                    </p>
                    <p className="garage-mono mt-1 text-[10px] text-[#ffd08a]">
                      Target: {merged.defaultPrinterName || "auto-detect"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="garage-press h-10"
                    onClick={() => void testPrinter()}
                    disabled={settingsAction === "print"}
                  >
                    <Printer className="mr-2 size-4" />
                    {settingsAction === "print" ? "Mengirim..." : "Test Print"}
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          {activeTab === "loyalty" ? (
            <>
              <SettingsField
                label="Poin per Rp 1.000"
                description="Berapa poin didapat member per Rp 1.000 belanja (sebelum tax)."
                defaultValue={defaults.pointsPerThousand}
                currentValue={merged.pointsPerThousand}
                onReset={() => resetField("pointsPerThousand")}
                disabled={!canWrite}
              >
                <Input
                  type="number"
                  min={0}
                  max={10}
                  step="0.1"
                  value={merged.pointsPerThousand}
                  onChange={(e) =>
                    setField("pointsPerThousand", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Max Discount Voucher (%)"
                description="Batas atas diskon per voucher (cap untuk voucher tipe persen)."
                defaultValue={defaults.voucherMaxDiscountPct}
                currentValue={merged.voucherMaxDiscountPct}
                onReset={() => resetField("voucherMaxDiscountPct")}
                disabled={!canWrite}
              >
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={merged.voucherMaxDiscountPct}
                  onChange={(e) =>
                    setField("voucherMaxDiscountPct", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Simulasi loyalty</p>
                <p className="mt-1 text-[11px] text-[#b8b8bf]">
                  Belanja Rp 50.000 menghasilkan {samplePoints} poin sebelum multiplier tier member.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    ["Silver", samplePoints],
                    ["Gold 1.5x", Math.floor(samplePoints * 1.5)],
                    ["Platinum 2x", samplePoints * 2],
                  ].map(([label, points]) => (
                    <div key={String(label)} className="rounded border border-[#34343c] bg-black/15 p-3">
                      <p className="garage-mono text-[10px] text-[#8f8f99]">{label}</p>
                      <p className="mt-1 text-lg font-black text-white">{points} poin</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {activeTab === "marketing" ? (
            <>
              <SettingsField
                label="Nama Campaign Default"
                description="Nama campaign yang muncul di Marketing Engine dan campaign log."
                defaultValue={defaults.marketingCampaignName}
                currentValue={merged.marketingCampaignName}
                onReset={() => resetField("marketingCampaignName")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.marketingCampaignName}
                  onChange={(e) => setField("marketingCampaignName", e.target.value)}
                  disabled={!canWrite}
                  maxLength={80}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Budget Marketing Bulanan"
                description="Budget guardrail untuk campaign dan estimasi cost per target."
                defaultValue={defaults.marketingMonthlyBudget}
                currentValue={merged.marketingMonthlyBudget}
                onReset={() => resetField("marketingMonthlyBudget")}
                disabled={!canWrite}
                displayValue={currency.format(merged.marketingMonthlyBudget)}
              >
                <Input
                  type="number"
                  min={0}
                  step={100000}
                  value={merged.marketingMonthlyBudget}
                  onChange={(e) =>
                    setField("marketingMonthlyBudget", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Segmen Default"
                description="Segmen yang otomatis dipilih saat modul Marketing dibuka."
                defaultValue={defaults.marketingDefaultSegment}
                currentValue={merged.marketingDefaultSegment}
                onReset={() => resetField("marketingDefaultSegment")}
                disabled={!canWrite}
              >
                <Select
                  value={merged.marketingDefaultSegment}
                  onValueChange={(value) => setField("marketingDefaultSegment", value)}
                  disabled={!canWrite}
                >
                  <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {marketingSegments.map((segment) => (
                      <SelectItem key={segment.key} value={segment.key}>
                        {segment.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsField>
              <SettingsField
                label="UTM / Source Campaign"
                description="Source link order untuk campaign WhatsApp."
                defaultValue={defaults.marketingUtmSource}
                currentValue={merged.marketingUtmSource}
                onReset={() => resetField("marketingUtmSource")}
                disabled={!canWrite}
              >
                <Input
                  value={merged.marketingUtmSource}
                  onChange={(e) => setField("marketingUtmSource", e.target.value)}
                  disabled={!canWrite}
                  maxLength={60}
                  className="h-10 border-[#34343c] bg-white/[0.06] font-mono"
                />
              </SettingsField>
              <SettingsToggle
                label="Auto Log Campaign"
                description="Saat WA dibuka dari Marketing, activity otomatis masuk campaign log."
                checked={merged.marketingAutoLogEnabled}
                onChange={(v) => setField("marketingAutoLogEnabled", v)}
                disabled={!canWrite}
              />
              <SettingsField
                label="Template WhatsApp Default"
                description="Token tersedia: {name}, {brand}, {segment}, {campaign}, {orderUrl}."
                defaultValue={defaults.marketingWhatsappTemplate}
                currentValue={merged.marketingWhatsappTemplate}
                onReset={() => resetField("marketingWhatsappTemplate")}
                disabled={!canWrite}
              >
                <Textarea
                  value={merged.marketingWhatsappTemplate}
                  onChange={(e) => setField("marketingWhatsappTemplate", e.target.value)}
                  disabled={!canWrite}
                  maxLength={500}
                  className="min-h-28 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Channel Default Campaign"
                description="Channel yang otomatis dipilih saat klik 'Campaign baru' dan 'Broadcast baru'."
                defaultValue={defaults.marketingDefaultChannel}
                currentValue={merged.marketingDefaultChannel}
                onReset={() => resetField("marketingDefaultChannel")}
                disabled={!canWrite}
              >
                <Select
                  value={merged.marketingDefaultChannel}
                  onValueChange={(value) => setField("marketingDefaultChannel", value)}
                  disabled={!canWrite}
                >
                  <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="in_store">In-store</SelectItem>
                    <SelectItem value="multi">Multi-channel</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsField>
              <SettingsField
                label="Durasi Default Campaign (hari)"
                description="Saat isi tanggal mulai campaign, tanggal selesai otomatis diisi mulai + N hari."
                defaultValue={defaults.marketingDefaultDurationDays}
                currentValue={merged.marketingDefaultDurationDays}
                onReset={() => resetField("marketingDefaultDurationDays")}
                disabled={!canWrite}
                displayValue={`${merged.marketingDefaultDurationDays} hari`}
              >
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={merged.marketingDefaultDurationDays}
                  onChange={(e) =>
                    setField("marketingDefaultDurationDays", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Threshold Approval Campaign"
                description="Campaign dengan budget di atas nilai ini akan diberi warning untuk approval owner sebelum 'active'."
                defaultValue={defaults.marketingApprovalThreshold}
                currentValue={merged.marketingApprovalThreshold}
                onReset={() => resetField("marketingApprovalThreshold")}
                disabled={!canWrite}
                displayValue={currency.format(merged.marketingApprovalThreshold)}
              >
                <Input
                  type="number"
                  min={0}
                  step={500000}
                  value={merged.marketingApprovalThreshold}
                  onChange={(e) =>
                    setField("marketingApprovalThreshold", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Voucher Default Type"
                description="Tipe voucher otomatis dipilih saat klik 'Promo baru' di modul Marketing."
                defaultValue={defaults.marketingDefaultVoucherType}
                currentValue={merged.marketingDefaultVoucherType}
                onReset={() => resetField("marketingDefaultVoucherType")}
                disabled={!canWrite}
              >
                <Select
                  value={merged.marketingDefaultVoucherType}
                  onValueChange={(value) =>
                    setField("marketingDefaultVoucherType", value as "fixed" | "percent")
                  }
                  disabled={!canWrite}
                >
                  <SelectTrigger className="h-10 border-[#34343c] bg-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed (Rp)</SelectItem>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                  </SelectContent>
                </Select>
              </SettingsField>
              <SettingsField
                label="Voucher Default Value"
                description="Nilai default voucher saat buat promo baru â€” angka rupiah jika fixed, persen jika percent."
                defaultValue={defaults.marketingDefaultVoucherValue}
                currentValue={merged.marketingDefaultVoucherValue}
                onReset={() => resetField("marketingDefaultVoucherValue")}
                disabled={!canWrite}
                displayValue={
                  merged.marketingDefaultVoucherType === "percent"
                    ? `${merged.marketingDefaultVoucherValue}%`
                    : currency.format(merged.marketingDefaultVoucherValue)
                }
              >
                <Input
                  type="number"
                  min={1}
                  value={merged.marketingDefaultVoucherValue}
                  onChange={(e) =>
                    setField("marketingDefaultVoucherValue", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Quiet Hours Broadcast (mulai)"
                description="Jam awal larangan jadwal broadcast WA. Form broadcast akan kasih warning jika jadwal masuk window ini."
                defaultValue={defaults.marketingQuietHoursStart}
                currentValue={merged.marketingQuietHoursStart}
                onReset={() => resetField("marketingQuietHoursStart")}
                disabled={!canWrite}
                displayValue={`${String(merged.marketingQuietHoursStart).padStart(2, "0")}:00`}
              >
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={merged.marketingQuietHoursStart}
                  onChange={(e) =>
                    setField("marketingQuietHoursStart", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <SettingsField
                label="Quiet Hours Broadcast (selesai)"
                description="Jam akhir larangan jadwal broadcast. Jika start > end, window menyeberang tengah malam."
                defaultValue={defaults.marketingQuietHoursEnd}
                currentValue={merged.marketingQuietHoursEnd}
                onReset={() => resetField("marketingQuietHoursEnd")}
                disabled={!canWrite}
                displayValue={`${String(merged.marketingQuietHoursEnd).padStart(2, "0")}:00`}
              >
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={merged.marketingQuietHoursEnd}
                  onChange={(e) =>
                    setField("marketingQuietHoursEnd", Number(e.target.value))
                  }
                  disabled={!canWrite}
                  className="h-10 border-[#34343c] bg-white/[0.06]"
                />
              </SettingsField>
              <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-4">
                <p className="text-sm font-semibold text-white">Preview marketing</p>
                <p className="mt-1 text-[11px] text-[#b8b8bf]">
                  Link order campaign: <span className="garage-mono text-[#ffd08a]">{marketingOrderUrl(merged)}</span>
                </p>
                <div className="mt-3 rounded-md border border-[#34343c] bg-[#f4f4f5] p-3 text-sm text-[#111116]">
                  {renderMarketingMessage({
                    template: merged.marketingWhatsappTemplate,
                    customer: { id: "preview", name: "Raka Garage", phone: "08123456789", tier: "Gold", reason: "Preview" },
                    settings: merged,
                    segment: { label: "At-Risk", description: "", customers: [] },
                  })}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
        </div>
      </div>

      <p className="text-[11px] text-[#8f8f99]">
        Outlet aktif: <span className="garage-mono text-[#ffd08a]">{me.outlet.code}</span> ·{" "}
        {me.outlet.name}. Pengaturan disimpan per outlet â€” switch outlet untuk
        edit setting outlet lain.
      </p>

      {(me.role === "Owner / CEO" || me.role === "Admin") && <DatabasePurgePanel />}

      {dirty && canWrite ? (
        <div className="sticky bottom-3 z-20 garage-animate-in">
          <div className="flex flex-col gap-3 rounded-lg border border-[#d11a2a]/45 bg-[#1a1416] px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.55)] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="size-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,167,66,0.7)]" />
              <span className="font-semibold text-white">
                {Object.keys(draft).length} perubahan belum disimpan
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 flex-1 border-[#4a4a54] bg-white/[0.055] sm:flex-none"
                onClick={cancelSettingsDraft}
                disabled={saving}
              >
                Batal
              </Button>
              <Button
                type="button"
                className="garage-press h-10 flex-1 sm:flex-none"
                onClick={() => void saveSettings()}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 size-4" />
                    {saveDraftLabel}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
        </>
      )}
    </section>
  );
}

function ThemeDebugCard({
  activePresetId,
  previewPresetId,
  savedPresetId,
  dirty,
}: {
  activePresetId: string;
  previewPresetId: string;
  savedPresetId: string;
  dirty: boolean;
}) {
  const [vars, setVars] = useState({
    bg: "",
    primary: "",
    accent: "",
    line: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const readVars = () => {
      const rootStyle = window.getComputedStyle(document.documentElement);
      setVars({
        bg: rootStyle.getPropertyValue("--garage-bg-0").trim(),
        primary: rootStyle.getPropertyValue("--garage-red").trim(),
        accent: rootStyle.getPropertyValue("--garage-amber").trim(),
        line: rootStyle.getPropertyValue("--garage-line").trim(),
      });
    };
    readVars();
    const id = window.setTimeout(readVars, 80);
    return () => window.clearTimeout(id);
  }, [activePresetId, previewPresetId]);

  const rows = [
    ["Provider aktif", getPreset(activePresetId).label],
    ["Preview settings", getPreset(previewPresetId).label],
    ["Tersimpan DB", getPreset(savedPresetId).label],
    ["Status", dirty ? "Preview belum disimpan" : "Sinkron"],
    ["--garage-bg-0", vars.bg || "(belum terbaca)"],
    ["--garage-red", vars.primary || "(belum terbaca)"],
    ["--garage-amber", vars.accent || "(belum terbaca)"],
    ["--garage-line", vars.line || "(belum terbaca)"],
  ];

  return (
    <div className="garage-theme-debug rounded-md border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-white">Theme Debug</p>
          <p className="mt-1 text-[11px] leading-5 text-[#b8b8bf]">
            Kartu ini memastikan theme provider, settings, dan CSS variable terbaca di browser.
          </p>
        </div>
        <Badge className="garage-theme-status-badge w-fit px-2 text-[10px]">
          {dirty ? "Preview" : "Synced"}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(([label, value]) => (
          <div key={label} className="garage-theme-debug-cell rounded-md border px-3 py-2">
            <p className="garage-mono text-[9px]">{label}</p>
            <p className="mt-1 break-words text-xs font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-md border border-black/20">
        {[
          ["Background", vars.bg],
          ["Primary", vars.primary],
          ["Accent", vars.accent],
          ["Line", vars.line],
        ].map(([label, color]) => (
          <div key={label} className="min-h-12 p-2" style={{ backgroundColor: color || "transparent" }}>
            <span className="rounded bg-black/35 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsField({
  label,
  description,
  defaultValue,
  currentValue,
  onReset,
  disabled,
  displayValue,
  children,
}: {
  label: string;
  description: string;
  defaultValue: string | number;
  currentValue: string | number;
  onReset: () => void;
  disabled: boolean;
  displayValue?: string;
  children: ReactNode;
}) {
  const changed = currentValue !== defaultValue;
  return (
    <div className="grid gap-2 border-b border-[#34343c] pb-4 last:border-0 last:pb-0 sm:grid-cols-[280px_1fr] sm:gap-4">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-white">{label}</p>
          {changed ? (
            <Badge className="border-[#f5a742]/45 bg-[#f5a742]/14 px-1.5 text-[9px] text-[#ffd08a]">
              UBAH
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] leading-5 text-[#b8b8bf]">{description}</p>
        {displayValue ? (
          <p className="garage-mono mt-1 text-[10px] text-[#ffd08a]">
            = {displayValue}
          </p>
        ) : null}
      </div>
      <div className="flex items-start gap-2">
        <div className="flex-1">{children}</div>
        {changed && !disabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="garage-press h-10 shrink-0 border-[#4a4a54] bg-white/[0.04] px-2 text-[11px] text-[#b8b8bf]"
            onClick={onReset}
            title={`Reset ke default: ${defaultValue}`}
          >
            <RefreshCw className="size-3" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SettingsToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-2 border-b border-[#34343c] pb-4 last:border-0 last:pb-0 sm:grid-cols-[280px_1fr] sm:gap-4">
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        <p className="mt-1 text-[11px] leading-5 text-[#b8b8bf]">{description}</p>
      </div>
      <div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`garage-press relative inline-flex h-7 w-12 items-center rounded-full border transition-colors ${
            checked
              ? "border-[#22c55e]/55 bg-[#22c55e]/35"
              : "border-[#34343c] bg-white/[0.06]"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <span
            className={`inline-block size-5 rounded-full bg-white transition-transform ${
              checked ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

type MarketingSegmentKey =
  | "vip"
  | "atRisk"
  | "new"
  | "voucherReady"
  | "birthdayWeek"
  | "stampMission"
  | "vipExclusive"
  | "referralReady";

type MarketingSegmentCustomer = {
  id: string;
  name: string;
  phone: string;
  tier: string;
  reason: string;
};

type MarketingSegmentData = {
  label: string;
  description: string;
  customers: MarketingSegmentCustomer[];
};

const marketingSegments: Array<{
  key: MarketingSegmentKey;
  label: string;
  objective: string;
}> = [
  { key: "atRisk", label: "At-Risk", objective: "Win-back repeat customer yang mulai hilang." },
  { key: "vip", label: "VIP", objective: "Naikkan frequency dan AOV member bernilai tinggi." },
  { key: "new", label: "New Customer", objective: "Dorong kunjungan kedua dalam 7 hari." },
  { key: "voucherReady", label: "Voucher Ready", objective: "Konversi poin menjadi kunjungan ulang." },
  { key: "birthdayWeek", label: "Birthday Week", objective: "Birthday reward dengan urgensi natural." },
  { key: "stampMission", label: "Stamp Mission", objective: "Selesaikan misi kunjungan menuju reward." },
  { key: "vipExclusive", label: "VIP Exclusive", objective: "Campaign invite-only untuk tier tinggi." },
  { key: "referralReady", label: "Referral Ready", objective: "Akuisisi customer baru dari referral." },
];

function marketingOrderUrl(settings: AppSettings) {
  const params = new URLSearchParams({
    source: settings.marketingUtmSource || "garage_marketing",
    campaign: settings.marketingCampaignName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
  });
  return `/order?${params.toString()}`;
}

function renderMarketingMessage({
  template,
  customer,
  settings,
  segment,
}: {
  template: string;
  customer: MarketingSegmentCustomer | null;
  settings: AppSettings;
  segment: MarketingSegmentData | null;
}) {
  const name = customer?.name.split(/\s+/)[0] || "Kak";
  return template
    .replaceAll("{name}", name)
    .replaceAll("{brand}", settings.brandName || "GARAGE")
    .replaceAll("{segment}", segment?.label ?? "Customer")
    .replaceAll("{campaign}", settings.marketingCampaignName)
    .replaceAll("{orderUrl}", marketingOrderUrl(settings));
}
