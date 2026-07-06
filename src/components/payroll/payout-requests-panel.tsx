"use client";

import { useEffect, useState } from "react";

interface PayoutRow {
  id: string;
  staffUserId: string;
  staffName: string;
  walletType: string;
  amountGaji: number;
  amountFee: number;
  reason: string | null;
  status: string;
  createdAt: string;
}

function rp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

export function PayoutRequestsPanel() {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [status, setStatus] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/payout-list?status=${status}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat");
      setRows(json.data.requests);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const approve = async (id: string) => {
    const note = window.prompt("Catatan (opsional)") ?? "";
    try {
      const res = await fetch(`/api/payroll/payout-approve/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal approve");
      void refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const reject = async (id: string) => {
    const reason = window.prompt("Alasan tolak (wajib min 3 char)");
    if (!reason || reason.length < 3) return;
    try {
      const res = await fetch(`/api/payroll/payout-reject/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal reject");
      void refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["pending", "approved", "rejected", "paid"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
              status === s
                ? "bg-[var(--garage-red)] text-white"
                : "bg-[var(--garage-bg-2)] text-[var(--garage-mute)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-[var(--garage-mute)]">Memuat…</div>
      ) : error ? (
        <div className="text-red-400 text-sm">{error}</div>
      ) : rows.length === 0 ? (
        <div className="text-[var(--garage-mute)] text-sm">Tidak ada request {status}.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-[var(--garage-fg)]">{r.staffName}</div>
                  <div className="text-xs text-[var(--garage-mute)]">
                    {new Date(r.createdAt).toLocaleString("id-ID")} · {r.walletType}
                  </div>
                  <div className="mt-2 text-sm">
                    {r.amountGaji > 0 && (
                      <span className="text-[var(--garage-silver)] mr-3">
                        Gaji: {rp(r.amountGaji)}
                      </span>
                    )}
                    {r.amountFee > 0 && (
                      <span className="text-[var(--garage-amber)]">
                        Fee: {rp(r.amountFee)}
                      </span>
                    )}
                  </div>
                  {r.reason && (
                    <div className="mt-1 text-xs text-[var(--garage-mute)]">
                      Alasan: {r.reason}
                    </div>
                  )}
                </div>
                {status === "pending" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(r.id)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => reject(r.id)}
                      className="px-3 py-1.5 rounded-lg bg-[var(--garage-red)] text-white text-sm"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
