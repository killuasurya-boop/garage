"use client";

import { useEffect, useState } from "react";

interface Entry {
  id: string;
  date: string;
  baseWage: number;
  overtimeAmount: number;
  bonusAmount: number;
  totalCredited: number;
  source: string;
  note: string | null;
}

function rp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export function WalletGajiPanel() {
  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/wallet-gaji/me");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? "Gagal ambil wallet");
        setBalance(json.data.balance);
        setEntries(json.data.entries);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-[var(--garage-mute)] text-sm">Memuat…</div>;
  if (error) return <div className="text-red-400 text-sm">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--garage-silver)]/30 bg-gradient-to-br from-zinc-800 to-zinc-900 p-6 shadow-lg">
        <div className="text-xs uppercase tracking-widest text-zinc-400">Saldo Wallet Gaji</div>
        <div className="mt-2 text-3xl font-bold text-[var(--garage-silver)]">
          {balance != null ? rp(balance) : "—"}
        </div>
        <div className="mt-3 text-xs text-zinc-500">
          Upah harian + lembur + bonus kehadiran
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4">
        <div className="text-xs uppercase text-[var(--garage-mute)] tracking-wider mb-3">
          Riwayat
        </div>
        {entries.length === 0 ? (
          <div className="text-sm text-[var(--garage-mute)]">Belum ada transaksi.</div>
        ) : (
          <ul className="divide-y divide-[var(--garage-bg-3)]">
            {entries.map((e) => (
              <li key={e.id} className="py-3 flex justify-between text-sm">
                <div>
                  <div className="text-[var(--garage-fg)]">{e.date}</div>
                  <div className="text-[var(--garage-mute)] text-xs">
                    {e.source} {e.note ? `· ${e.note}` : ""}
                  </div>
                </div>
                <div className={`font-semibold ${e.totalCredited > 0 ? "text-emerald-400" : "text-[var(--garage-mute)]"}`}>
                  {e.totalCredited > 0 ? `+${rp(e.totalCredited)}` : "Rp 0"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
