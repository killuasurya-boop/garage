"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Landmark, RefreshCw, ShieldAlert } from "lucide-react";

import { Panel } from "@/components/ceo/layout/Panel";
import { CashOpeningCard } from "@/components/ceo/finance/CashOpeningCard";
import { Badge } from "@/components/ceo/ui/Badge";
import {
  OVERSIGHT_EXCEPTION_LABEL,
  OVERSIGHT_EXCEPTIONS,
  OVERSIGHT_QUEUE_META,
  OVERSIGHT_QUEUES,
  type CashOversight,
  type OversightItem,
} from "@/lib/cash-oversight-meta";

const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function jakartaKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(date);
}

function age(hours: number) {
  if (hours < 1) return "< 1 jam";
  if (hours < 48) return `${Math.round(hours)} jam`;
  return `${Math.round(hours / 24)} hari`;
}

/**
 * Pengawasan Kas Owner (P5): antrean tindakan + pengecualian kontrol + saldo buku kas.
 * Data & Excel dari GET /api/control/cash-oversight (satu sumber, angka identik).
 */
export function CashOversightPanel() {
  const [to, setTo] = useState(() => jakartaKey(new Date()));
  const [from, setFrom] = useState(() => jakartaKey(new Date(Date.now() - 6 * 86_400_000)));
  const [outlet, setOutlet] = useState("");
  const [data, setData] = useState<CashOversight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const query = `from=${from}&to=${to}${outlet ? `&outlet=${outlet}` : ""}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/control/cash-oversight?${query}`, { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as { data?: CashOversight; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      setData(json.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pengawasan kas");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const inputClass = "rounded-lg border border-white/15 bg-[var(--garage-bg-3)] px-2 py-1.5 text-sm text-zinc-100";

  return (
    <Panel
      title="Pengawasan Kas"
      subtitle="Yang masih menggantung & siapa yang harus bertindak. Antrean shift/QRIS = shift dibuka di periode; setoran, petty, kejadian & pengajuan = semua yang masih terbuka."
    >
      <div className="space-y-4" data-testid="cash-oversight">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-zinc-300">
            Dari
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-zinc-300">
            Sampai
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputClass} />
          </label>
          {data && data.outlets.length > 1 ? (
            <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase text-zinc-300">
              Outlet
              <select value={outlet} onChange={(e) => setOutlet(e.target.value)} className={inputClass}>
                <option value="">Semua outlet</option>
                {data.outlets.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.code} · {row.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[var(--garage-bg-3)] px-3 text-xs font-semibold uppercase text-zinc-100 hover:bg-white/10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Segarkan
          </button>
          <a
            href={`/api/control/cash-oversight?${query}&format=xlsx`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_16%,transparent)] px-3 text-xs font-semibold uppercase text-[#ffd8a8] hover:bg-[color-mix(in_srgb,var(--garage-amber)_26%,transparent)]"
            data-testid="cash-oversight-xlsx"
          >
            <Download className="h-3.5 w-3.5" /> Unduh Excel
          </a>
        </div>

        {error ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--garage-red)_45%,transparent)] bg-[color-mix(in_srgb,var(--garage-red)_12%,transparent)] p-3 text-sm text-[#ffb1b1]">{error}</p>
        ) : null}

        {data ? (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {data.balances.map((balance) => (
                <div key={balance.account} className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-zinc-300">
                    <Landmark className="h-3.5 w-3.5" /> {balance.label}
                  </p>
                  <p
                    className={`mt-1 font-mono text-base font-bold ${
                      balance.account === "deposit_transit" && balance.balance > 0 ? "text-[#ffd8a8]" : "text-zinc-50"
                    }`}
                  >
                    {idr.format(balance.balance)}
                  </p>
                  {balance.account !== "deposit_transit" ? (
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {balance.certifiedAt ? `Pembuka disahkan ${dateTime.format(new Date(balance.certifiedAt))}` : "Saldo pembuka belum disahkan"}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-400">
              Rekening yang belum disahkan = arus bersih yang tercatat lewat Garage OS (setoran masuk − isi petty / biaya dari rekening) sejak buku kas aktif, bukan saldo bank. Minus = lebih banyak keluar daripada setoran yang tercatat. Setelah saldo pembuka disahkan, angka ini = saldo nyata saat disahkan + arus sesudahnya.
            </p>

            <CashOpeningCard onChanged={() => void load()} />

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Shift periode" value={`${data.summary.closedShifts} tutup · ${data.summary.openShifts} buka`} />
              <Stat label="Diverifikasi" value={`${data.summary.verified} / ${data.summary.closedShifts}`} />
              <Stat label="Selisih lebih / kurang" value={`${idr.format(data.summary.over)} / ${idr.format(data.summary.short)}`} />
              <Stat
                label="Balance · kecil · periksa · kritis"
                value={`${data.summary.byStatus.ok} · ${data.summary.byStatus.minor} · ${data.summary.byStatus.review} · ${data.summary.byStatus.critical}`}
              />
              <Stat label="Setoran dikonfirmasi" value={idr.format(data.summary.depositsConfirmed)} />
              <Stat label="Setoran dalam perjalanan" value={idr.format(data.summary.depositsInTransit)} tone={data.summary.depositsInTransit > 0 ? "amber" : undefined} />
              <Stat label="Item terbuka" value={String(data.summary.openItems)} tone={data.summary.openItems > 0 ? "amber" : undefined} />
              <Stat label="Diperbarui" value={dateTime.format(new Date(data.generatedAt))} />
            </div>

            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-xs font-black uppercase text-zinc-100">
                <AlertTriangle className="h-4 w-4 text-[#ffd8a8]" /> Antrean tindakan
              </h4>
              {OVERSIGHT_QUEUES.map((key) => (
                <QueueGroup
                  key={key}
                  id={key}
                  label={OVERSIGHT_QUEUE_META[key].label}
                  owner={OVERSIGHT_QUEUE_META[key].owner}
                  tone={OVERSIGHT_QUEUE_META[key].severity}
                  items={data.queues[key]}
                  open={open === key}
                  onToggle={() => setOpen(open === key ? null : key)}
                  onChanged={() => void load()}
                />
              ))}
            </div>

            <div className="space-y-2">
              <h4 className="flex items-center gap-1.5 text-xs font-black uppercase text-zinc-100">
                <ShieldAlert className="h-4 w-4 text-zinc-300" /> Pengecualian kontrol (periode)
              </h4>
              {OVERSIGHT_EXCEPTIONS.map((key) => (
                <QueueGroup
                  key={key}
                  id={key}
                  label={OVERSIGHT_EXCEPTION_LABEL[key]}
                  owner={null}
                  tone="amber"
                  items={data.exceptions[key]}
                  open={open === key}
                  onToggle={() => setOpen(open === key ? null : key)}
                  onChanged={() => void load()}
                />
              ))}
            </div>
          </>
        ) : loading ? (
          <p className="text-sm text-zinc-400">Memuat pengawasan kas…</p>
        ) : null}
      </div>
    </Panel>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-[var(--garage-bg-3)] p-3">
      <p className="text-[11px] font-semibold uppercase text-zinc-300">{label}</p>
      <p className={`mt-1 break-words font-mono text-sm font-bold ${tone === "amber" ? "text-[#ffd8a8]" : "text-zinc-50"}`}>{value}</p>
    </div>
  );
}

function QueueGroup({
  id,
  label,
  owner,
  tone,
  items,
  open,
  onToggle,
  onChanged,
}: {
  id: string;
  label: string;
  owner: string | null;
  tone: "red" | "amber";
  items: OversightItem[];
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const empty = items.length === 0;
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--garage-bg-3)]" data-testid={`oversight-${id}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={empty}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left disabled:cursor-default"
      >
        <span className="flex min-w-0 items-center gap-2">
          {empty ? <span className="h-4 w-4" /> : open ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-300" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />}
          <span className="min-w-0">
            <span className={`block text-sm font-semibold ${empty ? "text-zinc-400" : "text-zinc-50"}`}>{label}</span>
            {owner && !empty ? <span className="block text-xs text-zinc-400">Tindakan: {owner}</span> : null}
          </span>
        </span>
        <Badge tone={empty ? "muted" : tone}>{items.length}</Badge>
      </button>
      {open && !empty ? (
        <ul className="divide-y divide-white/5 border-t border-white/10">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-zinc-50">
                  <span className="font-mono text-zinc-300">{item.ref}</span>
                  {item.outletCode ? <span className="ml-1 text-xs text-zinc-400">· {item.outletCode}</span> : null} — {item.title}
                </p>
                {item.detail ? <p className="break-words text-zinc-300">{item.detail}</p> : null}
                <p className="text-xs text-zinc-400">
                  {item.person ? `${item.person} · ` : ""}
                  {dateTime.format(new Date(item.at))} · {age(item.ageHours)} lalu
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {id === "deposit_unconfirmed" ? (
                  <DepositConfirm id={item.id} onDone={onChanged} />
                ) : null}
                <Link
                  href={item.href}
                  className="inline-flex h-9 items-center rounded-md border border-white/15 px-3 text-xs font-semibold uppercase text-zinc-100 hover:bg-white/10"
                >
                  Buka
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Konfirmasi setoran langsung dari dashboard (endpoint yang sama dengan detail kas). */
function DepositConfirm({ id, onDone }: { id: string; onDone: () => void }) {
  const [bankRef, setBankRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/cash-movements/${id}/deposit-confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bankRef: bankRef.trim() }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengonfirmasi");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          value={bankRef}
          onChange={(e) => setBankRef(e.target.value.slice(0, 80))}
          placeholder="No. bukti setor"
          aria-label="Nomor bukti setor"
          className="h-9 w-36 rounded-md border border-white/15 bg-[var(--garage-bg-2)] px-2 text-sm text-zinc-100"
        />
        <button
          type="button"
          disabled={busy || bankRef.trim().length < 3}
          onClick={() => void submit()}
          className="h-9 rounded-md border border-[color-mix(in_srgb,var(--garage-amber)_55%,transparent)] bg-[color-mix(in_srgb,var(--garage-amber)_20%,transparent)] px-3 text-xs font-semibold uppercase text-[#ffd8a8] disabled:opacity-50"
          data-testid="oversight-deposit-confirm"
        >
          {busy ? "…" : "Diterima"}
        </button>
      </div>
      {error ? <p className="max-w-64 text-xs text-[#ffb1b1]">{error}</p> : null}
    </div>
  );
}
