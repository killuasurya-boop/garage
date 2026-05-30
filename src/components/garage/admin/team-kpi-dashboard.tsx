"use client";

import { useEffect, useState } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  Award, 
  Clock, 
  ClipboardCheck, 
  Star, 
  Sparkles,
  RefreshCw,
  Info,
  Calendar,
  Medal,
  Crown
} from "lucide-react";

type StaffMember = {
  id: string;
  name: string;
  role: string;
  email: string;
};

type KpiEvaluation = {
  id: string;
  staffId: string;
  period: string;
  score: number;
  feedback: string | null;
};

export function TeamKpiDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState("2026-05");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [evaluations, setEvaluations] = useState<Record<string, KpiEvaluation>>({}); 
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [manualRatings, setManualRatings] = useState<Record<string, number>>({}); 
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const staffRes = await fetch("/api/hr/team/staff");
      let staffList: StaffMember[] = [];
      if (staffRes.ok) {
        const data = await staffRes.json();
        staffList = data.staff || [];
        setStaff(staffList);
      }

      const kpiRes = await fetch(`/api/hr/team/kpi?period=${selectedPeriod}`);
      if (kpiRes.ok) {
        const data = await kpiRes.json();
        const rawEvals: KpiEvaluation[] = data.evaluations || [];
        
        const evalMap: Record<string, KpiEvaluation> = {};
        const ratingsMap: Record<string, number> = {};
        const feedbackMap: Record<string, string> = {};

        rawEvals.forEach((ev) => {
          evalMap[ev.staffId] = ev;
          const manualPart = ev.score - (95 * 0.4) - (90 * 0.4); 
          const rating = Math.max(1, Math.min(5, Math.round((manualPart / 0.2) / 20)));
          ratingsMap[ev.staffId] = rating || 4;
          feedbackMap[ev.staffId] = ev.feedback || "";
        });

        staffList.forEach((s) => {
          if (!ratingsMap[s.id]) ratingsMap[s.id] = 4; 
          if (!feedbackMap[s.id]) feedbackMap[s.id] = "";
        });

        setEvaluations(evalMap);
        setManualRatings(ratingsMap);
        setFeedbacks(feedbackMap);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Gagal memuat rapor performa tim." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  const handleRatingChange = (staffId: string, rating: number) => {
    setManualRatings((prev) => ({ ...prev, [staffId]: rating }));
  };

  const handleFeedbackChange = (staffId: string, text: string) => {
    setFeedbacks((prev) => ({ ...prev, [staffId]: text }));
  };

  const getAttendanceScore = (staffId: string) => {
    return 95;
  };

  const getSopScore = (staffId: string) => {
    return 90;
  };

  const calculateFinalScore = (staffId: string) => {
    const attendance = getAttendanceScore(staffId);
    const sop = getSopScore(staffId);
    const manualRating = manualRatings[staffId] || 4;
    const manualScore = manualRating * 20; 
    return parseFloat((attendance * 0.4 + sop * 0.4 + manualScore * 0.2).toFixed(1));
  };

  const saveKpi = async (staffId: string) => {
    setSavingId(staffId);
    setMessage(null);
    try {
      const finalScore = calculateFinalScore(staffId);
      const feedback = feedbacks[staffId] || "";

      const res = await fetch("/api/hr/team/kpi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          period: selectedPeriod,
          score: finalScore,
          feedback,
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Rapor performa bulanan staf berhasil disimpan!" });
        fetchData();
      } else {
        setMessage({ type: "error", text: "Gagal menyimpan rapor performa ke database." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Terjadi gangguan koneksi saat menyimpan." });
    } finally {
      setSavingId(null);
    }
  };

  const getPerformanceBadge = (score: number) => {
    if (score >= 90) return { label: "🌟 Outstanding (A)", color: "border-emerald-500/50 text-emerald-600 dark:text-emerald-500 bg-emerald-500/10" };
    if (score >= 80) return { label: "✅ Baik (B)", color: "border-blue-500/50 text-blue-600 dark:text-blue-500 bg-blue-500/10" };
    if (score >= 70) return { label: "⚠️ Cukup (C)", color: "border-orange-500/50 text-orange-600 dark:text-orange-500 bg-orange-500/10" };
    return { label: "🛑 Perlu Perbaikan (D)", color: "border-destructive/50 text-destructive bg-destructive/10" };
  };

  const getAverageTeamScore = () => {
    if (staff.length === 0) return "0.0";
    let sum = 0;
    staff.forEach((s) => {
      sum += calculateFinalScore(s.id);
    });
    return (sum / staff.length).toFixed(1);
  };

  const sortedStaff = [...staff].sort((a, b) => calculateFinalScore(b.id) - calculateFinalScore(a.id));
  const topThree = sortedStaff.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Date & Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-4 rounded-lg border shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <div className="flex items-center gap-2 relative z-10">
          <Calendar className="size-5 text-primary" />
          <span className="text-sm font-bold text-muted-foreground uppercase mr-2 tracking-wide">Periode Penilaian</span>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="text-sm font-bold px-4 py-2 rounded-md border bg-muted text-foreground focus:outline-none focus:border-primary transition-colors cursor-pointer"
          >
            <option value="2026-05">Mei 2026</option>
            <option value="2026-06">Juni 2026</option>
            <option value="2026-07">Juli 2026</option>
          </select>
        </div>

        <Button 
          onClick={fetchData} 
          disabled={loading} 
          variant="outline" 
          className="gap-2 self-end sm:self-auto relative z-10 font-semibold"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Segarkan Data
        </Button>
      </div>

      {/* Staff Performance Leaderboard - Top 3 Podium */}
      {staff.length >= 3 && !loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          
          {/* Silver - 2nd Place */}
          <div className="order-2 md:order-1 mt-0 md:mt-8">
            <Card className="border-muted bg-card/80 backdrop-blur-md shadow-sm relative overflow-hidden group hover:border-primary/50 transition-colors">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-muted-foreground to-transparent opacity-30"></div>
              <CardContent className="p-6 text-center space-y-4">
                <div className="mx-auto w-16 h-16 rounded-full bg-muted border-2 border-muted-foreground flex items-center justify-center relative shadow-sm">
                  <Medal className="size-8 text-muted-foreground" />
                  <span className="absolute -bottom-2 -right-2 bg-muted-foreground text-card text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">2</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-foreground">{topThree[1].name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{topThree[1].role}</p>
                </div>
                <div className="inline-block bg-muted rounded-full px-4 py-1.5 border">
                  <span className="text-xl font-black text-foreground">{calculateFinalScore(topThree[1].id)}</span>
                  <span className="text-xs text-muted-foreground ml-1">pts</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Gold - 1st Place */}
          <div className="order-1 md:order-2">
            <Card className="border-primary/40 bg-card shadow-md relative overflow-hidden group hover:border-primary/60 transition-colors transform md:-translate-y-4">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-80 shadow-sm"></div>
              <div className="absolute -top-10 -right-10 w-24 h-24 bg-primary/10 blur-2xl rounded-full"></div>
              <CardContent className="p-6 text-center space-y-4">
                <div className="mx-auto w-20 h-20 rounded-full bg-muted border-2 border-primary flex items-center justify-center relative shadow-md">
                  <Crown className="size-10 text-primary drop-shadow-sm" />
                  <span className="absolute -bottom-2 -right-2 bg-primary text-primary-foreground text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center">1</span>
                </div>
                <div>
                  <h3 className="font-extrabold text-xl text-primary">{topThree[0].name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 tracking-wide uppercase">Pegawai Teladan Bulan Ini</p>
                </div>
                <div className="inline-block bg-primary/10 rounded-full px-5 py-2 border border-primary/30 shadow-inner">
                  <span className="text-2xl font-black text-primary">{calculateFinalScore(topThree[0].id)}</span>
                  <span className="text-xs text-primary/70 ml-1 font-bold">pts</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bronze - 3rd Place */}
          <div className="order-3 md:order-3 mt-0 md:mt-12">
            <Card className="border-orange-700/30 bg-card/80 backdrop-blur-md shadow-sm relative overflow-hidden group hover:border-orange-700/50 transition-colors">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-orange-700 to-transparent opacity-50"></div>
              <CardContent className="p-6 text-center space-y-4">
                <div className="mx-auto w-14 h-14 rounded-full bg-muted border-2 border-orange-700 flex items-center justify-center relative shadow-sm">
                  <Medal className="size-7 text-orange-700" />
                  <span className="absolute -bottom-2 -right-2 bg-orange-700 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">3</span>
                </div>
                <div>
                  <h3 className="font-bold text-base text-foreground">{topThree[2].name}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{topThree[2].role}</p>
                </div>
                <div className="inline-block bg-muted rounded-full px-3 py-1 border">
                  <span className="text-lg font-black text-foreground">{calculateFinalScore(topThree[2].id)}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">pts</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Alert toast */}
      {message && (
        <div className={`p-4 rounded-md border text-sm transition-all duration-300 shadow-sm ${
          message.type === "success" 
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-500" 
            : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 flex-shrink-0" />
            <p className="font-medium">{message.text}</p>
          </div>
        </div>
      )}

      {/* Main KPI List Grid */}
      <Card className="shadow-sm overflow-hidden mt-8 border">
        <CardHeader className="border-b bg-muted/20 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                <Award className="size-5 text-primary" />
                Rapor & Evaluasi Seluruh Staf
              </CardTitle>
              <CardDescription className="mt-1">
                Evaluasi manual performa tim Anda bulan ini. Pembobotan: 40% Kehadiran, 40% SOP, 20% Sikap.
              </CardDescription>
            </div>
            
            <div className="flex items-center gap-3">
               <div className="bg-background border rounded-md px-3 py-1.5 flex items-center gap-2 shadow-sm">
                 <span className="text-xs text-muted-foreground">Rata-rata Skor:</span>
                 <span className="text-sm font-black text-primary">{loading ? "..." : getAverageTeamScore()}</span>
               </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 space-y-4 bg-muted/10 rounded-b-xl">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              <RefreshCw className="size-6 animate-spin mx-auto mb-3 text-primary" />
              <p className="text-sm">Menganalisis data leaderboard...</p>
            </div>
          ) : staff.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-xs">
              <Info className="size-6 mx-auto mb-2 opacity-50" />
              Tidak ada staf aktif terdaftar.
            </div>
          ) : (
            sortedStaff.map((employee, index) => {
              const finalScore = calculateFinalScore(employee.id);
              const badge = getPerformanceBadge(finalScore);
              const isSaved = !!evaluations[employee.id];

              return (
                <div key={employee.id} className="p-4 rounded-xl border bg-card hover:bg-muted/50 hover:shadow-sm transition-all space-y-4 group">
                  {/* Row 1: Employee Header Info */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted border flex items-center justify-center text-xs font-bold text-muted-foreground">
                        #{index + 1}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                          {employee.name}
                          {isSaved && <Badge className="text-[9px] px-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border-emerald-500/30 tracking-wider">Disimpan</Badge>}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{employee.role} • {employee.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Total Skor</div>
                        <div className="text-2xl font-black text-primary leading-none">{finalScore}</div>
                      </div>
                      <Badge variant="outline" className={`text-xs px-2.5 py-1 font-bold ${badge.color}`}>
                        {badge.label}
                      </Badge>
                    </div>
                  </div>

                  {/* Row 2: Metrics Grid Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                    {/* Attendance Metric */}
                    <div className="space-y-1.5 bg-background p-3 rounded-lg border shadow-sm">
                      <h4 className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                        <Clock className="size-3 text-emerald-500" />
                        Absensi (40%)
                      </h4>
                      <div className="text-lg font-black text-foreground mt-1">95.0</div>
                      <p className="text-[10px] text-muted-foreground/80 leading-tight">Kehadiran tepat waktu tanpa pelanggaran shift.</p>
                    </div>

                    {/* SOP Metric */}
                    <div className="space-y-1.5 bg-background p-3 rounded-lg border shadow-sm">
                      <h4 className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                        <ClipboardCheck className="size-3 text-blue-500" />
                        SOP (40%)
                      </h4>
                      <div className="text-lg font-black text-foreground mt-1">90.0</div>
                      <p className="text-[10px] text-muted-foreground/80 leading-tight">Penyelesaian checklist opening & closing.</p>
                    </div>

                    {/* Manual Appraisal Star Rating */}
                    <div className="space-y-1.5 bg-background p-3 rounded-lg border shadow-sm">
                      <h4 className="text-[10px] font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider">
                        <Star className="size-3 text-primary" />
                        Sikap (20%)
                      </h4>
                      <div className="flex items-center gap-1 mt-1">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const currentRating = manualRatings[employee.id] || 4;
                          return (
                            <button
                              key={star}
                              type="button"
                              onClick={() => handleRatingChange(employee.id, star)}
                              className="focus:outline-none hover:scale-110 transition-transform"
                            >
                              <Star className={`size-5 ${
                                star <= currentRating ? "fill-primary text-primary" : "text-muted"
                              }`} />
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground/80 leading-tight mt-1">Sikap inisiatif & keramahan staf.</p>
                    </div>
                  </div>

                  {/* Row 3: Manager Feedback & Action */}
                  <div className="flex flex-col md:flex-row gap-3 pt-3 border-t">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={feedbacks[employee.id] || ""}
                        onChange={(e) => handleFeedbackChange(employee.id, e.target.value)}
                        placeholder="Catatan / masukan untuk staf ini..."
                        className="w-full text-sm px-4 py-2.5 rounded-lg border bg-background text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/50 shadow-sm"
                      />
                    </div>
                    <Button
                      disabled={savingId === employee.id}
                      onClick={() => saveKpi(employee.id)}
                      className="font-bold text-xs px-5"
                    >
                      {savingId === employee.id ? <RefreshCw className="size-4 animate-spin mr-2" /> : null}
                      {savingId === employee.id ? "Menyimpan..." : "Simpan Evaluasi"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
