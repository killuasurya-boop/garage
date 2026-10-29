"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  CheckCircle2,
  Download,
  FileText,
  History,
  MessageCircle,
  Pencil,
  Send,
  ShieldCheck,
  Truck,
  Wallet,
  X,
} from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useGarageToast } from "@/components/garage/garage-toast";
import { ConfirmDialog } from "@/components/wms/master/master-shared";
import { garageApi } from "@/lib/api-client";
import { unitCostCurrency } from "@/lib/garage-data";
import { formatPacks, type PackUom } from "@/lib/stock-uom";
import { parseIdNumber } from "@/lib/wms-master-form";
import { FUND_SOURCE_LABEL, PAYMENT_STATUS_META, PO_EDITABLE, PO_STEPS, poPdfFileName, poStatusMeta, poStepIndex, type FundSource } from "@/lib/wms-procurement-meta";
import { Skeleton, TonePill, proc, rupiah, tanggal, waktu } from "./proc-ui";

type PoItem = {
  id: string;
  productId: string | null;
  name: string | null;
  sku: string | null;
  unit: string | null;
  uoms?: PackUom[];
  uom: string | null;
  uomFactor: number | null;
  orderedQty: number;
  receivedQty: number;
  remainingQty: number;
  unitPrice: number;
  sourceRefs: string[];
};
type Dispatch = { id: string; event: string; channel: string; revision: number; recipient: string; note: string; userName: string; createdAt: string; pdfSha256: string | null };
type Payment = { id: string; doc: string; kind: string; amount: number; method: string; fundSource: string; status: string; paidAt: string; createdByName: string };
export type PoDetail = {
  id: string;
  doc: string;
  status: string;
  revision: number;
  sentRevision: number | null;
  supplierName: string;
  supplierPhone: string;
  supplierPic: string;
  supplierAddress: string;
  expectedDate: string | null;
  note: string;
  deliveryNote: string;
  paymentTerms: string;
  showPrices: boolean;
  createdAt: string;
  items: PoItem[];
  receivings: Array<{ id: string; doc: string; status: string }>;
  dispatch: Dispatch[];
  payments: Payment[];
  whatsapp: { manual: boolean; cloudConfigured: boolean; cloudReady: boolean; note: string };
};

/** 1.5 → "1,5" (tanpa pemisah ribuan) — dibaca balik dengan benar oleh parseIdNumber. */
const idNum = (v: number) => String(v).replace(".", ",");

const EVENT_LABEL: Record<string, string> = {
  pdf_generated: "PDF dibuat",
  wa_opened: "WhatsApp dibuka",
  sent_confirmed: "Terkirim (konfirmasi manual)",
  provider_accepted: "Diterima server WhatsApp",
  provider_failed: "Gagal kirim (API)",
  supplier_confirmed: "Supplier mengonfirmasi",
  supplier_processing: "Supplier memproses / mengirim",
  revised: "Direvisi",
};


function Stepper({ status }: { status: string }) {
  const idx = poStepIndex(status);
  if (idx < 0) return <TonePill tone="red">Dibatalkan</TonePill>;
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Tahapan PO">
      {PO_STEPS.map((s, i) => {
        const done = i < idx || (i === idx && status === "received");
        const active = i === idx && !done;
        return (
          <li key={s.key} className="flex shrink-0 items-center gap-1" aria-current={active ? "step" : undefined}>
            <span
              className={`grid size-6 place-items-center rounded-full text-[11px] font-bold transition-colors duration-200 motion-reduce:transition-none ${
                done ? "bg-[#15803D] text-white" : active ? "bg-[#C8102E] text-white ring-4 ring-[#C8102E]/15" : "bg-[#ECEDF0] text-[#6B7280]"
              }`}
            >
              {done ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
            </span>
            <span className={`text-[11.5px] font-semibold ${active ? "text-[#111111]" : done ? "text-[#15803D]" : "text-[#6B7280]"}`}>{s.label}</span>
            {i < PO_STEPS.length - 1 && <span className={`mx-1 h-px w-4 ${done ? "bg-[#15803D]" : "bg-[#D9DCE1]"}`} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export function PoDrawer({ poId, onClose, onChanged }: { poId: string; onClose: () => void; onChanged: () => void }) {
  const toast = useGarageToast();
  const router = useRouter();
  const [po, setPo] = useState<PoDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waResult, setWaResult] = useState<{ url: string; text: string; fileName: string; revision: number } | null>(null);
  const [sentChecked, setSentChecked] = useState(false);
  const [confirm, setConfirm] = useState<null | "cancel" | "reject">(null);
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [dpOpen, setDpOpen] = useState(false);
  const inflight = useRef(false);

  const load = useCallback(async () => {
    const d = await garageApi.get<PoDetail>(`/api/wms/purchase-orders/${poId}`);
    setPo(d);
    return d;
  }, [poId]);

  useEffect(() => {
    let alive = true;
    garageApi
      .get<PoDetail>(`/api/wms/purchase-orders/${poId}`)
      .then((d) => { if (alive) setPo(d); })
      .catch((e) => toast.push({ tone: "error", title: "Gagal memuat PO", body: e instanceof Error ? e.message : "" }));
    return () => { alive = false; };
  }, [poId, toast]);

  /** Satu aksi pada satu waktu (cegah klik ganda); hasil selalu memuat ulang PO + daftar. */
  async function act(action: string, body: Record<string, unknown> = {}, success?: string) {
    if (inflight.current) return null;
    inflight.current = true;
    setBusy(action);
    try {
      const result = await garageApi.post<Record<string, unknown>>(`/api/wms/purchase-orders/${poId}/${action}`, body);
      if (success) toast.push({ tone: "success", title: success });
      await load();
      onChanged();
      return result;
    } catch (e) {
      toast.push({ tone: "error", title: "Aksi gagal", body: e instanceof Error ? e.message : "Coba lagi.", ttl: 8000 });
      return null;
    } finally {
      inflight.current = false;
      setBusy(null);
    }
  }

  async function openWhatsapp() {
    // Buka tab dulu (gesture pengguna) supaya tidak diblokir popup blocker, lalu arahkan ke wa.me.
    const win = window.open("", "_blank");
    if (win) win.opener = null; // cegah tab WhatsApp mengakses halaman ini
    const res = (await act("wa-open", {}, undefined)) as { url: string; text: string; fileName: string; revision: number } | null;
    if (!res) {
      win?.close();
      return;
    }
    setWaResult(res);
    if (win) win.location.href = res.url;
    toast.push({ tone: "info", title: "WhatsApp dibuka", body: "Lampirkan PDF, kirim, lalu tekan konfirmasi terkirim. PDF tidak terkirim otomatis." });
  }

  async function confirmSent() {
    if (!po) return;
    const ok = await act("confirm-sent", { revision: waResult?.revision ?? po.revision }, `${po.doc} ditandai terkirim`);
    if (ok) {
      setWaOpen(false);
      setSentChecked(false);
    }
  }

  async function receive() {
    const res = (await act("receive")) as { id?: string } | null;
    if (res?.id) router.push(`/warehouse/receiving?edit=${res.id}`);
  }

  const meta = po ? poStatusMeta(po.status) : null;
  const editable = po ? (PO_EDITABLE as readonly string[]).includes(po.status) && po.receivings.every((r) => r.status === "cancelled") : false;
  const dispatched = po ? po.sentRevision !== null || po.dispatch.some((d) => d.event === "wa_opened") : false;
  const total = po ? po.items.reduce((s, it) => s + it.orderedQty * it.unitPrice, 0) : 0;
  const pdfUrl = `/api/wms/purchase-orders/${poId}/pdf`;
  const fileName = po ? poPdfFileName(po.doc, po.supplierName, po.revision) : "";
  const canSend = po && ["approved", "wa_opened", "sent", "confirmed", "processing"].includes(po.status);

  return (
    <Sheet open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <SheetContent side="right" showCloseButton={false} className="[color-scheme:light] w-full gap-0 border-[#E8E8E8] bg-[#FAFAFB] p-0 text-[#111111] data-[side=right]:w-full data-[side=right]:sm:max-w-[760px]">
        <SheetHeader className="border-b border-[#E8E8E8] bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex flex-wrap items-center gap-2 font-mono text-[18px] font-extrabold text-[#111111]">
                {po?.doc ?? "Memuat…"}
                {po && po.revision > 0 && <span className="rounded bg-[#FFFBEB] px-1.5 py-0.5 font-sans text-[11px] font-bold text-[#92400E]">REVISI {po.revision}</span>}
                {po && meta && <TonePill tone={meta.tone}>{meta.label}</TonePill>}
              </SheetTitle>
              <SheetDescription className="text-[12.5px] text-[#4B5563]">{meta?.hint ?? " "}</SheetDescription>
            </div>
            <button type="button" aria-label="Tutup" onClick={onClose} disabled={!!busy} className="grid size-9 place-items-center rounded-md text-[#4B5563] hover:bg-[#F3F4F6]"><X className="size-5" /></button>
          </div>
          {po && <div className="mt-2"><Stepper status={po.status} /></div>}
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!po ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              {/* Aksi utama sesuai status */}
              <section className="flex flex-wrap gap-2 rounded-xl border border-[#E8E8E8] bg-white p-3" aria-label="Aksi PO">
                {po.status === "draft" && (
                  <button type="button" disabled={!!busy} onClick={() => void act("submit", {}, "PO diajukan untuk persetujuan")} className={`${proc.btn} ${proc.primary}`}>
                    <ShieldCheck className="size-4" aria-hidden="true" /> Ajukan persetujuan
                  </button>
                )}
                {po.status === "pending_approval" && (
                  <>
                    <button type="button" disabled={!!busy} onClick={() => void act("approve", {}, "PO disetujui — siap dikirim")} className={`${proc.btn} ${proc.primary}`}>
                      <CheckCircle2 className="size-4" aria-hidden="true" /> Setujui PO
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => setConfirm("reject")} className={`${proc.btn} ${proc.outline}`}>Tolak</button>
                  </>
                )}
                <button type="button" onClick={() => setPdfOpen(true)} className={`${proc.btn} ${proc.dark}`}>
                  <FileText className="size-4" aria-hidden="true" /> Buat PDF Pesanan
                </button>
                {canSend && (
                  <button type="button" disabled={!!busy} onClick={() => { setWaResult(null); setSentChecked(false); setWaOpen(true); }} className={`${proc.btn} ${proc.wa}`}>
                    <MessageCircle className="size-4" aria-hidden="true" /> Kirim PO via WhatsApp
                  </button>
                )}
                {po.status === "sent" && (
                  <button type="button" disabled={!!busy} onClick={() => void act("supplier-confirmed", {}, "Konfirmasi supplier dicatat")} className={`${proc.btn} ${proc.outline}`}>
                    <Check className="size-4" aria-hidden="true" /> Supplier konfirmasi
                  </button>
                )}
                {(po.status === "sent" || po.status === "confirmed") && (
                  <button type="button" disabled={!!busy} onClick={() => void act("supplier-processing", {}, "Ditandai sedang diproses supplier")} className={`${proc.btn} ${proc.outline}`}>
                    <Truck className="size-4" aria-hidden="true" /> Diproses / dikirim supplier
                  </button>
                )}
                {["approved", "wa_opened", "sent", "confirmed", "processing", "partial"].includes(po.status) && (
                  <>
                    <button type="button" disabled={!!busy} onClick={() => void receive()} className={`${proc.btn} ${proc.outline}`}>
                      <Truck className="size-4 text-[#C8102E]" aria-hidden="true" /> Terima barang
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => setDpOpen(true)} className={`${proc.btn} ${proc.outline}`}>
                      <Wallet className="size-4" aria-hidden="true" /> Catat DP
                    </button>
                  </>
                )}
                {editable && (
                  <button type="button" disabled={!!busy} onClick={() => setEditing((v) => !v)} className={`${proc.btn} ${proc.outline}`}>
                    <Pencil className="size-4" aria-hidden="true" /> {editing ? "Tutup edit" : dispatched ? "Revisi PO" : "Edit PO"}
                  </button>
                )}
                {!["received", "cancelled"].includes(po.status) && (
                  <button type="button" disabled={!!busy} onClick={() => setConfirm("cancel")} className={`${proc.btn} ${proc.ghostDanger} ml-auto`}>
                    <Ban className="size-4" aria-hidden="true" /> Batalkan
                  </button>
                )}
              </section>

              {editing && <ReviseForm po={po} dispatched={dispatched} onDone={async () => { setEditing(false); await load(); onChanged(); }} />}

              {/* Supplier & pengiriman */}
              <section className="grid gap-3 rounded-xl border border-[#E8E8E8] bg-white p-4 sm:grid-cols-2">
                <div>
                  <p className="text-[11.5px] font-bold uppercase tracking-wide text-[#C8102E]">Supplier</p>
                  <p className="mt-1 text-[15px] font-bold">{po.supplierName}</p>
                  <p className="text-[12.5px] text-[#374151]">PIC: {po.supplierPic || "-"} · WA: {po.supplierPhone || <span className="font-semibold text-[#B91C1C]">belum ada</span>}</p>
                  <p className="text-[12.5px] text-[#374151]">{po.supplierAddress || "Alamat belum diisi"}</p>
                </div>
                <div>
                  <p className="text-[11.5px] font-bold uppercase tracking-wide text-[#C8102E]">Pengiriman</p>
                  <p className="mt-1 text-[12.5px] text-[#374151]">Dibutuhkan: <b>{tanggal(po.expectedDate)}</b></p>
                  <p className="text-[12.5px] text-[#374151]">Catatan kirim: {po.deliveryNote || "-"}</p>
                  <p className="text-[12.5px] text-[#374151]">Pembayaran: {po.paymentTerms || "mengikuti termin supplier"}</p>
                </div>
              </section>

              {/* Item */}
              <section className="rounded-xl border border-[#E8E8E8] bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-[13px]">
                    <thead className="bg-[#F3F4F6] text-left text-[11.5px] font-bold uppercase tracking-wide text-[#4B5563]">
                      <tr>
                        <th className="px-3 py-2">Bahan</th>
                        <th className="px-3 py-2 text-right">Pesan</th>
                        <th className="px-3 py-2 text-right">Diterima</th>
                        <th className="px-3 py-2 text-right">Harga ref.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF0F3]">
                      {po.items.map((it) => (
                        <tr key={it.id}>
                          <td className="px-3 py-2">
                            <p className="font-semibold">{it.name}</p>
                            {it.sourceRefs.length > 0 && <p className="text-[11.5px] text-[#4B5563]">Asal: {it.sourceRefs.join(" · ")}</p>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatPacks(it.orderedQty, it.unit ?? "", it.uoms)}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${it.remainingQty > 0 && it.receivedQty > 0 ? "text-[#92400E]" : it.remainingQty === 0 ? "text-[#15803D]" : ""}`}>
                            {formatPacks(it.receivedQty, it.unit ?? "", it.uoms)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.unitPrice > 0 ? `${unitCostCurrency.format(it.unitPrice)}/${it.unit}` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t border-[#EEF0F3] px-3 py-2 text-right text-[13px]">
                  Estimasi total <b className="font-mono">{rupiah(total)}</b> <span className="text-[11.5px] text-[#6B7280]">(bukan harga final)</span>
                </p>
              </section>

              {po.receivings.length > 0 && (
                <p className="text-[12.5px] text-[#374151]">Penerimaan: {po.receivings.map((r) => `${r.doc} (${r.status})`).join(", ")}</p>
              )}

              {po.payments.length > 0 && (
                <section className="rounded-xl border border-[#E8E8E8] bg-white p-3">
                  <p className="mb-2 text-[13px] font-bold">DP & pembayaran</p>
                  <ul className="space-y-1.5">
                    {po.payments.map((p) => {
                      const m = PAYMENT_STATUS_META[p.status] ?? PAYMENT_STATUS_META.pending_verification;
                      return (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                          <span>{p.kind === "dp" ? "DP" : "Bayar"} {rupiah(p.amount)} · {p.method} · {FUND_SOURCE_LABEL[p.fundSource as FundSource] ?? p.fundSource} · {tanggal(p.paidAt)}</span>
                          <TonePill tone={m.tone}>{m.label}</TonePill>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* Jejak pengiriman */}
              <section className="rounded-xl border border-[#E8E8E8] bg-white p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[13px] font-bold"><History className="size-4" aria-hidden="true" /> Jejak dokumen & pengiriman</p>
                {po.dispatch.length === 0 ? (
                  <p className="text-[12.5px] text-[#6B7280]">Belum ada PDF / pengiriman.</p>
                ) : (
                  <ol className="relative space-y-2 border-l border-[#E5E7EB] pl-4">
                    {po.dispatch.map((d) => (
                      <li key={d.id} className="text-[12.5px]">
                        <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-[#C8102E]" aria-hidden="true" />
                        <b>{EVENT_LABEL[d.event] ?? d.event}</b> · R{d.revision} · {d.userName || "-"} · {waktu(d.createdAt)}
                        {d.recipient && <span className="text-[#4B5563]"> · ke +{d.recipient}</span>}
                        {d.note && <span className="block text-[#4B5563]">{d.note}</span>}
                        {d.pdfSha256 && <span className="block font-mono text-[10.5px] text-[#9CA3AF]">sha256 {d.pdfSha256.slice(0, 16)}…</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>

        {/* Pratinjau PDF */}
        <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
          <DialogContent className="[color-scheme:light] flex h-[92vh] w-[96vw] max-w-4xl flex-col gap-3 border-[#E8E8E8] bg-white p-4 text-[#111111] sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-bold">Pratinjau PDF · {fileName}</DialogTitle>
              <DialogDescription className="text-[12.5px] text-[#4B5563]">
                {po && !["approved", "wa_opened", "sent", "confirmed", "processing", "partial", "received"].includes(po.status)
                  ? "PO belum disetujui — PDF bertanda DRAFT dan bukan pesanan final."
                  : "Periksa isi sebelum dikirim ke supplier."}
              </DialogDescription>
            </DialogHeader>
            {pdfOpen && <iframe title={`Pratinjau ${fileName}`} src={pdfUrl} className="min-h-0 w-full flex-1 rounded-lg border border-[#E8E8E8]" />}
            <div className="flex flex-wrap justify-end gap-2">
              <a href={`${pdfUrl}?download=1`} download={fileName} className={`${proc.btn} ${proc.dark}`}>
                <Download className="size-4" aria-hidden="true" /> Unduh PDF
              </a>
            </div>
          </DialogContent>
        </Dialog>

        {/* Kirim via WhatsApp — Mode 1 (manual) */}
        <Dialog open={waOpen} onOpenChange={(o) => { if (!busy) setWaOpen(o); }}>
          <DialogContent className="[color-scheme:light] max-w-lg border-[#E8E8E8] bg-white text-[#111111]">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-bold">Kirim {po?.doc}{po && po.revision > 0 ? ` (REVISI ${po.revision})` : ""} ke {po?.supplierName}</DialogTitle>
              <DialogDescription className="text-[12.5px] text-[#4B5563]">
                Mode WhatsApp biasa: sistem membuka chat dengan pesan otomatis. <b>PDF tidak terkirim otomatis</b> — lampirkan sendiri.
              </DialogDescription>
            </DialogHeader>
            <ol className="space-y-3 text-[13px]">
              <li className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#111111] text-[11px] font-bold text-white">1</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Unduh PDF pesanan</p>
                  <a href={`${pdfUrl}?download=1`} download={fileName} className={`${proc.btn} ${proc.outline} mt-1`}>
                    <Download className="size-4" aria-hidden="true" /> {fileName}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#111111] text-[11px] font-bold text-white">2</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Buka WhatsApp supplier ({po?.supplierPhone || "nomor belum ada"})</p>
                  <button type="button" disabled={!!busy || !po?.supplierPhone} onClick={() => void openWhatsapp()} className={`${proc.btn} ${proc.wa} mt-1`}>
                    <MessageCircle className="size-4" aria-hidden="true" /> {busy === "wa-open" ? "Membuka…" : "Buka WhatsApp + pesan"}
                  </button>
                  {waResult && (
                    <>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-[#F3F4F6] p-2 text-[11.5px] text-[#374151]">{waResult.text}</pre>
                      <a href={waResult.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12px] font-semibold text-[#128C4A] underline">Tab tidak terbuka? Klik di sini</a>
                    </>
                  )}
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#111111] text-[11px] font-bold text-white">3</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Lampirkan PDF, kirim, lalu konfirmasi</p>
                  <label className="mt-1 flex items-start gap-2 text-[12.5px] text-[#374151]">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[#C8102E]"
                      checked={sentChecked}
                      disabled={po?.status !== "wa_opened" && !waResult}
                      onChange={(e) => setSentChecked(e.target.checked)}
                    />
                    <span>
                      Saya sudah mengirim pesan <b>dan</b> melampirkan PDF {po && po.revision > 0 ? `REVISI ${po.revision}` : ""} ke supplier di WhatsApp.
                    </span>
                  </label>
                  <button type="button" disabled={!!busy || !sentChecked} onClick={() => void confirmSent()} className={`${proc.btn} ${proc.primary} mt-2`}>
                    <Send className="size-4" aria-hidden="true" /> {busy === "confirm-sent" ? "Menyimpan…" : "Konfirmasi terkirim"}
                  </button>
                </div>
              </li>
            </ol>
            {po?.whatsapp && !po.whatsapp.cloudReady && <p className="text-[11.5px] text-[#6B7280]">{po.whatsapp.note}</p>}
          </DialogContent>
        </Dialog>

        {dpOpen && po && <DpDialog poId={po.id} onClose={() => setDpOpen(false)} onDone={async () => { setDpOpen(false); await load(); onChanged(); }} />}

        <ConfirmDialog
          open={confirm !== null}
          danger
          busy={!!busy}
          title={confirm === "reject" ? "Tolak PO?" : `Batalkan ${po?.doc ?? "PO"}?`}
          confirmLabel={confirm === "reject" ? "Tolak" : "Batalkan PO"}
          onCancel={() => { setConfirm(null); setReason(""); }}
          onConfirm={async () => {
            const res = confirm === "reject" ? await act("reject", { reason }, "PO dikembalikan ke draft") : await act("cancel", {}, "PO dibatalkan");
            if (res) {
              setConfirm(null);
              setReason("");
            }
          }}
          body={
            confirm === "reject" ? (
              <label className="block">
                Alasan penolakan
                <input value={reason} onChange={(e) => setReason(e.target.value)} className={`${proc.input} mt-1`} autoFocus />
              </label>
            ) : (
              <p>PO tidak berlaku lagi. {dispatched ? "Kabari supplier bahwa pesanan dibatalkan." : ""} Ditolak bila sudah ada DP/pembayaran atau penerimaan draft.</p>
            )
          }
        />
      </SheetContent>
    </Sheet>
  );
}

/** Edit / revisi: jumlah & harga per satuan beli, tanggal, catatan. Setelah pernah dikirim → REVISI baru. */
function ReviseForm({ po, dispatched, onDone }: { po: PoDetail; dispatched: boolean; onDone: () => Promise<void> }) {
  const toast = useGarageToast();
  const [rows, setRows] = useState(() =>
    po.items.map((it) => {
      const f = it.uom && it.uomFactor && it.uomFactor > 1 ? it.uomFactor : 1;
      // Desimal Indonesia (koma) supaya parseIdNumber tidak membaca "1.5" sebagai ribuan;
      // nilai asli disimpan agar baris yang tidak disentuh dikirim apa adanya (tanpa pembulatan).
      const qty = idNum(Math.round((it.orderedQty / f) * 1000) / 1000);
      const price = idNum(Math.round(it.unitPrice * f * 100) / 100);
      return {
        productId: it.productId,
        name: it.name,
        unit: it.uom && f > 1 ? it.uom : (it.unit ?? ""),
        factor: f,
        uom: f > 1 ? it.uom : null,
        qty,
        price,
        initQty: qty,
        initPrice: price,
        origQty: it.orderedQty,
        origPrice: it.unitPrice,
      };
    }),
  );
  const [expectedDate, setExpectedDate] = useState(po.expectedDate ?? "");
  const [note, setNote] = useState(po.note);
  const [deliveryNote, setDeliveryNote] = useState(po.deliveryNote);
  const [paymentTerms, setPaymentTerms] = useState(po.paymentTerms);
  const [showPrices, setShowPrices] = useState(po.showPrices);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const n = (s: string) => {
    const v = parseIdNumber(s);
    return Number.isFinite(v) ? v : 0;
  };
  const invalid = rows.some((r) => !(n(r.qty) > 0) || n(r.price) < 0);

  async function save() {
    setBusy(true);
    try {
      await garageApi.patch(`/api/wms/purchase-orders/${po.id}`, {
        expectedDate: expectedDate || null,
        note,
        deliveryNote,
        paymentTerms,
        showPrices,
        items: rows
          .filter((r) => r.productId)
          .map((r) => ({
            productId: r.productId,
            orderedQty: r.qty === r.initQty ? r.origQty : Math.round(n(r.qty) * r.factor * 10_000) / 10_000,
            unitPrice: r.price === r.initPrice ? r.origPrice : Math.round((n(r.price) / r.factor) * 10_000) / 10_000,
            uom: r.uom,
            uomFactor: r.factor > 1 ? r.factor : null,
          })),
      });
      toast.push({ tone: "success", title: dispatched ? `Revisi ${po.revision + 1} dibuat` : "PO diperbarui", body: dispatched || po.status !== "draft" ? "PO perlu disetujui lagi sebelum dikirim." : undefined });
      setConfirmOpen(false);
      await onDone();
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal menyimpan", body: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border-2 border-[#FCD34D] bg-white p-4">
      <p className="text-[13px] font-bold">{dispatched ? `Revisi PO → menjadi REVISI ${po.revision + 1}` : "Edit PO"}</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={`${r.productId}-${i}`} className="grid grid-cols-[1fr_96px_120px] items-end gap-2">
            <p className="truncate pb-2 text-[13px] font-semibold">{r.name}</p>
            <label className="text-[11.5px] font-semibold text-[#374151]">
              Jumlah ({r.unit})
              <input aria-label={`Jumlah ${r.name}`} value={r.qty} inputMode="decimal" onChange={(e) => setRows((c) => c.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} className={`${proc.input} text-right`} />
            </label>
            <label className="text-[11.5px] font-semibold text-[#374151]">
              Harga/{r.unit}
              <input aria-label={`Harga ${r.name}`} value={r.price} inputMode="decimal" onChange={(e) => setRows((c) => c.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} className={`${proc.input} text-right`} />
            </label>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className={proc.label}>Tanggal dibutuhkan<input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className={proc.input} /></label>
        <label className={proc.label}>Termin pembayaran<input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="mis. Tempo 14 hari" className={proc.input} /></label>
        <label className={`${proc.label} sm:col-span-2`}>Catatan pengiriman<input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="mis. kirim sebelum 10.00, pintu belakang" className={proc.input} /></label>
        <label className={`${proc.label} sm:col-span-2`}>Catatan khusus<input value={note} onChange={(e) => setNote(e.target.value)} className={proc.input} /></label>
      </div>
      <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#374151]">
        <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} className="size-4 accent-[#C8102E]" /> Tampilkan harga estimasi di PDF
      </label>
      <div className="flex justify-end">
        <button type="button" disabled={busy || invalid} onClick={() => (po.status === "draft" && !dispatched ? void save() : setConfirmOpen(true))} className={`${proc.btn} ${proc.primary}`}>
          {busy ? "Menyimpan…" : "Simpan perubahan"}
        </button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        busy={busy}
        title={dispatched ? `Buat REVISI ${po.revision + 1}?` : "Simpan perubahan PO?"}
        confirmLabel="Ya, simpan"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void save()}
        body={
          <ul className="list-disc space-y-1 pl-5">
            <li>PO kembali ke status <b>Menunggu Persetujuan</b>.</li>
            {dispatched && <li>Dokumen baru bertanda <b>REVISI {po.revision + 1}</b> dan wajib dikirim ulang ke supplier; dokumen lama tidak berlaku.</li>}
          </ul>
        }
      />
    </section>
  );
}

function DpDialog({ poId, onClose, onDone }: { poId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const toast = useGarageToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer">("transfer");
  const [fund, setFund] = useState<FundSource>("bank_jago");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const value = Number(amount.replace(/\D/g, "")) || 0;
  const funds: FundSource[] = method === "cash" ? ["petty", "external"] : ["bank_jago", "bank_bni", "external"];
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await garageApi.post("/api/wms/supplier-payments", { purchaseOrderId: poId, kind: "dp", amount: value, method, fundSource: fund, reference });
      toast.push({ tone: "success", title: `DP ${rupiah(value)} dicatat` });
      await onDone();
    } catch (e) {
      toast.push({ tone: "error", title: "Gagal mencatat DP", body: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="[color-scheme:light] max-w-md border-[#E8E8E8] bg-white text-[#111111]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-bold">Catat DP ke supplier</DialogTitle>
          <DialogDescription className="text-[12.5px] text-[#4B5563]">DP tidak membuat pengeluaran baru dan tidak memotong laci kasir. Nanti otomatis dihitung saat tagihan dibuat dari penerimaan tempo.</DialogDescription>
        </DialogHeader>
        <PaymentFields amount={amount} setAmount={setAmount} method={method} setMethod={(m) => { setMethod(m); setFund(m === "cash" ? "petty" : "bank_jago"); }} fund={fund} setFund={setFund} funds={funds} reference={reference} setReference={setReference} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={`${proc.btn} ${proc.outline}`}>Batal</button>
          <button type="button" onClick={() => void save()} disabled={busy || value <= 0 || (method === "transfer" && !reference.trim())} className={`${proc.btn} ${proc.primary}`}>{busy ? "Menyimpan…" : "Simpan DP"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentFields(props: {
  amount: string;
  setAmount: (v: string) => void;
  method: "cash" | "transfer";
  setMethod: (m: "cash" | "transfer") => void;
  fund: FundSource;
  setFund: (f: FundSource) => void;
  funds: FundSource[];
  reference: string;
  setReference: (v: string) => void;
}) {
  const value = Number(props.amount.replace(/\D/g, "")) || 0;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className={`${proc.label} sm:col-span-2`}>
        Nominal (Rp)
        <input inputMode="numeric" value={props.amount} onChange={(e) => props.setAmount(e.target.value)} placeholder="mis. 150.000" className={`${proc.input} text-right font-mono`} />
        {value > 0 && <span className="mt-0.5 block text-right text-[11.5px] text-[#4B5563]">{rupiah(value)}</span>}
      </label>
      <label className={proc.label}>
        Metode
        <select value={props.method} onChange={(e) => props.setMethod(e.target.value as "cash" | "transfer")} className={proc.input}>
          <option value="transfer">Transfer bank</option>
          <option value="cash">Tunai</option>
        </select>
      </label>
      <label className={proc.label}>
        Sumber dana
        <select value={props.fund} onChange={(e) => props.setFund(e.target.value as FundSource)} className={proc.input}>
          {props.funds.map((f) => <option key={f} value={f}>{FUND_SOURCE_LABEL[f]}</option>)}
        </select>
      </label>
      <label className={`${proc.label} sm:col-span-2`}>
        Referensi {props.method === "transfer" ? "(wajib: no. transaksi)" : "(opsional)"}
        <input value={props.reference} onChange={(e) => props.setReference(e.target.value)} className={proc.input} />
      </label>
      <p className="text-[11.5px] text-[#6B7280] sm:col-span-2">Laci kasir tidak bisa dipakai untuk membayar supplier.</p>
    </div>
  );
}
