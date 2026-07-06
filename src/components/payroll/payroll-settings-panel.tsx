"use client";

import { useEffect, useState } from "react";

const TAB_DEFS: Array<{ key: string; label: string; hint: string }> = [
  { key: "general", label: "Umum", hint: "Jam operasional, hari libur, timezone" },
  { key: "gps", label: "GPS Toko", hint: "Koordinat + radius toleransi absensi" },
  { key: "attendance.methods", label: "Metode Absen", hint: "PIN / PIN+Selfie+GPS per role" },
  { key: "late.brackets", label: "Bracket Telat", hint: "Persen upah bertingkat" },
  { key: "overtime", label: "Lembur", hint: "Aturan tarif lembur" },
  { key: "fee.pool", label: "Fee Pool", hint: "Rp per produk + split mode" },
  { key: "bonus.target", label: "Bonus Target", hint: "Bonus kalau target harian tercapai" },
  { key: "bonus.zeroKomplain", label: "Bonus Zero Komplain", hint: "" },
  { key: "bonus.attendance", label: "Bonus Kehadiran", hint: "Bulanan" },
  { key: "payout", label: "Payout", hint: "Manual approve / auto tanggal" },
  { key: "slip", label: "Slip Gaji PDF", hint: "" },
  { key: "security", label: "Keamanan", hint: "PIN & foto retensi" },
];

export function PayrollSettingsPanel() {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [activeTab, setActiveTab] = useState<string>(TAB_DEFS[0].key);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/payroll/settings");
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message ?? "Gagal memuat");
        setSettings(json.data.settings);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (settings[activeTab] !== undefined) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(JSON.stringify(settings[activeTab], null, 2));
    }
  }, [activeTab, settings]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const value = JSON.parse(draft);
      const res = await fetch("/api/payroll/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: activeTab, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Gagal simpan");
      setSettings({ ...settings, [activeTab]: value });
      alert("Tersimpan ✅");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-[var(--garage-mute)]">Memuat…</div>;

  return (
    <div className="grid md:grid-cols-[220px_1fr] gap-4">
      <aside className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-2 md:h-fit">
        <ul className="space-y-1">
          {TAB_DEFS.map((t) => (
            <li key={t.key}>
              <button
                onClick={() => setActiveTab(t.key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                  activeTab === t.key
                    ? "bg-[var(--garage-red)] text-white"
                    : "text-[var(--garage-mute)] hover:bg-[var(--garage-bg-2)]"
                }`}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="rounded-2xl border border-[var(--garage-bg-3)] bg-[var(--garage-bg-1)] p-4 space-y-3">
        <div className="text-xs uppercase text-[var(--garage-mute)] tracking-widest">
          {TAB_DEFS.find((t) => t.key === activeTab)?.label}
        </div>
        <p className="text-xs text-[var(--garage-mute)]">
          {TAB_DEFS.find((t) => t.key === activeTab)?.hint}
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={16}
          className="w-full font-mono text-xs bg-[var(--garage-bg-0)] border border-[var(--garage-bg-3)] rounded-xl p-3 text-[var(--garage-fg)]"
          spellCheck={false}
        />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-[var(--garage-red)] text-white text-sm disabled:opacity-40"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </section>
    </div>
  );
}
