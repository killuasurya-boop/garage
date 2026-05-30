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
  DollarSign, 
  Settings, 
  FileText, 
  Save, 
  CheckCircle2, 
  RefreshCw, 
  Sparkles,
  Info,
  Calendar,
  AlertTriangle,
  Printer
} from "lucide-react";

type StaffPayroll = {
  staffId: string;
  name: string;
  role: string;
  outletId: string;
  kpiScore: number;
  
  // Master Configs
  masterBaseSalary: number;
  masterAllowance: number;

  // Monthly stats
  baseSalary: number;
  allowance: number;
  bonus: number;
  deduction: number;
  netSalary: number;
  status: "draft" | "paid";
  paidAt: string | null;
  notes: string;
  payrollId: string | null;
  
  // Suggestions
  suggestedBonus: number;
  suggestedDeduction: number;
};

export function TeamPayrollManager() {
  const [selectedPeriod, setSelectedPeriod] = useState("2026-05");
  const [activeSubTab, setActiveSubTab] = useState<"sheet" | "config">("sheet");
  const [payrolls, setPayrolls] = useState<StaffPayroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit states for Master Salaries
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editBase, setEditBase] = useState("");
  const [editAllow, setEditAllow] = useState("");

  // Edit states for monthly payroll adjustments
  const [bonusAdjustments, setBonusAdjustments] = useState<Record<string, string>>({});
  const [deductAdjustments, setDeductAdjustments] = useState<Record<string, string>>({});
  const [notesAdjustments, setNotesAdjustments] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/hr/team/payroll?period=${selectedPeriod}`);
      if (res.ok) {
        const data = await res.json();
        const list: StaffPayroll[] = data.payrolls || [];
        setPayrolls(list);

        // Initialize adjustment inputs
        const bonusMap: Record<string, string> = {};
        const deductMap: Record<string, string> = {};
        const notesMap: Record<string, string> = {};

        list.forEach((p) => {
          bonusMap[p.staffId] = String(p.bonus);
          deductMap[p.staffId] = String(p.deduction);
          notesMap[p.staffId] = p.notes || "";
        });

        setBonusAdjustments(bonusMap);
        setDeductAdjustments(deductMap);
        setNotesAdjustments(notesMap);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Gagal memuat rekap payroll bulanan." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  const handleBonusChange = (staffId: string, val: string) => {
    setBonusAdjustments((prev) => ({ ...prev, [staffId]: val }));
  };

  const handleDeductChange = (staffId: string, val: string) => {
    setDeductAdjustments((prev) => ({ ...prev, [staffId]: val }));
  };

  const handleNotesChange = (staffId: string, val: string) => {
    setNotesAdjustments((prev) => ({ ...prev, [staffId]: val }));
  };

  // On-the-fly net salary calculator
  const getCalculatedNet = (p: StaffPayroll) => {
    const base = p.baseSalary;
    const allow = p.allowance;
    const bonus = parseInt(bonusAdjustments[p.staffId]) || 0;
    const deduct = parseInt(deductAdjustments[p.staffId]) || 0;
    return (base + allow + bonus) - deduct;
  };

  const saveMonthlyPayroll = async (p: StaffPayroll) => {
    setSavingId(p.staffId);
    setMessage(null);
    try {
      const bonusVal = parseInt(bonusAdjustments[p.staffId]) || 0;
      const deductVal = parseInt(deductAdjustments[p.staffId]) || 0;
      const notesVal = notesAdjustments[p.staffId] || "";

      const res = await fetch("/api/hr/team/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_monthly_payroll",
          staffId: p.staffId,
          period: selectedPeriod,
          baseSalary: p.baseSalary,
          allowance: p.allowance,
          bonus: bonusVal,
          deduction: deductVal,
          notes: notesVal,
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: `Penyesuaian gaji untuk ${p.name} berhasil disimpan.` });
        fetchData();
      } else {
        setMessage({ type: "error", text: "Gagal menyimpan rincian payroll harian." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Terjadi kesalahan koneksi." });
    } finally {
      setSavingId(null);
    }
  };

  const paySalary = async (p: StaffPayroll) => {
    if (!confirm(`Konfirmasi pembayaran gaji sebesar ${formatRupiah(getCalculatedNet(p))} kepada ${p.name}? Tindakan ini akan mengunci rekap gaji bulanan ini.`)) {
      return;
    }
    
    setPayingId(p.staffId);
    setMessage(null);
    try {
      // 1. First save any adjustments
      const bonusVal = parseInt(bonusAdjustments[p.staffId]) || 0;
      const deductVal = parseInt(deductAdjustments[p.staffId]) || 0;
      const notesVal = notesAdjustments[p.staffId] || "";

      await fetch("/api/hr/team/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_monthly_payroll",
          staffId: p.staffId,
          period: selectedPeriod,
          baseSalary: p.baseSalary,
          allowance: p.allowance,
          bonus: bonusVal,
          deduction: deductVal,
          notes: notesVal,
        }),
      });

      // 2. Mark as paid
      const res = await fetch("/api/hr/team/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "pay_salary",
          staffId: p.staffId,
          period: selectedPeriod,
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: `Gaji untuk ${p.name} telah berhasil dibayarkan!` });
        fetchData();
      } else {
        setMessage({ type: "error", text: "Gagal memproses pembayaran gaji." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Terjadi kesalahan koneksi." });
    } finally {
      setPayingId(null);
    }
  };

  const startEditMaster = (p: StaffPayroll) => {
    setEditingStaffId(p.staffId);
    setEditBase(String(p.masterBaseSalary || p.baseSalary));
    setEditAllow(String(p.masterAllowance || p.allowance));
  };

  const saveMasterSalary = async (staffId: string) => {
    setSavingId(staffId);
    setMessage(null);
    try {
      const res = await fetch("/api/hr/team/payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_base_salary",
          staffId,
          baseSalary: parseInt(editBase) || 0,
          allowance: parseInt(editAllow) || 0,
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Master gaji dasar karyawan berhasil diperbarui!" });
        setEditingStaffId(null);
        fetchData();
      } else {
        setMessage({ type: "error", text: "Gagal menyimpan gaji dasar ke database." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Terjadi kesalahan koneksi." });
    } finally {
      setSavingId(null);
    }
  };

  const downloadSlipPdf = (p: StaffPayroll) => {
    window.open(`/api/hr/team/payroll/pdf?staffId=${p.staffId}&period=${selectedPeriod}`, "_blank");
  };

  // Helper format rupiah
  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  // Stats Card Calculations
  const getTotalPayrollExpenses = () => {
    let sum = 0;
    payrolls.forEach((p) => {
      sum += getCalculatedNet(p);
    });
    return sum;
  };

  const getPaidCount = () => {
    return payrolls.filter((p) => p.status === "paid").length;
  };

  const getUnpaidCount = () => {
    return payrolls.filter((p) => p.status !== "paid").length;
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab view selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#14141A] p-4 rounded-lg border border-[#34343c]">
        <div className="flex items-center gap-3">
          <Button
            variant={activeSubTab === "sheet" ? "default" : "outline"}
            onClick={() => setActiveSubTab("sheet")}
            className={activeSubTab === "sheet" 
              ? "bg-[#f5a742] text-[#111116] hover:bg-[#e0922f] font-semibold" 
              : "border-[#34343c] bg-white/[0.02] text-[#f4f4f5] hover:bg-white/[0.08]"
            }
          >
            <FileText className="size-4 mr-2" />
            Lembar Gaji Bulanan
          </Button>
          <Button
            variant={activeSubTab === "config" ? "default" : "outline"}
            onClick={() => setActiveSubTab("config")}
            className={activeSubTab === "config" 
              ? "bg-[#f5a742] text-[#111116] hover:bg-[#e0922f] font-semibold" 
              : "border-[#34343c] bg-white/[0.02] text-[#f4f4f5] hover:bg-white/[0.08]"
            }
          >
            <Settings className="size-4 mr-2" />
            Master Gaji Dasar
          </Button>
        </div>

        {activeSubTab === "sheet" && (
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-[#f5a742]" />
            <span className="text-xs font-semibold text-[#a1a1aa] uppercase mr-2 font-sans">Periode</span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="text-xs font-semibold px-3 py-2 rounded border border-[#34343c] bg-[#1a1a24] text-[#f4f4f5] focus:outline-none focus:border-[#f5a742]"
            >
              <option value="2026-05">Mei 2026</option>
              <option value="2026-06">Juni 2026</option>
              <option value="2026-07">Juli 2026</option>
            </select>
          </div>
        )}
      </div>

      {/* Stats Cards Row (Only for Monthly Payroll Sheet) */}
      {activeSubTab === "sheet" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-[#34343c] bg-[#14141A]">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#a1a1aa] text-xs font-semibold uppercase">Total Anggaran Gaji Bulan Ini</CardDescription>
              <CardTitle className="text-2xl font-extrabold text-[#f5a742] mt-1">
                {loading ? "Rp 0" : formatRupiah(getTotalPayrollExpenses())}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[11px] text-[#a1a1aa]">Akumulasi seluruh gaji bersih staf, lembur, dan bonus dikurangi denda.</p>
            </CardContent>
          </Card>

          <Card className="border-[#34343c] bg-[#14141A]">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#a1a1aa] text-xs font-semibold uppercase">Karyawan Sudah Terbayar</CardDescription>
              <CardTitle className="text-2xl font-extrabold text-[#22c55e] mt-1 flex items-baseline gap-2">
                {loading ? "0" : getPaidCount()}
                <span className="text-xs font-semibold text-[#a1a1aa]">orang</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[11px] text-[#a1a1aa]">Penggajian staf yang status pembayarannya telah dikunci dan dibayarkan.</p>
            </CardContent>
          </Card>

          <Card className="border-[#34343c] bg-[#14141A]">
            <CardHeader className="pb-2">
              <CardDescription className="text-[#a1a1aa] text-xs font-semibold uppercase">Karyawan Belum Terbayar (Draft)</CardDescription>
              <CardTitle className="text-2xl font-extrabold text-[#ef4444] mt-1 flex items-baseline gap-2">
                {loading ? "0" : getUnpaidCount()}
                <span className="text-xs font-semibold text-[#a1a1aa]">orang</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[11px] text-[#a1a1aa]">Lembar penggajian karyawan yang masih dalam status draf draf penyesuaian.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alert toast messages */}
      {message && (
        <div className={`p-4 rounded-md border text-sm transition-all duration-300 ${
          message.type === "success" 
            ? "bg-[#22c55e]/10 border-[#22c55e]/30 text-[#22c55e]" 
            : "bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]"
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 flex-shrink-0" />
            <p className="font-medium">{message.text}</p>
          </div>
        </div>
      )}

      {/* Active Sub-tab View Render */}
      {activeSubTab === "sheet" ? (
        /* Monthly Payroll Sheet Grid */
        <Card className="border-[#34343c] bg-[#14141A] shadow-xl overflow-hidden">
          <CardHeader className="border-b border-[#34343c] bg-white/[0.01] py-4">
            <CardTitle className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
              <DollarSign className="size-5 text-[#f5a742]" />
              Rekapitulasi Penggajian Karyawan Bulanan
            </CardTitle>
            <CardDescription className="text-[#a1a1aa] text-xs">
              Sistem menghitung otomatis bonus dari pencapaian KPI dan denda keterlambatan dari absensi secara dinamis.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {loading ? (
              <div className="py-12 text-center text-[#a1a1aa] text-xs">
                <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-[#f5a742] opacity-75" />
                Menyelaraskan laporan keuangan staf...
              </div>
            ) : payrolls.length === 0 ? (
              <div className="py-12 text-center text-[#a1a1aa] text-xs">
                <Info className="size-6 mx-auto mb-2 text-[#a1a1aa] opacity-50" />
                Tidak ada staf aktif terdaftar di periode ini.
              </div>
            ) : (
              payrolls.map((p) => {
                const calculatedNet = getCalculatedNet(p);
                const isPaid = p.status === "paid";
                const isSaving = savingId === p.staffId;
                const isPaying = payingId === p.staffId;

                return (
                  <div key={p.staffId} className={`p-4 rounded-lg border transition-all ${
                    isPaid 
                      ? "bg-[#22c55e]/5 border-[#22c55e]/30" 
                      : "bg-white/[0.01] border-[#34343c] hover:bg-white/[0.02]"
                  }`}>
                    {/* Upper Layout: Staf Info & Calculated Gaji Bersih */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#34343c]/50 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-[#f4f4f5] flex items-center gap-2 flex-wrap">
                          {p.name}
                          {isPaid && (
                            <Badge className="text-[9px] px-1 bg-[#22c55e]/15 border-[#22c55e]/30 text-[#22c55e] font-semibold gap-1">
                              <CheckCircle2 className="size-3" /> Terbayar
                            </Badge>
                          )}
                          {p.payrollId && (
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => downloadSlipPdf(p)}
                              className="text-[9px] h-5 px-1.5 border-[#34343c] bg-[#1a1a24] text-zinc-300 hover:bg-[#34343c] gap-1 rounded font-sans"
                            >
                              <Printer className="size-3" /> Slip PDF
                            </Button>
                          )}
                        </h4>
                        <p className="text-xs text-[#a1a1aa] mt-0.5">{p.role} • KPI Bulan Ini: <span className="font-semibold text-[#f5a742]">{p.kpiScore}</span></p>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-[#a1a1aa] font-semibold">Gaji Bersih (Net)</div>
                        <div className="text-lg font-extrabold text-[#f5a742]">{formatRupiah(calculatedNet)}</div>
                      </div>
                    </div>

                    {/* Middle Layout: Base, Allowance, Adjustments */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 text-xs">
                      <div>
                        <span className="text-[#a1a1aa] font-semibold block uppercase text-[10px] tracking-wider">Gaji Pokok</span>
                        <span className="text-[#f4f4f5] font-mono font-medium block mt-1">{formatRupiah(p.baseSalary)}</span>
                      </div>

                      <div>
                        <span className="text-[#a1a1aa] font-semibold block uppercase text-[10px] tracking-wider">Tunjangan Tetap</span>
                        <span className="text-[#f4f4f5] font-mono font-medium block mt-1">{formatRupiah(p.allowance)}</span>
                      </div>

                      {/* Editable Bonus Input */}
                      <div>
                        <span className="text-[#a1a1aa] font-semibold block uppercase text-[10px] tracking-wider mb-1">
                          Tambahan (Bonus/Lembur)
                          {p.suggestedBonus > 0 && <span className="text-[#22c55e] ml-1">*(KPI +{p.suggestedBonus / 1000}k)</span>}
                        </span>
                        <input
                          type="number"
                          disabled={isPaid}
                          value={bonusAdjustments[p.staffId] || "0"}
                          onChange={(e) => handleBonusChange(p.staffId, e.target.value)}
                          className="w-full text-xs font-mono font-bold px-2 py-1 rounded border border-[#34343c] bg-[#1a1a24] text-[#22c55e] focus:outline-none focus:border-[#f5a742] disabled:opacity-50"
                        />
                      </div>

                      {/* Editable Deduction Input */}
                      <div>
                        <span className="text-[#a1a1aa] font-semibold block uppercase text-[10px] tracking-wider mb-1">
                          Potongan (Denda/Terlambat)
                        </span>
                        <input
                          type="number"
                          disabled={isPaid}
                          value={deductAdjustments[p.staffId] || "0"}
                          onChange={(e) => handleDeductChange(p.staffId, e.target.value)}
                          className="w-full text-xs font-mono font-bold px-2 py-1 rounded border border-[#34343c] bg-[#1a1a24] text-[#ef4444] focus:outline-none focus:border-[#f5a742] disabled:opacity-50"
                        />
                      </div>
                    </div>

                    {/* Bottom Layout: Note input & Action button */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-4 items-center">
                      <div className="w-full flex-1">
                        <input
                          type="text"
                          disabled={isPaid}
                          value={notesAdjustments[p.staffId] || ""}
                          onChange={(e) => handleNotesChange(p.staffId, e.target.value)}
                          placeholder="Masukkan catatan alasan perubahan nominal/kas bon/keterangan denda..."
                          className="w-full text-xs px-3 py-1.5 rounded border border-[#34343c] bg-[#1a1a24] text-[#f4f4f5] focus:outline-none focus:border-[#f5a742] disabled:opacity-50"
                        />
                      </div>

                      {!isPaid && (
                        <div className="flex gap-2 w-full sm:w-auto flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isSaving || isPaying}
                            onClick={() => saveMonthlyPayroll(p)}
                            className="border-[#34343c] bg-[#1a1a24] text-[#f4f4f5] hover:bg-white/[0.04] text-xs font-semibold px-3 gap-1.5 w-1/2 sm:w-auto"
                          >
                            <Save className="size-3.5" /> Simpan
                          </Button>
                          <Button
                            size="sm"
                            disabled={isSaving || isPaying}
                            onClick={() => paySalary(p)}
                            className="bg-[#22c55e] text-white hover:bg-[#16a34a] text-xs font-bold px-4 w-1/2 sm:w-auto"
                          >
                            Bayar Gaji
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      ) : (
        /* Master Gaji Dasar Table View */
        <Card className="border-[#34343c] bg-[#14141A] shadow-xl overflow-hidden">
          <CardHeader className="border-b border-[#34343c] bg-white/[0.01] py-4">
            <CardTitle className="text-base font-bold text-[#f4f4f5] flex items-center gap-2">
              <Settings className="size-5 text-[#f5a742]" />
              Pengaturan Konfigurasi Master Gaji Dasar
            </CardTitle>
            <CardDescription className="text-[#a1a1aa] text-xs">
              Atur nominal dasar gaji pokok bulanan dan tunjangan tetap primer untuk setiap karyawan Anda sekali saja.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="overflow-x-auto rounded border border-[#34343c]">
              <table className="w-full border-collapse text-left text-xs text-[#e4e4e7]">
                <thead className="bg-white/[0.02] border-b border-[#34343c]">
                  <tr>
                    <th className="p-3 font-semibold text-[#a1a1aa]">Nama Staf</th>
                    <th className="p-3 font-semibold text-[#a1a1aa]">Posisi (Role)</th>
                    <th className="p-3 font-semibold text-[#a1a1aa]">Gaji Pokok (Base)</th>
                    <th className="p-3 font-semibold text-[#a1a1aa]">Tunjangan Tetap</th>
                    <th className="p-3 font-semibold text-[#a1a1aa] text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#34343c]">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-[#a1a1aa]">
                        Memuat data master gaji...
                      </td>
                    </tr>
                  ) : payrolls.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-[#a1a1aa]">
                        Tidak ada staf terdaftar.
                      </td>
                    </tr>
                  ) : (
                    payrolls.map((p) => {
                      const isEditing = editingStaffId === p.staffId;
                      const isSaving = savingId === p.staffId;

                      return (
                        <tr key={p.staffId} className="hover:bg-white/[0.01] transition-colors">
                          <td className="p-3 font-semibold text-[#f4f4f5]">{p.name}</td>
                          <td className="p-3 text-[#a1a1aa]">
                            <Badge variant="outline" className="text-[10px] border-[#34343c] text-[#a1a1aa] bg-[#1a1a24]">
                              {p.role}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editBase}
                                onChange={(e) => setEditBase(e.target.value)}
                                className="text-xs px-2 py-1 rounded border border-[#34343c] bg-[#1a1a24] text-[#f4f4f5] w-32 focus:outline-none"
                              />
                            ) : (
                              formatRupiah(p.masterBaseSalary || p.baseSalary)
                            )}
                          </td>
                          <td className="p-3 font-mono">
                            {isEditing ? (
                              <input
                                type="number"
                                value={editAllow}
                                onChange={(e) => setEditAllow(e.target.value)}
                                className="text-xs px-2 py-1 rounded border border-[#34343c] bg-[#1a1a24] text-[#f4f4f5] w-32 focus:outline-none"
                              />
                            ) : (
                              formatRupiah(p.masterAllowance || p.allowance)
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {isEditing ? (
                              <div className="flex gap-2 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingStaffId(null)}
                                  className="border-[#34343c] bg-[#1a1a24] text-[#f4f4f5] text-[11px] h-7 px-2.5"
                                >
                                  Batal
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={isSaving}
                                  onClick={() => saveMasterSalary(p.staffId)}
                                  className="bg-[#f5a742] text-[#111116] hover:bg-[#e0922f] text-[11px] h-7 px-3 font-semibold"
                                >
                                  Simpan
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEditMaster(p)}
                                className="border-[#34343c] bg-white/[0.02] text-[#f4f4f5] hover:bg-white/[0.08] text-[11px] h-7 px-3.5"
                              >
                                Edit Gaji
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Helpful Policy Warning Info Card */}
      <div className="flex items-start gap-3 bg-[#f5a742]/10 border border-[#f5a742]/30 p-4 rounded-lg">
        <AlertTriangle className="size-5 text-[#f5a742] flex-shrink-0 mt-0.5" />
        <div className="text-xs text-[#d6d6dc] leading-relaxed space-y-1">
          <p className="font-bold text-[#f5a742]">Pemberitahuan Audit Keuangan & Kasbon:</p>
          <p>• Rekap gaji bulanan yang telah berstatus <strong>Terbayar (Paid)</strong> akan mengunci nominal dan tidak dapat diubah kembali untuk menghindari kecurangan.</p>
          <p>• Jika staf melakukan pengambilan <strong>Kas Bon</strong> di tengah bulan, catat nominalnya di kolom <strong>Potongan</strong> pada akhir bulan dengan keterangan tertulis di kolom catatan.</p>
        </div>
      </div>
    </div>
  );
}
