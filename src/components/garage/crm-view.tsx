"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { currency } from "@/lib/garage-data";
import { garageApi } from "@/lib/api-client";
import type { AppSettings, Customer, GarageMe } from "@/lib/garage-api-types";
import {
  DISCOUNT_PER_REDEEM_UNIT,
  GOLD_ANNUAL_SPEND,
  MAX_PERCENT_VOUCHER,
  MIN_PERCENT_VOUCHER,
  PLATINUM_ANNUAL_SPEND,
  POINTS_PER_REDEEM_UNIT,
} from "@/lib/member-types";

const CrmModuleFallback = () => (
  <div className="px-4 py-10 text-center text-sm text-zinc-400">Memuat CRM...</div>
);

const CrmCustomerList = dynamic(
  () => import("@/components/garage/crm-customer-list").then((m) => m.CrmCustomerList),
  { loading: CrmModuleFallback },
);
const CrmSegments = dynamic(
  () => import("@/components/garage/crm-segments").then((m) => m.CrmSegments),
  { loading: CrmModuleFallback },
);
const CrmAutoSegmentsPanel = dynamic(
  () => import("@/components/garage/crm-auto-segments-panel").then((m) => m.CrmAutoSegmentsPanel),
  { loading: CrmModuleFallback },
);
const GarageMarketingView = dynamic(
  () => import("@/components/garage/garage-marketing").then((m) => m.GarageMarketingView),
  { loading: CrmModuleFallback },
);

type CrmTab = "dashboard" | "customers" | "segments" | "program" | "marketing";

export function CrmView({ customers, settings, me }: { customers: Customer[]; settings: AppSettings; me: GarageMe }) {
  const [activeTab, setActiveTab] = useState<CrmTab>("dashboard");
  const [dashMetrics, setDashMetrics] = useState<CrmDashboardMetrics | null>(null);

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    garageApi.get<CrmDashboardMetrics>("/api/crm/dashboard", { cache: "no-store" })
      .then(setDashMetrics)
      .catch(() => setDashMetrics(null));
  }, [activeTab]);

  return (
    <section className="space-y-4">
      <CrmAutoSegmentsPanel />
      {/* Header KPI strip */}
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">CRM</p>
            <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">Customer Intelligence</h1>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Daftar customer, voucher 5%-50%, poin, tier, dan WhatsApp engagement.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <CrmKpi label="Total customer" value={dashMetrics ? String(dashMetrics.totalCustomers) : "-"} />
          <CrmKpi label="Repeat rate" value={dashMetrics ? `${dashMetrics.repeatRate}%` : "-"} sub={dashMetrics ? `${dashMetrics.atRiskRecovered30d} recovered` : undefined} />
          <CrmKpi label="Active members" value={dashMetrics ? String(dashMetrics.activeMembers) : "-"} />
          <CrmKpi label="Campaign 30d" value={dashMetrics ? String(dashMetrics.campaignOpened30d) : "-"} sub="dibuka" />
        </div>
      </div>

      {/* Tab strip */}
      <div className="grid grid-cols-2 items-center gap-1 rounded-lg border border-[#34343c] bg-[#111116] p-1 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => setActiveTab("dashboard")}
          className={`garage-press flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "dashboard"
              ? "bg-[#f5a742] text-black"
              : "text-[#d6d6dc] hover:bg-white/[0.04]"
          }`}
        >
          Dashboard CRM
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("customers")}
          className={`garage-press flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "customers"
              ? "bg-[#f5a742] text-black"
              : "text-[#d6d6dc] hover:bg-white/[0.04]"
          }`}
        >
          Daftar Customer
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("segments")}
          className={`garage-press flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "segments"
              ? "bg-[#f5a742] text-black"
              : "text-[#d6d6dc] hover:bg-white/[0.04]"
          }`}
        >
          Smart Segments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("program")}
          className={`garage-press rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "program"
              ? "bg-[#f5a742] text-black"
              : "text-[#d6d6dc] hover:bg-white/[0.04]"
          }`}
        >
          Program CRM
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("marketing")}
          className={`garage-press flex-1 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "marketing"
              ? "bg-[#f5a742] text-black"
              : "text-[#d6d6dc] hover:bg-white/[0.04]"
          }`}
        >
          Marketing
        </button>
      </div>

      {activeTab === "dashboard" && <CrmDashboardView />}
      {activeTab === "customers" && <CrmCustomerList />}
      {activeTab === "segments" && <CrmSegments />}
      {activeTab === "program" && <CrmProgramView />}
      {activeTab === "marketing" && <GarageMarketingView customers={customers} settings={settings} me={me} />}
    </section>
  );
}

type CrmDashboardMetrics = {
  totalCustomers: number;
  activeMembers: number;
  repeatRate: number;
  redeemedVoucherCount: number;
  redeemedDiscount: number;
  rewardLiability: number;
  rewardCostPct: number;
  campaignOpened30d: number;
  atRiskRecovered30d: number;
  referralConversion30d: number;
  avgLtv: number;
  medianLtv: number;
  churnRiskRate: number;
  atRiskCustomerCount: number;
};

function CrmDashboardView() {
  const [metrics, setMetrics] = useState<CrmDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await garageApi.get<CrmDashboardMetrics>("/api/crm/dashboard", { cache: "no-store" });
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat dashboard CRM.");
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
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
              Owner CRM Dashboard
            </p>
            <h2 className="mt-1 text-xl font-black text-white">Retention & Reward Control</h2>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Pantau repeat rate, voucher redeemed, biaya reward, dan liability poin.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#4a4a54]"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffc2c8]">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <CrmMetricBox label="Active member" value={metrics ? String(metrics.activeMembers) : "-"} sub={`${metrics?.totalCustomers ?? 0} customer`} />
        <CrmMetricBox label="Repeat rate" value={metrics ? `${metrics.repeatRate}%` : "-"} sub="Returning customer" />
        <CrmMetricBox label="Voucher redeemed" value={metrics ? String(metrics.redeemedVoucherCount) : "-"} sub={currency.format(metrics?.redeemedDiscount ?? 0)} />
        <CrmMetricBox label="Reward cost" value={metrics ? `${metrics.rewardCostPct}%` : "-"} sub="Dari omzet member 30 hari" />
        <CrmMetricBox label="Reward liability" value={currency.format(metrics?.rewardLiability ?? 0)} sub="Saldo poin belum redeem" />
        <CrmMetricBox label="Campaign opened" value={metrics ? String(metrics.campaignOpened30d) : "-"} sub="30 hari terakhir" />
        <CrmMetricBox label="At-risk recovered" value={metrics ? String(metrics.atRiskRecovered30d) : "-"} sub="Proxy paid member 30 hari" />
        <CrmMetricBox label="Referral conversion" value={`${metrics?.referralConversion30d ?? 0}`} sub="Transaksi referral 30 hari" />
        <CrmMetricBox
          label="Avg LTV"
          value={currency.format(metrics?.avgLtv ?? 0)}
          sub={`Median ${currency.format(metrics?.medianLtv ?? 0)}`}
        />
        <CrmMetricBox
          label="Churn risk"
          value={metrics ? `${metrics.churnRiskRate}%` : "-"}
          sub={`${metrics?.atRiskCustomerCount ?? 0} customer belum order 60 hari`}
        />
      </div>
    </section>
  );
}

function CrmMetricBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
      <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs text-[#b8b8bf]">{sub}</p>
    </div>
  );
}

function CrmProgramView() {
  const rewardCostRows = [
    { label: "Point earn", value: "Rp1.000 = 1 poin", note: "Biaya muncul saat poin diredeem." },
    {
      label: "Redeem point",
      value: `${POINTS_PER_REDEEM_UNIT} poin = ${currency.format(DISCOUNT_PER_REDEEM_UNIT)}`,
      note: "Mudah dihitung customer dan cocok untuk kasir jelaskan cepat.",
    },
    {
      label: "Voucher campaign",
      value: `${MIN_PERCENT_VOUCHER}%-${MAX_PERCENT_VOUCHER}%`,
      note: "Pakai 5%-15% untuk reguler, 20%-50% hanya recovery/VIP/event.",
    },
  ];
  const marginRows = [
    { scenario: "Normal", spend: "Rp100.000", reward: "100 poin", cost: "Belum jadi biaya" },
    { scenario: "Redeem", spend: "Rp100.000", reward: "Voucher Rp10.000", cost: "10% gross discount" },
    { scenario: "Healthy cap", spend: "Rp100.000", reward: "Budget Rp2.000-Rp5.000", cost: "2%-5% omzet member" },
  ];

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <p className="garage-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
          Membership Strategy
        </p>
        <h2 className="mt-1 text-xl font-black text-white">Garage Reserve Club</h2>
        <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">
          Program dibuat mudah dihitung customer, tetap terkontrol untuk margin: poin sederhana,
          voucher persen dibatasi, dan benefit besar diarahkan ke tier tinggi.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {rewardCostRows.map((row) => (
          <div key={row.label} className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
            <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#8f8f99]">
              {row.label}
            </p>
            <p className="mt-2 text-lg font-black text-white">{row.value}</p>
            <p className="mt-1 text-xs leading-5 text-[#b8b8bf]">{row.note}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <h3 className="text-base font-bold text-white">Desain Tier</h3>
          <div className="mt-3 grid gap-2">
            <TierProgramRow tier="Silver" target="Daftar member" earn="1x point" benefits="Welcome reward, promo umum, stamp mission" />
            <TierProgramRow tier="Gold" target={`Mulai ${currency.format(GOLD_ANNUAL_SPEND)}/tahun`} earn="1.2x point" benefits="Birthday reward, priority promo, early access seasonal drink" />
            <TierProgramRow tier="Platinum" target={`Mulai ${currency.format(PLATINUM_ANNUAL_SPEND)}/tahun`} earn="1.5x point" benefits="Free monthly drink, VIP menu, exclusive event, faster redeem" />
          </div>
        </div>

        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <h3 className="text-base font-bold text-white">Simulasi Margin CRM</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                <tr>
                  <th className="py-2 text-left font-normal">Skenario</th>
                  <th className="py-2 text-left font-normal">Spend</th>
                  <th className="py-2 text-left font-normal">Reward</th>
                  <th className="py-2 text-left font-normal">Cost</th>
                </tr>
              </thead>
              <tbody>
                {marginRows.map((row) => (
                  <tr key={row.scenario} className="border-t border-[#34343c] text-[#d6d6dc]">
                    <td className="py-2 pr-3 font-semibold text-white">{row.scenario}</td>
                    <td className="py-2 pr-3">{row.spend}</td>
                    <td className="py-2 pr-3">{row.reward}</td>
                    <td className="py-2">{row.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-5 text-[#b8b8bf]">
            SOP sehat: budget reward real dijaga 2%-5% omzet member. Campaign 50% hanya untuk
            kompensasi, birthday, atau invite-only dengan kuota.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <CrmProgramPanel
          title="SOP Member"
          items={[
            "Kasir wajib tawarkan daftar member sebelum pembayaran.",
            "Welcome reward: free espresso shot, topping, atau diskon 10% sekali pakai.",
            "Stamp mission: beli 5 kopi susu gratis 1, datang 10x bonus dessert.",
            "Poin punya masa evaluasi tahunan; reward tidak boleh tanpa expiry.",
          ]}
        />
        <CrmProgramPanel
          title="WhatsApp / App Flow"
          items={[
            "Daftar member dari QR, POS, atau link WhatsApp.",
            "Setelah transaksi: kirim invoice, poin masuk, progres tier, dan CTA redeem.",
            "Segment otomatis kirim: welcome, birthday week, at-risk, payday, member days.",
            "Referral: ajak teman, dua-duanya dapat 30 poin setelah transaksi pertama.",
          ]}
        />
        <CrmProgramPanel
          title="Nama Premium"
          items={[
            "Garage Reserve Club: Silver, Gold, Onyx.",
            "Brew Society: Brew, Reserve, Signature.",
            "Roastery Circle: Bean, Roastery, Master Roast.",
            "Motor & Coffee Club: Classic, Gold, Black.",
          ]}
        />
      </div>
    </section>
  );
}

function TierProgramRow({
  tier,
  target,
  earn,
  benefits,
}: {
  tier: string;
  target: string;
  earn: string;
  benefits: string;
}) {
  return (
    <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-white">{tier}</p>
        <span className="rounded-md border border-[#f5a742]/40 px-2 py-1 font-mono text-[10px] text-[#ffd79a]">
          {earn}
        </span>
      </div>
      <p className="mt-1 text-xs text-[#b8b8bf]">{target}</p>
      <p className="mt-2 text-xs leading-5 text-[#d6d6dc]">{benefits}</p>
    </div>
  );
}

function CrmProgramPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
      <h3 className="text-base font-bold text-white">{title}</h3>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <p key={item} className="rounded-md border border-[#23232a] bg-[#17171c] p-3 text-xs leading-5 text-[#d6d6dc]">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function CrmKpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">{label}</p>
      <p className="mt-1 garage-display text-xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-[#8f8f99]">{sub}</p>}
    </div>
  );
}

