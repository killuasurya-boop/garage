"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, HandCoins, XCircle } from "lucide-react";

import { garageApi, GarageApiError } from "@/lib/api-client";
import type { FundRequestView } from "@/lib/event-fund-request-service";

// Pengajuan dana panitia (Owner 23 Nov 2026). Panitia (Ketua/Bendahara) mengajukan + bukti; Owner mengesahkan →
// baris Transparansi. Bukan buku kas. Hak dicek di server; layar ini hanya menampilkan & mengirim.

const card = "rounded-lg border border-white/10 bg-[var(--garage-bg-2,#17171b)] p-4";
const input = "h-11 w-full rounded-md border border-white/15 bg-black/30 px-3 text-base text-zinc-50 focus:border-amber-300 focus:outline-none";
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const errText = (e: unknown) => (e instanceof GarageApiError || e instanceof Error ? e.message : "Gagal.");
const todayWib = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const STATUS: Record<FundRequestView["status"], { label: string; cls: string }> = {
  diajukan: { label: "Menunggu Owner", cls: "border-amber-300/40 text-amber-200" },
  disahkan: { label: "Disahkan", cls: "border-emerald-400/40 text-emerald-300" },
  ditolak: { label: "Ditolak", cls: "border-red-400/40 text-red-300" },
};

function RequestRow({ r, actions }: { r: FundRequestView; actions?: React.ReactNode }) {
  const s = STATUS[r.status];
  return (
    <li className="space-y-1 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 font-semibold text-zinc-50">
          {r.kind === "masuk" ? "Dana masuk" : "Dana keluar"} · {r.kind === "masuk" ? r.party : `pos ${r.budgetCode}${r.party ? ` · ${r.party}` : ""}`}
        </span>
        <span className="shrink-0 font-mono font-bold tabular-nums text-zinc-50">{rp(r.amount)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-300">
        <span>{r.date}</span>
        <span>· oleh {r.submittedByName}</span>
        <span className={`rounded border px-1.5 py-0.5 ${s.cls}`}>{s.label}</span>
        {r.hasProof ? (
          <a className="inline-flex items-center gap-1 text-amber-200 underline-offset-2 hover:underline" href={`/api/event-fund-requests/${r.id}/proof`} target="_blank" rel="noreferrer">
            <FileText size={13} /> Bukti
          </a>
        ) : null}
      </div>
      {r.description ? <p className="text-sm text-zinc-200">{r.description}</p> : null}
      {r.decisionNote ? <p className="text-sm text-zinc-300">Catatan Owner: {r.decisionNote}</p> : null}
      {actions}
    </li>
  );
}

/** Ruang Panitia (Ketua/Bendahara): ajukan dana + riwayat pengajuan event itu. */
export function PanitiaFundRequestCard({
  eventId,
  data,
  onChanged,
}: {
  eventId: string;
  data: { items: FundRequestView[]; budgetCodes: Array<{ code: string; name: string }> };
  onChanged: () => void | Promise<void>;
}) {
  const [kind, setKind] = useState<"masuk" | "keluar">("keluar");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(form: HTMLFormElement) {
    setBusy(true);
    setMsg(null);
    try {
      const body = new FormData(form);
      body.set("eventId", eventId);
      body.set("kind", kind);
      body.set("amount", String(body.get("amount") ?? "").replace(/[^\d]/g, ""));
      const res = await fetch("/api/panitia/fund-requests", { method: "POST", body, credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? "Pengajuan gagal dikirim.");
      form.reset();
      setMsg("Pengajuan terkirim. Owner akan memeriksa buktinya.");
      await onChanged();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${card} space-y-3`}>
      <h3 className="flex items-center gap-2 font-bold text-zinc-50">
        <HandCoins size={16} className="text-[#ff6b75]" /> Pengajuan dana
      </h3>
      <p className="text-xs text-zinc-300">Catat dana masuk (sponsor/donatur) atau dana keluar (bayar vendor) beserta bukti. Setelah disahkan Owner, angka tampil di Transparansi. Bukan buku kas kafe.</p>
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <div className="flex gap-2 sm:col-span-2" role="radiogroup" aria-label="Jenis dana">
          {(["keluar", "masuk"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`h-11 flex-1 rounded-md border px-3 text-sm font-bold ${kind === k ? "border-[#ff6b75] bg-[#ff6b75]/15 text-zinc-50" : "border-white/15 text-zinc-200"}`}
            >
              {k === "keluar" ? "Dana keluar" : "Dana masuk"}
            </button>
          ))}
        </div>
        <label className="space-y-1 text-sm text-zinc-200">
          <span>Tanggal</span>
          <input name="date" type="date" required defaultValue={todayWib()} className={input} />
        </label>
        <label className="space-y-1 text-sm text-zinc-200">
          <span>Nominal (Rp)</span>
          <input name="amount" inputMode="numeric" required placeholder="500000" className={`${input} text-right tabular-nums`} />
        </label>
        {kind === "keluar" ? (
          <>
            <label className="space-y-1 text-sm text-zinc-200">
              <span>Pos RAB</span>
              <select name="budgetCode" required className={input} defaultValue="">
                <option value="" disabled>
                  {data.budgetCodes.length ? "Pilih pos" : "Belum ada pos di Transparansi"}
                </option>
                {data.budgetCodes.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.code} · {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-zinc-200">
              <span>Jenis bayar</span>
              <select name="payKind" className={input} defaultValue="">
                <option value="">-</option>
                <option value="dp">DP</option>
                <option value="termin">Termin</option>
                <option value="pelunasan">Pelunasan</option>
                <option value="lunas">Lunas</option>
              </select>
            </label>
          </>
        ) : null}
        <label className="space-y-1 text-sm text-zinc-200">
          <span>{kind === "masuk" ? "Dari (sponsor/donatur)" : "Kepada (vendor)"}</span>
          <input name="party" maxLength={120} required={kind === "masuk"} className={input} />
        </label>
        <label className="space-y-1 text-sm text-zinc-200">
          <span>Keterangan</span>
          <input name="description" maxLength={200} className={input} />
        </label>
        <label className="space-y-1 text-sm text-zinc-200 sm:col-span-2">
          <span>Bukti transfer / nota (foto atau PDF, maks 5 MB)</span>
          <input name="proof" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm text-zinc-200 file:mr-3 file:h-10 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:text-zinc-50" />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={busy} className="h-11 rounded-md bg-[var(--garage-red,#d43a3a)] px-4 text-sm font-bold text-white disabled:opacity-60">
            {busy ? "Mengirim…" : "Ajukan ke Owner"}
          </button>
          {msg ? (
            <span className="text-sm text-amber-200" role="status">
              {msg}
            </span>
          ) : null}
        </div>
      </form>
      {data.items.length ? (
        <ul className="max-h-96 divide-y divide-white/10 overflow-y-auto text-sm">
          {data.items.map((r) => (
            <RequestRow key={r.id} r={r} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-300">Belum ada pengajuan.</p>
      )}
    </div>
  );
}

/** Owner (Transparansi): pengajuan panitia yang menunggu + riwayat. Sah → baris Transparansi di server. */
export function OwnerFundRequestsCard({ eventId, onDecided }: { eventId: string; onDecided: () => void | Promise<void> }) {
  const [items, setItems] = useState<FundRequestView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; note: string } | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    garageApi
      .get<{ items: FundRequestView[] }>(`/api/event-fund-requests?eventId=${eventId}`, { cache: "no-store" })
      .then((d) => alive && (setItems(d.items), setError(null)))
      .catch((e) => alive && setError(errText(e)));
    return () => {
      alive = false;
    };
  }, [eventId, version]);

  async function decide(id: string, action: "sahkan" | "tolak", note = "") {
    setBusyId(id);
    setError(null);
    try {
      await garageApi.post(`/api/event-fund-requests/${id}/decide`, { action, note });
      setRejecting(null);
      reload();
      await onDecided();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusyId(null);
    }
  }

  const pending = (items ?? []).filter((r) => r.status === "diajukan");
  const done = (items ?? []).filter((r) => r.status !== "diajukan");
  return (
    <section className={`${card} space-y-3`} aria-labelledby="tr-requests">
      <h2 id="tr-requests" className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-zinc-100">
        <HandCoins size={16} className="text-[#ff6b75]" /> Pengajuan dana panitia {pending.length ? <span className="rounded bg-amber-300/20 px-1.5 text-amber-200">{pending.length}</span> : null}
      </h2>
      <p className="text-xs text-zinc-300">
        Periksa bukti dengan mutasi rekening event. Sahkan = langsung jadi baris dana masuk/keluar di Transparansi (bukan buku kas). Simpan dulu perubahan Transparansi yang belum disimpan, karena
        formulir dimuat ulang setelah pengesahan.
      </p>
      {error ? (
        <p className="text-sm text-[#ffb4b4]" role="alert">
          {error}
        </p>
      ) : null}
      {items === null ? <p className="text-sm text-zinc-300">Memuat…</p> : null}
      {items && !items.length ? <p className="text-sm text-zinc-300">Belum ada pengajuan dari panitia.</p> : null}
      {pending.length ? (
        <ul className="divide-y divide-white/10 text-sm">
          {pending.map((r) => (
            <RequestRow
              key={r.id}
              r={r}
              actions={
                rejecting?.id === r.id ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      aria-label="Alasan penolakan"
                      className={`${input} h-10 min-w-0 flex-1`}
                      maxLength={300}
                      placeholder="Alasan penolakan"
                      value={rejecting.note}
                      onChange={(e) => setRejecting({ id: r.id, note: e.target.value })}
                    />
                    <button type="button" disabled={busyId === r.id} onClick={() => void decide(r.id, "tolak", rejecting.note)} className="h-10 rounded-md border border-red-400/50 px-3 text-sm font-bold text-red-200">
                      Tolak
                    </button>
                    <button type="button" onClick={() => setRejecting(null)} className="h-10 rounded-md border border-white/15 px-3 text-sm text-zinc-200">
                      Batal
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button type="button" disabled={busyId === r.id} onClick={() => void decide(r.id, "sahkan")} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[var(--garage-red,#d43a3a)] px-3 text-sm font-bold text-white disabled:opacity-60">
                      <CheckCircle2 size={15} /> Sahkan
                    </button>
                    <button type="button" onClick={() => setRejecting({ id: r.id, note: "" })} className="inline-flex h-10 items-center gap-1.5 rounded-md border border-white/15 px-3 text-sm text-zinc-100">
                      <XCircle size={15} /> Tolak
                    </button>
                  </div>
                )
              }
            />
          ))}
        </ul>
      ) : null}
      {done.length ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-zinc-200">Riwayat ({done.length})</summary>
          <ul className="max-h-80 divide-y divide-white/10 overflow-y-auto text-sm">
            {done.map((r) => (
              <RequestRow key={r.id} r={r} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
