"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Coins,
  TrendingUp,
  Activity,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type OverviewStats = {
  totalStaff: number;
  presentToday: number;
  pendingAdvances: number;
  pendingTasks: number;
  avgKpiScore: number | null;
};

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function TeamHrOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [stats, setStats] = useState<OverviewStats>({
    totalStaff: 0,
    presentToday: 0,
    pendingAdvances: 0,
    pendingTasks: 0,
    avgKpiScore: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      setLoading(true);
      const period = currentPeriod();
      const todayKey = new Date().toISOString().slice(0, 10);

      // Fetch in parallel; tolerate individual failures (no permission, network).
      const [staffRes, logsRes, advRes, tasksRes, kpiRes] = await Promise.all([
        fetch("/api/hr/team/staff").catch(() => null),
        fetch("/api/hr/attendance/logs").catch(() => null),
        fetch(`/api/hr/team/advances?period=${period}`).catch(() => null),
        fetch("/api/staff-tasks?status=open").catch(() => null),
        fetch(`/api/hr/team/kpi?period=${period}`).catch(() => null),
      ]);

      let totalStaff = 0;
      if (staffRes?.ok) {
        const d = await staffRes.json();
        totalStaff = (d.staff ?? []).length;
      }

      let presentToday = 0;
      if (logsRes?.ok) {
        const d = await logsRes.json();
        const todays = (d.logs ?? []).filter(
          (l: { timestamp: string; action: string; userId?: string }) =>
            l.timestamp?.slice(0, 10) === todayKey && l.action === "in",
        );
        const distinct = new Set(todays.map((l: { userId?: string }) => l.userId));
        presentToday = distinct.size;
      }

      let pendingAdvances = 0;
      if (advRes?.ok) {
        const d = await advRes.json();
        pendingAdvances = (d.advances ?? []).filter(
          (a: { status: string }) => a.status === "pending",
        ).length;
      }

      let pendingTasks = 0;
      if (tasksRes?.ok) {
        const d = await tasksRes.json();
        pendingTasks = (d.tasks ?? d.data?.tasks ?? []).filter(
          (t: { status: string }) => t.status === "open" || t.status === "acknowledged",
        ).length;
      }

      let avgKpiScore: number | null = null;
      if (kpiRes?.ok) {
        const d = await kpiRes.json();
        const scores: number[] = (d.evaluations ?? []).map((e: { score: number }) => e.score);
        if (scores.length > 0) {
          avgKpiScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
        }
      }

      setStats({ totalStaff, presentToday, pendingAdvances, pendingTasks, avgKpiScore });
      setLoading(false);
    };

    fetchOverview();
  }, []);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-xl bg-primary p-8 sm:p-10 text-primary-foreground shadow-md">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-black/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Pusat Kendali Tim</h1>
            <p className="mt-2 text-sm font-medium opacity-90 max-w-lg leading-relaxed">
              Ringkasan kehadiran, kasbon, tugas, dan performa tim untuk hari & periode berjalan.
            </p>
          </div>
          <div className="hidden md:flex h-24 w-24 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border border-white/30 shadow-inner">
            <Activity className="size-10 text-primary-foreground" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Activity className="size-4 text-primary" /> Sorotan
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Tile
            onClick={() => onNavigate("attendance")}
            iconBg="bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-500/20"
            icon={<Clock className="size-5" />}
            value={loading ? "..." : `${stats.presentToday}/${stats.totalStaff}`}
            label="Staf Hadir Hari Ini"
          />
          <Tile
            onClick={() => onNavigate("advances")}
            iconBg="bg-orange-500/10 text-orange-500 group-hover:bg-orange-500/20"
            icon={<Coins className="size-5" />}
            value={loading ? "..." : String(stats.pendingAdvances)}
            label="Kasbon Menunggu"
            pulse={stats.pendingAdvances > 0 && !loading}
          />
          <Tile
            onClick={() => onNavigate("tasks")}
            iconBg="bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20"
            icon={<CheckCircle2 className="size-5" />}
            value={loading ? "..." : String(stats.pendingTasks)}
            label="Tugas Tertunda"
          />
          <Tile
            onClick={() => onNavigate("kpi")}
            iconBg="bg-violet-500/10 text-violet-500 group-hover:bg-violet-500/20"
            icon={<TrendingUp className="size-5" />}
            value={loading ? "..." : stats.avgKpiScore === null ? "—" : String(stats.avgKpiScore)}
            label="Skor Rata-Rata KPI"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="size-4 text-orange-500" />
              Tindakan yang Tertunda
            </CardTitle>
            <CardDescription>Kasbon dan tugas yang menunggu keputusan Anda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Row
              dotColor="bg-orange-500"
              label={`Persetujuan Kasbon (${stats.pendingAdvances})`}
              onAction={() => onNavigate("advances")}
              disabled={stats.pendingAdvances === 0}
            />
            <Row
              dotColor="bg-blue-500"
              label={`Delegasi Tugas Aktif (${stats.pendingTasks})`}
              onAction={() => onNavigate("tasks")}
              disabled={stats.pendingTasks === 0}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="size-4 text-emerald-500" />
              Direktori Tim
            </CardTitle>
            <CardDescription>Akses cepat ke data staf dan jadwal.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => onNavigate("directory")}
            >
              <span>Direktori Staf ({stats.totalStaff})</span>
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="w-full justify-between"
              onClick={() => onNavigate("rostering")}
            >
              <span>Jadwal Shift Mingguan</span>
              <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Tile({
  onClick,
  iconBg,
  icon,
  value,
  label,
  pulse,
}: {
  onClick: () => void;
  iconBg: string;
  icon: React.ReactNode;
  value: string;
  label: string;
  pulse?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-5 text-left transition-all hover:bg-muted focus:outline-none shadow-sm"
    >
      <div className="flex w-full items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${iconBg}`}>
          {icon}
        </div>
        <div className="flex items-center gap-2">
          {pulse && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500" />
            </span>
          )}
          <ArrowRight className="size-4 text-muted-foreground opacity-0 -translate-x-4 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs font-semibold text-muted-foreground mt-1 uppercase tracking-wide">
          {label}
        </div>
      </div>
    </button>
  );
}

function Row({
  dotColor,
  label,
  onAction,
  disabled,
}: {
  dotColor: string;
  label: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/50">
      <div className="flex items-center gap-3">
        <div className={`h-2 w-2 rounded-full ${dotColor} ${disabled ? "" : "animate-pulse"}`} />
        <div className="text-sm font-medium text-foreground">{label}</div>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={onAction}
        disabled={disabled}
      >
        Tinjau
      </Button>
    </div>
  );
}
