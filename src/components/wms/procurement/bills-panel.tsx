"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, FileUp, Paperclip, ShieldCheck, Wallet } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGarageToast } from "@/components/garage/garage-toast";
import { ConfirmDialog } from "@/components/wms/master/master-shared";
import { garageApi } from "@/lib/api-client";
import { BILL_STATUS_META, FUND_SOURCE_LABEL, PAYMENT_STATUS_META, type FundSource } from "@/lib/wms-procurement-meta";
import { PaymentFields } from "./po-drawer";
import { Skeleton, TonePill, proc, rupiah, tanggal } from "./proc-ui";

type Payment = {
  id: string;
  doc: string;
  kind: string;
  amount: number;
  method: string;
  fundSource: string;
  reference: string;
  proofUrl: string | null;
  status: string;
  paidAt: string;
  createdBy: string | null;
  createdByName: string;
  voidReason: string | null;
};
type Bill = {
  id: string;
  doc: string;
  supplierName: string;
  poDoc: string | null;
  receivingDoc: string | null;
  invoiceNo: string;
  invoiceDate: string | null;
  dueDate: string | null;
  invoiceUrl: string | null;
  amount: number;
  paidAmount: number;
  outstanding: number;
  status: string;
  overdue: boolean;
  payments: Payment[];
};

async function upload(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/wms/supplier-docs", { method: "POST", body: fd });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Gagal mengunggah berkas.");
  return json.data.path as string;
}

/** Tagihan supplier (penerimaan tempo) + pembayaran. Ungu = menunggu verifikasi pembayaran. */
export function BillsPanel({ filter, role, userId, onChanged }: { filter: "open" | "verify" | "all"; role: string; userId: string; onChanged: () => void }) {
  const toast = useGarageToast();
  const [view, setView] = useState(filter);
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [paying, setPaying] = useState<Bill | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<Bill | null>(null);
  const [voiding, setVoiding] = useState<Payment | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);

  const fetchBills = useCallback(() => garageApi.get<Bill[]>(`/api/wms/supplier-bills${view === "all" ? "" : view === "open" ? "?status=unpaid,partial" : ""}`), [view]);
  const reload = useCallback(async () => {
    setBills(await fetchBills());
    onChanged();
  }, [fetchBills, onChanged]);

  useEffect(() => {
    let alive = true;
    fetchBills()
      .then((b) => { if (alive) setBills(b); })
      .catch((e) => toast.push({ tone: "error", title: "Gagal memuat tagihan", body: e instanceof Error ? e.message : "" }));
    return () => { alive = false; };
  }, [fetchBills, toast]);

  async function run(fn: () => Promise<unknown>, success: string) {
    if (inflight.current) return false;
    inflight.current = true;
    setBusy(true);
    try {
      await fn();
      toast.push({ tone: "success", title: success });
      await reload();
      return true;
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal", body: e instanceof Error ? e.message : "", ttl: 8000 });
      return false;
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const shown = (bills ?? []).filter((b) => (view === "verify" ? b.payments.some((p) => p.status === "pending_verification") : true));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Saring tagihan">
        {([
          ["open", "Belum lunas"],
          ["verify", "Menunggu verifikasi"],
          ["all", "Semua"],
        ] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => { setBills(null); setView(k); }} className={`${proc.btn} min-h-9 ${view === k ? proc.dark : proc.outline}`}>
            {label}
          </button>
        ))}
        <p className="ml-auto text-[12px] text-[#4B5563]">Tagihan muncul dari penerimaan bermetode <b>Tempo</b>. Pembayaran tidak membuat pengeluaran baru.</p>
      </div>

      {!bills ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#D9DCE1] bg-white p-8 text-center text-[13px] text-[#6B7280]">Tidak ada tagihan.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map((b) => {
            const m = BILL_STATUS_META[b.status] ?? BILL_STATUS_META.unpaid;
            return (
              <li key={b.id} className="rounded-xl border border-[#E8E8E8] bg-white p-3 motion-safe:transition-shadow hover:shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-[#111111]">{b.supplierName}</p>
                    <p className="text-[12px] text-[#4B5563]">
                      <span className="font-mono">{b.doc}</span> · {b.poDoc ?? "tanpa PO"} · terima {b.receivingDoc ?? "-"} · invoice {b.invoiceNo || <span className="font-semibold text-[#92400E]">belum ditautkan</span>}
                    </p>
                    <p className="text-[12px] text-[#4B5563]">Jatuh tempo {tanggal(b.dueDate)}</p>
                  </div>
                  <div className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {b.overdue && <TonePill tone="red">Lewat jatuh tempo</TonePill>}
                      <TonePill tone={m.tone}>{m.label}</TonePill>
                    </div>
                    <p className="mt-1 font-mono text-[15px] font-extrabold tabular-nums">{rupiah(b.outstanding)}</p>
                    <p className="text-[11.5px] text-[#6B7280]">sisa dari {rupiah(b.amount)}</p>
                  </div>
                </div>
                {b.payments.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-[#EEF0F3] pt-2">
                    {b.payments.map((p) => {
                      const pm = PAYMENT_STATUS_META[p.status] ?? PAYMENT_STATUS_META.pending_verification;
                      const canVerify = p.status === "pending_verification" && (role === "Owner" || p.createdBy !== userId);
                      return (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                          <span className="min-w-0">
                            {p.kind === "dp" ? "DP" : "Bayar"} <b className="font-mono">{rupiah(p.amount)}</b> · {p.method === "cash" ? "Tunai" : "Transfer"} · {FUND_SOURCE_LABEL[p.fundSource as FundSource] ?? p.fundSource}
                            {p.reference && ` · ref ${p.reference}`} · {tanggal(p.paidAt)} · {p.createdByName}
                            {p.proofUrl && (
                              <a href={`/api/wms/supplier-docs/${p.proofUrl}`} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 font-semibold text-[#1D4ED8] underline">
                                <Paperclip className="size-3" aria-hidden="true" /> bukti
                              </a>
                            )}
                            {p.voidReason && <span className="text-[#6B7280]"> · batal: {p.voidReason}</span>}
                          </span>
                          <span className="flex items-center gap-1">
                            <TonePill tone={pm.tone}>{pm.label}</TonePill>
                            {canVerify && (
                              <button type="button" disabled={busy} onClick={() => void run(() => garageApi.post(`/api/wms/supplier-payments/${p.id}/verify`, {}), "Pembayaran diverifikasi")} className={`${proc.btn} ${proc.outline} min-h-8 px-2 text-[12px]`}>
                                <ShieldCheck className="size-3.5" aria-hidden="true" /> Verifikasi
                              </button>
                            )}
                            {role === "Owner" && p.status !== "void" && (
                              <button type="button" disabled={busy} onClick={() => setVoiding(p)} className={`${proc.btn} ${proc.ghostDanger} min-h-8 px-2 text-[12px]`} aria-label={`Batalkan pembayaran ${p.doc}`}>
                                <Ban className="size-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {b.status !== "void" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {b.status !== "paid" && (
                      <button type="button" disabled={busy} onClick={() => setPaying(b)} className={`${proc.btn} ${proc.primary} min-h-9`}>
                        <Wallet className="size-4" aria-hidden="true" /> Catat pembayaran
                      </button>
                    )}
                    <button type="button" disabled={busy} onClick={() => setInvoiceFor(b)} className={`${proc.btn} ${proc.outline} min-h-9`}>
                      <FileUp className="size-4" aria-hidden="true" /> {b.invoiceNo ? "Ubah invoice" : "Tautkan invoice"}
                    </button>
                    {b.invoiceUrl && (
                      <a href={`/api/wms/supplier-docs/${b.invoiceUrl}`} target="_blank" rel="noopener noreferrer" className={`${proc.btn} ${proc.outline} min-h-9`}>
                        <Paperclip className="size-4" aria-hidden="true" /> Lihat invoice
                      </a>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {paying && <PayDialog bill={paying} role={role} onClose={() => setPaying(null)} onDone={async () => { setPaying(null); await reload(); }} />}
      {invoiceFor && <InvoiceDialog bill={invoiceFor} onClose={() => setInvoiceFor(null)} onDone={async () => { setInvoiceFor(null); await reload(); }} />}
      <ConfirmDialog
        open={voiding !== null}
        danger
        busy={busy}
        title={`Batalkan pembayaran ${voiding?.doc ?? ""}?`}
        confirmLabel="Batalkan pembayaran"
        onCancel={() => { setVoiding(null); setReason(""); }}
        onConfirm={async () => {
          if (!voiding) return;
          const ok = await run(() => garageApi.post(`/api/wms/supplier-payments/${voiding.id}/void`, { reason }), "Pembayaran dibatalkan");
          if (ok) {
            setVoiding(null);
            setReason("");
          }
        }}
        body={
          <label className="block">
            Riwayat tetap tersimpan. Alasan (wajib)
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${proc.input} mt-1`} autoFocus />
          </label>
        }
      />
    </div>
  );
}

function PayDialog({ bill, role, onClose, onDone }: { bill: Bill; role: string; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useGarageToast();
  const [amount, setAmount] = useState(String(bill.outstanding));
  const [method, setMethod] = useState<"cash" | "transfer">("transfer");
  const [fund, setFund] = useState<FundSource>("bank_jago");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const value = Number(amount.replace(/\D/g, "")) || 0;
  const funds: FundSource[] = method === "cash" ? ["petty", "external"] : ["bank_jago", "bank_bni", "external"];
  const over = value > bill.outstanding;

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const proofUrl = proof ? await upload(proof) : null;
      await garageApi.post("/api/wms/supplier-payments", { billId: bill.id, kind: "payment", amount: value, method, fundSource: fund, reference, proofUrl });
      toast.push({
        tone: "success",
        title: `Pembayaran ${rupiah(value)} dicatat`,
        body: role === "Owner" ? "Langsung terverifikasi (Owner)." : "Menunggu verifikasi Owner / Manajer lain.",
      });
      await onDone();
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal mencatat pembayaran", body: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="[color-scheme:light] max-w-md border-[#E8E8E8] bg-white text-[#111111]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-bold">Bayar {bill.supplierName}</DialogTitle>
          <DialogDescription className="text-[12.5px] text-[#4B5563]">Sisa tagihan {rupiah(bill.outstanding)}. Pencatatan ini tidak membuat pengeluaran baru (biaya sudah tercatat saat barang diterima).</DialogDescription>
        </DialogHeader>
        <PaymentFields amount={amount} setAmount={setAmount} method={method} setMethod={(m) => { setMethod(m); setFund(m === "cash" ? "petty" : "bank_jago"); }} fund={fund} setFund={setFund} funds={funds} reference={reference} setReference={setReference} />
        {over && <p role="alert" className="text-[12px] font-semibold text-[#B91C1C]">Melebihi sisa tagihan.</p>}
        <label className={proc.label}>
          Bukti bayar (foto / PDF, opsional)
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[12.5px]" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={`${proc.btn} ${proc.outline}`}>Batal</button>
          <button type="button" onClick={() => void save()} disabled={busy || value <= 0 || over || (method === "transfer" && !reference.trim())} className={`${proc.btn} ${proc.primary}`}>
            {busy ? "Menyimpan…" : "Simpan pembayaran"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({ bill, onClose, onDone }: { bill: Bill; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useGarageToast();
  const [invoiceNo, setInvoiceNo] = useState(bill.invoiceNo);
  const [invoiceDate, setInvoiceDate] = useState(bill.invoiceDate ?? "");
  const [dueDate, setDueDate] = useState(bill.dueDate ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const invoiceUrl = file ? await upload(file) : undefined;
      await garageApi.patch(`/api/wms/supplier-bills/${bill.id}`, { invoiceNo, invoiceDate: invoiceDate || null, dueDate: dueDate || null, ...(invoiceUrl ? { invoiceUrl } : {}) });
      toast.push({ tone: "success", title: "Invoice ditautkan" });
      await onDone();
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal menyimpan invoice", body: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="[color-scheme:light] max-w-md border-[#E8E8E8] bg-white text-[#111111]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-bold">Invoice supplier · {bill.doc}</DialogTitle>
          <DialogDescription className="text-[12.5px] text-[#4B5563]">Bandingkan nominal invoice dengan penerimaan ({rupiah(bill.amount)}). Selisih harga dikoreksi lewat penerimaan, bukan di sini.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`${proc.label} sm:col-span-2`}>No. invoice<input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className={proc.input} /></label>
          <label className={proc.label}>Tanggal invoice<input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={proc.input} /></label>
          <label className={proc.label}>Jatuh tempo<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={proc.input} /></label>
          <label className={`${proc.label} sm:col-span-2`}>
            Berkas invoice (foto / PDF)
            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-[12.5px]" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={`${proc.btn} ${proc.outline}`}>Batal</button>
          <button type="button" onClick={() => void save()} disabled={busy} className={`${proc.btn} ${proc.primary}`}>{busy ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
