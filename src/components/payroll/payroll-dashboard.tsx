"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface StaffRow {
  user_id: string;
  name: string;
  role: string;
  daily_wage: number;
  wallet_gaji: number;
  wallet_fee: number;
}

function rp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export function PayrollDashboard() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch("/api/payroll/staff");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat");
      setStaff(json.data.staff as StaffRow[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  const runFinalize = async () => {
    setFinalizing(true);
    try {
      const res = await fetch("/api/payroll/cron/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal finalisasi");
      alert(
        `Finalisasi ${json.data.date}: staff valid ${json.data.staffValid}, gaji ${rp(json.data.totalGajiCredited)}, pool ${rp(json.data.poolAmount)}`,
      );
      void refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return <div className="text-[var(--garage-mute)]">Memuat…</div>;
  if (error) return <div className="text-red-400 text-sm">{error}</div>;

  const totalGaji = staff.reduce((s, r) => s + Number(r.wallet_gaji ?? 0), 0);
  const totalFee = staff.reduce((s, r) => s + Number(r.wallet_fee ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4">
          <div className="text-xs uppercase text-[var(--garage-mute)]">Total Wallet Gaji</div>
          <div className="mt-1 text-xl font-bold text-[var(--garage-silver)]">{rp(totalGaji)}</div>
        </div>
        <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4">
          <div className="text-xs uppercase text-[var(--garage-mute)]">Total Wallet Fee</div>
          <div className="mt-1 text-xl font-bold text-[var(--garage-amber)]">{rp(totalFee)}</div>
        </div>
        <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4">
          <div className="text-xs uppercase text-[var(--garage-mute)]">Staff Aktif</div>
          <div className="mt-1 text-xl font-bold text-[var(--garage-fg)]">{staff.length}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/owner/payroll/settings"
          className="px-4 py-2 rounded-lg bg-[var(--garage-bg-2)] text-[var(--garage-fg)] text-sm hover:bg-[var(--garage-bg-3)]"
        >
          Pengaturan
        </Link>
        <Link
          href="/owner/payroll/requests"
          className="px-4 py-2 rounded-lg bg-[var(--garage-bg-2)] text-[var(--garage-fg)] text-sm hover:bg-[var(--garage-bg-3)]"
        >
          Payout Requests
        </Link>
        <button
          onClick={runFinalize}
          disabled={finalizing}
          className="px-4 py-2 rounded-lg bg-[var(--garage-red)] text-white text-sm disabled:opacity-40"
        >
          {finalizing ? "Memproses…" : "Finalisasi H-1"}
        </button>
      </div>

      <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--garage-bg-2)] text-[var(--garage-mute)] uppercase text-xs">
            <tr>
              <th className="text-left px-3 py-2">Nama</th>
              <th className="text-left px-3 py-2">Role</th>
              <th className="text-right px-3 py-2">Upah/Hari</th>
              <th className="text-right px-3 py-2">Wallet Gaji</th>
              <th className="text-right px-3 py-2">Wallet Fee</th>
              <th className="px-3 py-2">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.user_id} className="border-t border-[var(--garage-bg-3)]">
                <td className="px-3 py-2 text-[var(--garage-fg)]">{s.name}</td>
                <td className="px-3 py-2 text-[var(--garage-mute)]">{s.role}</td>
                <td className="px-3 py-2 text-right">{rp(Number(s.daily_wage))}</td>
                <td className="px-3 py-2 text-right text-[var(--garage-silver)]">
                  {rp(Number(s.wallet_gaji ?? 0))}
                </td>
                <td className="px-3 py-2 text-right text-[var(--garage-amber)]">
                  {rp(Number(s.wallet_fee ?? 0))}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/owner/payroll/${s.user_id}`}
                    className="text-xs text-[var(--garage-amber)] hover:underline"
                  >
                    Detail
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
