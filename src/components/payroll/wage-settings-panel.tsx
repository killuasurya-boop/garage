"use client";

// Form upah per staff — ganti textarea JSON. List semua staff aktif + input
// upah harian + tarif lembur. Simpan per baris via PATCH /api/payroll/staff/[id]/wage.

import { useEffect, useState } from "react";

interface StaffRow {
  user_id: string;
  name: string;
  role: string;
  daily_wage: number;
}

function rp(n: number) {
  return new Intl.NumberFormat("id-ID").format(n);
}

export function WageSettingsPanel() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { wage: string; overtime: string }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/payroll/staff");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat");
        const rows = json.data.staff as StaffRow[];
        setStaff(rows);
        const d: Record<string, { wage: string; overtime: string }> = {};
        for (const r of rows) d[r.user_id] = { wage: String(r.daily_wage ?? 0), overtime: "0" };
        setDrafts(d);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveRow = async (userId: string) => {
    setSavingId(userId);
    setError(null);
    setSavedId(null);
    try {
      const d = drafts[userId];
      const res = await fetch(`/api/payroll/staff/${userId}/wage`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dailyWage: Number(d.wage) || 0,
          overtimeHourly: Number(d.overtime) || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal simpan");
      setSavedId(userId);
      setTimeout(() => setSavedId(null), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="text-[var(--garage-mute)] text-sm">Memuat data staff…</div>;

  return (
    <div className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--garage-fg)]">Upah Harian per Staff</h2>
        <p className="text-xs text-[var(--garage-mute)] mt-1">
          Set upah harian tiap karyawan. Tarif lembur kosong = otomatis (upah ÷ 8 × 1.5/jam).
        </p>
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[var(--garage-mute)] uppercase text-xs">
            <tr>
              <th className="text-left px-2 py-2">Nama</th>
              <th className="text-left px-2 py-2">Role</th>
              <th className="text-right px-2 py-2">Upah/Hari (Rp)</th>
              <th className="text-right px-2 py-2">Lembur/Jam (Rp)</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.user_id} className="border-t border-[var(--garage-bg-3)]">
                <td className="px-2 py-2 text-[var(--garage-fg)] font-medium whitespace-nowrap">
                  {s.name}
                </td>
                <td className="px-2 py-2 text-[var(--garage-mute)] whitespace-nowrap">{s.role}</td>
                <td className="px-2 py-2 text-right">
                  <input
                    type="number"
                    value={drafts[s.user_id]?.wage ?? "0"}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [s.user_id]: { ...d[s.user_id], wage: e.target.value },
                      }))
                    }
                    className="w-28 px-2 py-1 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-right"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <input
                    type="number"
                    value={drafts[s.user_id]?.overtime ?? "0"}
                    onChange={(e) =>
                      setDrafts((d) => ({
                        ...d,
                        [s.user_id]: { ...d[s.user_id], overtime: e.target.value },
                      }))
                    }
                    className="w-24 px-2 py-1 rounded-lg bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] text-[var(--garage-fg)] text-right"
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    onClick={() => saveRow(s.user_id)}
                    disabled={savingId === s.user_id}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      savedId === s.user_id
                        ? "bg-emerald-600 text-white"
                        : "bg-[var(--garage-red)] text-white"
                    } disabled:opacity-50`}
                  >
                    {savingId === s.user_id
                      ? "…"
                      : savedId === s.user_id
                        ? "Tersimpan ✓"
                        : "Simpan"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--garage-mute)]">
        Contoh: barista Rp {rp(80000)}/hari, kasir Rp {rp(85000)}/hari. Sesuaikan dgn kebijakan.
      </p>
    </div>
  );
}
