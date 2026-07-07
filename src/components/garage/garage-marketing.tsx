"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Check,
  Copy,
  Download,
  Gift,
  Inbox,
  Layers,
  LineChart,
  Megaphone,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Tags,
  Target,
  Ticket,
  TrendingUp,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { GarageApiError, garageApi } from "@/lib/api-client";
import type { AppSettings, Customer, GarageMe } from "@/lib/garage-api-types";
import { currency } from "@/lib/garage-data";
import { canUseApi } from "@/lib/role-access";
import { ContentPublisher } from "@/components/garage/content-publisher";

type MarketingTab =
  | "overview"
  | "campaigns"
  | "broadcasts"
  | "promos"
  | "calendar"
  | "publisher";

type CampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "paused"
  | "completed"
  | "archived";

type BroadcastStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled";

type MarketingChannel = "whatsapp" | "instagram" | "in_store" | "multi";

type MarketingObjective =
  | "winback"
  | "acquisition"
  | "retention"
  | "awareness"
  | "loyalty";

type CampaignDto = {
  id: string;
  code: string;
  name: string;
  objective: MarketingObjective | string;
  channel: MarketingChannel | string;
  segmentKey: string;
  audienceSize: number;
  budget: number;
  spend: number;
  targetOrders: number;
  targetRevenue: number;
  actualOrders: number;
  actualRevenue: number;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  ownerName: string | null;
  notes: string | null;
  voucherId: string | null;
  voucherCode: string | null;
  voucherTitle: string | null;
  createdAt: string;
  updatedAt: string;
};

type BroadcastDto = {
  id: string;
  campaignId: string | null;
  campaignName: string | null;
  campaignCode: string | null;
  name: string;
  channel: MarketingChannel | string;
  segmentKey: string;
  templateBody: string;
  status: BroadcastStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type PromoDto = {
  id: string;
  code: string;
  title: string;
  type: "fixed" | "percent";
  value: number;
  minSpend: number;
  maxDiscount: number | null;
  audience: string;
  status: "active" | "draft" | "paused" | "expired";
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usedCount: number;
  redemptionCount: number;
  discountTotal: number;
  createdAt: string;
};

type OverviewDto = {
  generatedAt: string;
  windowSince: string;
  campaigns: {
    total: number;
    active: number;
    scheduled: number;
    draft: number;
    completed: number;
    paused: number;
    archived: number;
    byChannel: Record<string, number>;
  };
  broadcasts: {
    total: number;
    scheduled: number;
    sent: number;
    sending: number;
    cancelled: number;
    sentLast30d: number;
    openedLast30d: number;
  };
  spend: { total: number; activeBudget: number; utilizationPct: number };
  performance: {
    actualRevenue: number;
    actualOrders: number;
    targetRevenue: number;
    targetOrders: number;
    revenueAchievedPct: number;
    orderAchievedPct: number;
    roi: number;
  };
  promos: {
    redeemedLast30d: number;
    discountLast30d: number;
    redeemedAllTime: number;
    discountAllTime: number;
  };
  engagement: {
    campaignLogsLast30d: number;
    repeatRatePct: number;
    totalCustomers: number;
  };
  upcomingBroadcasts: BroadcastDto[];
  activeCampaigns: CampaignDto[];
};

type CalendarEntry = {
  id: string;
  kind: "campaign" | "broadcast" | "promo";
  title: string;
  code: string | null;
  campaignName?: string | null;
  status: string;
  channel: string;
  segmentKey: string | null;
  date: string;
  endsAt: string | null;
};

type CalendarDto = {
  rangeStart: string;
  rangeEnd: string;
  entries: CalendarEntry[];
};

type SegmentInfo = { key: string; label: string; objective: string };

const MARKETING_SEGMENTS: SegmentInfo[] = [
  { key: "atRisk", label: "At-Risk", objective: "Win-back repeat customer yang mulai hilang." },
  { key: "vip", label: "VIP", objective: "Naikkan frequency dan AOV member bernilai tinggi." },
  { key: "new", label: "New Customer", objective: "Dorong kunjungan kedua dalam 7 hari." },
  { key: "voucherReady", label: "Voucher Ready", objective: "Konversi poin menjadi kunjungan ulang." },
  { key: "birthdayWeek", label: "Birthday Week", objective: "Birthday reward dengan urgensi natural." },
  { key: "stampMission", label: "Stamp Mission", objective: "Selesaikan misi kunjungan menuju reward." },
  { key: "vipExclusive", label: "VIP Exclusive", objective: "Campaign invite-only untuk tier tinggi." },
  { key: "referralReady", label: "Referral Ready", objective: "Akuisisi customer baru dari referral." },
];

const OBJECTIVES: Array<{ value: MarketingObjective; label: string; hint: string }> = [
  { value: "retention", label: "Retention", hint: "Pertahankan customer aktif" },
  { value: "winback", label: "Win-back", hint: "Tarik ulang customer hilang" },
  { value: "acquisition", label: "Acquisition", hint: "Akuisisi customer baru" },
  { value: "awareness", label: "Awareness", hint: "Naikkan brand awareness" },
  { value: "loyalty", label: "Loyalty", hint: "Reward member loyal" },
];

const CHANNELS: Array<{ value: MarketingChannel; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "in_store", label: "In-store" },
  { value: "multi", label: "Multi-channel" },
];

const CAMPAIGN_STATUSES: Array<{ value: CampaignStatus; label: string; tone: string }> = [
  { value: "draft", label: "Draft", tone: "border-[#4a4a54] bg-white/[0.05] text-[#d6d6dc]" },
  { value: "scheduled", label: "Scheduled", tone: "border-[#3b82f6]/45 bg-[#3b82f6]/15 text-[#bfdbfe]" },
  { value: "active", label: "Active", tone: "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#86efac]" },
  { value: "paused", label: "Paused", tone: "border-[#f5a742]/45 bg-[#f5a742]/15 text-[#ffd08a]" },
  { value: "completed", label: "Completed", tone: "border-[#a855f7]/45 bg-[#a855f7]/15 text-[#d8b4fe]" },
  { value: "archived", label: "Archived", tone: "border-[#52525b]/45 bg-[#52525b]/15 text-[#a1a1aa]" },
];

const BROADCAST_STATUSES: Array<{ value: BroadcastStatus; label: string; tone: string }> = [
  { value: "draft", label: "Draft", tone: "border-[#4a4a54] bg-white/[0.05] text-[#d6d6dc]" },
  { value: "scheduled", label: "Scheduled", tone: "border-[#3b82f6]/45 bg-[#3b82f6]/15 text-[#bfdbfe]" },
  { value: "sending", label: "Sending", tone: "border-[#f5a742]/45 bg-[#f5a742]/15 text-[#ffd08a]" },
  { value: "sent", label: "Sent", tone: "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#86efac]" },
  { value: "cancelled", label: "Cancelled", tone: "border-[#d11a2a]/45 bg-[#d11a2a]/15 text-[#ffc2c8]" },
];

const PROMO_STATUSES: Array<{ value: PromoDto["status"]; label: string; tone: string }> = [
  { value: "active", label: "Active", tone: "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#86efac]" },
  { value: "paused", label: "Paused", tone: "border-[#f5a742]/45 bg-[#f5a742]/15 text-[#ffd08a]" },
  { value: "draft", label: "Draft", tone: "border-[#4a4a54] bg-white/[0.05] text-[#d6d6dc]" },
  { value: "expired", label: "Expired", tone: "border-[#52525b]/45 bg-[#52525b]/15 text-[#a1a1aa]" },
];

function segmentLabel(key: string) {
  return MARKETING_SEGMENTS.find((s) => s.key === key)?.label ?? key;
}

function channelLabel(value: string) {
  return CHANNELS.find((c) => c.value === value)?.label ?? value;
}

function objectiveLabel(value: string) {
  return OBJECTIVES.find((o) => o.value === value)?.label ?? value;
}

function statusBadgeTone<T extends { value: string; tone: string }>(items: T[], value: string) {
  return items.find((s) => s.value === value)?.tone ?? "border-[#4a4a54] bg-white/[0.05] text-[#d6d6dc]";
}

function statusLabel<T extends { value: string; label: string }>(items: T[], value: string) {
  return items.find((s) => s.value === value)?.label ?? value;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function formatDateShort(value: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function toDateTimeLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

function fromDateTimeLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function describeApiError(err: unknown): string {
  if (err instanceof GarageApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Terjadi error tak terduga.";
}

export function GarageMarketingView({
  customers,
  settings,
  me,
}: {
  customers: Customer[];
  settings: AppSettings;
  me: GarageMe;
}) {
  const [activeTab, setActiveTab] = useState<MarketingTab>("overview");
  const canWrite = canUseApi(me.role, "marketing:write");

  return (
    <section className="space-y-4">
      <MarketingHeader settings={settings} totalCustomers={customers.length} />

      <div className="grid grid-cols-3 items-center gap-1 rounded-lg border border-[#34343c] bg-[#111116] p-1 lg:grid-cols-6">
        {([
          { key: "overview", label: "Overview", icon: LineChart },
          { key: "campaigns", label: "Campaigns", icon: Target },
          { key: "broadcasts", label: "Broadcasts", icon: Send },
          { key: "promos", label: "Promos", icon: Ticket },
          { key: "calendar", label: "Calendar", icon: CalendarDays },
          { key: "publisher", label: "Publisher", icon: Send },
        ] as Array<{ key: MarketingTab; label: string; icon: typeof LineChart }>).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`garage-press flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-[#f5a742] text-black"
                  : "text-[#d6d6dc] hover:bg-white/[0.04]"
              }`}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && <MarketingOverview settings={settings} />}
      {activeTab === "campaigns" && (
        <MarketingCampaigns canWrite={canWrite} settings={settings} />
      )}
      {activeTab === "broadcasts" && (
        <MarketingBroadcasts canWrite={canWrite} settings={settings} />
      )}
      {activeTab === "promos" && <MarketingPromos canWrite={canWrite} settings={settings} />}
      {activeTab === "calendar" && <MarketingCalendar />}
      {activeTab === "publisher" && <ContentPublisher canWrite={canWrite} />}
    </section>
  );
}

function MarketingHeader({
  settings,
  totalCustomers,
}: {
  settings: AppSettings;
  totalCustomers: number;
}) {
  return (
    <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
            Marketing Master
          </p>
          <h1 className="mt-1 text-2xl font-black text-white">Garage Marketing OS</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#b8b8bf]">
            Campaign engine + broadcast scheduler + voucher manager + calendar. Semua aktivitas
            marketing tercatat, terukur, dan terhubung ke CRM segments. Default brand & budget
            dikunci di Pengaturan.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:max-w-md">
          <HeaderKpi label="Customer" value={String(totalCustomers)} />
          <HeaderKpi label="Brand" value={settings.brandName} mono />
          <HeaderKpi label="Budget bln" value={currency.format(settings.marketingMonthlyBudget)} />
        </div>
      </div>
    </div>
  );
}

function HeaderKpi({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
      <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-base font-bold text-white ${
          mono ? "garage-mono text-[#ffd08a]" : ""
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function MarketingOverview({ settings }: { settings: AppSettings }) {
  const [data, setData] = useState<OverviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await garageApi.get<OverviewDto>("/api/marketing/overview", {
        cache: "no-store",
      });
      setData(result);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[#8f8f99]">
          Window 30 hari terakhir.{" "}
          {data?.generatedAt ? `Updated ${formatDate(data.generatedAt)}` : ""}
        </p>
        <Button
          type="button"
          variant="outline"
          className="garage-press h-9 border-[#4a4a54]"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Marketing Overview</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Target}
          label="Active campaign"
          value={data ? String(data.campaigns.active) : "-"}
          sub={`${data?.campaigns.scheduled ?? 0} scheduled · ${data?.campaigns.draft ?? 0} draft`}
        />
        <KpiCard
          icon={Send}
          label="Broadcast 30d"
          value={data ? String(data.broadcasts.sentLast30d) : "-"}
          sub={`${data?.broadcasts.openedLast30d ?? 0} dibuka`}
        />
        <KpiCard
          icon={Ticket}
          label="Voucher redeemed"
          value={data ? String(data.promos.redeemedLast30d) : "-"}
          sub={currency.format(data?.promos.discountLast30d ?? 0)}
        />
        <KpiCard
          icon={TrendingUp}
          label="ROI estimasi"
          value={data ? `${data.performance.roi}%` : "-"}
          sub={`Spend ${currency.format(data?.spend.total ?? 0)}`}
          tone={data && data.performance.roi >= 0 ? "good" : "warn"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-3 rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-black text-white">Performance vs Target</h3>
            <Badge className="border-[#f5a742]/35 bg-[#f5a742]/12 text-[#ffd08a]">
              Campaign aktif
            </Badge>
          </div>
          <PerformanceBar
            label="Revenue tercapai"
            actual={data?.performance.actualRevenue ?? 0}
            target={data?.performance.targetRevenue ?? 0}
            valueFormatter={(v) => currency.format(v)}
          />
          <PerformanceBar
            label="Order tercapai"
            actual={data?.performance.actualOrders ?? 0}
            target={data?.performance.targetOrders ?? 0}
            valueFormatter={(v) => `${v} order`}
          />
          <PerformanceBar
            label="Spend vs Budget aktif"
            actual={data?.spend.total ?? 0}
            target={data?.spend.activeBudget ?? 0}
            valueFormatter={(v) => currency.format(v)}
          />
          <p className="text-xs text-[#b8b8bf]">
            ROI = (Actual revenue − Total spend) / Total spend. Update actual revenue dari edit
            campaign saat closing.
          </p>
        </div>

        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <h3 className="text-lg font-black text-white">Channel mix</h3>
          <p className="mt-1 text-xs text-[#b8b8bf]">Distribusi campaign berdasarkan channel.</p>
          <div className="mt-3 space-y-2">
            {CHANNELS.map((channel) => {
              const value = data?.campaigns.byChannel[channel.value] ?? 0;
              const total = data?.campaigns.total ?? 0;
              const pct = total ? Math.round((value / total) * 100) : 0;
              return (
                <div key={channel.value} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#d6d6dc]">{channel.label}</span>
                    <span className="garage-mono text-[#ffd08a]">
                      {value} · {pct}%
                    </span>
                  </div>
                  <Progress value={pct} className="h-1.5 bg-white/[0.06]" />
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-md border border-[#34343c] bg-white/[0.04] p-3">
            <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
              Engagement 30d
            </p>
            <p className="mt-1 text-2xl font-black text-white">
              {data?.engagement.campaignLogsLast30d ?? 0}
            </p>
            <p className="text-xs text-[#b8b8bf]">
              WA campaign opened (CRM logs) · Repeat rate {data?.engagement.repeatRatePct ?? 0}%
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-white">Active campaigns</h3>
            <Badge className="border-[#22c55e]/35 bg-[#22c55e]/12 text-[#86efac]">
              {data?.activeCampaigns.length ?? 0}
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            {data && data.activeCampaigns.length > 0 ? (
              data.activeCampaigns.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-[#34343c] bg-white/[0.04] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{c.name}</p>
                    <p className="garage-mono mt-0.5 text-[10px] text-[#8f8f99]">
                      {c.code} · {channelLabel(c.channel)} · {segmentLabel(c.segmentKey)}
                    </p>
                    <p className="mt-1 text-xs text-[#ffd08a]">
                      Budget {currency.format(c.budget)} · Spend {currency.format(c.spend)}
                    </p>
                  </div>
                  <Badge className={statusBadgeTone(CAMPAIGN_STATUSES, c.status)}>
                    {statusLabel(CAMPAIGN_STATUSES, c.status)}
                  </Badge>
                </div>
              ))
            ) : (
              <EmptyState icon={Megaphone} title="Belum ada campaign aktif">
                Buat campaign di tab Campaigns lalu set status Active.
              </EmptyState>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-white">Broadcast terdekat</h3>
            <Badge className="border-[#3b82f6]/35 bg-[#3b82f6]/12 text-[#bfdbfe]">
              {data?.upcomingBroadcasts.length ?? 0}
            </Badge>
          </div>
          <div className="mt-3 space-y-2">
            {data && data.upcomingBroadcasts.length > 0 ? (
              data.upcomingBroadcasts.map((b) => (
                <div
                  key={b.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-[#34343c] bg-white/[0.04] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{b.name}</p>
                    <p className="garage-mono mt-0.5 text-[10px] text-[#8f8f99]">
                      {channelLabel(b.channel)} · {segmentLabel(b.segmentKey)}
                    </p>
                    <p className="mt-1 text-xs text-[#bfdbfe]">
                      {formatDate(b.scheduledAt)} · {b.totalRecipients} target
                    </p>
                  </div>
                  <Badge className={statusBadgeTone(BROADCAST_STATUSES, b.status)}>
                    {statusLabel(BROADCAST_STATUSES, b.status)}
                  </Badge>
                </div>
              ))
            ) : (
              <EmptyState icon={CalendarClock} title="Belum ada broadcast terjadwal">
                Buat broadcast baru di tab Broadcasts.
              </EmptyState>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <h3 className="text-lg font-black text-white">Insight & Guardrails</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {[
            `Default segment ${segmentLabel(settings.marketingDefaultSegment)} dipakai untuk preview composer.`,
            `Budget per bulan ${currency.format(settings.marketingMonthlyBudget)} (atur di Pengaturan).`,
            "WA broadcast tetap manual per-customer agar comply, sistem bantu jadwal & template.",
            "Voucher diskon disarankan 5-15% reguler; 20-50% hanya recovery atau VIP event.",
          ].map((line) => (
            <div
              key={line}
              className="flex gap-2 rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-sm text-[#d6d6dc]"
            >
              <Sparkles className="mt-0.5 size-4 shrink-0 text-[#f5a742]" />
              <span>{line}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PerformanceBar({
  label,
  actual,
  target,
  valueFormatter,
}: {
  label: string;
  actual: number;
  target: number;
  valueFormatter: (v: number) => string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#d6d6dc]">{label}</span>
        <span className="garage-mono text-[#ffd08a]">
          {valueFormatter(actual)} / {valueFormatter(target)} · {pct}%
        </span>
      </div>
      <Progress value={pct} className="h-2 bg-white/[0.06]" />
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof LineChart;
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn";
}) {
  const valueColor =
    tone === "warn"
      ? "text-[#ffc2c8]"
      : tone === "good"
        ? "text-[#86efac]"
        : "text-white";
  return (
    <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-[#f5a742]" />
        <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
          {label}
        </p>
      </div>
      <p className={`mt-2 text-2xl font-black ${valueColor}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-[#b8b8bf]" title={sub}>
        {sub}
      </p>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof LineChart;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-dashed border-[#34343c] py-8 text-center">
      <Icon className="mx-auto size-6 text-[#8f8f99]" />
      <p className="mt-2 text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 text-xs text-[#8f8f99]">{children}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaigns tab
// ─────────────────────────────────────────────────────────────────────────────

function MarketingCampaigns({
  canWrite,
  settings,
}: {
  canWrite: boolean;
  settings: AppSettings;
}) {
  const [rows, setRows] = useState<CampaignDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Seleksi massal untuk export aman (NAV_ACTION_AUDIT §1.7, non-destruktif).
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());

  function toggleBulk(id: string) {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleBulkAll(ids: string[]) {
    setBulkIds((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }
  function exportSelectedCsv() {
    const picked = rows.filter((r) => bulkIds.has(r.id));
    if (picked.length === 0) return;
    const head = ["Nama", "Kode", "Channel", "Status", "Budget", "Spend", "Revenue", "Order"];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const body = picked.map((r) =>
      [r.name, r.code, r.channel, r.status, r.budget, r.spend, r.actualRevenue, r.actualOrders].map(esc).join(","),
    );
    const csv = [head.map(esc).join(","), ...body].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-terpilih-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (channelFilter !== "all") params.set("channel", channelFilter);
      if (search.trim()) params.set("search", search.trim());
      const result = await garageApi.get<CampaignDto[]>(
        `/api/marketing/campaigns?${params.toString()}`,
        { cache: "no-store" },
      );
      setRows(result);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, channelFilter, search]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function handleArchive(row: CampaignDto) {
    if (!confirm(`Arsipkan campaign "${row.name}"?`)) return;
    try {
      await garageApi.delete(`/api/marketing/campaigns/${row.id}`);
      setNotice(`Campaign ${row.code} diarsipkan.`);
      await load();
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[200px] flex-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama campaign..."
              className="h-9 border-[#34343c] bg-white/[0.05]"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[160px] border-[#34343c] bg-white/[0.05]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {CAMPAIGN_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-9 w-[160px] border-[#34343c] bg-white/[0.05]">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua channel</SelectItem>
              {CHANNELS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-9 border-[#4a4a54]"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            type="button"
            className="garage-press h-9 gap-2 bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
            disabled={!canWrite}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            Campaign baru
          </Button>
        </div>
      </div>

      {error ? (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
          <Check className="size-4" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {/* Bar aksi massal aman — export campaign terpilih (NAV_ACTION_AUDIT §1.7). */}
      {bulkIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 px-3 py-2">
          <span className="text-sm font-semibold text-white">{bulkIds.size} terpilih</span>
          <button
            type="button"
            onClick={exportSelectedCsv}
            className="inline-flex items-center gap-1.5 rounded border border-[#f5a742]/40 bg-[#f5a742]/10 px-2.5 py-1 text-xs font-semibold text-[#ffd79a] hover:border-[#f5a742]/70 hover:text-white"
          >
            <Download size={13} /> Export CSV terpilih
          </button>
          <button
            type="button"
            onClick={() => setBulkIds(new Set())}
            className="ml-auto rounded border border-white/15 px-2.5 py-1 text-xs text-[#d0d0d6] hover:border-white/40 hover:text-white"
          >
            Batal pilih
          </button>
        </div>
      )}

      <div className="rounded-lg border border-[#34343c] bg-[#111116]">
        <div className="garage-scroll overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
              <tr className="border-b border-[#34343c]">
                <th className="px-3 py-2 text-center font-normal w-9">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua campaign"
                    className="size-4 cursor-pointer accent-[#d11a2a]"
                    checked={rows.length > 0 && rows.every((r) => bulkIds.has(r.id))}
                    onChange={() => toggleBulkAll(rows.map((r) => r.id))}
                  />
                </th>
                <th className="px-3 py-2 text-left font-normal">Campaign</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-left font-normal">Channel</th>
                <th className="px-3 py-2 text-left font-normal">Segment</th>
                <th className="px-3 py-2 text-right font-normal">Budget</th>
                <th className="px-3 py-2 text-right font-normal">Spend</th>
                <th className="px-3 py-2 text-right font-normal">Aktual</th>
                <th className="px-3 py-2 text-left font-normal">Jadwal</th>
                <th className="px-3 py-2 text-right font-normal">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[#8f8f99]">
                    <RefreshCw className="mx-auto size-5 animate-spin text-[#f5a742]" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-[#8f8f99]">
                    Belum ada campaign. Klik &quot;Campaign baru&quot; untuk mulai.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={`border-t border-[#34343c] text-[#d6d6dc] ${bulkIds.has(row.id) ? "bg-[#d11a2a]/10" : ""}`}>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${row.name}`}
                        className="size-4 cursor-pointer accent-[#d11a2a]"
                        checked={bulkIds.has(row.id)}
                        onChange={() => toggleBulk(row.id)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-white">{row.name}</p>
                      <p className="garage-mono mt-0.5 text-[10px] text-[#8f8f99]">
                        {row.code} · {objectiveLabel(row.objective)}
                        {row.voucherCode ? ` · ${row.voucherCode}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={statusBadgeTone(CAMPAIGN_STATUSES, row.status)}>
                        {statusLabel(CAMPAIGN_STATUSES, row.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-white">{channelLabel(row.channel)}</td>
                    <td className="px-3 py-2 text-white">{segmentLabel(row.segmentKey)}</td>
                    <td className="px-3 py-2 text-right text-white">
                      {currency.format(row.budget)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="text-white">{currency.format(row.spend)}</span>
                      {row.budget > 0 && (
                        <span className="ml-1 text-[10px] text-[#8f8f99]">
                          {Math.round((row.spend / row.budget) * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <p className="text-white">{currency.format(row.actualRevenue)}</p>
                      <p className="text-[10px] text-[#8f8f99]">{row.actualOrders} order</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-white">{formatDateShort(row.startsAt)}</p>
                      <p className="text-[10px] text-[#8f8f99]">
                        s/d {formatDateShort(row.endsAt)}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-[#34343c] px-2"
                          onClick={() => setEditing(row)}
                          disabled={!canWrite}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 border-[#34343c] px-2 text-[#ffc2c8] hover:bg-[#d11a2a]/15"
                          onClick={() => void handleArchive(row)}
                          disabled={!canWrite || row.status === "archived"}
                          title="Arsipkan"
                        >
                          <Inbox className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen ? (
        <CampaignFormDialog
          settings={settings}
          onClose={() => setCreateOpen(false)}
          onSaved={(msg) => {
            setNotice(msg);
            setCreateOpen(false);
            void load();
          }}
        />
      ) : null}
      {editing ? (
        <CampaignFormDialog
          settings={settings}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setNotice(msg);
            setEditing(null);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function CampaignFormDialog({
  initial,
  settings,
  onClose,
  onSaved,
}: {
  initial?: CampaignDto;
  settings: AppSettings;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isEdit = Boolean(initial);
  const defaultChannelFromSettings = (settings.marketingDefaultChannel as MarketingChannel) ?? "whatsapp";
  const defaultSegmentFromSettings = settings.marketingDefaultSegment || "atRisk";
  const [name, setName] = useState(initial?.name ?? (isEdit ? "" : settings.marketingCampaignName));
  const [objective, setObjective] = useState<MarketingObjective>(
    (initial?.objective as MarketingObjective) ?? "retention",
  );
  const [channel, setChannel] = useState<MarketingChannel>(
    (initial?.channel as MarketingChannel) ?? defaultChannelFromSettings,
  );
  const [segmentKey, setSegmentKey] = useState<string>(
    initial?.segmentKey ?? defaultSegmentFromSettings,
  );
  const [status, setStatus] = useState<CampaignStatus>(initial?.status ?? "draft");
  const [audienceSize, setAudienceSize] = useState<string>(String(initial?.audienceSize ?? 0));
  const [budget, setBudget] = useState<string>(String(initial?.budget ?? 0));
  const [spend, setSpend] = useState<string>(String(initial?.spend ?? 0));
  const [targetOrders, setTargetOrders] = useState<string>(String(initial?.targetOrders ?? 0));
  const [targetRevenue, setTargetRevenue] = useState<string>(String(initial?.targetRevenue ?? 0));
  const [actualOrders, setActualOrders] = useState<string>(String(initial?.actualOrders ?? 0));
  const [actualRevenue, setActualRevenue] = useState<string>(String(initial?.actualRevenue ?? 0));
  const [startsAt, setStartsAt] = useState<string>(toDateTimeLocalInput(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState<string>(toDateTimeLocalInput(initial?.endsAt ?? null));
  const [ownerName, setOwnerName] = useState<string>(initial?.ownerName ?? "");
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const budgetNumeric = Number.parseInt(budget, 10) || 0;
  const overThreshold =
    settings.marketingApprovalThreshold > 0 &&
    budgetNumeric > settings.marketingApprovalThreshold &&
    status === "active";

  function handleStartsAtChange(value: string) {
    setStartsAt(value);
    if (!endsAt && value && settings.marketingDefaultDurationDays > 0) {
      const baseDate = new Date(value);
      if (!Number.isNaN(baseDate.getTime())) {
        baseDate.setDate(baseDate.getDate() + settings.marketingDefaultDurationDays);
        setEndsAt(toDateTimeLocalInput(baseDate.toISOString()));
      }
    }
  }

  async function handleSubmit() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Nama campaign minimal 2 karakter.");
      return;
    }
    const payload = {
      name: name.trim(),
      objective,
      channel,
      segmentKey,
      status,
      audienceSize: Number.parseInt(audienceSize, 10) || 0,
      budget: Number.parseInt(budget, 10) || 0,
      targetOrders: Number.parseInt(targetOrders, 10) || 0,
      targetRevenue: Number.parseInt(targetRevenue, 10) || 0,
      startsAt: fromDateTimeLocalInput(startsAt),
      endsAt: fromDateTimeLocalInput(endsAt),
      ownerName: ownerName.trim() || null,
      notes: notes.trim() || null,
    };
    setSaving(true);
    try {
      if (isEdit && initial) {
        await garageApi.patch(`/api/marketing/campaigns/${initial.id}`, {
          ...payload,
          spend: Number.parseInt(spend, 10) || 0,
          actualOrders: Number.parseInt(actualOrders, 10) || 0,
          actualRevenue: Number.parseInt(actualRevenue, 10) || 0,
        });
        onSaved(`Campaign ${initial.code} diperbarui.`);
      } else {
        await garageApi.post("/api/marketing/campaigns", payload);
        onSaved("Campaign baru dibuat.");
      }
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Campaign" : "Buat Campaign Baru"}</DialogTitle>
          <DialogDescription>
            Set objective, target segment, budget, dan KPI target. Status &quot;active&quot; akan
            ditampilkan di Overview.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <label className="text-xs text-[#d6d6dc]">Nama campaign</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Win-back September"
              className="mt-1 border-[#34343c] bg-white/[0.05]"
              maxLength={120}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[#d6d6dc]">Objective</label>
              <Select value={objective} onValueChange={(v) => setObjective(v as MarketingObjective)}>
                <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label} — {o.hint}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-[#d6d6dc]">Channel</label>
              <Select value={channel} onValueChange={(v) => setChannel(v as MarketingChannel)}>
                <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[#d6d6dc]">Segment target</label>
              <Select value={segmentKey} onValueChange={setSegmentKey}>
                <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETING_SEGMENTS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-[#d6d6dc]">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as CampaignStatus)}>
                <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[#d6d6dc]">Mulai</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => handleStartsAtChange(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[#34343c] bg-white/[0.05] px-3 text-sm text-white"
              />
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                Pilih tanggal mulai → tanggal selesai auto +
                {settings.marketingDefaultDurationDays} hari (atur di Pengaturan).
              </p>
            </div>
            <div>
              <label className="text-xs text-[#d6d6dc]">Selesai</label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[#34343c] bg-white/[0.05] px-3 text-sm text-white"
              />
            </div>
          </div>

          {overThreshold ? (
            <Alert className="border-[#f5a742]/55 bg-[#f5a742]/12 text-[#ffe5b4]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Approval owner direkomendasikan</AlertTitle>
              <AlertDescription>
                Budget {currency.format(budgetNumeric)} melebihi threshold{" "}
                {currency.format(settings.marketingApprovalThreshold)}. Pertimbangkan simpan dulu
                sebagai &quot;draft&quot; dan ajukan approval ke owner sebelum aktifkan.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              label="Audience size"
              value={audienceSize}
              onChange={setAudienceSize}
              hint="orang"
            />
            <NumberField
              label="Budget (IDR)"
              value={budget}
              onChange={setBudget}
              hint={currency.format(Number.parseInt(budget, 10) || 0)}
            />
            <NumberField
              label="Target order"
              value={targetOrders}
              onChange={setTargetOrders}
              hint="order"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              label="Target revenue (IDR)"
              value={targetRevenue}
              onChange={setTargetRevenue}
              hint={currency.format(Number.parseInt(targetRevenue, 10) || 0)}
            />
            {isEdit ? (
              <>
                <NumberField
                  label="Spend aktual"
                  value={spend}
                  onChange={setSpend}
                  hint={currency.format(Number.parseInt(spend, 10) || 0)}
                />
                <NumberField
                  label="Actual order"
                  value={actualOrders}
                  onChange={setActualOrders}
                  hint="order tercatat"
                />
              </>
            ) : null}
          </div>
          {isEdit ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                label="Actual revenue (IDR)"
                value={actualRevenue}
                onChange={setActualRevenue}
                hint={currency.format(Number.parseInt(actualRevenue, 10) || 0)}
              />
              <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2 text-xs text-[#b8b8bf]">
                ROI:{" "}
                <span className="font-bold text-white">
                  {(() => {
                    const sp = Number.parseInt(spend, 10) || 0;
                    const ar = Number.parseInt(actualRevenue, 10) || 0;
                    if (sp <= 0) return "—";
                    return `${Math.round(((ar - sp) / sp) * 100)}%`;
                  })()}
                </span>
              </div>
            </div>
          ) : null}
          <div>
            <label className="text-xs text-[#d6d6dc]">PIC / Owner</label>
            <Input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Contoh: Ayu (Marketing)"
              className="mt-1 border-[#34343c] bg-white/[0.05]"
              maxLength={120}
            />
          </div>
          <div>
            <label className="text-xs text-[#d6d6dc]">Catatan</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Strategi, asumsi, atau catatan untuk tim..."
              className="mt-1 min-h-20 border-[#34343c] bg-white/[0.05]"
              maxLength={2000}
            />
          </div>
        </div>

        {error ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#4a4a54]"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? (
              <RefreshCw className="mr-2 size-4 animate-spin" />
            ) : (
              <Check className="mr-2 size-4" />
            )}
            {isEdit ? "Simpan perubahan" : "Buat campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-xs text-[#d6d6dc]">{label}</label>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        className="mt-1 border-[#34343c] bg-white/[0.05]"
      />
      {hint ? <p className="mt-1 text-[10px] text-[#8f8f99]">{hint}</p> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcasts tab
// ─────────────────────────────────────────────────────────────────────────────

function MarketingBroadcasts({
  canWrite,
  settings,
}: {
  canWrite: boolean;
  settings: AppSettings;
}) {
  const [rows, setRows] = useState<BroadcastDto[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const [broadcasts, camps] = await Promise.all([
        garageApi.get<BroadcastDto[]>(`/api/marketing/broadcasts?${params.toString()}`, {
          cache: "no-store",
        }),
        garageApi.get<CampaignDto[]>("/api/marketing/campaigns?status=active", {
          cache: "no-store",
        }),
      ]);
      setRows(broadcasts);
      setCampaigns(camps);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function handleMarkSent(row: BroadcastDto) {
    if (!confirm(`Tandai broadcast "${row.name}" sebagai terkirim?`)) return;
    try {
      await garageApi.patch(`/api/marketing/broadcasts/${row.id}`, {
        markSent: true,
        sentCount: row.totalRecipients,
      });
      setNotice(`Broadcast ${row.name} ditandai terkirim.`);
      await load();
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  async function handleSend(row: BroadcastDto) {
    if (
      !confirm(
        `Kirim broadcast "${row.name}" ke semua penerima segmen ${segmentLabel(row.segmentKey)} sekarang?`,
      )
    )
      return;
    try {
      const summary = await garageApi.post<{
        total: number;
        sent: number;
        simulated: number;
        failed: number;
        provider: string;
      }>(`/api/marketing/broadcasts/${row.id}/send`, {});
      const sentTotal = summary.sent + summary.simulated;
      setNotice(
        `Broadcast ${row.name}: ${sentTotal}/${summary.total} terkirim` +
          (summary.provider === "simulation" ? " (mode simulasi)" : "") +
          (summary.failed > 0 ? `, ${summary.failed} gagal` : "") +
          ".",
      );
      await load();
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  async function handleCancel(row: BroadcastDto) {
    if (!confirm(`Batalkan broadcast "${row.name}"?`)) return;
    try {
      await garageApi.patch(`/api/marketing/broadcasts/${row.id}`, {
        status: "cancelled",
      });
      setNotice(`Broadcast ${row.name} dibatalkan.`);
      await load();
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[180px] border-[#34343c] bg-white/[0.05]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {BROADCAST_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-9 border-[#4a4a54]"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <div className="ml-auto" />
          <Button
            type="button"
            className="garage-press h-9 gap-2 bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
            disabled={!canWrite}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            Broadcast baru
          </Button>
        </div>
      </div>

      {error ? (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
          <Check className="size-4" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {loading && rows.length === 0 ? (
          <div className="rounded-lg border border-[#34343c] bg-[#111116] py-10 text-center text-[#8f8f99]">
            <RefreshCw className="mx-auto size-5 animate-spin text-[#f5a742]" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-[#34343c] bg-[#111116] p-6 text-center text-sm text-[#8f8f99] lg:col-span-2">
            Belum ada broadcast. Buat baru untuk jadwal WA blast.
          </div>
        ) : (
          rows.map((row) => (
            <BroadcastCard
              key={row.id}
              row={row}
              canWrite={canWrite}
              onSend={() => void handleSend(row)}
              onMarkSent={() => void handleMarkSent(row)}
              onCancel={() => void handleCancel(row)}
            />
          ))
        )}
      </div>

      {createOpen ? (
        <BroadcastFormDialog
          campaigns={campaigns}
          settings={settings}
          onClose={() => setCreateOpen(false)}
          onSaved={(msg) => {
            setNotice(msg);
            setCreateOpen(false);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function BroadcastCard({
  row,
  canWrite,
  onSend,
  onMarkSent,
  onCancel,
}: {
  row: BroadcastDto;
  canWrite: boolean;
  onSend: () => void;
  onMarkSent: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-white">{row.name}</p>
          <p className="garage-mono mt-0.5 text-[10px] text-[#8f8f99]">
            {channelLabel(row.channel)} · {segmentLabel(row.segmentKey)}
            {row.campaignCode ? ` · ${row.campaignCode}` : ""}
          </p>
        </div>
        <Badge className={statusBadgeTone(BROADCAST_STATUSES, row.status)}>
          {statusLabel(BROADCAST_STATUSES, row.status)}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
          <p className="garage-mono text-[10px] text-[#8f8f99]">Target</p>
          <p className="text-lg font-bold text-white">{row.totalRecipients}</p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
          <p className="garage-mono text-[10px] text-[#8f8f99]">Sent</p>
          <p className="text-lg font-bold text-white">{row.sentCount}</p>
        </div>
        <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-2">
          <p className="garage-mono text-[10px] text-[#8f8f99]">Opened</p>
          <p className="text-lg font-bold text-white">{row.openedCount}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-[#34343c] bg-white/[0.04] p-3">
        <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
          Template preview
        </p>
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-[#d6d6dc]">
          {row.templateBody || "—"}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-[#b8b8bf]">
        <span>
          Jadwal: <span className="text-white">{formatDate(row.scheduledAt)}</span>
        </span>
        {row.sentAt ? (
          <span>
            Sent: <span className="text-white">{formatDate(row.sentAt)}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 border-[#4a4a54]"
          onClick={() => {
            navigator.clipboard.writeText(row.templateBody).catch(() => {});
          }}
        >
          <Copy className="mr-1.5 size-3.5" />
          Copy template
        </Button>
        {row.status !== "sent" && row.status !== "cancelled" ? (
          <>
            <Button
              type="button"
              size="sm"
              className="h-8 bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
              disabled={!canWrite}
              onClick={onSend}
            >
              <Send className="mr-1.5 size-3.5" />
              Kirim sekarang
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#4a4a54]"
              disabled={!canWrite}
              onClick={onMarkSent}
            >
              <Check className="mr-1.5 size-3.5" />
              Tandai terkirim
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-[#4a4a54] text-[#ffc2c8]"
              disabled={!canWrite}
              onClick={onCancel}
            >
              <X className="mr-1.5 size-3.5" />
              Batalkan
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function BroadcastFormDialog({
  campaigns,
  settings,
  onClose,
  onSaved,
}: {
  campaigns: CampaignDto[];
  settings: AppSettings;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [campaignId, setCampaignId] = useState<string>("none");
  const [channel, setChannel] = useState<MarketingChannel>(
    (settings.marketingDefaultChannel as MarketingChannel) ?? "whatsapp",
  );
  const [segmentKey, setSegmentKey] = useState<string>(settings.marketingDefaultSegment || "atRisk");
  const [templateBody, setTemplateBody] = useState<string>(settings.marketingWhatsappTemplate);
  const [scheduledAt, setScheduledAt] = useState<string>(toDateTimeLocalInput(new Date().toISOString()));
  const [totalRecipients, setTotalRecipients] = useState<string>("0");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utmOrderUrl = useMemo(() => {
    const params = new URLSearchParams({
      source: settings.marketingUtmSource || "garage_marketing",
      campaign: settings.marketingCampaignName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    });
    return `/order?${params.toString()}`;
  }, [settings.marketingUtmSource, settings.marketingCampaignName]);

  const quietHoursWarning = useMemo(() => {
    if (!scheduledAt) return null;
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime())) return null;
    const hour = date.getHours();
    const start = settings.marketingQuietHoursStart;
    const end = settings.marketingQuietHoursEnd;
    const inQuiet = start <= end ? hour >= start && hour < end : hour >= start || hour < end;
    if (!inQuiet) return null;
    return `Jadwal jam ${String(hour).padStart(2, "0")}:00 masuk quiet hours ${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}. Pertimbangkan reschedule.`;
  }, [scheduledAt, settings.marketingQuietHoursStart, settings.marketingQuietHoursEnd]);

  async function handleSubmit() {
    setError(null);
    if (name.trim().length < 2) {
      setError("Nama broadcast minimal 2 karakter.");
      return;
    }
    if (templateBody.trim().length < 1) {
      setError("Template body wajib diisi.");
      return;
    }
    setSaving(true);
    try {
      await garageApi.post("/api/marketing/broadcasts", {
        campaignId: campaignId === "none" ? null : campaignId,
        name: name.trim(),
        channel,
        segmentKey,
        templateBody,
        status: "scheduled",
        scheduledAt: fromDateTimeLocalInput(scheduledAt),
        totalRecipients: Number.parseInt(totalRecipients, 10) || 0,
        notes: notes.trim() || null,
      });
      onSaved("Broadcast terjadwal.");
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Buat Broadcast Baru</DialogTitle>
          <DialogDescription>
            Jadwalkan WA blast / Instagram post terhubung ke campaign. Tracking sent/open dilakukan
            setelah eksekusi.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <label className="text-xs text-[#d6d6dc]">Nama broadcast</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Blast Win-back Minggu 1"
              className="mt-1 border-[#34343c] bg-white/[0.05]"
              maxLength={120}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[#d6d6dc]">Campaign (opsional)</label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Tanpa campaign —</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-[#d6d6dc]">Channel</label>
              <Select value={channel} onValueChange={(v) => setChannel(v as MarketingChannel)}>
                <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[#d6d6dc]">Segment target</label>
              <Select value={segmentKey} onValueChange={setSegmentKey}>
                <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETING_SEGMENTS.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <NumberField
              label="Total recipient"
              value={totalRecipients}
              onChange={setTotalRecipients}
              hint="customer"
            />
          </div>
          <div>
            <label className="text-xs text-[#d6d6dc]">Jadwal</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-[#34343c] bg-white/[0.05] px-3 text-sm text-white"
            />
            {quietHoursWarning ? (
              <p className="mt-1 flex items-start gap-1 text-[10px] text-[#ffd08a]">
                <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                {quietHoursWarning}
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                Quiet hours: {String(settings.marketingQuietHoursStart).padStart(2, "0")}-
                {String(settings.marketingQuietHoursEnd).padStart(2, "0")} (atur di Pengaturan).
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-[#d6d6dc]">Template body</label>
            <Textarea
              value={templateBody}
              onChange={(e) => setTemplateBody(e.target.value)}
              className="mt-1 min-h-32 border-[#34343c] bg-white/[0.05]"
              maxLength={2000}
              placeholder="Hi {name}, kami punya promo spesial..."
            />
            <p className="mt-1 text-[10px] text-[#8f8f99]">
              Token: {"{name}"}, {"{brand}"}, {"{campaign}"}, {"{orderUrl}"} di-render saat
              eksekusi. {"{orderUrl}"} →{" "}
              <span className="garage-mono text-[#ffd08a]">{utmOrderUrl}</span>
            </p>
          </div>
          <div>
            <label className="text-xs text-[#d6d6dc]">Catatan</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 border-[#34343c] bg-white/[0.05]"
              maxLength={500}
            />
          </div>
        </div>

        {error ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#4a4a54]"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? (
              <RefreshCw className="mr-2 size-4 animate-spin" />
            ) : (
              <Send className="mr-2 size-4" />
            )}
            Jadwalkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Promos tab
// ─────────────────────────────────────────────────────────────────────────────

function MarketingPromos({
  canWrite,
  settings,
}: {
  canWrite: boolean;
  settings: AppSettings;
}) {
  const [rows, setRows] = useState<PromoDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      const result = await garageApi.get<PromoDto[]>(
        `/api/marketing/promos?${params.toString()}`,
        { cache: "no-store" },
      );
      setRows(result);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function handleSetStatus(row: PromoDto, status: PromoDto["status"]) {
    try {
      await garageApi.patch(`/api/marketing/promos/${row.id}`, { status });
      setNotice(`Promo ${row.code} → ${status}.`);
      await load();
    } catch (err) {
      setError(describeApiError(err));
    }
  }

  const stats = useMemo(() => {
    const active = rows.filter((p) => p.status === "active").length;
    const redeemed = rows.reduce((sum, p) => sum + p.redemptionCount, 0);
    const discount = rows.reduce((sum, p) => sum + p.discountTotal, 0);
    return { active, redeemed, discount, total: rows.length };
  }, [rows]);

  return (
    <section className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard
          icon={Tags}
          label="Total promo"
          value={String(stats.total)}
          sub={`${stats.active} aktif`}
        />
        <KpiCard
          icon={Gift}
          label="Total redeem"
          value={String(stats.redeemed)}
          sub="all-time"
        />
        <KpiCard
          icon={Percent}
          label="Total diskon"
          value={currency.format(stats.discount)}
          sub="dari semua redeem"
        />
        <KpiCard
          icon={Layers}
          label="Promo aktif"
          value={String(stats.active)}
          sub={`${stats.total - stats.active} non-aktif`}
        />
      </div>

      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[180px] border-[#34343c] bg-white/[0.05]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua status</SelectItem>
              {PROMO_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-9 border-[#4a4a54]"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <div className="ml-auto" />
          <Button
            type="button"
            className="garage-press h-9 gap-2 bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
            disabled={!canWrite}
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            Promo baru
          </Button>
        </div>
      </div>

      {error ? (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert className="border-[#22c55e]/45 bg-[#22c55e]/12 text-[#f4f4f5]">
          <Check className="size-4" />
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-[#34343c] bg-[#111116]">
        <div className="garage-scroll overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
              <tr className="border-b border-[#34343c]">
                <th className="px-3 py-2 text-left font-normal">Promo</th>
                <th className="px-3 py-2 text-left font-normal">Status</th>
                <th className="px-3 py-2 text-left font-normal">Tipe</th>
                <th className="px-3 py-2 text-right font-normal">Value</th>
                <th className="px-3 py-2 text-right font-normal">Redeem</th>
                <th className="px-3 py-2 text-right font-normal">Total diskon</th>
                <th className="px-3 py-2 text-left font-normal">Periode</th>
                <th className="px-3 py-2 text-right font-normal">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#8f8f99]">
                    <RefreshCw className="mx-auto size-5 animate-spin text-[#f5a742]" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#8f8f99]">
                    Belum ada promo. Klik &quot;Promo baru&quot; untuk mulai.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#34343c] text-[#d6d6dc]">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-white">{row.title}</p>
                      <p className="garage-mono mt-0.5 text-[10px] text-[#ffd08a]">{row.code}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={statusBadgeTone(PROMO_STATUSES, row.status)}>
                        {statusLabel(PROMO_STATUSES, row.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-white">
                      {row.type === "fixed" ? "Fixed" : "Percent"}
                    </td>
                    <td className="px-3 py-2 text-right text-white">
                      {row.type === "fixed"
                        ? currency.format(row.value)
                        : `${row.value}%`}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <p className="text-white">{row.redemptionCount}</p>
                      {row.usageLimit ? (
                        <p className="text-[10px] text-[#8f8f99]">
                          / {row.usageLimit}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-white">
                      {currency.format(row.discountTotal)}
                    </td>
                    <td className="px-3 py-2">
                      <p className="text-white">{formatDateShort(row.startsAt)}</p>
                      <p className="text-[10px] text-[#8f8f99]">
                        s/d {formatDateShort(row.endsAt)}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {row.status !== "active" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-[#34343c] px-2 text-[#86efac]"
                            disabled={!canWrite}
                            onClick={() => void handleSetStatus(row, "active")}
                            title="Aktifkan"
                          >
                            <Check className="size-3.5" />
                          </Button>
                        ) : null}
                        {row.status !== "paused" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-[#34343c] px-2 text-[#ffd08a]"
                            disabled={!canWrite}
                            onClick={() => void handleSetStatus(row, "paused")}
                            title="Jeda"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        ) : null}
                        {row.status !== "expired" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 border-[#34343c] px-2 text-[#ffc2c8]"
                            disabled={!canWrite}
                            onClick={() => void handleSetStatus(row, "expired")}
                            title="Expire"
                          >
                            <X className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen ? (
        <PromoFormDialog
          settings={settings}
          onClose={() => setCreateOpen(false)}
          onSaved={(msg) => {
            setNotice(msg);
            setCreateOpen(false);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function PromoFormDialog({
  settings,
  onClose,
  onSaved,
}: {
  settings: AppSettings;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"fixed" | "percent">(settings.marketingDefaultVoucherType);
  const [value, setValue] = useState<string>(String(settings.marketingDefaultVoucherValue));
  const [minSpend, setMinSpend] = useState<string>("0");
  const [maxDiscount, setMaxDiscount] = useState<string>("");
  const [audience, setAudience] = useState<string>("all");
  const [status, setStatus] = useState<PromoDto["status"]>("active");
  const [startsAt, setStartsAt] = useState<string>(toDateTimeLocalInput(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState<string>("");
  const [usageLimit, setUsageLimit] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!/^[A-Z0-9\-_]{3,40}$/i.test(code.trim())) {
      setError("Kode promo 3-40 karakter, hanya huruf/angka/dash/underscore.");
      return;
    }
    if (title.trim().length < 2) {
      setError("Judul promo minimal 2 karakter.");
      return;
    }
    const val = Number.parseInt(value, 10) || 0;
    if (val <= 0) {
      setError("Value promo harus > 0.");
      return;
    }
    if (type === "percent" && val > 100) {
      setError("Promo persen tidak boleh > 100%.");
      return;
    }
    setSaving(true);
    try {
      await garageApi.post("/api/marketing/promos", {
        code: code.trim(),
        title: title.trim(),
        type,
        value: val,
        minSpend: Number.parseInt(minSpend, 10) || 0,
        maxDiscount: maxDiscount ? Number.parseInt(maxDiscount, 10) : null,
        audience,
        status,
        startsAt: fromDateTimeLocalInput(startsAt),
        endsAt: fromDateTimeLocalInput(endsAt),
        usageLimit: usageLimit ? Number.parseInt(usageLimit, 10) : null,
      });
      onSaved(`Promo ${code.toUpperCase()} dibuat.`);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto border-[#34343c] bg-[#111116] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Buat Promo Baru</DialogTitle>
          <DialogDescription>
            Buat voucher fixed atau percent. Voucher otomatis terhubung ke validator POS & order.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[#d6d6dc]">Kode promo</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WINBACK10"
                className="garage-mono mt-1 border-[#34343c] bg-white/[0.05]"
                maxLength={40}
              />
            </div>
            <div>
              <label className="text-xs text-[#d6d6dc]">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as PromoDto["status"])}>
                <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROMO_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-[#d6d6dc]">Judul</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Promo Win-back September"
              className="mt-1 border-[#34343c] bg-white/[0.05]"
              maxLength={120}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[#d6d6dc]">Tipe</label>
              <Select value={type} onValueChange={(v) => setType(v as "fixed" | "percent")}>
                <SelectTrigger className="mt-1 border-[#34343c] bg-white/[0.05]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed (Rp)</SelectItem>
                  <SelectItem value="percent">Percent (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumberField
              label={type === "fixed" ? "Value (IDR)" : "Value (%)"}
              value={value}
              onChange={setValue}
              hint={
                type === "fixed"
                  ? currency.format(Number.parseInt(value, 10) || 0)
                  : `${Number.parseInt(value, 10) || 0}%`
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              label="Min spend"
              value={minSpend}
              onChange={setMinSpend}
              hint={currency.format(Number.parseInt(minSpend, 10) || 0)}
            />
            <NumberField
              label="Max diskon"
              value={maxDiscount}
              onChange={setMaxDiscount}
              hint={
                maxDiscount
                  ? currency.format(Number.parseInt(maxDiscount, 10) || 0)
                  : "tanpa cap"
              }
            />
            <NumberField
              label="Usage limit"
              value={usageLimit}
              onChange={setUsageLimit}
              hint={usageLimit || "unlimited"}
            />
          </div>
          <div>
            <label className="text-xs text-[#d6d6dc]">Audience</label>
            <Input
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="all / vip / new / member"
              className="mt-1 border-[#34343c] bg-white/[0.05]"
              maxLength={40}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[#d6d6dc]">Mulai</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[#34343c] bg-white/[0.05] px-3 text-sm text-white"
              />
            </div>
            <div>
              <label className="text-xs text-[#d6d6dc]">Selesai</label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-[#34343c] bg-white/[0.05] px-3 text-sm text-white"
              />
            </div>
          </div>
        </div>

        {error ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#4a4a54]"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving ? (
              <RefreshCw className="mr-2 size-4 animate-spin" />
            ) : (
              <Ticket className="mr-2 size-4" />
            )}
            Buat promo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar tab
// ─────────────────────────────────────────────────────────────────────────────

function MarketingCalendar() {
  const [data, setData] = useState<CalendarDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await garageApi.get<CalendarDto>("/api/marketing/calendar", {
        cache: "no-store",
      });
      setData(result);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  const grouped = useMemo(() => {
    if (!data) return [] as Array<{ monthLabel: string; entries: CalendarEntry[] }>;
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of data.entries) {
      const date = new Date(entry.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, entries]) => {
        const [year, month] = key.split("-").map((v) => Number.parseInt(v, 10));
        const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("id-ID", {
          month: "long",
          year: "numeric",
        });
        return { monthLabel, entries };
      });
  }, [data]);

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
              Marketing Calendar
            </p>
            <h2 className="mt-1 text-xl font-black text-white">Agenda Bulanan</h2>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Gabungan campaign, broadcast, dan promo dalam 1 timeline. Range default: 1 bulan
              sebelumnya s/d 2 bulan ke depan.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-9 border-[#4a4a54]"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className="rounded-lg border border-[#34343c] bg-[#111116] py-10 text-center text-[#8f8f99]">
          <RefreshCw className="mx-auto size-5 animate-spin text-[#f5a742]" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-6 text-center text-sm text-[#8f8f99]">
          Belum ada agenda dalam range ini. Tambah campaign/broadcast/promo dengan tanggal mulai.
        </div>
      ) : (
        grouped.map((group) => (
          <div key={group.monthLabel} className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
            <h3 className="text-lg font-black text-white capitalize">{group.monthLabel}</h3>
            <div className="mt-3 space-y-2">
              {group.entries.map((entry) => (
                <CalendarEntryRow key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function CalendarEntryRow({ entry }: { entry: CalendarEntry }) {
  const kindMeta: Record<
    CalendarEntry["kind"],
    { label: string; icon: typeof LineChart; tone: string }
  > = {
    campaign: {
      label: "Campaign",
      icon: Target,
      tone: "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]",
    },
    broadcast: {
      label: "Broadcast",
      icon: Send,
      tone: "border-[#3b82f6]/45 bg-[#3b82f6]/12 text-[#bfdbfe]",
    },
    promo: {
      label: "Promo",
      icon: Ticket,
      tone: "border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffd08a]",
    },
  };
  const meta = kindMeta[entry.kind];
  const Icon = meta.icon;

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-[#34343c] bg-white/[0.04] p-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className={`flex size-10 shrink-0 items-center justify-center rounded-md border ${meta.tone}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-white">{entry.title}</p>
          <p className="garage-mono mt-0.5 text-[10px] text-[#8f8f99]">
            {meta.label}
            {entry.code ? ` · ${entry.code}` : ""}
            {entry.segmentKey ? ` · ${segmentLabel(entry.segmentKey)}` : ""}
            {entry.kind !== "promo" ? ` · ${channelLabel(entry.channel)}` : ""}
          </p>
        </div>
      </div>
      <div className="text-right text-xs">
        <p className="text-white">{formatDate(entry.date)}</p>
        {entry.endsAt ? (
          <p className="text-[10px] text-[#8f8f99]">s/d {formatDateShort(entry.endsAt)}</p>
        ) : null}
        <Badge
          className={`mt-1 ${
            entry.kind === "campaign"
              ? statusBadgeTone(CAMPAIGN_STATUSES, entry.status)
              : entry.kind === "broadcast"
                ? statusBadgeTone(BROADCAST_STATUSES, entry.status)
                : statusBadgeTone(PROMO_STATUSES, entry.status)
          }`}
        >
          {entry.status}
        </Badge>
      </div>
    </div>
  );
}
