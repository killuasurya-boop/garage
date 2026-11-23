"use client";

import { useState } from "react";
import { Download, NotebookPen, Utensils } from "lucide-react";

import { garageApi, GarageApiError } from "@/lib/api-client";
import { consumptionCsv, type Consumption } from "@/lib/event-consumption-rules";
import type { EventNotes } from "@/lib/event-crew-notes-service";

// Catatan panitia + rekap konsumsi (Owner 22 Nov 2026, pindahan Dashboard Penyelenggara). Dipakai papan Lineup (Owner/
// Manajer) dan Ruang Panitia. Hak ubah dicek di server; `canEdit` hanya menyembunyikan tombol.
// Pemakai memberi `key={eventId}`: isian di-reset saat event berganti.

const card = "rounded-lg border border-white/10 bg-[var(--garage-bg-2,#17171b)] p-4";
const area = "min-h-28 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-base text-zinc-50 focus:border-amber-300 focus:outline-none";
const errText = (e: unknown) => (e instanceof GarageApiError || e instanceof Error ? e.message : "Gagal menyimpan.");
const stamp = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : null;

export function CrewNotesCard({ eventId, notes, canEdit, onSaved }: { eventId: string; notes: EventNotes; canEdit: boolean; onSaved: () => void | Promise<void> }) {
  // Draft selalu membawa revisi dasarnya. Revisi baru dari server: draft yang belum diubah ikut diperbarui; draft yang
  // sedang diubah tetap memakai revisi lamanya → simpan ditolak 409 (tidak menimpa simpanan orang lain diam-diam).
  const fromNotes = (n: EventNotes) => ({ rundown: n.rundown, readiness: n.readiness, extraPortions: n.extraPortions, base: n.revision, dirty: false });
  const [draft, setDraftState] = useState(() => fromNotes(notes));
  if (draft.base !== notes.revision && !draft.dirty) setDraftState(fromNotes(notes));
  const setDraft = (patch: Partial<Pick<typeof draft, "rundown" | "readiness" | "extraPortions">>) => setDraftState((d) => ({ ...d, ...patch, dirty: true }));
  const stale = draft.dirty && draft.base !== notes.revision;
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await garageApi.put("/api/panitia/notes", { eventId, rundown: draft.rundown, readiness: draft.readiness, extraPortions: draft.extraPortions, revision: draft.base });
      setDraftState((d) => ({ ...d, dirty: false }));
      setMsg("Catatan tersimpan.");
      await onSaved();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setSaving(false);
    }
  }

  const who = notes.updatedByName ? `Diperbarui ${notes.updatedByName} · ${stamp(notes.updatedAt)} WIB` : "Belum ada catatan.";
  return (
    <div className={`${card} space-y-3`}>
      <h3 className="flex items-center gap-2 font-bold text-zinc-50">
        <NotebookPen size={16} className="text-[#ff6b75]" /> Catatan panitia
      </h3>
      <p className="text-xs text-zinc-300">{who}</p>
      {stale ? (
        <p className="text-sm text-amber-200" role="alert">
          Catatan sudah diubah orang lain sejak Anda mulai mengetik. Salin teks Anda, muat ulang halaman, lalu simpan lagi.
        </p>
      ) : null}
      {canEdit ? (
        <>
          <label className="block space-y-1 text-sm text-zinc-200">
            <span>Catatan rundown</span>
            <textarea className={area} maxLength={4000} value={draft.rundown} onChange={(e) => setDraft({ rundown: e.target.value })} />
          </label>
          <label className="block space-y-1 text-sm text-zinc-200">
            <span>Catatan kesiapan</span>
            <textarea className={area} maxLength={4000} value={draft.readiness} onChange={(e) => setDraft({ readiness: e.target.value })} />
          </label>
          <label className="block space-y-1 text-sm text-zinc-200">
            <span>Porsi konsumsi tambahan (MC, tamu, lainnya)</span>
            <input
              type="number"
              min={0}
              max={1000}
              inputMode="numeric"
              className="h-11 w-32 rounded-md border border-white/15 bg-black/30 px-3 text-base text-zinc-50 focus:border-amber-300 focus:outline-none"
              value={draft.extraPortions}
              onChange={(e) => setDraft({ extraPortions: Math.max(0, Math.min(1000, Number(e.target.value) || 0)) })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={saving} onClick={() => void save()} className="h-11 rounded-md bg-[var(--garage-red,#d43a3a)] px-4 text-sm font-bold text-white disabled:opacity-60">
              {saving ? "Menyimpan…" : "Simpan catatan"}
            </button>
            {msg ? <span className="text-sm text-amber-200" role="status">{msg}</span> : null}
          </div>
        </>
      ) : (
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-zinc-400">Catatan rundown</dt>
            <dd className="whitespace-pre-wrap text-zinc-100">{notes.rundown || "-"}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">Catatan kesiapan</dt>
            <dd className="whitespace-pre-wrap text-zinc-100">{notes.readiness || "-"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export function ConsumptionCard({ data, fileName }: { data: Consumption; fileName: string }) {
  function download() {
    const url = URL.createObjectURL(new Blob([consumptionCsv(data)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
  const t = data.totals;
  return (
    <div className={`${card} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-zinc-50">
          <Utensils size={16} className="text-[#ff6b75]" /> Rekap konsumsi
        </h3>
        <button type="button" onClick={download} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-white/15 px-3 text-sm text-zinc-100 hover:bg-white/5">
          <Download size={15} /> Unduh CSV
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {(
          [
            ["Panitia aktif", t.crew],
            ["Kru menunggu persetujuan", t.crewWaiting],
            ["Talent berhonor", t.fundedTalent],
            ["Talent non-honor", t.volunteerTalent],
            ["Tambahan (MC/tamu)", t.extra],
            ["Total porsi", t.portions],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-md border border-white/10 p-2">
            <dt className="text-xs text-zinc-300">{label}</dt>
            <dd className="font-mono text-lg font-bold tabular-nums text-zinc-50">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-zinc-300">Kru yang masih menunggu persetujuan belum dihitung porsinya. Jumlah orang & catatan makanan diambil dari pendaftaran website bila tertaut.</p>
      {data.rows.length ? (
        <div className="max-h-96 overflow-auto rounded-md border border-white/10">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="sticky top-0 bg-[#1d1d22] text-xs uppercase text-zinc-300">
              <tr>
                {["Kelompok", "Nama", "Peran/Jenis", "Orang", "Kehadiran", "Catatan makanan"].map((h) => (
                  <th key={h} className="px-2 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {data.rows.map((r, i) => (
                <tr key={`${r.group}-${r.name}-${i}`} className="text-zinc-100">
                  <td className="px-2 py-1.5 text-zinc-300">{r.group}</td>
                  <td className="px-2 py-1.5 font-medium">{r.name}</td>
                  <td className="px-2 py-1.5">{r.role}</td>
                  <td className="px-2 py-1.5 font-mono tabular-nums">{r.members}</td>
                  <td className="px-2 py-1.5">{r.attendance}</td>
                  <td className="px-2 py-1.5">{r.diet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-zinc-300">Belum ada panitia aktif atau talent terkonfirmasi.</p>
      )}
    </div>
  );
}
