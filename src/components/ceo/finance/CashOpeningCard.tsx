"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Fingerprint, Scale } from "lucide-react";

import { Badge } from "@/components/ceo/ui/Badge";
import type { OpeningScope, OpeningStatus } from "@/lib/cash-opening-meta";

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${idr.format(Math.abs(value))}`;
}

/**
 * Saldo pembuka disahkan Owner (P6): petty per outlet + Rekening Jago/BNI, satu kali.
 * Baris lama hasil migrasi = `legacy_unverified` sampai akunnya disahkan.
 */
export function CashOpeningCard({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<OpeningStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/control/cash-opening", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { data?: OpeningStatus; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      setStatus(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat saldo pembuka");
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  return (
    <div className="space-y-2 rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3" data-testid="cash-opening">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-black uppercase text-zinc-100">
          <Scale className="h-4 w-4 text-[#ffd8a8]" /> Saldo pembuka disahkan Owner
        </h4>
        {status ? <Badge tone={status.pending ? "amber" : "muted"}>{status.pending ? `${status.pending} belum disahkan` : "Semua disahkan"}</Badge> : null}
      </div>
      <p className="text-xs text-zinc-300">
        Isi saldo nyata (hitung fisik petty cash / saldo di mutasi rekening) satu kali per akun. Selisih dengan buku kas dicatat sebagai baris
        &quot;Saldo pembuka disahkan Owner&quot;; baris lama tidak diubah. Laci tidak disahkan di sini: setiap shift dibuka dengan hitungan pecahan.
      </p>
      {error ? <p className="text-sm text-[#ffb1b1]">{error}</p> : null}
      {status ? (
        <>
          <ul className="divide-y divide-white/5 rounded-md border border-white/10">
            {status.scopes.map((scope) => (
              <ScopeRow
                key={scope.scopeKey}
                scope={scope}
                onDone={() => {
                  void load();
                  onChanged();
                }}
              />
            ))}
          </ul>
          <div className="grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
            <p data-testid="cash-opening-legacy">
              <span className="font-semibold text-zinc-100">Entri lama belum terverifikasi (legacy_unverified):</span>{" "}
              {status.legacyUnverified.entries} baris · {signed(status.legacyUnverified.total)}
              {status.drawerLegacy.entries ? ` — termasuk ${status.drawerLegacy.entries} saldo laci shift lama dari cache (tetap berlabel, tidak ditebak).` : ""}
            </p>
            <p className="flex min-w-0 items-start gap-1.5" data-testid="cash-opening-fingerprint">
              <Fingerprint className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-all">
                Sidik buku kas: {status.fingerprint.entries} baris · seq {status.fingerprint.lastSeq} ·{" "}
                <span className="font-mono">{status.fingerprint.digest}</span> — catat sebelum backup, harus sama setelah restore.
              </span>
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ScopeRow({ scope, onDone }: { scope: OpeningScope; onDone: () => void }) {
  const [counted, setCounted] = useState("");
  const [evidenceRef, setEvidenceRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cert = scope.certification;
  const countedValue = counted.trim() === "" ? null : Number(counted.replace(/\D/g, ""));
  const adjustment = countedValue === null ? null : countedValue - scope.ledgerBalance;
  const title = `${scope.label}${scope.outletCode ? ` · ${scope.outletCode}` : ""}`;

  async function submit() {
    if (countedValue === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/control/cash-opening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account: scope.account,
          outletId: scope.outletId,
          countedBalance: countedValue,
          expectedLedgerBalance: scope.ledgerBalance,
          evidenceRef: evidenceRef.trim(),
          note: note.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengesahkan");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "h-9 min-w-0 rounded-md border border-white/15 bg-[var(--garage-bg-2)] px-2 text-sm text-zinc-100";
  return (
    <li className="space-y-2 px-3 py-2.5" data-testid={`cash-opening-${scope.scopeKey}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-50">{title}</p>
          <p className="text-xs text-zinc-300">
            Buku kas sekarang <span className="font-mono text-zinc-100">{idr.format(scope.ledgerBalance)}</span>
            {scope.legacyEntries ? ` · ${scope.legacyEntries} entri lama (${signed(scope.legacyTotal)})${cert ? "" : " legacy_unverified"}` : ""}
          </p>
        </div>
        {cert ? (
          <Badge tone="success">
            <BadgeCheck className="h-3.5 w-3.5" /> Disahkan
          </Badge>
        ) : (
          <Badge tone="amber">Belum disahkan</Badge>
        )}
      </div>
      {cert ? (
        <p className="text-xs text-zinc-300">
          {dateTime.format(new Date(cert.asOf))} oleh {cert.certifiedByName ?? cert.certifiedBy}: nyata {idr.format(cert.countedBalance)} (buku kas{" "}
          {idr.format(cert.ledgerBalance)}, penyesuaian {signed(cert.adjustment)}) · bukti {cert.evidenceRef}
          {cert.note ? ` · ${cert.note}` : ""}
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input
              inputMode="numeric"
              value={counted}
              onChange={(e) => setCounted(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
              placeholder="Saldo nyata (Rp)"
              aria-label={`Saldo nyata ${title}`}
              className={inputClass}
            />
            <input
              value={evidenceRef}
              onChange={(e) => setEvidenceRef(e.target.value.slice(0, 120))}
              placeholder={scope.account === "petty" ? "Bukti, mis. hitung fisik 25/10" : "Bukti, mis. mutasi Jago 25/10"}
              aria-label={`Bukti saldo ${title}`}
              className={inputClass}
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Catatan (opsional)"
              aria-label={`Catatan ${title}`}
              className={inputClass}
            />
            <button
              type="button"
              disabled={busy || countedValue === null || evidenceRef.trim().length < 3}
              onClick={() => void submit()}
              className="h-9 rounded-md border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_20%,transparent)] px-3 text-xs font-semibold uppercase text-[#ffd8a8] disabled:opacity-50"
              data-testid="cash-opening-certify"
            >
              {busy ? "…" : "Sahkan"}
            </button>
          </div>
          {adjustment !== null ? (
            <p className="text-xs text-zinc-300">
              Penyesuaian yang akan dicatat: <span className={`font-mono font-semibold ${adjustment ? "text-[#ffd8a8]" : "text-zinc-100"}`}>{signed(adjustment)}</span>
              {adjustment ? " (sekali, tidak bisa diubah)" : " — buku kas sudah sama"}
            </p>
          ) : null}
          {error ? <p className="text-xs text-[#ffb1b1]">{error}</p> : null}
        </div>
      )}
    </li>
  );
}
