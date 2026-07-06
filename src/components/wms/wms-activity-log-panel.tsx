"use client";

import { useEffect, useMemo, useState } from "react";

interface Row {
  id: string;
  createdAt: string;
  type: string;
  qty: number;
  valueHpp: number;
  refDoc: string;
  productId: string | null;
  productName: string | null;
  productSku: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  userId: string | null;
  userName: string | null;
}

interface StaffAgg {
  userId: string | null;
  userName: string | null;
  totalAksi: number;
  totalIn: number;
  totalOut: number;
  totalTransfer: number;
  totalWaste: number;
  totalAdjustment: number;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  in: { label: "Masuk", color: "text-emerald-400 bg-emerald-950" },
  out: { label: "Keluar", color: "text-red-400 bg-red-950" },
  transfer: { label: "Transfer", color: "text-blue-400 bg-blue-950" },
  waste: { label: "Waste", color: "text-orange-400 bg-orange-950" },
  adjustment: { label: "Adjustment", color: "text-amber-400 bg-amber-950" },
  internal_out: { label: "Internal Out", color: "text-purple-400 bg-purple-950" },
};

function rp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function WmsActivityLogPanel() {
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(todayKey());
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [userFilter, setUserFilter] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [byStaff, setByStaff] = useState<StaffAgg[]>([]);
  const [viewerScope, setViewerScope] = useState<"all" | "self">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to, limit: "300" });
      if (typeFilter) params.set("type", typeFilter);
      if (userFilter) params.set("userId", userFilter);
      const res = await fetch(`/api/wms/activity-log?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat");
      setRows(json.data.rows as Row[]);
      setByStaff(json.data.byStaff as StaffAgg[]);
      setViewerScope(json.data.viewerScope);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of byStaff) if (s.userId) map.set(s.userId, s.userName ?? "(tanpa nama)");
    return Array.from(map.entries());
  }, [byStaff]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col">
          <label className="text-xs uppercase text-[var(--garage-mute)]">Dari</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 px-3 py-1.5 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs uppercase text-[var(--garage-mute)]">Sampai</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 px-3 py-1.5 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-sm"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-xs uppercase text-[var(--garage-mute)]">Jenis Aksi</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="mt-1 px-3 py-1.5 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-sm"
          >
            <option value="">Semua</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        {viewerScope === "all" && (
          <div className="flex flex-col">
            <label className="text-xs uppercase text-[var(--garage-mute)]">Staff</label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="mt-1 px-3 py-1.5 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-sm min-w-[180px]"
            >
              <option value="">Semua staff</option>
              {staffOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          onClick={() => void load()}
          disabled={loading}
          className="px-4 py-2 rounded-lg bg-[var(--garage-red)] text-white text-sm disabled:opacity-40"
        >
          {loading ? "Memuat…" : "Terapkan"}
        </button>
        {viewerScope === "self" && (
          <div className="text-xs text-amber-400">
            Anda melihat aktivitas SENDIRI (role: Gudang).
          </div>
        )}
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {/* Ringkasan per staff */}
      {byStaff.length > 0 && (
        <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4">
          <div className="text-xs uppercase text-[var(--garage-mute)] tracking-widest mb-3">
            Ringkasan per Staff (Periode Terpilih)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[var(--garage-mute)] uppercase text-xs">
                <tr>
                  <th className="text-left px-2 py-2">Staff</th>
                  <th className="text-right px-2 py-2">Total Aksi</th>
                  <th className="text-right px-2 py-2">Masuk</th>
                  <th className="text-right px-2 py-2">Keluar</th>
                  <th className="text-right px-2 py-2">Transfer</th>
                  <th className="text-right px-2 py-2">Waste</th>
                  <th className="text-right px-2 py-2">Adjustment</th>
                </tr>
              </thead>
              <tbody>
                {byStaff.map((s) => (
                  <tr
                    key={s.userId ?? "no-user"}
                    className="border-t border-[var(--garage-bg-3)]"
                  >
                    <td className="px-2 py-2 text-[var(--garage-fg)] font-medium">
                      {s.userName ?? "(tanpa nama)"}
                    </td>
                    <td className="px-2 py-2 text-right text-[var(--garage-amber)] font-semibold">
                      {Number(s.totalAksi)}
                    </td>
                    <td className="px-2 py-2 text-right text-emerald-400">
                      {Number(s.totalIn) || "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-red-400">
                      {Number(s.totalOut) || "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-blue-400">
                      {Number(s.totalTransfer) || "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-orange-400">
                      {Number(s.totalWaste) || "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-amber-400">
                      {Number(s.totalAdjustment) || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail per transaksi */}
      <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4">
        <div className="text-xs uppercase text-[var(--garage-mute)] tracking-widest mb-3">
          Detail Transaksi ({rows.length})
        </div>
        {loading ? (
          <div className="text-[var(--garage-mute)] text-sm">Memuat…</div>
        ) : rows.length === 0 ? (
          <div className="text-[var(--garage-mute)] text-sm">
            Tidak ada transaksi pada periode & filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[var(--garage-mute)] uppercase text-xs">
                <tr>
                  <th className="text-left px-2 py-2">Waktu</th>
                  <th className="text-left px-2 py-2">Staff</th>
                  <th className="text-left px-2 py-2">Aksi</th>
                  <th className="text-left px-2 py-2">Produk</th>
                  <th className="text-left px-2 py-2">Gudang</th>
                  <th className="text-right px-2 py-2">Qty</th>
                  <th className="text-right px-2 py-2">Nilai HPP</th>
                  <th className="text-left px-2 py-2">Ref Dok</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const typ = TYPE_LABELS[r.type] ?? { label: r.type, color: "text-zinc-400 bg-zinc-800" };
                  return (
                    <tr key={r.id} className="border-t border-[var(--garage-bg-3)]">
                      <td className="px-2 py-2 text-[var(--garage-mute)] whitespace-nowrap">
                        {fmt(r.createdAt)}
                      </td>
                      <td className="px-2 py-2 text-[var(--garage-fg)] font-medium">
                        {r.userName ?? "(sistem)"}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold ${typ.color}`}
                        >
                          {typ.label}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[var(--garage-fg)]">
                        {r.productName ?? "—"}
                        {r.productSku && (
                          <span className="ml-1 text-[var(--garage-mute)] text-xs">
                            ({r.productSku})
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-[var(--garage-mute)]">
                        {r.warehouseName ?? "—"}
                      </td>
                      <td className="px-2 py-2 text-right text-[var(--garage-fg)] font-mono">
                        {Number(r.qty).toLocaleString("id-ID")}
                      </td>
                      <td className="px-2 py-2 text-right text-[var(--garage-mute)] font-mono">
                        {Number(r.valueHpp) > 0 ? rp(Number(r.valueHpp)) : "—"}
                      </td>
                      <td className="px-2 py-2 text-[var(--garage-mute)] text-xs">
                        {r.refDoc || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
