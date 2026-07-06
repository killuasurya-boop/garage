"use client";

import { useEffect, useState } from "react";

interface Split {
  id: string;
  date: string;
  minutesWorked: number;
  sharePct: number;
  amount: number;
  bonusTarget: number;
  bonusZeroKomplain: number;
}

function rp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export function WalletFeePanel() {
  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<Split[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/wallet-fee/me");
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
      <div className="rounded-2xl border border-[var(--garage-amber)]/40 bg-gradient-to-br from-amber-950 to-zinc-900 p-6 shadow-lg">
        <div className="text-xs uppercase tracking-widest text-amber-300/80">Saldo Wallet Fee</div>
        <div className="mt-2 text-3xl font-bold text-[var(--garage-amber)]">
          {balance != null ? rp(balance) : "—"}
        </div>
        <div className="mt-3 text-xs text-amber-200/70">
          Pool Rp 200/produk + bonus target + zero-komplain
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4">
        <div className="text-xs uppercase text-[var(--garage-mute)] tracking-wider mb-3">
          Rincian Harian
        </div>
        {entries.length === 0 ? (
          <div className="text-sm text-[var(--garage-mute)]">
            Belum ada fee. Absen valid → fee otomatis masuk saat cron 23:59.
          </div>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => {
              const total = e.amount + e.bonusTarget + e.bonusZeroKomplain;
              return (
                <li key={e.id} className="rounded-xl border border-[var(--garage-bg-3)] p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--garage-fg)] font-medium">{e.date}</span>
                    <span className="text-emerald-400 font-semibold">+{rp(total)}</span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--garage-mute)] space-y-0.5">
                    <div>
                      Jam kerja saya: {Math.round(e.minutesWorked / 60 * 10) / 10} jam · Bagian:{" "}
                      {e.sharePct.toFixed(1)}%
                    </div>
                    <div>Pool: {rp(e.amount)}</div>
                    {e.bonusTarget > 0 && <div>Bonus target: {rp(e.bonusTarget)}</div>}
                    {e.bonusZeroKomplain > 0 && (
                      <div>Bonus zero-komplain: {rp(e.bonusZeroKomplain)}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
