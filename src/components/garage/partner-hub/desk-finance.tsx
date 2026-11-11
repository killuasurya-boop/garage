"use client";

// Keuangan Mitra (papan 04) + Settlement (papan 01). Semua angka dari server (snapshot), bukan dihitung di layar.
// Kasir: lihat, buat draft, ajukan, preview PDF. Owner: setujui. Owner/Manajer: catat & verifikasi transfer.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Eye, FileDown, Send, Wallet } from "lucide-react";

import { api, Btn, Card, Chip, dateWib, Field, inputCls, Kpi, Notice, rp, SETTLEMENT_LABEL, timeWib, todayKey } from "./desk-shared";

type FinanceLine = {
  id: string;
  orderNo: string;
  createdAt: string;
  tableLabel: string | null;
  customerName: string | null;
  itemName: string;
  variantLabel: string;
  qty: number;
  unitPrice: number;
  unitCost: number | null;
  status: string;
  settlementNo: string | null;
  gross: number;
  cost: number | null;
  profit: number | null;
  liability: number;
  payableQty: number;
};
type PartnerFinance = {
  partnerId: string;
  partnerName: string;
  partnerCode: string;
  grossSales: number;
  netSales: number;
  totalCost: number | null;
  garageProfit: number | null;
  liabilityTotal: number;
  paidAmount: number;
  outstanding: number;
  orderCount: number;
  unsettledLines: number;
  lines: FinanceLine[];
};
/** Untung hijau, rugi merah — angka negatif tidak boleh tampil seperti untung. */
const profitTone = (value: number) => (value < 0 ? "text-[#ff8a94]" : "text-[#86efac]");

type SettlementRow = { settlement: { id: string; settlementNo: string; status: string; liabilityTotal: number; paidAmount: number; grossSales: number; garageProfit: number | null; periodFrom: string; periodTo: string; lineCount: number }; partnerName: string; partnerCode: string };
type SettlementDetail = {
  settlement: SettlementRow["settlement"] & { totalCost: number | null; salesAdjustments: number; liabilityAdjustments: number };
  payouts: Array<{ id: string; amount: number; fundSource: string; reference: string; status: string; paidAt: string; selfVerified: boolean; createdBy: string | null; hasProof?: boolean }>;
  reports: Array<{ id: string; reportNo: string; audience: string; kind: string; version: number; createdAt: string }>;
};

const LINE_STATUS: Record<string, string> = { queue: "Menunggu", accepted: "Diterima", processing: "Diproses", ready: "Siap", delivered: "Diantar", rejected: "Ditolak", cancelled: "Batal" };

export function DeskFinance({ role, userId }: { role: string; userId: string }) {
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [data, setData] = useState<{ partners: PartnerFinance[] } | null>(null);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<SettlementDetail | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const isOwner = role === "Owner";
  const canPay = role === "Owner" || role === "Manajer";
  // Kasir tidak melihat HPP per item & profit Garage (server juga tidak mengirimnya).
  const showCost = role !== "Kasir";

  const load = useCallback(async () => {
    try {
      const [finance, list] = await Promise.all([
        api<{ partners: PartnerFinance[] }>(`/api/pos/partner-finance?from=${from}&to=${to}`),
        api<SettlementRow[]>("/api/finance/partner-settlements"),
      ]);
      setData(finance);
      setSettlements(list);
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    }
  }, [from, to]);

  useEffect(() => {
    // Ambil data saat tampil (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    setSelected(id);
    setDetail(await api<SettlementDetail>(`/api/finance/partner-settlements/${id}`));
  }, []);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: "ok", text: ok });
      await load();
      if (selected) await loadDetail(selected);
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const partners = useMemo(() => (data?.partners ?? []).filter((p) => partnerFilter === "all" || p.partnerId === partnerFilter), [data, partnerFilter]);
  const totals = useMemo(
    () => partners.reduce((acc, p) => ({ gross: acc.gross + p.netSales, cost: acc.cost + (p.totalCost ?? 0), profit: acc.profit + (p.garageProfit ?? 0), liability: acc.liability + p.liabilityTotal }), { gross: 0, cost: 0, profit: 0, liability: 0 }),
    [partners],
  );
  const unpaid = settlements.filter((s) => ["approved", "partially_paid"].includes(s.settlement.status)).reduce((sum, s) => sum + s.settlement.liabilityTotal - s.settlement.paidAmount, 0);
  const paid = settlements.reduce((sum, s) => sum + s.settlement.paidAmount, 0);

  return (
    <div className="grid gap-4">
      <Notice message={message} />
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Dari">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Sampai">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Mitra">
            <select value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)} className={inputCls}>
              <option value="all">Semua mitra</option>
              {(data?.partners ?? []).map((p) => (
                <option key={p.partnerId} value={p.partnerId}>
                  {p.partnerName}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <div className={`grid grid-cols-2 gap-3 ${showCost ? "lg:grid-cols-6" : "lg:grid-cols-4"}`}>
        <Kpi label="Penjualan mitra (bersih)" value={rp(totals.gross)} />
        {showCost ? <Kpi label="Total HPP mitra" value={rp(totals.cost)} hint="semua item terjual" /> : null}
        {showCost ? <Kpi label="Profit kotor Garage" value={rp(totals.profit)} tone={totals.profit < 0 ? "red" : "green"} hint={totals.profit < 0 ? "rugi: cek refund/void setelah siap" : undefined} /> : null}
        <Kpi label="Kewajiban setoran" value={rp(totals.liability)} tone="amber" hint="item Siap Antar" />
        <Kpi label="Sudah dibayar" value={rp(paid)} hint="semua settlement" />
        <Kpi label="Sisa setoran" value={rp(unpaid)} tone="red" hint="settlement disetujui" />
      </div>

      {partners.map((partner) => (
        <Card key={partner.partnerId}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white">
                {partner.partnerName} <span className="text-xs font-semibold text-[#b8b8bf]">#{partner.partnerCode}</span>
              </h3>
              <p className="text-xs text-[#b8b8bf]">
                {partner.orderCount} order · jual {rp(partner.netSales)}
                {showCost ? ` · HPP ${rp(partner.totalCost ?? 0)} · profit ${rp(partner.garageProfit ?? 0)}` : ""} · setoran {rp(partner.liabilityTotal)}
              </p>
            </div>
            <Btn
              tone="primary"
              disabled={partner.unsettledLines === 0}
              busy={busy === `create-${partner.partnerId}`}
              onClick={() =>
                void run(`create-${partner.partnerId}`, () => api("/api/finance/partner-settlements", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, from, to }) }), "Draft settlement dibuat. Periksa lalu ajukan.")
              }
            >
              <Send className="size-4" /> Buat draft settlement ({partner.unsettledLines})
            </Btn>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-[#2a2a30]">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-[#0f0f12] text-xs uppercase tracking-wide text-[#b8b8bf]">
                <tr>
                  {["Jam", "No. Order", "Meja", "Pemesan", "Produk", "Qty", "Harga", "Total jual", ...(showCost ? ["HPP", "Profit"] : []), "Setoran", "Status", "Settlement"].map((h) => (
                    <th key={h} className="px-2 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {partner.lines.length === 0 ? (
                  <tr>
                    <td colSpan={showCost ? 13 : 11} className="px-2 py-4 text-center text-[#b8b8bf]">
                      Belum ada transaksi mitra di periode ini.
                    </td>
                  </tr>
                ) : (
                  partner.lines.map((line) => (
                    <tr key={line.id} className="border-t border-[#2a2a30] text-[#f4f4f5]">
                      <td className="px-2 py-2 tabular-nums">{timeWib(line.createdAt)}</td>
                      <td className="px-2 py-2">{line.orderNo}</td>
                      <td className="px-2 py-2">{line.tableLabel ?? "Take away"}</td>
                      <td className="px-2 py-2">{line.customerName ?? "-"}</td>
                      <td className="px-2 py-2">
                        {line.itemName}
                        {line.variantLabel && line.variantLabel !== "Regular" ? ` (${line.variantLabel})` : ""}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{line.qty}</td>
                      <td className="px-2 py-2 tabular-nums">{rp(line.unitPrice)}</td>
                      <td className="px-2 py-2 tabular-nums">{rp(line.gross)}</td>
                      {showCost ? <td className="px-2 py-2 tabular-nums">{rp(line.cost ?? 0)}</td> : null}
                      {showCost ? <td className={`px-2 py-2 tabular-nums ${profitTone(line.profit ?? 0)}`}>{rp(line.profit ?? 0)}</td> : null}
                      <td className="px-2 py-2 tabular-nums text-[#ffd08a]">{rp(line.liability)}</td>
                      <td className="px-2 py-2">{LINE_STATUS[line.status] ?? line.status}</td>
                      <td className="px-2 py-2 text-xs text-[#b8b8bf]">{line.settlementNo ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {canPay ? <AdjustmentsCard partners={(data?.partners ?? []).map((p) => ({ id: p.partnerId, name: p.partnerName }))} isOwner={isOwner} userId={userId} busy={busy} run={run} reloadKey={`${from}:${to}:${settlements.length}`} /> : null}

      <Card>
        <h3 className="flex items-center gap-2 text-base font-bold text-white">
          <Wallet className="size-4 text-[#ff5a66]" /> Settlement mitra
        </h3>
        {settlements.length === 0 ? (
          <p className="mt-2 text-sm text-[#b8b8bf]">Belum ada settlement.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {settlements.map(({ settlement: s, partnerName }) => (
              <li key={s.id} className={`rounded-lg border p-3 ${selected === s.id ? "border-[#ff5a66]" : "border-[#3a3a42]"} bg-black/20`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => void loadDetail(s.id)} className="min-h-10 text-left font-semibold text-white underline-offset-4 hover:underline">
                    {s.settlementNo} · {partnerName}
                  </button>
                  <Chip tone={s.status === "paid" ? "green" : s.status === "cancelled" ? "red" : s.status === "approved" || s.status === "partially_paid" ? "amber" : "default"}>{SETTLEMENT_LABEL[s.status] ?? s.status}</Chip>
                </div>
                <p className="mt-1 text-xs text-[#b8b8bf]">
                  {dateWib(s.periodFrom)} – {dateWib(new Date(new Date(s.periodTo).getTime() - 1).toISOString())} · {s.lineCount} baris · setoran {rp(s.liabilityTotal)} · dibayar {rp(s.paidAmount)} · sisa {rp(s.liabilityTotal - s.paidAmount)}
                </p>
                {selected === s.id && detail ? (
                  <SettlementActions
                    detail={detail}
                    isOwner={isOwner}
                    canPay={canPay}
                    userId={userId}
                    busy={busy}
                    run={run}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SettlementActions({
  detail,
  isOwner,
  canPay,
  userId,
  busy,
  run,
}: {
  detail: SettlementDetail;
  isOwner: boolean;
  canPay: boolean;
  userId: string;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const s = detail.settlement;
  // Persetujuan Owner: bila akun Owner memakai 2FA, server meminta kode authenticator (428) → minta lalu ulangi.
  const approve = () =>
    run(
      `${s.id}-approve`,
      async () => {
        const send = (totpCode?: string) => api(`/api/finance/partner-settlements/${s.id}/action`, { method: "POST", body: JSON.stringify({ action: "approve", totpCode }) });
        try {
          await send();
        } catch (error) {
          if ((error as { code?: string }).code !== "TOTP_REQUIRED") throw error;
          const code = window.prompt("Kode 2FA (6 angka dari aplikasi authenticator) untuk menyetujui settlement:")?.replace(/\D/g, "");
          if (!code) throw new Error("Persetujuan dibatalkan — kode 2FA tidak diisi.");
          await send(code);
        }
      },
      "Settlement disetujui — PDF FINAL tersedia.",
    );
  const uploadProof = async (payoutId: string, file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.append("image", file);
    await run(
      `${payoutId}-proof`,
      async () => {
        const res = await fetch(`/api/finance/partner-payouts/${payoutId}/proof`, { method: "POST", credentials: "include", body: form });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "Gagal mengunggah bukti.");
      },
      "Bukti transfer tersimpan.",
    );
  };
  const [amount, setAmount] = useState(String(Math.max(0, s.liabilityTotal - s.paidAmount)));
  const [reference, setReference] = useState("");
  const [fundSource, setFundSource] = useState<"bank_jago" | "bank_bni" | "external">("bank_jago");
  const [paidAt, setPaidAt] = useState(todayKey());
  const action = (name: string, body: Record<string, unknown>, ok: string) => run(`${s.id}-${name}`, () => api(`/api/finance/partner-settlements/${s.id}/action`, { method: "POST", body: JSON.stringify(body) }), ok);
  const approved = ["approved", "partially_paid", "paid"].includes(s.status);
  return (
    <div className="mt-3 grid gap-3 border-t border-[#2a2a30] pt-3">
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <p className="text-[#b8b8bf]">
          Penjualan <b className="block text-white">{rp(s.grossSales + s.salesAdjustments)}</b>
        </p>
        <p className="text-[#b8b8bf]">
          HPP <b className="block text-white">{s.totalCost === null ? "—" : rp(s.totalCost)}</b>
        </p>
        <p className="text-[#b8b8bf]">
          Profit Garage <b className={`block ${profitTone(s.garageProfit ?? 0)}`}>{s.garageProfit === null ? "—" : rp(s.garageProfit)}</b>
        </p>
        <p className="text-[#b8b8bf]">
          Setoran ke mitra <b className="block text-[#ffd08a]">{rp(s.liabilityTotal)}</b>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/finance/partner-settlements/${s.id}/pdf?inline=1`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
          <Eye className="size-4" /> Preview PDF {approved ? "(FINAL)" : "(DRAFT)"}
        </a>
        <a href={`/api/finance/partner-settlements/${s.id}/pdf`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
          <FileDown className="size-4" /> Unduh PDF mitra
        </a>
        {canPay ? (
          <a href={`/api/finance/partner-settlements/${s.id}/pdf?audience=internal&inline=1`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
            <FileDown className="size-4" /> PDF internal
          </a>
        ) : null}
        {s.status === "draft" ? (
          <Btn tone="primary" busy={busy === `${s.id}-submit`} onClick={() => void action("submit", { action: "submit" }, "Settlement diajukan ke Owner.")}>
            <Send className="size-4" /> Ajukan settlement
          </Btn>
        ) : null}
        {isOwner && (s.status === "draft" || s.status === "submitted") ? (
          <Btn tone="success" busy={busy === `${s.id}-approve`} onClick={() => void approve()}>
            <BadgeCheck className="size-4" /> Setujui (Owner)
          </Btn>
        ) : null}
        {canPay && (s.status === "draft" || s.status === "submitted") ? (
          <Btn
            tone="danger"
            busy={busy === `${s.id}-cancel`}
            onClick={() => {
              const reason = window.prompt("Alasan membatalkan settlement ini?");
              if (reason?.trim()) void action("cancel", { action: "cancel", reason }, "Settlement dibatalkan; transaksi bisa direkap ulang.");
            }}
          >
            Batalkan
          </Btn>
        ) : null}
      </div>
      {detail.reports.length ? (
        <p className="text-xs text-[#b8b8bf]">
          Arsip PDF: {detail.reports.map((r) => `${r.reportNo} (${r.kind === "final" ? "FINAL" : "DRAFT"})`).join(" · ")}
        </p>
      ) : null}
      {detail.payouts.length ? (
        <ul className="grid gap-1 text-sm">
          {detail.payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a2a30] px-3 py-2">
              <span className="text-[#f4f4f5]">
                {dateWib(p.paidAt)} · {rp(p.amount)} · Ref {p.reference} · {p.fundSource}
                {p.selfVerified ? " · tanpa pemeriksa kedua" : ""}
              </span>
              <span className="flex items-center gap-2">
                <Chip tone={p.status === "verified" ? "green" : p.status === "void" ? "red" : "amber"}>{p.status === "verified" ? "Terverifikasi" : p.status === "void" ? "Dibatalkan" : "Menunggu verifikasi"}</Chip>
                {p.hasProof ? (
                  <a href={`/api/finance/partner-payouts/${p.id}/proof`} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
                    <Eye className="size-4" /> Bukti
                  </a>
                ) : null}
                {canPay && p.status !== "void" ? (
                  <label className="inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
                    {busy === `${p.id}-proof` ? "Mengunggah…" : p.hasProof ? "Ganti bukti" : "Unggah bukti"}
                    <input type="file" accept="image/*" className="sr-only" onChange={(event) => void uploadProof(p.id, event.target.files?.[0])} />
                  </label>
                ) : null}
                {isOwner && p.status === "recorded" && p.createdBy !== userId ? (
                  <Btn tone="success" busy={busy === `${p.id}-verify`} onClick={() => void run(`${p.id}-verify`, () => api(`/api/finance/partner-payouts/${p.id}`, { method: "POST", body: JSON.stringify({ action: "verify" }) }), "Pembayaran diverifikasi.")}>
                    Verifikasi
                  </Btn>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {canPay && (s.status === "approved" || s.status === "partially_paid") ? (
        <form
          className="grid gap-2 rounded-lg border border-[#2a2a30] p-3 sm:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              `${s.id}-pay`,
              () =>
                api(`/api/finance/partner-settlements/${s.id}/payments`, {
                  method: "POST",
                  body: JSON.stringify({ amount: Number(amount), fundSource, reference, paidAt, idempotencyKey: `pay-${s.id}-${reference}` }),
                }),
              isOwner ? "Transfer tercatat & terverifikasi." : "Transfer tercatat — menunggu verifikasi Owner.",
            );
          }}
        >
          <Field label="Nominal transfer">
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} className={inputCls} />
          </Field>
          <Field label="Dari rekening">
            <select value={fundSource} onChange={(e) => setFundSource(e.target.value as typeof fundSource)} className={inputCls}>
              <option value="bank_jago">Bank Jago</option>
              <option value="bank_bni">Bank BNI</option>
              <option value="external">Uang pribadi Owner</option>
            </select>
          </Field>
          <Field label="No. referensi bank">
            <input value={reference} onChange={(e) => setReference(e.target.value)} required minLength={4} className={inputCls} />
          </Field>
          <Field label="Tanggal transfer">
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex items-end">
            <Btn type="submit" tone="primary" busy={busy === `${s.id}-pay`} disabled={!reference.trim() || !Number(amount)}>
              Catat transfer
            </Btn>
          </div>
        </form>
      ) : null}
    </div>
  );
}

type Adjustment = { id: string; partnerId: string; partnerName: string; kind: string; salesDelta: number; liabilityDelta: number; reason: string; status: string; createdBy: string | null; createdAt: string };
const ADJ_KIND: Record<string, string> = { refund: "Refund", void: "Void", discount_partner: "Diskon ditanggung mitra", correction: "Koreksi", dispute: "Sengketa" };

/** Penyesuaian manual (koreksi / diskon mitra / sengketa). Manajer mengajukan, Owner memutuskan; riwayat tidak dihapus. */
function AdjustmentsCard({
  partners,
  isOwner,
  userId,
  busy,
  run,
  reloadKey,
}: {
  partners: Array<{ id: string; name: string }>;
  isOwner: boolean;
  userId: string;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;
  reloadKey: string;
}) {
  const [rows, setRows] = useState<Adjustment[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ partnerId: "", kind: "correction", sales: "", liability: "", reason: "" });
  const reload = useCallback(async () => {
    try {
      setRows(await api<Adjustment[]>("/api/finance/partner-adjustments"));
    } catch {
      setRows([]);
    }
  }, []);
  useEffect(() => {
    // Ambil data saat tampil / setelah aksi lain (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload, reloadKey]);
  const signed = (value: string) => Number(value.replace(/[^\d-]/g, "")) || 0;
  const partnerId = form.partnerId || partners[0]?.id || "";
  const pending = rows.filter((row) => row.status === "pending").length;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-white">
          Penyesuaian mitra {pending ? <span className="ml-1 rounded-full bg-[#d11a2a] px-2 py-0.5 text-xs">{pending} menunggu</span> : null}
        </h3>
        <Btn onClick={() => setOpen((value) => !value)}>{open ? "Tutup" : "Catat penyesuaian"}</Btn>
      </div>
      <p className="mt-1 text-xs text-[#b8b8bf]">Koreksi di luar refund/void otomatis. Angka minus mengurangi; plus menambah. Manajer mengajukan, Owner memutuskan.</p>
      {open ? (
        <form
          className="mt-3 grid gap-2 rounded-lg border border-[#2a2a30] p-3 sm:grid-cols-2 lg:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            void run(
              "adj-create",
              () => api("/api/finance/partner-adjustments", { method: "POST", body: JSON.stringify({ partnerId, kind: form.kind, salesDelta: signed(form.sales), liabilityDelta: signed(form.liability), reason: form.reason }) }),
              isOwner && form.kind !== "dispute" ? "Penyesuaian tercatat & berlaku." : "Penyesuaian diajukan — menunggu keputusan Owner.",
            ).then(() => {
              setForm((value) => ({ ...value, sales: "", liability: "", reason: "" }));
              void reload();
            });
          }}
        >
          <Field label="Mitra">
            <select value={partnerId} onChange={(e) => setForm({ ...form, partnerId: e.target.value })} className={inputCls}>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jenis">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputCls}>
              <option value="correction">Koreksi</option>
              <option value="discount_partner">Diskon ditanggung mitra</option>
              <option value="dispute">Sengketa</option>
            </select>
          </Field>
          <Field label="Penjualan (± Rp)">
            <input inputMode="numeric" value={form.sales} onChange={(e) => setForm({ ...form, sales: e.target.value })} placeholder="mis. -22000" className={inputCls} />
          </Field>
          <Field label="Setoran ke mitra (± Rp)">
            <input inputMode="numeric" value={form.liability} onChange={(e) => setForm({ ...form, liability: e.target.value })} placeholder="mis. -19000" className={inputCls} />
          </Field>
          <Field label="Alasan">
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required minLength={3} className={inputCls} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-5">
            <Btn type="submit" tone="primary" busy={busy === "adj-create"} disabled={!partnerId || form.reason.trim().length < 3 || (!signed(form.sales) && !signed(form.liability))}>
              Simpan penyesuaian
            </Btn>
          </div>
        </form>
      ) : null}
      {rows.length ? (
        <ul className="mt-3 grid gap-1 text-sm">
          {rows.slice(0, 12).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a2a30] px-3 py-2">
              <span className="min-w-0 text-[#f4f4f5]">
                {dateWib(row.createdAt)} · {row.partnerName} · {ADJ_KIND[row.kind] ?? row.kind} · jual {rp(row.salesDelta)} · setoran {rp(row.liabilityDelta)}
                <span className="block text-xs text-[#b8b8bf]">{row.reason}</span>
              </span>
              <span className="flex items-center gap-2">
                <Chip tone={row.status === "approved" ? "green" : row.status === "rejected" ? "red" : "amber"}>{row.status === "approved" ? "Berlaku" : row.status === "rejected" ? "Ditolak" : "Menunggu Owner"}</Chip>
                {isOwner && row.status === "pending" && row.createdBy !== userId ? (
                  <>
                    <Btn tone="success" busy={busy === `adj-${row.id}-ok`} onClick={() => void run(`adj-${row.id}-ok`, () => api(`/api/finance/partner-adjustments/${row.id}`, { method: "POST", body: JSON.stringify({ approve: true }) }), "Penyesuaian disetujui.").then(reload)}>
                      Setujui
                    </Btn>
                    <Btn tone="danger" busy={busy === `adj-${row.id}-no`} onClick={() => void run(`adj-${row.id}-no`, () => api(`/api/finance/partner-adjustments/${row.id}`, { method: "POST", body: JSON.stringify({ approve: false }) }), "Penyesuaian ditolak.").then(reload)}>
                      Tolak
                    </Btn>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
