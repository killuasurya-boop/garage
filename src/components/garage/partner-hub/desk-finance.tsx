"use client";

// Keuangan Mitra (papan 04) + Settlement (papan 01). Semua angka dari server (snapshot), bukan dihitung di layar.
// Kasir: lihat, buat draft, ajukan, preview PDF. Owner: setujui. Owner/Manajer: catat & verifikasi transfer.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Eye, FileDown, MessageCircle, Send, Wallet } from "lucide-react";

import { partnerFacingPayoutStatus, partnerSettlementWhatsapp, settlementPayoutState } from "@/lib/partner-hub-rules";

import { api, Btn, Card, Chip, dateWib, Field, inputCls, Kpi, Notice, rp, SETTLEMENT_LABEL, timeWib, todayKey } from "./desk-shared";
import { useNowTick } from "./desk-orders";

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

type SettlementRow = { pendingAmount?: number; settlement: { id: string; settlementNo: string; status: string; liabilityTotal: number; paidAmount: number; grossSales: number; garageProfit: number | null; periodFrom: string; periodTo: string; lineCount: number }; partnerName: string; partnerCode: string };
type SettlementDetail = {
  settlement: SettlementRow["settlement"] & { totalCost: number | null; salesAdjustments: number; liabilityAdjustments: number };
  partner?: { id: string; name: string; phone: string | null };
  sentLog?: Array<{ actorName: string | null; createdAt: string; channel: string | null }>;
  payouts: Array<{ id: string; amount: number; fundSource: string; reference: string; status: string; paidAt: string; selfVerified: boolean; createdBy: string | null; hasProof?: boolean }>;
  reports: Array<{ id: string; reportNo: string; audience: string; kind: string; version: number; createdAt: string }>;
};

const NUMERIC_HEADS = new Set(["Qty", "Harga", "Total jual", "HPP", "Profit", "Setoran"]);

/** Angka kecil berlabel di kepala kartu mitra. */
function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "red" | "amber" | "green" }) {
  const color = tone === "red" ? "text-[#ff8a94]" : tone === "amber" ? "text-[#ffd08a]" : tone === "green" ? "text-[#86efac]" : "text-white";
  return (
    <div className="min-w-0 rounded-lg border border-[#2a2a30] bg-black/20 px-3 py-2">
      <dt className="text-xs text-[#b8b8bf]">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

const LINE_STATUS: Record<string, string> = { queue: "Menunggu", accepted: "Diterima", processing: "Diproses", ready: "Siap", delivered: "Diantar", rejected: "Ditolak", cancelled: "Batal" };

type Coverage = {
  shiftCount: number;
  shifts: string[];
  totalPayable: number;
  coveredPayable: number;
  uncoveredPayable: number;
  missing: Array<{ orderNo: string; partnerName: string; itemName: string; variantLabel: string; qty: number; payable: number; reason: string }>;
};

/**
 * Cek silang (Owner 16 Nov 2026): wajib bayar ke mitra di rekap setoran vs yang tercatat di laporan shift kasir.
 * Selisih = pesanan mitra yang tidak masuk shift mana pun, ditampilkan dengan sebabnya. Hanya informasi.
 */
function ShiftCoverageCard({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<Coverage | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api<Coverage>(`/api/pos/partner-finance/coverage?from=${from}&to=${to}`)
      .then((res) => alive && (setData(res), setError(null)))
      .catch((err: Error) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [from, to]);
  if (error) return <Notice message={{ tone: "error", text: `Cek silang laporan shift gagal dimuat: ${error}` }} />;
  if (!data || data.totalPayable === 0) return null;
  const match = data.uncoveredPayable === 0;
  return (
    <Card className={match ? "" : "border-[#f5a742]/60"}>
      <div data-testid="partner-shift-coverage">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
          Cek silang laporan shift
          <Chip tone={match ? "green" : "amber"}>{match ? "Cocok" : "Ada selisih"}</Chip>
          <span className="ml-auto text-xs font-normal text-[#b8b8bf]">{data.shiftCount} shift kasir di periode ini</span>
        </h3>
        <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Stat label="Wajib bayar di rekap setoran" value={rp(data.totalPayable)} tone="amber" />
          <Stat label="Tercatat di laporan shift" value={rp(data.coveredPayable)} />
          <Stat label="Tidak masuk shift mana pun" value={rp(data.uncoveredPayable)} tone={match ? "default" : "red"} />
        </dl>
        {match ? (
          <p className="mt-2 text-xs text-[#bbf7d0]">Semua pesanan mitra yang wajib dibayar sudah tercatat di laporan shift kasir.</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-[#ffd08a]">Pesanan di bawah tetap wajib dibayar ke mitra (masuk rekap setoran), tetapi tidak tercatat di laporan shift kasir mana pun. Periksa sebelum menyetujui setoran.</p>
            <ul className="mt-2 grid gap-1 text-sm">
              {data.missing.slice(0, 20).map((row, index) => (
                <li key={`${row.orderNo}-${index}`} className="flex flex-wrap justify-between gap-x-3 rounded-md border border-[#2a2a30] bg-black/20 px-2 py-1.5 text-[#e4e4e8]">
                  <span className="min-w-0 break-words">
                    <b>{row.orderNo}</b> · {row.partnerName} · {row.qty ? `${row.qty}× ` : ""}{row.itemName}
                    {row.variantLabel && row.variantLabel !== "Regular" ? ` (${row.variantLabel})` : ""}
                    <span className="block text-xs text-[#b8b8bf]">{row.reason}</span>
                  </span>
                  <span className="tabular-nums font-semibold text-[#ffd08a]">{rp(row.payable)}</span>
                </li>
              ))}
            </ul>
            {data.missing.length > 20 ? <p className="mt-1 text-xs text-[#b8b8bf]">+{data.missing.length - 20} baris lainnya.</p> : null}
          </>
        )}
      </div>
    </Card>
  );
}

export function DeskFinance({ role, userId }: { role: string; userId: string }) {
  // Label jatuh tempo (12.00 WIB) ikut berganti tanpa muat ulang.
  const now = useNowTick(60_000);
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
  // Keputusan Owner 15 Nov 2026: semua peran keuangan (termasuk Kasir) melihat HPP mitra & profit Garage.
  const showCost = true;

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
  // Kartu settlement ikut filter mitra (nama mitra = kunci yang tersedia di daftar settlement).
  const filteredName = partnerFilter === "all" ? null : ((data?.partners ?? []).find((p) => p.partnerId === partnerFilter)?.partnerName ?? null);
  const shownSettlements = filteredName ? settlements.filter((s) => s.partnerName === filteredName) : settlements;
  const unpaid = shownSettlements.filter((s) => ["approved", "partially_paid"].includes(s.settlement.status)).reduce((sum, s) => sum + s.settlement.liabilityTotal - s.settlement.paidAmount, 0);
  const paid = shownSettlements.reduce((sum, s) => sum + s.settlement.paidAmount, 0);

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
          {canPay ? (
            <a
              href={`/api/partners/finance-export?from=${from}&to=${to}${partnerFilter !== "all" ? `&partnerId=${partnerFilter}` : ""}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10"
            >
              Unduh Excel (ringkasan · terlaris · transaksi)
            </a>
          ) : null}
        </div>
      </Card>

      {data === null ? (
        <Card>
          <p className="text-sm text-[#b8b8bf]">Memuat keuangan mitra…</p>
        </Card>
      ) : null}
      <section aria-label="Ringkasan periode">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#b8b8bf]">
          Periode {dateWib(`${from}T00:00:00+07:00`)}
          {to !== from ? ` – ${dateWib(`${to}T00:00:00+07:00`)}` : ""}
        </h3>
        <div className={`grid grid-cols-2 gap-3 ${showCost ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
          <Kpi label="Penjualan mitra (bersih)" value={rp(totals.gross)} />
          {showCost ? <Kpi label="Total HPP mitra" value={rp(totals.cost)} hint="semua item terjual" /> : null}
          {showCost ? <Kpi label="Profit kotor Garage" value={rp(totals.profit)} tone={totals.profit < 0 ? "red" : "green"} hint={totals.profit < 0 ? "rugi: cek refund/void setelah siap" : undefined} /> : null}
          <Kpi label="Kewajiban setoran" value={rp(totals.liability)} tone="amber" hint="item Siap Antar" />
        </div>
      </section>
      <ShiftCoverageCard from={from} to={to} />
      <section aria-label="Ringkasan settlement">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-[#b8b8bf]">Semua settlement{filteredName ? ` · ${filteredName}` : " · semua mitra"} (tidak mengikuti periode)</h3>
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Sudah dibayar ke mitra" value={rp(paid)} hint="pembayaran terverifikasi" />
          <Kpi label="Sisa yang harus dibayar" value={rp(unpaid)} tone={unpaid > 0 ? "red" : "default"} hint="settlement disetujui, belum lunas" />
        </div>
      </section>
      {data !== null && partners.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-[#b8b8bf]">Belum ada mitra dengan transaksi di periode ini.</p>
        </Card>
      ) : null}

      {partners.map((partner) => (
        <Card key={partner.partnerId}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-base font-bold text-white">
                {partner.partnerName} <span className="text-xs font-semibold text-[#b8b8bf]">#{partner.partnerCode}</span>
              </h3>
            </div>
            {/* A7: settlement per hari kalender WIB (penjualan X dibayar X+1 ≤ 12.00). */}
            <div className="grid justify-items-end gap-1">
              <Btn
                tone="primary"
                disabled={partner.unsettledLines === 0 || from !== to}
                busy={busy === `create-${partner.partnerId}`}
                onClick={() => {
                  // Hari ini belum tutup (23.00 WIB): transaksi berikutnya hari ini tidak bisa ditambahkan ke draft ini.
                  const wibHour = new Date(Date.now() + 7 * 3_600_000).getUTCHours();
                  if (from === todayKey() && wibHour < 23 && !window.confirm("Hari ini belum tutup (23.00). Transaksi mitra setelah ini tidak masuk ke settlement ini, dan selama draft ini terbuka tanggal ini tidak bisa direkap lagi. Tetap buat sekarang?")) return;
                  void run(
                    `create-${partner.partnerId}`,
                    () => api("/api/finance/partner-settlements", { method: "POST", body: JSON.stringify({ partnerId: partner.partnerId, from, to: from }) }),
                    `Draft settlement ${dateWib(`${from}T00:00:00+07:00`)} dibuat. Periksa, ajukan, lalu kirim PDF ke mitra.`,
                  );
                }}
              >
                <Send className="size-4" aria-hidden /> Buat settlement harian {dateWib(`${from}T00:00:00+07:00`)} ({partner.unsettledLines})
              </Btn>
              {from !== to ? <p className="text-xs text-[#ffd08a]">Settlement dibuat per hari — samakan tanggal Dari &amp; Sampai.</p> : null}
            </div>
          </div>
          <dl className={`mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 ${showCost ? "lg:grid-cols-6" : "lg:grid-cols-4"}`}>
            <Stat label="Order" value={String(partner.orderCount)} />
            <Stat label="Penjualan" value={rp(partner.netSales)} />
            {showCost ? <Stat label="HPP mitra" value={rp(partner.totalCost ?? 0)} /> : null}
            {showCost ? <Stat label="Profit Garage" value={rp(partner.garageProfit ?? 0)} tone={(partner.garageProfit ?? 0) < 0 ? "red" : "green"} /> : null}
            <Stat label="Kewajiban setoran" value={rp(partner.liabilityTotal)} tone="amber" />
            <Stat label="Belum masuk settlement" value={`${partner.unsettledLines} baris`} tone={partner.unsettledLines ? "amber" : "default"} />
          </dl>
          {/* HP: daftar kartu per baris (tanpa gulir samping). */}
          <ul className="mt-3 grid gap-2 sm:hidden">
            {partner.lines.length === 0 ? <li className="rounded-lg border border-dashed border-[#3a3a42] p-3 text-center text-sm text-[#b8b8bf]">Belum ada transaksi mitra di periode ini.</li> : null}
            {partner.lines.map((line) => (
              <li key={line.id} className="rounded-lg border border-[#2a2a30] bg-black/20 p-3 text-sm text-[#f4f4f5]">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold">
                    {line.itemName}
                    {line.variantLabel && line.variantLabel !== "Regular" ? ` (${line.variantLabel})` : ""}
                  </p>
                  <Chip>{LINE_STATUS[line.status] ?? line.status}</Chip>
                </div>
                <p className="mt-0.5 text-xs text-[#b8b8bf]">
                  {timeWib(line.createdAt)} · {line.orderNo} · {line.tableLabel ?? "Take away"}
                  {line.customerName ? ` · ${line.customerName}` : ""}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-[#b8b8bf]">Qty × harga</dt>
                  <dd className="text-right tabular-nums">
                    {line.qty} × {rp(line.unitPrice)}
                  </dd>
                  <dt className="text-[#b8b8bf]">Total jual</dt>
                  <dd className="text-right font-semibold tabular-nums">{rp(line.gross)}</dd>
                  {showCost ? <dt className="text-[#b8b8bf]">Profit Garage</dt> : null}
                  {showCost ? <dd className={`text-right tabular-nums ${profitTone(line.profit ?? 0)}`}>{rp(line.profit ?? 0)}</dd> : null}
                  <dt className="text-[#b8b8bf]">Setoran mitra</dt>
                  <dd className="text-right tabular-nums text-[#ffd08a]">{rp(line.liability)}</dd>
                  <dt className="text-[#b8b8bf]">Settlement</dt>
                  <dd className="break-all text-right">{line.settlementNo ?? "belum"}</dd>
                </dl>
              </li>
            ))}
          </ul>
          <div className="garage-scroll mt-3 hidden max-h-[28rem] overflow-auto rounded-lg border border-[#2a2a30] sm:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-[#0f0f12] text-xs uppercase tracking-wide text-[#b8b8bf]">
                <tr>
                  {["Jam", "No. Order", "Meja", "Pemesan", "Produk", "Qty", "Harga", "Total jual", ...(showCost ? ["HPP", "Profit"] : []), "Setoran", "Status", "Settlement"].map((h) => (
                    <th key={h} className={`px-2 py-2 font-semibold ${NUMERIC_HEADS.has(h) ? "text-right" : ""}`}>
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
                      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{line.qty}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{rp(line.unitPrice)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{rp(line.gross)}</td>
                      {showCost ? <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{rp(line.cost ?? 0)}</td> : null}
                      {showCost ? <td className={`px-2 py-2 text-right whitespace-nowrap tabular-nums ${profitTone(line.profit ?? 0)}`}>{rp(line.profit ?? 0)}</td> : null}
                      <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums text-[#ffd08a]">{rp(line.liability)}</td>
                      <td className="px-2 py-2">{LINE_STATUS[line.status] ?? line.status}</td>
                      <td className="px-2 py-2 text-xs text-[#b8b8bf]">{line.settlementNo ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {partner.lines.length ? (
                <tfoot className="sticky bottom-0 bg-[#0f0f12] text-sm font-bold text-white">
                  <tr className="border-t border-[#3a3a42]">
                    <td colSpan={5} className="px-2 py-2">
                      Total {partner.lines.length} baris
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{partner.lines.reduce((sum, line) => sum + line.qty, 0)}</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{rp(partner.lines.reduce((sum, line) => sum + line.gross, 0))}</td>
                    {showCost ? <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{rp(partner.lines.reduce((sum, line) => sum + (line.cost ?? 0), 0))}</td> : null}
                    {showCost ? <td className={`px-2 py-2 text-right whitespace-nowrap tabular-nums ${profitTone(partner.lines.reduce((sum, line) => sum + (line.profit ?? 0), 0))}`}>{rp(partner.lines.reduce((sum, line) => sum + (line.profit ?? 0), 0))}</td> : null}
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums text-[#ffd08a]">{rp(partner.lines.reduce((sum, line) => sum + line.liability, 0))}</td>
                    <td colSpan={2} className="px-2 py-2 text-xs font-normal text-[#b8b8bf]">sebelum penyesuaian</td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        </Card>
      ))}

      {canPay ? <AdjustmentsCard partners={(data?.partners ?? []).map((p) => ({ id: p.partnerId, name: p.partnerName }))} isOwner={isOwner} userId={userId} busy={busy} run={run} reloadKey={`${from}:${to}:${settlements.length}`} /> : null}

      <Card>
        <h3 className="flex items-center gap-2 text-base font-bold text-white">
          <Wallet className="size-4 text-[#ff5a66]" aria-hidden /> Settlement mitra
        </h3>
        {settlements.length === 0 ? (
          <p className="mt-2 text-sm text-[#b8b8bf]">Belum ada settlement.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {settlements.map(({ settlement: s, partnerName, pendingAmount }) => {
              const due = settlementPayoutState({ status: s.status, periodFrom: s.periodFrom, liabilityTotal: s.liabilityTotal, paidAmount: s.paidAmount, pendingAmount }, new Date(now));
              return (
              <li key={s.id} className={`rounded-lg border p-3 ${selected === s.id ? "border-[#ff5a66]" : "border-[#3a3a42]"} bg-black/20`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" aria-expanded={selected === s.id} onClick={() => void loadDetail(s.id)} className="min-h-10 min-w-0 break-words text-left font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                    {s.settlementNo} · {partnerName}
                  </button>
                  <Chip tone={s.status === "paid" ? "green" : s.status === "cancelled" ? "red" : s.status === "approved" || s.status === "partially_paid" ? "amber" : "default"}>{SETTLEMENT_LABEL[s.status] ?? s.status}</Chip>
                </div>
                <p className="mt-1 text-xs text-[#b8b8bf]">
                  {dateWib(s.periodFrom)} – {dateWib(new Date(new Date(s.periodTo).getTime() - 1).toISOString())} · {s.lineCount} baris
                </p>
                {due.key !== "cancelled" && due.key !== "none" ? (
                  <p className="mt-1" data-testid="settlement-due-state">
                    <Chip tone={due.tone}>{due.label}</Chip>
                  </p>
                ) : null}
                {s.status !== "cancelled" && s.liabilityTotal > 0 ? (
                  <div className="mt-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                      <span className="text-[#e4e4e8]">
                        Dibayar <b className="tabular-nums text-white">{rp(s.paidAmount)}</b> dari <b className="tabular-nums text-white">{rp(s.liabilityTotal)}</b>
                      </span>
                      <span className={`font-semibold tabular-nums ${s.liabilityTotal - s.paidAmount > 0 ? "text-[#ffd08a]" : "text-[#86efac]"}`}>
                        {s.liabilityTotal - s.paidAmount > 0 ? `Sisa ${rp(s.liabilityTotal - s.paidAmount)}` : "Lunas"}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Pembayaran ${s.settlementNo}`} aria-valuemin={0} aria-valuemax={s.liabilityTotal} aria-valuenow={Math.min(s.paidAmount, s.liabilityTotal)}>
                      <div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${Math.min(100, Math.round((s.paidAmount / s.liabilityTotal) * 100))}%` }} />
                    </div>
                  </div>
                ) : null}
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
              );
            })}
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
  const now = useNowTick(60_000);
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
  // A4 (Owner 15 Nov 2026): kirim PDF settlement ke WA mitra. HP → lembar bagikan dengan PDF terlampir;
  // komputer → PDF terunduh + chat WA mitra terbuka dengan ringkasan. Nomor = nomor mitra di Partner Hub.
  const pendingAmount = detail.payouts.filter((p) => p.status === "recorded").reduce((sum, p) => sum + p.amount, 0);
  const due = settlementPayoutState({ status: s.status, periodFrom: s.periodFrom, liabilityTotal: s.liabilityTotal, paidAmount: s.paidAmount, pendingAmount }, new Date(now));
  const wa = partnerSettlementWhatsapp({
    partnerName: detail.partner?.name ?? "Mitra",
    phone: detail.partner?.phone ?? null,
    settlementNo: s.settlementNo,
    periodFrom: s.periodFrom,
    periodTo: s.periodTo,
    grossSales: s.grossSales,
    garageProfit: s.garageProfit,
    liabilityTotal: s.liabilityTotal,
    // Ke mitra: jumlah yang sudah ditransfer termasuk yang menunggu verifikasi Owner; status dengan bahasa mitra.
    paidAmount: s.paidAmount + pendingAmount,
    statusLabel: partnerFacingPayoutStatus(due),
  });
  // PDF yang sudah diunduh tapi menunggu ketukan baru untuk dibagikan; ikut settlement & statusnya
  // (berganti settlement / status → dibuang, supaya PDF lama tidak terkirim).
  const [prepared, setPrepared] = useState<{ key: string; file: File } | null>(null);
  const preparedKey = `${s.id}:${s.status}:${s.paidAmount}`;
  const preparedPdf = prepared?.key === preparedKey ? prepared.file : null;
  const setPreparedPdf = (file: File | null) => setPrepared(file ? { key: preparedKey, file } : null);
  // Lembar bagikan (PDF terlampir) hanya di perangkat sentuh/HP. Chrome/Edge desktop juga mendukung
  // navigator.share, tapi di sana nomor mitra tidak terpakai — desktop selalu lewat chat wa.me + unduh PDF.
  const canShareFiles = () => {
    try {
      const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
      return Boolean(touch) && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "cek.pdf", { type: "application/pdf" })] });
    } catch {
      return false;
    }
  };
  async function fetchPdf() {
    const res = await fetch(`/api/finance/partner-settlements/${s.id}/pdf`, { credentials: "include", cache: "no-store" });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "PDF gagal dibuat.");
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `${s.settlementNo}.pdf`;
    return new File([await res.blob()], name, { type: "application/pdf" });
  }
  // A7: jejak "PDF sudah dikirim" (siapa & kapan). Gagal mencatat tidak membatalkan pengiriman.
  const markSent = (channel: "share" | "wa_desktop") =>
    api(`/api/finance/partner-settlements/${s.id}/sent`, { method: "POST", body: JSON.stringify({ channel }) }).catch(() => undefined);
  async function shareFile(file: File) {
    try {
      await navigator.share({ files: [file], text: wa.text, title: `Laporan ${s.settlementNo}` });
      setPreparedPdf(null);
      await markSent("share");
    } catch (error) {
      if ((error as DOMException).name === "AbortError") {
        // Kasir menutup lembar bagikan: PDF BELUM terkirim — jangan tampilkan pesan sukses.
        setPreparedPdf(file);
        throw new Error("Pengiriman dibatalkan — PDF belum terkirim. Ketuk \"Bagikan sekarang\" untuk mencoba lagi.");
      }
      if ((error as DOMException).name === "NotAllowedError") {
        // Browser (mis. Safari) butuh ketukan baru setelah PDF selesai diunduh.
        setPreparedPdf(file);
        throw new Error("PDF siap — ketuk \"Bagikan sekarang\" untuk memilih WhatsApp.");
      }
      throw error;
    }
  }
  const shareNow = () => (preparedPdf ? run(`${s.id}-wa`, () => shareFile(preparedPdf), "PDF dibagikan — pastikan terkirim ke kontak mitra.") : Promise.resolve());
  const sendWhatsapp = () => {
    if (canShareFiles()) {
      return run(`${s.id}-wa`, async () => shareFile(await fetchPdf()), "Pilih WhatsApp lalu kontak mitra — PDF sudah terlampir.");
    }
    // Komputer: buka chat WA sekarang (masih dalam ketukan, tidak diblok popup), lalu unduh PDF untuk dilampirkan.
    // Tanpa fitur "noopener" (dengan itu window.open SELALU mengembalikan null) — opener diputus manual.
    const chat = wa.url ? window.open(wa.url, "_blank") : null;
    if (chat) chat.opener = null;
    return run(
      `${s.id}-wa`,
      async () => {
        const file = await fetchPdf();
        const href = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = href;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
        if (!wa.url) throw new Error("PDF terunduh, tetapi nomor WA mitra belum diisi/valid di Kelola Mitra — kirim manual.");
        if (!chat) throw new Error("PDF terunduh. Browser memblokir jendela WhatsApp — izinkan pop-up lalu coba lagi.");
        await markSent("wa_desktop");
      },
      wa.url ? "PDF terunduh & chat WA mitra terbuka — lampirkan file PDF di chat, lalu kirim." : "PDF terunduh.",
    );
  };

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
        <button type="button" onClick={() => void sendWhatsapp()} disabled={busy !== null} data-testid="settlement-send-wa" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#22c55e]/60 bg-[#14532d]/40 px-3 text-sm font-semibold text-[#bbf7d0] hover:bg-[#14532d] disabled:opacity-60">
          <MessageCircle className="size-4" /> {busy === `${s.id}-wa` ? "Menyiapkan PDF…" : "Kirim PDF via WA"}
        </button>
        {preparedPdf ? (
          <button type="button" onClick={() => void shareNow()} disabled={busy !== null} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#16a34a] px-3 text-sm font-bold text-white hover:bg-[#15803d] disabled:opacity-60">
            <MessageCircle className="size-4" /> Bagikan sekarang
          </button>
        ) : null}
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
      <p className="text-xs text-[#b8b8bf]" data-testid="settlement-sent-log">
        {detail.sentLog?.length
          ? `PDF terakhir dikirim ke mitra: ${detail.sentLog[0].actorName ?? "staf"} · ${dateWib(detail.sentLog[0].createdAt)} ${timeWib(detail.sentLog[0].createdAt)} (${detail.sentLog[0].channel === "share" ? "lembar bagikan HP" : "WA komputer"})${detail.sentLog.length > 1 ? ` · total ${detail.sentLog.length}×` : ""}`
          : "PDF belum pernah dikirim ke mitra lewat tombol WA."}
      </p>
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
                {isOwner && p.status !== "void" ? (
                  <Btn
                    tone="danger"
                    busy={busy === `${p.id}-void`}
                    onClick={() => {
                      const reason = window.prompt(`Batalkan pembayaran ${rp(p.amount)} (Ref ${p.reference})? Tulis alasannya:`);
                      if (reason?.trim()) void run(`${p.id}-void`, () => api(`/api/finance/partner-payouts/${p.id}`, { method: "POST", body: JSON.stringify({ action: "void", reason }) }), "Pembayaran dibatalkan; sisa setoran dihitung ulang.");
                    }}
                  >
                    Batalkan
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
