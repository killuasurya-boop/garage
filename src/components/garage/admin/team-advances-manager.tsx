"use client";

import { useEffect, useState } from "react";
import { DollarSign, Plus, Check, X, ShieldAlert, FileText, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StaffAdvance {
  id: string;
  staffId: string;
  period: string;
  amount: number;
  reason: string | null;
  status: string;
  createdAt: string;
  name: string;
  role: string;
}

interface StaffMember {
  id: string;
  name: string;
  role: string;
}

export function TeamAdvancesManager() {
  const [advances, setAdvances] = useState<StaffAdvance[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [period, setPeriod] = useState("2026-05");
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form states
  const [staffId, setStaffId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchAdvances() {
    try {
      setLoading(true);
      const res = await fetch(`/api/hr/team/advances?period=${period}`);
      const data = await res.json();
      if (data.advances) {
        setAdvances(data.advances);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStaff() {
    try {
      const res = await fetch("/api/hr/team/staff");
      const data = await res.json();
      if (data.staff) {
        setStaff(data.staff);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAdvances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStaff();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId || !amount || !period) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/hr/team/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request",
          staffId,
          amount,
          period,
          reason,
        }),
      });
      if (res.ok) {
        setAmount("");
        setReason("");
        setStaffId("");
        setShowAddForm(false);
        fetchAdvances();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: string) {
    try {
      const res = await fetch("/api/hr/team/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", id }),
      });
      if (res.ok) {
        fetchAdvances();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleReject(id: string) {
    try {
      const res = await fetch("/api/hr/team/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", id }),
      });
      if (res.ok) {
        fetchAdvances();
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <DollarSign className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-100">Daftar Pembayaran Kasbon Karyawan</h3>
            <p className="text-xs text-zinc-400">Pengajuan pinjaman, persetujuan kasbon, dan otomatisasi potongan gaji.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-40 bg-zinc-950/50 border-zinc-800 text-zinc-200 text-sm focus:border-amber-500"
          />
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold gap-2 border border-amber-400/20"
          >
            <Plus className="size-4" />
            Catat Kasbon
          </Button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4 backdrop-blur-md">
          <h4 className="text-sm font-semibold text-zinc-200">Catat Pengajuan Kasbon Baru</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Karyawan Pemohon</label>
              <select
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-zinc-950/50 border border-zinc-800 text-zinc-200 focus:border-amber-500 text-sm focus:outline-none"
                required
              >
                <option value="">Pilih Karyawan...</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Nominal Kasbon (IDR)</label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Contoh: 150000"
                className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Alasan Kasbon</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Biaya servis motor pribadi / Kebutuhan mendesak keluarga"
              className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAddForm(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold gap-2 border border-amber-400/20"
            >
              {submitting ? "Menyimpan..." : "Simpan Pengajuan"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-zinc-500">Memuat log kasbon...</div>
      ) : advances.length === 0 ? (
        <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-12 text-center text-zinc-500 space-y-2">
          <FileText className="size-8 mx-auto text-zinc-600" />
          <p className="font-medium text-zinc-400">Tidak ada transaksi kasbon</p>
          <p className="text-xs">Tidak ada pengajuan kasbon terdaftar untuk periode {period}.</p>
        </div>
      ) : (
        <div className="bg-zinc-900/20 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 font-semibold bg-zinc-950/20">
                  <th className="p-4">Karyawan</th>
                  <th className="p-4">Nominal</th>
                  <th className="p-4">Tanggal Pengajuan</th>
                  <th className="p-4">Alasan</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Persetujuan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {advances.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-900/10 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-zinc-100">{item.name}</div>
                      <div className="text-xs text-zinc-500">{item.role}</div>
                    </td>
                    <td className="p-4 font-mono text-zinc-100 font-semibold">
                      Rp{item.amount.toLocaleString("id-ID")}
                    </td>
                    <td className="p-4 text-zinc-400 text-xs">
                      {new Date(item.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric"
                      })}
                    </td>
                    <td className="p-4 text-zinc-300 text-xs max-w-xs truncate">
                      {item.reason || "-"}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                        item.status === "approved"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : item.status === "deducted"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : item.status === "rejected"
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}>
                        {item.status === "approved"
                          ? "Disetujui"
                          : item.status === "deducted"
                            ? "Dipotong Gaji"
                            : item.status === "rejected"
                              ? "Ditolak"
                              : "Menunggu"}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {item.status === "pending" && (
                        <div className="flex justify-end gap-1.5">
                          <Button
                            onClick={() => handleApprove(item.id)}
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-zinc-100 h-7 w-7 p-0 rounded-md"
                          >
                            <Check className="size-3.5" />
                          </Button>
                          <Button
                            onClick={() => handleReject(item.id)}
                            size="sm"
                            variant="ghost"
                            className="text-red-400 hover:text-red-200 h-7 w-7 p-0 rounded-md border border-zinc-800"
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
