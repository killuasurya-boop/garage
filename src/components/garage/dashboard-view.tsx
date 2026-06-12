"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Activity,
  BarChart3,
  Gauge,
  LockKeyhole,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DashboardData, GarageMe } from "@/lib/garage-api-types";
import type { ModuleId } from "@/lib/garage-data";

const DashboardOwnerSnapshot = dynamic(
  () =>
    import("@/components/garage/dashboard-owner-snapshot").then(
      (m) => m.DashboardOwnerSnapshot,
    ),
  { loading: () => <DashboardModuleFallback /> },
);

const SmartFloorCommand = dynamic(
  () =>
    import("@/components/garage/smart-floor-command").then(
      (m) => m.SmartFloorCommand,
    ),
  { loading: () => <DashboardModuleFallback /> },
);

const toneClass = {
  good: "border-[#d4d4d8]/45 bg-[#d4d4d8]/12 text-[#ffffff]",
  watch: "border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]",
  warn: "border-[#ff2a3a]/45 bg-[#ff2a3a]/14 text-[#ffc2c8]",
  risk: "border-[#d11a2a]/50 bg-[#d11a2a]/16 text-[#ffb0b8]",
};

const metricIcons = {
  revenue: BarChart3,
  cash: Gauge,
  orders: Activity,
  approvals: ShieldAlert,
};

function DashboardModuleFallback() {
  return (
    <div className="rounded-md border border-[#34343c] bg-white/[0.04] p-4 text-sm text-zinc-400">
      Memuat dashboard...
    </div>
  );
}

export function DashboardView({
  data,
  me,
  onNavigateModule,
}: {
  data: DashboardData;
  me: GarageMe;
  onNavigateModule?: (module: ModuleId) => void;
}) {
  const maxSales = Math.max(...data.salesTrend.map((item) => item.sales), 1);
  const canOpenCeoControl = me.role === "Owner / CEO";
  const canSeeSnapshot =
    me.role === "Owner / CEO" ||
    me.role === "Admin" ||
    me.role === "Manager Operasional" ||
    me.role === "Finance / CFO";

  return (
    <section className="space-y-4">
      {canSeeSnapshot && (
        <DashboardOwnerSnapshot
          role={me.role}
          onNavigateModule={onNavigateModule}
        />
      )}

      {canSeeSnapshot && (
        <SmartFloorCommand onNavigateModule={onNavigateModule} />
      )}

      {canOpenCeoControl && (
        <Card className="garage-panel garage-animate-in overflow-hidden border-[#f5a742]/35 bg-[#f5a742]/8">
          <CardHeader className="relative">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(245,167,66,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(245,167,66,0.06)_1px,transparent_1px)] bg-[size:36px_36px]" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="max-w-3xl">
                <Badge className="border-[#f5a742]/45 bg-[#f5a742]/14 text-[#ffd08a]">
                  CEO access only
                </Badge>
                <CardTitle className="mt-4 text-2xl md:text-3xl">
                  GARAGE Company Control Center
                </CardTitle>
                <CardDescription className="mt-2">
                  Dashboard profesional Owner / CEO untuk full control dokumen
                  perusahaan, SOP, training, audit, approval, dan arsip strategis.
                </CardDescription>
              </div>
              <Button asChild className="garage-press bg-[#f5a742] text-[#101014] hover:bg-[#ffd08a]">
                <Link href="/control">
                  <LockKeyhole className="mr-2 size-4" />
                  Masuk Pusat Kontrol
                </Link>
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.headlineMetrics.map((metric) => {
          const MetricIcon = metricIcons[metric.id];

          return (
            <Card key={metric.label} className="garage-panel garage-animate-in garage-hover-lift">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                <div className="min-w-0">
                  <CardDescription>{metric.label}</CardDescription>
                  <CardTitle className="mt-2 break-words text-2xl leading-tight">
                    {metric.value}
                  </CardTitle>
                </div>
                <Badge className={`${toneClass[metric.tone]} shrink-0`}>
                  <MetricIcon className="mr-1 size-3" />
                  {metric.delta}
                </Badge>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Sales trend hari ini</CardTitle>
            <CardDescription>
              Omzet per jam dari transaksi POS yang sudah dibayar (live).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid h-[230px] grid-cols-12 items-end gap-2">
              {data.salesTrend.map((item) => (
                <div key={item.hour} className="flex h-full flex-col justify-end gap-2">
                  <div
                    className="min-h-4 rounded-sm bg-gradient-to-t from-[#8b0f1a] via-[#d11a2a] to-[#f5a742] shadow-[0_0_18px_rgba(209,26,42,0.22)] transition-[height,filter] duration-500 hover:brightness-125"
                    style={{ height: `${(item.sales / maxSales) * 100}%` }}
                  />
                  <p className="text-center text-xs text-[#d0d0d6]">
                    {item.hour}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="garage-panel garage-animate-in">
          <CardHeader>
            <CardTitle>Operational signals</CardTitle>
            <CardDescription>Kontrol cepat owner dan manager.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.operationalSignals.map((signal) => (
              <div
                key={signal.label}
                className="garage-surface garage-hover-lift rounded-md p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">{signal.label}</p>
                  <p className="text-lg font-semibold text-white">{signal.value}</p>
                </div>
                <p className="mt-1 text-sm text-zinc-200">{signal.status}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
