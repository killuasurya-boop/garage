"use client";

import { CheckCircle2, ClipboardList, Download, FileText, Loader2, Plus, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { CashDenominationGrid, denominationTotals } from "@/components/garage/cash-denomination-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { GarageApiError, garageApi } from "@/lib/api-client";

const rp = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "-"
    : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const time = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const todayKey = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const errorText = (error: unknown, fallback: string) =>
  error instanceof GarageApiError || error instanceof Error ? error.message : fallback;

const selectClass =
  "h-10 w-full rounded-md border border-[#4a4a54] bg-[#1b1b20] px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#f5a742]/60";

// Kategori dicerminkan dari src/lib/cashier-accountability.ts (validasi server).
const PETTY_EXPENSE_CATEGORIES = ["Kebutuhan operasional", "Bahan mendadak", "Kebersihan", "Transport / ongkir", "Perbaikan kecil", "Lain-lain"];
const PETTY_TOPUP_CATEGORIES = ["Pengisian dana", "Pengembalian sisa dana", "Lain-lain"];
const INCIDENT_CATEGORIES = [
  "Selisih kas",
  "Kesalahan transaksi",
  "Permintaan void",
  "Refund pelanggan",
  "Gangguan QRIS",
  "Pembayaran tidak teridentifikasi",
  "Produk habis",
  "Komplain pelanggan",
  "Perubahan metode bayar",
  "Pengeluaran mendadak",
  "Pergantian kasir",
  "Gangguan POS / printer",
  "Masalah stok",
  "Lainnya",
];
const PETTY_STATUS: Record<string, { label: string; className: string }> = {
  submitted: { label: "Diajukan", className: "border-[#f5a742]/55 bg-[#f5a742]/15 text-[#ffd08a]" },
  approved: { label: "Disetujui", className: "border-[#4a4a54] bg-white/10 text-white" },
  awaiting: { label: "Disetujui · belum dibayar", className: "border-[#f5a742]/55 bg-[#f5a742]/10 text-[#ffd08a]" },
  paid: { label: "Dibayar", className: "border-[#4a4a54] bg-white/10 text-white" },
  reversed: { label: "Dibatalkan (dibalik)", className: "border-[#4a4a54] bg-white/5 text-[#c8c8cf]" },
  rejected: { label: "Ditolak", className: "border-[#d11a2a]/55 bg-[#d11a2a]/15 text-[#ffc2c8]" },
  cancelled: { label: "Dibatalkan", className: "border-[#4a4a54] bg-white/5 text-[#c8c8cf]" },
};
const INCIDENT_STATUS: Record<string, string> = { open: "Terbuka", follow_up: "Tindak lanjut", resolved: "Selesai" };

function openPdf(url: string) {
  window.open(url, "_blank", "noopener");
}

// ── Unduh laporan lengkap ───────────────────────────────────────────────────

type DaySession = { id: string; code: string; status: string; openedBy: string | null; cashierName: string | null; shiftNumber: number };

/** Unduhan PDF laporan pertanggungjawaban: per shift, per kasir, harian, kas & petty cash. */
export function AccountabilityExportCard({ canSupervise }: { canSupervise: boolean }) {
  const [date, setDate] = useState(todayKey);
  const [sessions, setSessions] = useState<DaySession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await garageApi.get<{ sessions: DaySession[] }>(
        `/api/reports/cashier-accountability?mode=sessions&date=${encodeURIComponent(date)}`,
        { cache: "no-store" },
      );
      setSessions(data.sessions);
    } catch (err) {
      setError(errorText(err, "Gagal memuat daftar shift."));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat ulang saat tanggal berganti
    void load();
  }, [load]);

  const cashiers = Array.from(new Map(sessions.filter((s) => s.openedBy).map((s) => [s.openedBy as string, s.cashierName ?? "Kasir"])));
  const base = `/api/reports/cashier-accountability?date=${encodeURIComponent(date)}`;

  return (
    <Card className="border-[#34343c] bg-[#141418]" data-testid="accountability-export">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <FileText className="size-4 text-[#f5a742]" /> Laporan Lengkap Kasir (PDF)
        </CardTitle>
        <CardDescription className="text-[#c8c8cf]">
          Transaksi, produk (pcs/cup/porsi), metode bayar, buku kas, petty cash, pecahan buka/tutup, void, refund, kejadian,
          rekonsiliasi & verifikasi. Nama file mengikuti tanggal operasional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex max-w-xs flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
          Tanggal operasional
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 border-[#4a4a54] bg-[#1b1b20]" />
        </label>
        {error ? <p className="text-sm text-[#ffb4bb]">{error}</p> : null}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-[#c8c8cf]">
            <Loader2 className="size-4 animate-spin" /> Memuat shift…
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[#c8c8cf]">Tidak ada shift di tanggal ini.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[#c8c8cf]">Per shift</p>
            <div className="flex flex-wrap gap-2">
              {sessions.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canSupervise && s.status === "open"}
                  title={!canSupervise && s.status === "open" ? "Tersedia setelah shift ditutup" : undefined}
                  className="h-10 border-[#4a4a54] bg-white/[0.05]"
                  onClick={() => openPdf(`/api/reports/cashier-accountability?sessionId=${s.id}`)}
                  data-testid="accountability-shift-pdf"
                >
                  <Download className="size-4" /> Shift {s.shiftNumber} · {s.cashierName ?? "Kasir"}
                  {s.status === "open" ? " (berlangsung)" : ""}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t border-[#34343c] pt-3">
          {canSupervise ? (
            <>
              {cashiers.map(([id, name]) => (
                <Button key={id} type="button" variant="outline" size="sm" className="h-10 border-[#4a4a54]" onClick={() => openPdf(`${base}&kind=cashier&cashierId=${id}`)}>
                  <Download className="size-4" /> Per kasir: {name}
                </Button>
              ))}
              <Button type="button" variant="outline" size="sm" className="h-10 border-[#4a4a54]" onClick={() => openPdf(`${base}&kind=all`)}>
                <Download className="size-4" /> Seluruh kasir
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 border-[#4a4a54]" onClick={() => openPdf(`${base}&kind=cash`)}>
                <Wallet className="size-4" /> Kas & Petty cash
              </Button>
              <Button type="button" size="sm" className="h-10 bg-[#d11a2a] text-white hover:bg-[#e5484d]" onClick={() => openPdf(`${base}&kind=combined`)} data-testid="accountability-combined-pdf">
                <Download className="size-4" /> Gabungan harian
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" className="h-10 bg-[#d11a2a] text-white hover:bg-[#e5484d]" onClick={() => openPdf(`${base}&kind=cashier`)}>
              <Download className="size-4" /> Laporan saya hari ini
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Petty cash ──────────────────────────────────────────────────────────────

type PettyEntry = {
  id: string;
  entryNo: string;
  type: "topup" | "expense" | "adjustment";
  category: string;
  description: string;
  amount: number;
  recipient: string | null;
  receiptNo: string | null;
  status: string;
  decisionNote: string | null;
  createdByName: string | null;
  approvedByName: string | null;
  entryAt: string;
  runningBalance: number | null;
  paidAt: string | null;
  paidByName: string | null;
  reversed: boolean;
  fundSource: string | null;
  selfApproved: boolean;
};

/** Status jujur petty cash: disetujui ≠ dibayar. */
function pettyStatusKey(entry: PettyEntry) {
  if (entry.reversed) return "reversed";
  if (entry.status === "approved") return entry.paidAt ? "paid" : "awaiting";
  return entry.status;
}

const FUND_SOURCE_LABEL: Record<string, string> = {
  bank_jago: "Rekening Jago",
  bank_bni: "Rekening BNI",
  external: "Uang pribadi Owner",
};
type PettySummary = {
  openingBalance: number;
  topups: number;
  expenses: number;
  adjustments: number;
  closingBalance: number;
  pendingCount: number;
  pendingExpenseTotal: number;
  awaitingPaymentCount: number;
  awaitingPaymentTotal: number;
  otherDayReversals: number;
  ledger: PettyEntry[];
};

/** Kas kecil terpisah dari laci: kasir mengajukan, Owner/Manajer menyetujui / mengisi dana. */
export function PettyCashPanel({ canSupervise, isOwner = false }: { canSupervise: boolean; isOwner?: boolean }) {
  const [date, setDate] = useState(todayKey);
  const [data, setData] = useState<PettySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ type: "expense", category: PETTY_EXPENSE_CATEGORIES[0], description: "", amount: "", recipient: "", receiptNo: "", fundSource: "bank_jago" });

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await garageApi.get<PettySummary>(`/api/finance/petty-cash?from=${date}&to=${date}`, { cache: "no-store" }));
    } catch (err) {
      setError(errorText(err, "Gagal memuat petty cash."));
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat ulang saat tanggal berganti
    void load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const amount = Math.round(Number(form.amount.replace(/[^\d-]/g, "")) || 0);
    if (!amount) {
      setError("Isi nominal.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await garageApi.post("/api/finance/petty-cash", {
        type: form.type,
        category: form.category,
        description: form.description,
        amount,
        ...(form.recipient.trim() ? { recipient: form.recipient } : {}),
        ...(form.receiptNo.trim() ? { receiptNo: form.receiptNo } : {}),
        ...(form.type === "topup" ? { fundSource: form.fundSource } : {}),
      });
      setMessage(
        isOwner
          ? "Petty cash dicatat & dibayar (Owner — tanpa pemeriksa kedua)."
          : "Pengajuan terkirim — menunggu persetujuan Owner/Manajer lain, lalu uang diserahkan.",
      );
      setForm((current) => ({ ...current, description: "", amount: "", recipient: "", receiptNo: "" }));
      await load();
    } catch (err) {
      setError(errorText(err, "Gagal menyimpan petty cash."));
    } finally {
      setBusy(false);
    }
  }

  async function decide(entry: PettyEntry, decision: "approve" | "reject" | "cancel" | "pay") {
    const id = entry.id;
    let note = "";
    let recipient = "";
    if (decision === "reject" || decision === "cancel") {
      note = window.prompt(decision === "reject" ? "Alasan menolak:" : "Alasan membatalkan:") ?? "";
      if (!note.trim()) return;
    }
    if (decision === "pay" && entry.type === "expense" && !entry.recipient) {
      recipient = window.prompt("Uang diserahkan kepada siapa?") ?? "";
      if (!recipient.trim()) return;
    }
    setBusy(true);
    setError(null);
    try {
      await garageApi.patch(`/api/finance/petty-cash/${id}`, {
        decision,
        ...(note.trim() ? { note } : {}),
        ...(recipient.trim() ? { recipient } : {}),
      });
      await load();
    } catch (err) {
      setError(errorText(err, "Gagal memproses petty cash."));
    } finally {
      setBusy(false);
    }
  }

  const categories = form.type === "expense" ? PETTY_EXPENSE_CATEGORIES : PETTY_TOPUP_CATEGORIES;

  return (
    <Card className="border-[#34343c] bg-[#141418]" data-testid="petty-cash-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <Wallet className="size-4 text-[#f5a742]" /> Petty Cash (kas kecil)
        </CardTitle>
        <CardDescription className="text-[#c8c8cf]">
          Terpisah dari uang laci kasir. Alur: diajukan → disetujui Owner/Manajer lain → uang diserahkan (Bayar). Saldo hanya berubah saat uang benar-benar diserahkan/diterima.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex max-w-xs flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
          Tanggal
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="h-10 border-[#4a4a54] bg-[#1b1b20]" />
        </label>
        {data ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Saldo awal", rp(data.openingBalance)],
              ["Penambahan", rp(data.topups)],
              ["Pengeluaran", rp(data.expenses)],
              ["Saldo akhir", rp(data.closingBalance)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#34343c] bg-white/[0.04] p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#c8c8cf]">{label}</p>
                <p className="mt-0.5 text-base font-black text-white">{value}</p>
              </div>
            ))}
          </div>
        ) : null}
        {data && data.closingBalance < 0 ? (
          <p className="rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/12 px-3 py-2 text-sm font-semibold text-[#ffc2c8]" role="alert">
            Saldo petty cash minus {rp(data.closingBalance)} — pengeluaran disetujui melebihi dana. Catat Penambahan dana yang sudah diberikan.
          </p>
        ) : null}
        {data?.awaitingPaymentCount ? (
          <p className="rounded-md border border-[#f5a742]/50 bg-[#f5a742]/10 px-3 py-2 text-sm font-semibold text-[#ffd08a]">
            {data.awaitingPaymentCount} disetujui tapi uang belum diserahkan · {rp(data.awaitingPaymentTotal)} (belum mengurangi saldo)
          </p>
        ) : null}
        {data?.otherDayReversals ? (
          <p className="text-xs text-[#c8c8cf]">Termasuk pembatalan entri hari lain: {rp(data.otherDayReversals)}.</p>
        ) : null}
        {data?.pendingCount ? (
          <p className="rounded-md border border-[#f5a742]/50 bg-[#f5a742]/10 px-3 py-2 text-sm font-semibold text-[#ffd08a]">
            {data.pendingCount} pengajuan menunggu persetujuan · {rp(data.pendingExpenseTotal)} (belum mengurangi saldo)
          </p>
        ) : null}

        <form onSubmit={(event) => void submit(event)} className="grid gap-2 rounded-lg border border-[#34343c] bg-white/[0.03] p-3 sm:grid-cols-2">
          <p className="text-sm font-bold text-white sm:col-span-2">{isOwner ? "Catat petty cash (langsung dibayar)" : canSupervise ? "Ajukan petty cash" : "Ajukan pengeluaran petty cash"}</p>
          {canSupervise ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
              Jenis
              <select
                className={selectClass}
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value,
                    category: event.target.value === "expense" ? PETTY_EXPENSE_CATEGORIES[0] : PETTY_TOPUP_CATEGORIES[0],
                  }))
                }
              >
                <option value="expense">Pengeluaran</option>
                <option value="topup">Penambahan dana</option>
                <option value="adjustment">Penyesuaian (±)</option>
              </select>
            </label>
          ) : null}
          {form.type === "topup" ? (
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
              Sumber dana
              <select className={selectClass} value={form.fundSource} onChange={(event) => setForm((current) => ({ ...current, fundSource: event.target.value }))}>
                {Object.entries(FUND_SOURCE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
            Kategori
            <select className={selectClass} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc] sm:col-span-2">
            Uraian kebutuhan
            <Input required minLength={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="h-10 border-[#4a4a54] bg-[#1b1b20]" data-testid="petty-description" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
            Nominal (Rp)
            <Input inputMode="numeric" required value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} className="h-10 border-[#4a4a54] bg-[#1b1b20] font-mono" data-testid="petty-amount" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
            Penerima dana
            <Input value={form.recipient} onChange={(event) => setForm((current) => ({ ...current, recipient: event.target.value }))} className="h-10 border-[#4a4a54] bg-[#1b1b20]" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
            No. nota / bukti
            <Input value={form.receiptNo} onChange={(event) => setForm((current) => ({ ...current, receiptNo: event.target.value }))} className="h-10 border-[#4a4a54] bg-[#1b1b20]" />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={busy} className="h-10 w-full bg-[#d11a2a] text-white hover:bg-[#e5484d]" data-testid="petty-submit">
              <Plus className="size-4" /> {isOwner ? "Simpan" : "Ajukan"}
            </Button>
          </div>
        </form>
        {message ? <p className="text-sm font-semibold text-[#ffd08a]">{message}</p> : null}
        {error ? <p className="text-sm font-semibold text-[#ffb4bb]">{error}</p> : null}

        <div className="garage-scroll max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {data?.ledger.length ? (
            data.ledger
              .slice()
              .reverse()
              .map((entry) => (
                <div key={entry.id} className="rounded-md border border-[#34343c] bg-white/[0.03] p-3 text-sm" data-testid="petty-row">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">
                        {entry.type === "topup" ? "+" : entry.type === "expense" ? "−" : "±"} {rp(entry.amount)} · {entry.category}
                      </p>
                      <p className="break-words text-[#d6d6dc]">{entry.description}</p>
                      <p className="text-xs text-[#c8c8cf]">
                        {entry.entryNo} · {time(entry.entryAt)} · {entry.createdByName ?? "-"}
                        {entry.recipient ? ` · ke ${entry.recipient}` : ""}
                        {entry.receiptNo ? ` · nota ${entry.receiptNo}` : ""}
                        {entry.approvedByName ? ` · disetujui ${entry.approvedByName}` : ""}
                        {entry.selfApproved ? " (tanpa pemeriksa kedua)" : ""}
                        {entry.paidByName ? ` · dibayar ${entry.paidByName}` : ""}
                        {entry.fundSource ? ` · dari ${FUND_SOURCE_LABEL[entry.fundSource] ?? entry.fundSource}` : ""}
                        {entry.decisionNote ? ` · ${entry.decisionNote}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={PETTY_STATUS[pettyStatusKey(entry)]?.className}>{PETTY_STATUS[pettyStatusKey(entry)]?.label ?? entry.status}</Badge>
                      {entry.runningBalance !== null ? <span className="text-xs text-[#c8c8cf]">Saldo {rp(entry.runningBalance)}</span> : null}
                    </div>
                  </div>
                  {entry.status === "submitted" ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {canSupervise ? (
                        <>
                          <Button type="button" size="sm" disabled={busy} className="h-9 bg-[#f5a742] text-black hover:bg-[#ffc167]" onClick={() => void decide(entry, "approve")}>
                            <CheckCircle2 className="size-4" /> Setujui
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={busy} className="h-9 border-[#d11a2a]/60 text-[#ffc2c8]" onClick={() => void decide(entry, "reject")}>
                            <XCircle className="size-4" /> Tolak
                          </Button>
                        </>
                      ) : null}
                      <Button type="button" size="sm" variant="outline" disabled={busy} className="h-9 border-[#4a4a54]" onClick={() => void decide(entry, "cancel")}>
                        Batalkan
                      </Button>
                    </div>
                  ) : null}
                  {entry.status === "approved" && canSupervise && !entry.reversed ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!entry.paidAt ? (
                        <Button type="button" size="sm" disabled={busy} className="h-9 bg-[#f5a742] text-black hover:bg-[#ffc167]" onClick={() => void decide(entry, "pay")} data-testid="petty-pay">
                          <Wallet className="size-4" /> {entry.type === "topup" ? "Dana diterima" : "Serahkan uang"}
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="outline" disabled={busy} className="h-9 border-[#4a4a54]" onClick={() => void decide(entry, "cancel")}>
                        {entry.paidAt ? "Batalkan (dibalik)" : "Batalkan"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))
          ) : (
            <p className="text-sm text-[#c8c8cf]">Belum ada transaksi petty cash di tanggal ini.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Catatan kejadian ────────────────────────────────────────────────────────

type Incident = {
  id: string;
  occurredAt: string;
  category: string;
  description: string;
  orderNo: string | null;
  financialImpact: number | null;
  actionTaken: string | null;
  status: string;
  responsibleName: string | null;
  managerNote: string | null;
  reportedByName: string | null;
};

/** Catatan kejadian shift: kasir mencatat, Owner/Manajer memberi catatan & menutup. */
export function ShiftIncidentsPanel({ sessionId, canSupervise, canAdd }: { sessionId: string; canSupervise: boolean; canAdd: boolean }) {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ category: INCIDENT_CATEGORIES[0], description: "", orderNo: "", impact: "", action: "" });

  const load = useCallback(async () => {
    try {
      const data = await garageApi.get<{ incidents: Incident[] }>(`/api/finance/shift-incidents?sessionId=${sessionId}`, { cache: "no-store" });
      setIncidents(data.incidents);
    } catch (err) {
      setError(errorText(err, "Gagal memuat catatan kejadian."));
    }
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat catatan untuk shift ini
    void load();
  }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const impact = form.impact.trim() ? Math.round(Number(form.impact.replace(/[^\d-]/g, "")) || 0) : undefined;
      await garageApi.post("/api/finance/shift-incidents", {
        cashSessionId: sessionId,
        category: form.category,
        description: form.description,
        ...(form.orderNo.trim() ? { orderNo: form.orderNo } : {}),
        ...(impact !== undefined ? { financialImpact: impact } : {}),
        ...(form.action.trim() ? { actionTaken: form.action } : {}),
      });
      setForm({ category: INCIDENT_CATEGORIES[0], description: "", orderNo: "", impact: "", action: "" });
      await load();
    } catch (err) {
      setError(errorText(err, "Gagal menyimpan catatan kejadian."));
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      await garageApi.patch(`/api/finance/shift-incidents/${id}`, body);
      await load();
    } catch (err) {
      setError(errorText(err, "Gagal memperbarui catatan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-[#34343c] bg-[#141418]" data-testid="shift-incidents">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-white">
          <ClipboardList className="size-4 text-[#f5a742]" /> Catatan Kejadian Shift
        </CardTitle>
        <CardDescription className="text-[#c8c8cf]">Selisih kas, gangguan QRIS/printer, komplain, produk habis, pergantian kasir, dll. Masuk ke laporan PDF.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canAdd ? (
          <form onSubmit={(event) => void add(event)} className="grid gap-2 rounded-lg border border-[#34343c] bg-white/[0.03] p-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
              Kategori
              <select className={selectClass} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                {INCIDENT_CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
              No. invoice (bila ada)
              <Input value={form.orderNo} onChange={(event) => setForm((current) => ({ ...current, orderNo: event.target.value }))} className="h-10 border-[#4a4a54] bg-[#1b1b20] font-mono" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc] sm:col-span-2">
              Deskripsi kejadian
              <Textarea required minLength={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="min-h-16 border-[#4a4a54] bg-[#1b1b20]" data-testid="incident-description" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
              Dampak keuangan (Rp, opsional)
              <Input inputMode="numeric" value={form.impact} onChange={(event) => setForm((current) => ({ ...current, impact: event.target.value }))} className="h-10 border-[#4a4a54] bg-[#1b1b20] font-mono" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-[#d6d6dc]">
              Tindakan yang dilakukan
              <Input value={form.action} onChange={(event) => setForm((current) => ({ ...current, action: event.target.value }))} className="h-10 border-[#4a4a54] bg-[#1b1b20]" />
            </label>
            <Button type="submit" disabled={busy} className="h-10 bg-[#d11a2a] text-white hover:bg-[#e5484d] sm:col-span-2" data-testid="incident-submit">
              <Plus className="size-4" /> Catat kejadian
            </Button>
          </form>
        ) : null}
        {error ? <p className="text-sm font-semibold text-[#ffb4bb]">{error}</p> : null}
        {incidents.length ? (
          incidents.map((incident) => (
            <div key={incident.id} className="rounded-md border border-[#34343c] bg-white/[0.03] p-3 text-sm" data-testid="incident-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{incident.category}</p>
                  <p className="break-words text-[#d6d6dc]">{incident.description}</p>
                  <p className="text-xs text-[#c8c8cf]">
                    {time(incident.occurredAt)} · {incident.reportedByName ?? "-"}
                    {incident.orderNo ? ` · ${incident.orderNo}` : ""}
                    {incident.financialImpact !== null ? ` · dampak ${rp(incident.financialImpact)}` : ""}
                  </p>
                  {incident.actionTaken ? <p className="text-xs text-[#d6d6dc]">Tindakan: {incident.actionTaken}</p> : null}
                  {incident.managerNote ? <p className="text-xs font-semibold text-[#ffd08a]">Catatan Manajer: {incident.managerNote}</p> : null}
                </div>
                <Badge className={incident.status === "resolved" ? "border-[#4a4a54] bg-white/10 text-white" : "border-[#f5a742]/55 bg-[#f5a742]/15 text-[#ffd08a]"}>
                  {INCIDENT_STATUS[incident.status] ?? incident.status}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {/* Diselesaikan Manajer/Owner lain — bukan pelapornya sendiri (dicek di server). */}
                {canSupervise && incident.status !== "resolved" ? (
                  <Button type="button" size="sm" variant="outline" disabled={busy} className="h-9 border-[#4a4a54]" onClick={() => void update(incident.id, { status: "resolved" })}>
                    <CheckCircle2 className="size-4" /> Tandai selesai
                  </Button>
                ) : null}
                {canSupervise ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    className="h-9 border-[#f5a742]/55 text-[#ffd08a]"
                    onClick={() => {
                      const note = window.prompt("Catatan Manajer / tindak lanjut:", incident.managerNote ?? "");
                      if (note !== null) void update(incident.id, { managerNote: note, ...(incident.status === "open" ? { status: "follow_up" } : {}) });
                    }}
                  >
                    Catatan Manajer
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-[#c8c8cf]">Belum ada kejadian yang dicatat di shift ini.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Verifikasi Manajer ──────────────────────────────────────────────────────

export function ShiftReviewCard({
  sessionId,
  shiftOpen,
  reviewStatus,
  reviewNote,
  openingVerifiedAt,
  openingCounted,
  expectedCash,
  actualCash,
  discrepancy,
  recountCash,
  discrepancyAcknowledged,
  selfVerified,
  viewerOwnsShift,
  isOwner,
  onChanged,
}: {
  sessionId: string;
  shiftOpen: boolean;
  reviewStatus: string;
  reviewNote: string | null;
  openingVerifiedAt: string | null;
  openingCounted: boolean;
  expectedCash: number;
  actualCash: number | null;
  discrepancy: number;
  recountCash: number | null;
  discrepancyAcknowledged: boolean;
  selfVerified: boolean;
  viewerOwnsShift: boolean;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(reviewNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recountOpen, setRecountOpen] = useState(false);
  const [recountCounts, setRecountCounts] = useState<Record<string, string>>({});
  const [acknowledge, setAcknowledge] = useState(false);
  const recount = denominationTotals(recountCounts);
  const effectiveRecount = recount.anyCounted ? recount.total : recountCash;
  const recountDiff = effectiveRecount === null ? 0 : effectiveRecount - expectedCash;
  const hasDiscrepancy = discrepancy !== 0 || recountDiff !== 0;
  // P4: Manajer tidak memeriksa shiftnya sendiri; Owner boleh, berlabel.
  const blocked = viewerOwnsShift && !isOwner;

  async function review(status: "verified" | "needs_followup") {
    setBusy(true);
    setError(null);
    try {
      await garageApi.patch(`/api/finance/cash-sessions/${sessionId}/review`, {
        status,
        ...(note.trim() ? { note } : {}),
        ...(recount.anyCounted ? { recountDenominations: recount.parsed } : {}),
        ...(status === "verified" && hasDiscrepancy ? { acknowledgeDiscrepancy: acknowledge } : {}),
      });
      setRecountCounts({});
      setRecountOpen(false);
      onChanged();
    } catch (err) {
      setError(errorText(err, "Gagal menyimpan verifikasi."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOpening() {
    setBusy(true);
    setError(null);
    try {
      await garageApi.patch(`/api/finance/cash-sessions/${sessionId}/opening-verify`, {});
      onChanged();
    } catch (err) {
      setError(errorText(err, "Gagal memverifikasi modal awal."));
    } finally {
      setBusy(false);
    }
  }

  const label = reviewStatus === "verified" ? "Diverifikasi" : reviewStatus === "needs_followup" ? "Perlu tindak lanjut" : "Menunggu pemeriksaan";
  return (
    <Card className="border-[#f5a742]/40 bg-[#141418]" data-testid="shift-review">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base text-white">
          <ShieldCheck className="size-4 text-[#f5a742]" /> Pemeriksaan Manajer
          <Badge className="border-[#f5a742]/55 bg-[#f5a742]/15 text-[#ffd08a]">{label}</Badge>
        </CardTitle>
        <CardDescription className="text-[#c8c8cf]">Status ini tercetak apa adanya di laporan PDF.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#d6d6dc]">
          Modal awal: {openingCounted ? "dihitung per pecahan" : "tanpa hitungan pecahan"} ·{" "}
          {openingVerifiedAt ? `diverifikasi ${time(openingVerifiedAt)}` : "belum diverifikasi"}
          {!openingVerifiedAt ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} className="h-9 border-[#4a4a54]" onClick={() => void verifyOpening()}>
              Verifikasi modal awal
            </Button>
          ) : null}
        </div>
        {shiftOpen ? (
          <p className="text-sm text-[#c8c8cf]">Laporan bisa diverifikasi setelah shift ditutup.</p>
        ) : blocked ? (
          <p className="rounded-md border border-[#4a4a54] bg-[#1b1b20] p-3 text-sm text-[#e4e4e9]" data-testid="shift-review-own">
            Shift ini milik Anda — pemeriksaan dilakukan Manajer lain atau Owner.
          </p>
        ) : (
          <>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <ReviewFigure label="Kas seharusnya" value={rp(expectedCash)} />
              <ReviewFigure label="Hitungan pertama kasir" value={actualCash === null ? "-" : rp(actualCash)} />
              <ReviewFigure
                label="Selisih"
                value={discrepancy === 0 ? "Balance" : `${discrepancy > 0 ? "Lebih" : "Kurang"} ${rp(Math.abs(discrepancy))}`}
                tone={discrepancy === 0 ? "ok" : "warn"}
              />
            </div>
            {recountCash !== null && !recount.anyCounted ? (
              <p className="text-sm text-[#d6d6dc]">
                Hitung ulang tersimpan: {rp(recountCash)} (selisih {rp(recountCash - expectedCash)}).
              </p>
            ) : null}
            <div className="space-y-2">
              <Button type="button" size="sm" variant="outline" className="h-9 border-[#4a4a54]" onClick={() => setRecountOpen((open) => !open)} data-testid="shift-review-recount-toggle">
                {recountOpen ? "Tutup hitung ulang" : "Hitung ulang uang laci"}
              </Button>
              {recountOpen ? (
                <div className="space-y-2 rounded-md border border-[#4a4a54] bg-[#1b1b20] p-3">
                  <CashDenominationGrid counts={recountCounts} onChange={setRecountCounts} testIdPrefix="recount" />
                  <p className="text-sm font-semibold text-white">
                    Hasil hitung ulang: {rp(recount.total)} · selisih{" "}
                    {recount.anyCounted ? rp(recount.total - expectedCash) : "-"}
                  </p>
                </div>
              ) : null}
            </div>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Hasil pemeriksaan / penyebab selisih / tindak lanjut" className="min-h-16 border-[#4a4a54] bg-[#1b1b20]" />
            {hasDiscrepancy ? (
              <label className="flex items-start gap-2 text-sm text-[#ffd08a]">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-[#f5a742]"
                  checked={acknowledge}
                  onChange={(event) => setAcknowledge(event.target.checked)}
                  data-testid="shift-review-acknowledge"
                />
                <span>Selisih diakui — penyebabnya sudah saya tulis di catatan (wajib untuk verifikasi shift berselisih).</span>
              </label>
            ) : null}
            {viewerOwnsShift && isOwner ? (
              <p className="text-sm text-[#ffd08a]">Anda memeriksa shift sendiri — tercatat &quot;tanpa pemeriksa kedua&quot;.</p>
            ) : null}
            {reviewStatus === "verified" && (discrepancyAcknowledged || selfVerified) ? (
              <p className="text-sm text-[#d6d6dc]">
                {discrepancyAcknowledged ? "Selisih diakui pemeriksa." : ""} {selfVerified ? "Tanpa pemeriksa kedua." : ""}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || (hasDiscrepancy && (!acknowledge || !note.trim()))}
                className="h-10 bg-[#f5a742] text-black hover:bg-[#ffc167]"
                onClick={() => void review("verified")}
                data-testid="shift-review-verify"
              >
                <CheckCircle2 className="size-4" /> Verifikasi laporan
              </Button>
              <Button type="button" variant="outline" disabled={busy} className="h-10 border-[#d11a2a]/60 text-[#ffc2c8]" onClick={() => void review("needs_followup")}>
                Perlu tindak lanjut
              </Button>
            </div>
          </>
        )}
        {error ? <p className="text-sm font-semibold text-[#ffb4bb]">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

function ReviewFigure({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-md border border-[#3a3a42] bg-[#1b1b20] px-3 py-2">
      <p className="text-xs font-semibold uppercase text-[#b8b8c0]">{label}</p>
      <p className={`text-base font-bold ${tone === "warn" ? "text-[#ffd08a]" : tone === "ok" ? "text-[#a8f0c4]" : "text-white"}`}>{value}</p>
    </div>
  );
}
