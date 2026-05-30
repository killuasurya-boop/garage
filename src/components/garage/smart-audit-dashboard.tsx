"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { garageApi, GarageApiError } from "@/lib/api-client";

// ── Types ──────────────────────────────────────────────────────────────

type RiskScore = {
  userId: string;
  name: string;
  role: string;
  score: number;
  level: "safe" | "watch" | "high";
  factors: Array<{ key: string; label: string; value: number; weight: number }>;
};

type RiskData = {
  generatedAt: string;
  windowDays: number;
  scores: RiskScore[];
  highCount: number;
  watchCount: number;
};

type TrendDay = { date: string; total: number; critical: number; watch: number };
type RepeatOffender = { actor: string; flagCount: number; kinds: string[]; trend: "escalating" | "stable" | "declining" };
type HourPattern = { hour: number; count: number; percentage: number };

type TrendData = {
  generatedAt: string;
  windowDays: number;
  daily: TrendDay[];
  repeatOffenders: RepeatOffender[];
  hourPatterns: HourPattern[];
};

type CorrelationFlag = {
  kind: string;
  severity: "critical" | "watch" | "info";
  title: string;
  description: string;
  evidence: string[];
};

type CorrelationData = {
  generatedAt: string;
  windowDays: number;
  correlations: CorrelationFlag[];
  criticalCount: number;
  watchCount: number;
};

type AuditCase = {
  id: string;
  flagKind: string;
  severity: string;
  actorName: string | null;
  title: string;
  description: string | null;
  status: string;
  assignedTo: string | null;
  assignedToName: string | null;
  notes: Array<{ by: string; byName: string; text: string; at: string }>;
  resolvedAt: string | null;
  createdByName: string | null;
  createdAt: string;
};

type CasesData = { cases: AuditCase[]; total: number };

type ShiftIntegrity = {
  sessionId: string;
  code: string;
  openedByName: string | null;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number;
  discrepancyStatus: string;
  integrityScore: number;
  flags: string[];
};

type ShiftData = {
  generatedAt: string;
  windowDays: number;
  shifts: ShiftIntegrity[];
  avgIntegrityScore: number;
  flaggedCount: number;
};

type DashboardData = {
  risk: { highCount: number; watchCount: number; topRisk: RiskScore[] };
  trends: { daily: TrendDay[]; escalatingOffenders: RepeatOffender[]; hotHours: HourPattern[] };
  correlations: { flags: CorrelationFlag[]; criticalCount: number };
  cases: { totalCases: number; openCases: number; resolutionRate: number; recentOpen: AuditCase[] };
  shifts: { avgIntegrity: number; flaggedCount: number; worstShifts: ShiftIntegrity[] };
};

// ── Tab type ───────────────────────────────────────────────────────────
type TabId = "overview" | "risk" | "trends" | "correlations" | "cases" | "shifts";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { id: "risk", label: "Risk Score", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "trends", label: "Trends", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  { id: "correlations", label: "Korelasi", icon: <Link2 className="h-3.5 w-3.5" /> },
  { id: "cases", label: "Cases", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "shifts", label: "Shift Integrity", icon: <Shield className="h-3.5 w-3.5" /> },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function rupiah(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

function sevBadge(severity: string) {
  if (severity === "critical" || severity === "high")
    return "border-[#d11a2a]/50 bg-[#d11a2a]/20 text-[#ff8a93]";
  if (severity === "watch")
    return "border-[#f5a742]/50 bg-[#f5a742]/20 text-[#ffd08a]";
  return "border-[#22c55e]/30 bg-[#22c55e]/20 text-[#bbf7d0]";
}

function statusBadge(status: string) {
  if (status === "open") return "border-[#d11a2a]/40 bg-[#d11a2a]/15 text-[#ff8a93]";
  if (status === "investigating") return "border-[#f5a742]/40 bg-[#f5a742]/15 text-[#ffd08a]";
  if (status === "resolved") return "border-[#22c55e]/30 bg-[#22c55e]/15 text-[#bbf7d0]";
  return "border-[#6b7280]/30 bg-[#6b7280]/15 text-[#b8b8bf]";
}

function ScoreBar({ score, size = "md" }: { score: number; size?: "sm" | "md" }) {
  const color = score >= 70 ? "#d11a2a" : score >= 40 ? "#f5a742" : "#22c55e";
  const h = size === "sm" ? "h-1.5" : "h-2";
  return (
    <div className={`w-full rounded-full bg-[#2a2a34] ${h}`}>
      <div className={`${h} rounded-full transition-all`} style={{ width: `${score}%`, backgroundColor: color }} />
    </div>
  );
}

// ── Mini bar chart (sparkline style) ────────────────────────────────────
function MiniBarChart({ data, height = 48 }: { data: { value: number; label?: string }[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 rounded-t bg-[#d11a2a]/60 transition-all hover:bg-[#d11a2a]"
          style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
          title={`${d.label ?? i}: ${d.value}`}
        />
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════

export function SmartAuditDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [riskData, setRiskData] = useState<RiskData | null>(null);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [correlationData, setCorrelationData] = useState<CorrelationData | null>(null);
  const [casesData, setCasesData] = useState<CasesData | null>(null);
  const [shiftData, setShiftData] = useState<ShiftData | null>(null);

  // Case management state
  const [selectedCase, setSelectedCase] = useState<AuditCase | null>(null);
  const [newNote, setNewNote] = useState("");
  const [caseLoading, setCaseLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<DashboardData>("/api/audit/dashboard", { cache: "no-store" });
      setDashboard(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRisk = useCallback(async () => {
    setLoading(true);
    try {
      const res = await garageApi.get<RiskData>("/api/audit/risk-scores", { cache: "no-store" });
      setRiskData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat risk scores.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTrends = useCallback(async () => {
    setLoading(true);
    try {
      const res = await garageApi.get<TrendData>("/api/audit/trends", { cache: "no-store" });
      setTrendData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat trends.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCorrelations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await garageApi.get<CorrelationData>("/api/audit/correlations", { cache: "no-store" });
      setCorrelationData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat korelasi.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await garageApi.get<CasesData>("/api/audit/cases", { cache: "no-store" });
      setCasesData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat cases.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await garageApi.get<ShiftData>("/api/audit/shift-integrity", { cache: "no-store" });
      setShiftData(res);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat shift integrity.");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    switch (activeTab) {
      case "overview": return loadOverview();
      case "risk": return loadRisk();
      case "trends": return loadTrends();
      case "correlations": return loadCorrelations();
      case "cases": return loadCases();
      case "shifts": return loadShifts();
    }
  }, [activeTab, loadOverview, loadRisk, loadTrends, loadCorrelations, loadCases, loadShifts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on tab change
    void refresh();
  }, [refresh]);

  // Case actions
  const selectedCaseId = selectedCase?.id ?? null;
  const updateCase = useCallback(async (caseId: string, updates: Record<string, unknown>) => {
    setCaseLoading(true);
    try {
      await garageApi.patch(`/api/audit/cases/${caseId}`, updates);
      await loadCases();
      if (selectedCaseId === caseId) {
        const updated = await garageApi.get<CasesData>("/api/audit/cases", { cache: "no-store" });
        const found = updated.cases.find((c) => c.id === caseId);
        if (found) setSelectedCase(found);
      }
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal update case.");
    } finally {
      setCaseLoading(false);
    }
  }, [loadCases, selectedCaseId]);

  const addNote = useCallback(async () => {
    if (!selectedCase || !newNote.trim()) return;
    setCaseLoading(true);
    try {
      const updated = await garageApi.post<AuditCase>(`/api/audit/cases/${selectedCase.id}/notes`, { text: newNote.trim() });
      setSelectedCase(updated);
      setNewNote("");
      await loadCases();
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal tambah note.");
    } finally {
      setCaseLoading(false);
    }
  }, [selectedCase, newNote, loadCases]);

  const createCaseFromCorrelation = useCallback(async (flag: CorrelationFlag) => {
    setCaseLoading(true);
    try {
      await garageApi.post("/api/audit/cases", {
        flagKind: flag.kind,
        severity: flag.severity,
        title: flag.title,
        description: flag.description + "\n\nEvidence:\n" + flag.evidence.map((e) => `• ${e}`).join("\n"),
      });
      await loadCases();
      setActiveTab("cases");
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal buat case.");
    } finally {
      setCaseLoading(false);
    }
  }, [loadCases]);

  // ── Overview Tab ─────────────────────────────────────────────────────
  const renderOverview = () => {
    if (!dashboard) return null;
    return (
      <div className="space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard
            label="High Risk Staff"
            value={dashboard.risk.highCount}
            sub={`${dashboard.risk.watchCount} watch`}
            color={dashboard.risk.highCount > 0 ? "red" : "green"}
            icon={<ShieldAlert className="h-4 w-4" />}
          />
          <KpiCard
            label="Korelasi"
            value={dashboard.correlations.criticalCount}
            sub={`${dashboard.correlations.flags.length} total`}
            color={dashboard.correlations.criticalCount > 0 ? "red" : "green"}
            icon={<Link2 className="h-4 w-4" />}
          />
          <KpiCard
            label="Open Cases"
            value={dashboard.cases.openCases}
            sub={`${dashboard.cases.resolutionRate}% resolved`}
            color={dashboard.cases.openCases > 3 ? "amber" : "green"}
            icon={<FileText className="h-4 w-4" />}
          />
          <KpiCard
            label="Shift Integrity"
            value={`${dashboard.shifts.avgIntegrity}%`}
            sub={`${dashboard.shifts.flaggedCount} flagged`}
            color={dashboard.shifts.avgIntegrity < 80 ? "red" : dashboard.shifts.avgIntegrity < 90 ? "amber" : "green"}
            icon={<Shield className="h-4 w-4" />}
          />
          <KpiCard
            label="Escalating"
            value={dashboard.trends.escalatingOffenders.length}
            sub="repeat offender"
            color={dashboard.trends.escalatingOffenders.length > 0 ? "red" : "green"}
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>

        {/* Trend chart */}
        {dashboard.trends.daily.length > 0 && (
          <Card className="garage-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Audit Events (14 hari)</CardTitle>
            </CardHeader>
            <CardContent>
              <MiniBarChart
                data={dashboard.trends.daily.map((d) => ({ value: d.total, label: d.date }))}
                height={64}
              />
              <div className="mt-1 flex justify-between text-[9px] text-[#b8b8bf]">
                <span>{dashboard.trends.daily[0]?.date}</span>
                <span>{dashboard.trends.daily[dashboard.trends.daily.length - 1]?.date}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top risk + open cases side by side */}
        <div className="grid gap-3 lg:grid-cols-2">
          {/* Top risk */}
          <Card className="garage-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Top Risk Staff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dashboard.risk.topRisk.length === 0 && (
                <p className="text-xs text-[#b8b8bf]">Semua staff aman.</p>
              )}
              {dashboard.risk.topRisk.map((s) => (
                <div key={s.userId} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white">{s.name}</p>
                    <p className="text-[10px] text-[#b8b8bf]">{s.role}</p>
                  </div>
                  <div className="w-20">
                    <ScoreBar score={s.score} size="sm" />
                  </div>
                  <span className={`garage-mono shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${sevBadge(s.level)}`}>
                    {s.score}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Correlation flags */}
          <Card className="garage-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Korelasi Lintas-Modul</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dashboard.correlations.flags.length === 0 && (
                <p className="text-xs text-[#b8b8bf]">Tidak ada korelasi mencurigakan.</p>
              )}
              {dashboard.correlations.flags.map((f, i) => (
                <div key={i} className={`rounded-md border p-2 ${f.severity === "critical" ? "border-[#d11a2a]/40 bg-[#d11a2a]/10" : "border-[#f5a742]/40 bg-[#f5a742]/10"}`}>
                  <p className="text-xs font-bold text-white">{f.title}</p>
                  <p className="mt-0.5 text-[10px] text-[#d6d6dc]">{f.description}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Hot hours + worst shifts */}
        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="garage-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Jam Rawan</CardTitle>
              <CardDescription className="text-[10px] text-[#b8b8bf]">Aktivitas mencurigakan per jam</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.trends.hotHours.length === 0 ? (
                <p className="text-xs text-[#b8b8bf]">Belum ada data.</p>
              ) : (
                <div className="space-y-1.5">
                  {dashboard.trends.hotHours.map((h) => (
                    <div key={h.hour} className="flex items-center gap-2 text-xs">
                      <span className="garage-mono w-12 text-[#b8b8bf]">{String(h.hour).padStart(2, "0")}:00</span>
                      <div className="flex-1">
                        <ScoreBar score={h.percentage} size="sm" />
                      </div>
                      <span className="garage-mono w-8 text-right text-[10px] text-[#d6d6dc]">{h.count}x</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="garage-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Shift Bermasalah</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dashboard.shifts.worstShifts.length === 0 ? (
                <p className="text-xs text-[#b8b8bf]">Semua shift OK.</p>
              ) : (
                dashboard.shifts.worstShifts.map((s) => (
                  <div key={s.sessionId} className="rounded-md border border-[#f5a742]/30 bg-[#f5a742]/8 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-white">{s.code}</p>
                      <span className={`garage-mono rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${sevBadge(s.integrityScore < 60 ? "critical" : "watch")}`}>
                        {s.integrityScore}%
                      </span>
                    </div>
                    <p className="text-[10px] text-[#b8b8bf]">{s.openedByName ?? "—"}</p>
                    {s.flags.map((f, fi) => (
                      <p key={fi} className="text-[10px] text-[#ffd08a]">• {f}</p>
                    ))}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ── Risk Tab ──────────────────────────────────────────────────────────
  const renderRisk = () => {
    if (!riskData) return null;
    return (
      <div className="space-y-3">
        <div className="flex gap-3">
          <KpiCard label="High Risk" value={riskData.highCount} color="red" icon={<ShieldAlert className="h-4 w-4" />} />
          <KpiCard label="Watch" value={riskData.watchCount} color="amber" icon={<AlertTriangle className="h-4 w-4" />} />
          <KpiCard label="Safe" value={riskData.scores.filter((s) => s.level === "safe").length} color="green" icon={<UserCheck className="h-4 w-4" />} />
        </div>
        <Card className="garage-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Staff Risk Leaderboard ({riskData.windowDays}d)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {riskData.scores.map((s) => (
              <RiskScoreRow key={s.userId} score={s} />
            ))}
            {riskData.scores.length === 0 && <p className="text-xs text-[#b8b8bf]">Tidak ada staff terdaftar.</p>}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Trends Tab ────────────────────────────────────────────────────────
  const renderTrends = () => {
    if (!trendData) return null;
    return (
      <div className="space-y-4">
        {/* Daily trend */}
        <Card className="garage-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Audit Events per Hari ({trendData.windowDays}d)</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.daily.length > 0 ? (
              <>
                <MiniBarChart data={trendData.daily.map((d) => ({ value: d.total, label: d.date }))} height={80} />
                <div className="mt-1 flex justify-between text-[9px] text-[#b8b8bf]">
                  <span>{trendData.daily[0]?.date}</span>
                  <span>{trendData.daily[trendData.daily.length - 1]?.date}</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-[#b8b8bf]">Belum ada data.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* Repeat offenders */}
          <Card className="garage-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Repeat Offenders</CardTitle>
              <CardDescription className="text-[10px] text-[#b8b8bf]">
                Staff dengan flag &ge; 3x
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {trendData.repeatOffenders.length === 0 ? (
                <p className="text-xs text-[#b8b8bf]">Tidak ada repeat offender.</p>
              ) : (
                trendData.repeatOffenders.map((o, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-[#4a4a54] bg-[#1e1e26] p-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-white">{o.actor}</p>
                      <p className="text-[10px] text-[#b8b8bf]">{o.kinds.join(", ")} · {o.flagCount}x</p>
                    </div>
                    <span className={`garage-mono shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      o.trend === "escalating" ? "border-[#d11a2a]/50 bg-[#d11a2a]/20 text-[#ff8a93]"
                      : o.trend === "declining" ? "border-[#22c55e]/30 bg-[#22c55e]/20 text-[#bbf7d0]"
                      : "border-[#6b7280]/30 bg-[#6b7280]/20 text-[#b8b8bf]"
                    }`}>
                      {o.trend === "escalating" ? "⬆ Naik" : o.trend === "declining" ? "⬇ Turun" : "━ Stabil"}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Hour patterns */}
          <Card className="garage-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Distribusi Jam</CardTitle>
              <CardDescription className="text-[10px] text-[#b8b8bf]">
                Kapan aktivitas mencurigakan paling sering
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {trendData.hourPatterns.length === 0 ? (
                <p className="text-xs text-[#b8b8bf]">Belum ada data.</p>
              ) : (
                trendData.hourPatterns.map((h) => (
                  <div key={h.hour} className="flex items-center gap-2 text-xs">
                    <span className="garage-mono w-14 text-[#b8b8bf]">{String(h.hour).padStart(2, "0")}:00</span>
                    <div className="flex-1">
                      <ScoreBar score={h.percentage} size="sm" />
                    </div>
                    <span className="garage-mono w-10 text-right text-[10px] text-[#d6d6dc]">{h.count}x ({h.percentage}%)</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ── Correlations Tab ──────────────────────────────────────────────────
  const renderCorrelations = () => {
    if (!correlationData) return null;
    return (
      <div className="space-y-3">
        <div className="flex gap-3">
          <KpiCard label="Critical" value={correlationData.criticalCount} color="red" icon={<ShieldAlert className="h-4 w-4" />} />
          <KpiCard label="Watch" value={correlationData.watchCount} color="amber" icon={<AlertTriangle className="h-4 w-4" />} />
        </div>
        <Card className="garage-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cross-Module Correlations ({correlationData.windowDays}d)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {correlationData.correlations.length === 0 ? (
              <div className="rounded-md border border-[#22c55e]/30 bg-[#22c55e]/10 p-3 text-xs text-[#bbf7d0]">
                Tidak ada korelasi mencurigakan. Aman.
              </div>
            ) : (
              correlationData.correlations.map((f, i) => (
                <div key={i} className={`rounded-md border p-3 ${f.severity === "critical" ? "border-[#d11a2a]/40 bg-[#d11a2a]/10" : "border-[#f5a742]/40 bg-[#f5a742]/10"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">{f.title}</p>
                      <p className="mt-1 text-[11px] text-[#d6d6dc]">{f.description}</p>
                      <div className="mt-2 space-y-0.5">
                        {f.evidence.map((e, ei) => (
                          <p key={ei} className="text-[10px] text-[#b8b8bf]">• {e}</p>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`garage-mono rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${sevBadge(f.severity)}`}>
                        {f.severity}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="garage-press mt-1 h-6 border-[#4a4a54] px-2 text-[9px]"
                        onClick={() => void createCaseFromCorrelation(f)}
                        disabled={caseLoading}
                      >
                        <FileText className="mr-1 h-3 w-3" />
                        Buat Case
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Cases Tab ─────────────────────────────────────────────────────────
  const caseCounts = useMemo(() => {
    if (!casesData) return { open: 0, investigating: 0, resolved: 0, dismissed: 0 };
    const c = { open: 0, investigating: 0, resolved: 0, dismissed: 0 };
    for (const cs of casesData.cases) {
      if (cs.status in c) c[cs.status as keyof typeof c]++;
    }
    return c;
  }, [casesData]);

  const renderCases = () => {
    if (!casesData) return null;
    return (
      <div className="space-y-3">
        <div className="flex gap-3">
          <KpiCard label="Open" value={caseCounts.open} color="red" icon={<FileText className="h-4 w-4" />} />
          <KpiCard label="Investigating" value={caseCounts.investigating} color="amber" icon={<FileText className="h-4 w-4" />} />
          <KpiCard label="Resolved" value={caseCounts.resolved} color="green" icon={<UserCheck className="h-4 w-4" />} />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* Case list */}
          <Card className="garage-panel">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Audit Cases ({casesData.total})</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="max-h-[500px] space-y-2 overflow-y-auto">
              {casesData.cases.length === 0 ? (
                <p className="text-xs text-[#b8b8bf]">Belum ada case.</p>
              ) : (
                casesData.cases.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`w-full rounded-md border p-2.5 text-left transition-colors ${
                      selectedCase?.id === c.id ? "border-[#d11a2a]/60 bg-[#d11a2a]/10" : "border-[#4a4a54] bg-[#1e1e26] hover:bg-[#24242e]"
                    }`}
                    onClick={() => setSelectedCase(c)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-white">{c.title}</p>
                      <span className={`garage-mono shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusBadge(c.status)}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-[#b8b8bf]">
                      <span className={`rounded-full border px-1 py-0.5 text-[8px] font-bold uppercase ${sevBadge(c.severity)}`}>
                        {c.severity}
                      </span>
                      {c.actorName && <span>• {c.actorName}</span>}
                      <span>• {new Date(c.createdAt).toLocaleDateString("id-ID")}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Case detail */}
          <Card className="garage-panel">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {selectedCase ? "Detail Case" : "Pilih case →"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedCase ? (
                <p className="text-xs text-[#b8b8bf]">Klik salah satu case untuk melihat detail.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-bold text-white">{selectedCase.title}</p>
                    {selectedCase.description && (
                      <p className="mt-1 whitespace-pre-wrap text-[11px] text-[#d6d6dc]">{selectedCase.description}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px]">
                    <span className={`rounded-full border px-2 py-0.5 font-bold uppercase ${sevBadge(selectedCase.severity)}`}>
                      {selectedCase.severity}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 font-bold uppercase ${statusBadge(selectedCase.status)}`}>
                      {selectedCase.status}
                    </span>
                  </div>

                  {/* Status actions */}
                  <div className="flex flex-wrap gap-1.5">
                    {selectedCase.status === "open" && (
                      <Button type="button" size="sm" variant="outline" className="garage-press h-6 border-[#f5a742]/40 px-2 text-[9px] text-[#ffd08a]"
                        onClick={() => void updateCase(selectedCase.id, { status: "investigating" })} disabled={caseLoading}>
                        Mulai Investigasi
                      </Button>
                    )}
                    {(selectedCase.status === "open" || selectedCase.status === "investigating") && (
                      <>
                        <Button type="button" size="sm" variant="outline" className="garage-press h-6 border-[#22c55e]/40 px-2 text-[9px] text-[#bbf7d0]"
                          onClick={() => void updateCase(selectedCase.id, { status: "resolved" })} disabled={caseLoading}>
                          Resolve
                        </Button>
                        <Button type="button" size="sm" variant="outline" className="garage-press h-6 border-[#6b7280]/40 px-2 text-[9px] text-[#b8b8bf]"
                          onClick={() => void updateCase(selectedCase.id, { status: "dismissed" })} disabled={caseLoading}>
                          Dismiss
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="space-y-2 border-t border-[#4a4a54] pt-2">
                    <p className="text-xs font-bold text-[#b8b8bf]">
                      <MessageSquarePlus className="mr-1 inline-block h-3 w-3" />
                      Notes ({selectedCase.notes.length})
                    </p>
                    <div className="max-h-40 space-y-1.5 overflow-y-auto">
                      {selectedCase.notes.map((n, i) => (
                        <div key={i} className="rounded border border-[#4a4a54] bg-[#16161e] p-2">
                          <p className="text-[11px] text-[#d6d6dc]">{n.text}</p>
                          <p className="mt-0.5 text-[9px] text-[#b8b8bf]">{n.byName} · {new Date(n.at).toLocaleString("id-ID")}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        className="flex-1 rounded border border-[#4a4a54] bg-[#16161e] px-2 py-1 text-xs text-white placeholder:text-[#6b7280] focus:border-[#d11a2a]/50 focus:outline-none"
                        placeholder="Tambah catatan..."
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void addNote()}
                      />
                      <Button type="button" size="sm" variant="outline" className="garage-press h-7 border-[#4a4a54] px-2"
                        onClick={() => void addNote()} disabled={caseLoading || !newNote.trim()}>
                        <Send className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ── Shifts Tab ────────────────────────────────────────────────────────
  const renderShifts = () => {
    if (!shiftData) return null;
    return (
      <div className="space-y-3">
        <div className="flex gap-3">
          <KpiCard label="Avg Integrity" value={`${shiftData.avgIntegrityScore}%`} color={shiftData.avgIntegrityScore < 80 ? "red" : "green"} icon={<Shield className="h-4 w-4" />} />
          <KpiCard label="Flagged" value={shiftData.flaggedCount} sub={`of ${shiftData.shifts.length}`} color={shiftData.flaggedCount > 0 ? "amber" : "green"} icon={<AlertTriangle className="h-4 w-4" />} />
        </div>
        <Card className="garage-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Shift Sessions ({shiftData.windowDays}d)</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[500px] space-y-2 overflow-y-auto">
            {shiftData.shifts.length === 0 ? (
              <p className="text-xs text-[#b8b8bf]">Belum ada shift data.</p>
            ) : (
              shiftData.shifts.map((s) => (
                <ShiftRow key={s.sessionId} shift={s} />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-[#ff8a93]" />
          <h2 className="text-lg font-bold text-white">Smart Audit</h2>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="garage-press h-7 border-[#4a4a54] px-2 text-[10px]"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[#4a4a54] pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-[#d11a2a] bg-[#d11a2a]/10 text-white"
                : "text-[#b8b8bf] hover:bg-[#2a2a34] hover:text-white"
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/10 p-2 text-xs text-[#ff8a93]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
          <button type="button" className="ml-auto" onClick={() => setError(null)}><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 animate-spin text-[#d11a2a]" />
          <span className="ml-2 text-xs text-[#b8b8bf]">Memuat data...</span>
        </div>
      )}

      {/* Content */}
      {!loading && (
        <>
          {activeTab === "overview" && renderOverview()}
          {activeTab === "risk" && renderRisk()}
          {activeTab === "trends" && renderTrends()}
          {activeTab === "correlations" && renderCorrelations()}
          {activeTab === "cases" && renderCases()}
          {activeTab === "shifts" && renderShifts()}
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }: {
  label: string;
  value: string | number;
  sub?: string;
  color: "red" | "amber" | "green";
  icon?: React.ReactNode;
}) {
  const border = color === "red" ? "border-[#d11a2a]/30" : color === "amber" ? "border-[#f5a742]/30" : "border-[#22c55e]/30";
  const bg = color === "red" ? "bg-[#d11a2a]/8" : color === "amber" ? "bg-[#f5a742]/8" : "bg-[#22c55e]/8";
  const text = color === "red" ? "text-[#ff8a93]" : color === "amber" ? "text-[#ffd08a]" : "text-[#bbf7d0]";
  return (
    <div className={`flex-1 rounded-lg border ${border} ${bg} p-3`}>
      <div className="flex items-center gap-1.5">
        {icon && <span className={text}>{icon}</span>}
        <p className="text-[10px] uppercase tracking-wide text-[#b8b8bf]">{label}</p>
      </div>
      <p className={`mt-1 text-xl font-bold ${text}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#b8b8bf]">{sub}</p>}
    </div>
  );
}

function RiskScoreRow({ score }: { score: RiskScore }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-[#4a4a54] bg-[#1e1e26] p-2.5">
      <button type="button" className="flex w-full items-center gap-3" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown className="h-3 w-3 text-[#b8b8bf]" /> : <ChevronRight className="h-3 w-3 text-[#b8b8bf]" />}
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs font-bold text-white">{score.name}</p>
          <p className="text-[10px] text-[#b8b8bf]">{score.role}</p>
        </div>
        <div className="w-24">
          <ScoreBar score={score.score} />
        </div>
        <span className={`garage-mono shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${sevBadge(score.level)}`}>
          {score.score}/100
        </span>
      </button>
      {expanded && score.factors.length > 0 && (
        <div className="mt-2 border-t border-[#4a4a54] pt-2 pl-6 space-y-1">
          {score.factors.map((f) => (
            <div key={f.key} className="flex items-center justify-between text-[10px]">
              <span className="text-[#d6d6dc]">{f.label}: {f.value}x</span>
              <span className="garage-mono text-[#ff8a93]">+{f.weight}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShiftRow({ shift }: { shift: ShiftIntegrity }) {
  const [expanded, setExpanded] = useState(false);
  const hasProblem = shift.flags.length > 0;
  return (
    <div className={`rounded-md border p-2.5 ${hasProblem ? "border-[#f5a742]/30 bg-[#f5a742]/5" : "border-[#4a4a54] bg-[#1e1e26]"}`}>
      <button type="button" className="flex w-full items-center gap-3" onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown className="h-3 w-3 text-[#b8b8bf]" /> : <ChevronRight className="h-3 w-3 text-[#b8b8bf]" />}
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs font-bold text-white">{shift.code}</p>
          <p className="text-[10px] text-[#b8b8bf]">
            {shift.openedByName ?? "—"} · {new Date(shift.openedAt).toLocaleString("id-ID")}
            {shift.closedAt ? "" : " · 🟢 Open"}
          </p>
        </div>
        <div className="w-16">
          <ScoreBar score={shift.integrityScore} size="sm" />
        </div>
        <span className={`garage-mono shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${sevBadge(shift.integrityScore < 60 ? "critical" : shift.integrityScore < 80 ? "watch" : "safe")}`}>
          {shift.integrityScore}%
        </span>
      </button>
      {expanded && (
        <div className="mt-2 border-t border-[#4a4a54] pt-2 pl-6 space-y-1.5 text-[10px]">
          <div className="flex justify-between text-[#d6d6dc]">
            <span>Opening cash</span>
            <span className="garage-mono">{rupiah(shift.openingCash)}</span>
          </div>
          <div className="flex justify-between text-[#d6d6dc]">
            <span>Expected cash</span>
            <span className="garage-mono">{rupiah(shift.expectedCash)}</span>
          </div>
          {shift.actualCash !== null && (
            <div className="flex justify-between text-[#d6d6dc]">
              <span>Actual cash</span>
              <span className="garage-mono">{rupiah(shift.actualCash)}</span>
            </div>
          )}
          {shift.discrepancy !== 0 && (
            <div className="flex justify-between font-bold text-[#ff8a93]">
              <span>Selisih</span>
              <span className="garage-mono">{shift.discrepancy > 0 ? "+" : ""}{rupiah(shift.discrepancy)}</span>
            </div>
          )}
          {shift.flags.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {shift.flags.map((f, i) => (
                <p key={i} className="text-[#ffd08a]">⚠ {f}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
