"use client";

import { BookmarkPlus, Check, ClipboardList, Loader2, Minus, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { garageApi } from "@/lib/api-client";
import { countPack, formatPacks, type PackUom } from "@/lib/stock-uom";

type Division = "bar" | "dapur";

type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  uoms?: PackUom[];
  minStock: number;
  onHand: number;
  sourceOnHand: number;
  status: "out" | "low" | "ok";
  /** M1: jumlah usulan (0 = tidak perlu). */
  suggestedQty?: number;
  targetStock?: number;
  /** M2: perkiraan habis & sisa porsi. */
  runoutAt?: string | null;
  portionsLeft?: number | null;
};
type Template = { name: string; items: Array<{ productId: string; qty: number }> };
type Catalog = { division: Division; room: { id: string; name: string }; source: { id: string; name: string } | null; products: CatalogProduct[] };

type RequestRow = {
  id: string;
  doc: string;
  division: Division;
  status: "submitted" | "sent" | "received" | "cancelled";
  urgent: boolean;
  note: string;
  requestedByName: string;
  createdAt: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  items: Array<{ id: string; name: string; unit: string; uoms?: PackUom[]; qty: number; sentQty: number; shortQty: number; receivedQty?: number | null }>;
};

/** Saran keranjang dari katalog (M1): bahan menipis/habis × jumlah usulan. */
export function suggestedCart(products: Array<Pick<CatalogProduct, "id" | "suggestedQty">>) {
  const cart: Record<string, number> = {};
  for (const p of products) if ((p.suggestedQty ?? 0) > 0) cart[p.id] = p.suggestedQty as number;
  return cart;
}

const DIVISION_LABEL: Record<Division, string> = { bar: "Bar", dapur: "Dapur" };
const STATUS_LABEL: Record<RequestRow["status"], { label: string; cls: string }> = {
  submitted: { label: "Menunggu gudang", cls: "border-[#f5a742]/50 bg-[#f5a742]/15 text-[#ffd58f]" },
  sent: { label: "Dikirim — cek & terima", cls: "border-[#7cc4ff]/50 bg-[#7cc4ff]/15 text-[#bfe3ff]" },
  received: { label: "Diterima", cls: "border-[#5ad19a]/50 bg-[#5ad19a]/15 text-[#a6efc9]" },
  cancelled: { label: "Batal", cls: "border-[#55555f] bg-[#26262d] text-[#c4c4cc]" },
};

const qtyFormat = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 });
const timeFormat = new Intl.DateTimeFormat("id-ID", { timeStyle: "short", dateStyle: "short", timeZone: "Asia/Jakarta" });
const clockFormat = new Intl.DateTimeFormat("id-ID", { timeStyle: "short", timeZone: "Asia/Jakarta" });

/** Langkah tambah cepat per satuan (ml/gr besar, pcs kecil). */
function stepFor(unit: string) {
  const u = unit.toLowerCase();
  if (u === "ml" || u === "gr" || u === "gram") return 100;
  return 1;
}

/**
 * Minta Bahan: karyawan Bar/Dapur menyusun daftar belanja bahan habis dari layar
 * produksi → langsung ke gudang (tanpa approval, manajer dapat notifikasi). Tab
 * "Permintaan" untuk memantau status & konfirmasi barang diterima.
 */
export function ProductionMaterialRequestDialog({
  divisions,
  triggerClassName,
  openSignal,
}: {
  divisions: Division[];
  /** Gaya tombol pemicu (Production Hub V4); kosong = gaya lama. */
  triggerClassName?: string;
  /** M3: angka berubah → dialog dibuka (chip "Bahan menipis" di layar produksi). */
  openSignal?: number;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"list" | "requests">("list");
  const [division, setDivision] = useState<Division>(divisions[0] ?? "bar");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [query, setQuery] = useState("");
  const [onlyNeeded, setOnlyNeeded] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  // Teks mentah saat mengetik (mis. "1," / "0.") supaya desimal tidak hilang per ketukan.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [autoFilled, setAutoFilled] = useState(0);
  const [lowCount, setLowCount] = useState(0);
  // M6: jumlah diterima per baris (kosong = sesuai kiriman).
  const [received, setReceived] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async (div: Division) => {
    setRequests(await garageApi.get<RequestRow[]>(`/api/wms/material-requests?division=${div}`));
  }, []);

  useEffect(() => {
    let alive = true;
    void garageApi
      .get<RequestRow[]>(`/api/wms/material-requests?division=${division}&status=submitted,sent`)
      .then((rows) => {
        if (alive) setRequests(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [division]);

  /** Katalog + paket; keranjang kosong → diisi saran otomatis (M1). */
  async function loadCatalog(div: Division, resetCart: boolean) {
    const [cat, tpl] = await Promise.all([
      garageApi.get<Catalog>(`/api/wms/material-requests/catalog?division=${div}`),
      garageApi.get<Template[]>(`/api/wms/material-requests/templates?division=${div}`).catch(() => [] as Template[]),
      loadRequests(div),
    ]);
    setCatalog(cat);
    setTemplates(tpl);
    setCart((current) => {
      if (!resetCart && Object.keys(current).length) {
        setAutoFilled(0);
        return current;
      }
      const next = suggestedCart(cat.products);
      setAutoFilled(Object.keys(next).length);
      return next;
    });
  }

  async function openDialog() {
    setOpen(true);
    setMessage(null);
    setLoading(true);
    try {
      await loadCatalog(division, false);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Gagal memuat bahan." });
    } finally {
      setLoading(false);
    }
  }

  async function switchDivision(next: Division) {
    setDivision(next);
    setLoading(true);
    try {
      await loadCatalog(next, true);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Gagal memuat bahan." });
    } finally {
      setLoading(false);
    }
  }

  // M3: jumlah bahan menipis/habis divisi ini (ringan: ringkasan WMS, tiap 2 menit).
  useEffect(() => {
    let alive = true;
    const load = () =>
      void garageApi
        .get<{ outletAlerts: Array<{ area: string; items: unknown[] }> }>("/api/wms/summary")
        .then((d) => alive && setLowCount((d.outletAlerts ?? []).filter((a) => a.area === division).reduce((n, a) => n + a.items.length, 0)))
        .catch(() => undefined);
    load();
    const id = window.setInterval(load, 120_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [division]);

  // M3: dibuka dari chip layar produksi.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- buka dialog saat sinyal berubah
    if (openSignal) void openDialog();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hanya saat sinyal berubah
  }, [openSignal]);

  /** M4: tambahkan isi paket ke keranjang (jumlah dijumlahkan). */
  function applyTemplate(template: Template) {
    setCart((current) => {
      const next = { ...current };
      for (const item of template.items) next[item.productId] = Math.round(((next[item.productId] ?? 0) + item.qty) * 1000) / 1000;
      return next;
    });
    setMessage({ ok: true, text: `Paket "${template.name}" ditambahkan ke daftar.` });
  }

  async function saveTemplate() {
    const name = templateName.trim();
    if (!name || !cartLines.length) return;
    setBusy(true);
    try {
      const list = await garageApi.post<Template[]>("/api/wms/material-requests/templates", {
        division,
        name,
        items: cartLines.map(([productId, qty]) => ({ productId, qty })),
      });
      setTemplates(list);
      setTemplateName("");
      setMessage({ ok: true, text: `Paket "${name}" disimpan.` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Gagal menyimpan paket." });
    } finally {
      setBusy(false);
    }
  }

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog?.products ?? [])
      .filter((p) => (q ? `${p.name} ${p.sku}`.toLowerCase().includes(q) : !onlyNeeded || p.status !== "ok" || cart[p.id]))
      .sort((a, b) => ["out", "low", "ok"].indexOf(a.status) - ["out", "low", "ok"].indexOf(b.status) || a.name.localeCompare(b.name, "id"));
  }, [catalog, query, onlyNeeded, cart]);

  const cartLines = Object.entries(cart).filter(([, qty]) => qty > 0);
  const activeCount = requests.filter((r) => r.status === "submitted" || r.status === "sent").length;
  const toReceive = requests.filter((r) => r.status === "sent").length;

  function setDraft(product: CatalogProduct, raw: string | null) {
    setDrafts((current) => {
      const next = { ...current };
      if (raw === null) delete next[product.id];
      else next[product.id] = raw;
      return next;
    });
  }

  function setQty(product: CatalogProduct, qty: number) {
    setCart((current) => {
      const next = { ...current };
      if (qty > 0) next[product.id] = Math.round(qty * 1000) / 1000;
      else delete next[product.id];
      return next;
    });
  }

  async function submit() {
    if (!cartLines.length || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const row = await garageApi.post<{ doc: string }>("/api/wms/material-requests", {
        division,
        urgent,
        note: note.trim() || undefined,
        items: cartLines.map(([productId, qty]) => ({ productId, qty })),
      });
      setMessage({ ok: true, text: `${row.doc} terkirim ke gudang. Pantau di tab Permintaan.` });
      setCart({});
      setDrafts({});
      setNote("");
      setUrgent(false);
      await loadRequests(division);
      setTab("requests");
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Gagal mengirim permintaan." });
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "receive" | "cancel") {
    setBusy(true);
    setMessage(null);
    try {
      const row = requests.find((r) => r.id === id);
      // M6: hanya baris yang dikoreksi staf yang dikirim.
      const lines =
        action === "receive" && row
          ? row.items
              .filter((i) => received[i.id] !== undefined && received[i.id] !== "")
              .map((i) => ({ itemId: i.id, receivedQty: Number(received[i.id].replace(",", ".")) || 0 }))
          : [];
      await garageApi.post(`/api/wms/material-requests/${id}/${action}`, lines.length ? { lines } : {});
      const short = lines.some((l) => {
        const item = row?.items.find((i) => i.id === l.itemId);
        return item ? l.receivedQty < item.sentQty : false;
      });
      setMessage({
        ok: true,
        text: action === "receive" ? (short ? "Diterima dengan selisih — manajer diberi tahu untuk cek gudang." : "Bahan dikonfirmasi diterima.") : "Permintaan dibatalkan.",
      });
      setReceived({});
      await loadRequests(division);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "Aksi gagal." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={triggerClassName ?? "garage-press h-10 border-[#f5a742]/50 bg-[#f5a742]/10 px-3 text-xs font-bold text-[#ffd58f]"}
        onClick={() => void openDialog()}
        data-testid="production-material-request"
      >
        <ClipboardList className="mr-1.5 size-4" />
        Minta Bahan{activeCount ? ` (${activeCount})` : ""}
        {lowCount ? <span className="ml-1.5 rounded bg-[#f5a742] px-1.5 text-[12px] font-bold text-black">{lowCount} menipis</span> : null}
        {toReceive ? <span className="ml-1.5 size-2 rounded-full bg-[#7cc4ff]" aria-label="Ada bahan dikirim" /> : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Minta Bahan ke Gudang</DialogTitle>
            <DialogDescription className="text-[#c4c4cc]">
              Pilih bahan yang habis / menipis, isi jumlah, lalu kirim. Gudang langsung menyiapkan dan mengirim ke{" "}
              {catalog?.room.name ?? DIVISION_LABEL[division]}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            {divisions.length > 1 &&
              divisions.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => void switchDivision(d)}
                  className={`h-9 rounded-md border px-3 text-xs font-bold ${division === d ? "border-[#d11a2a] bg-[#d11a2a]/20 text-white" : "border-[#34343c] text-[#c4c4cc]"}`}
                >
                  {DIVISION_LABEL[d]}
                </button>
              ))}
            <div className="ml-auto flex rounded-md border border-[#34343c] p-0.5">
              {(["list", "requests"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`h-8 rounded px-3 text-xs font-bold ${tab === t ? "bg-[#26262d] text-white" : "text-[#c4c4cc]"}`}
                >
                  {t === "list" ? `Daftar belanja${cartLines.length ? ` (${cartLines.length})` : ""}` : `Permintaan${activeCount ? ` (${activeCount})` : ""}`}
                </button>
              ))}
            </div>
          </div>

          {message && <p className={`text-sm font-semibold ${message.ok ? "text-[#a6efc9]" : "text-[#ffc2c8]"}`}>{message.text}</p>}

          {tab === "list" ? (
            <>
              {autoFilled > 0 && (
                <p className="flex items-center gap-1.5 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 px-2.5 py-1.5 text-xs font-semibold text-[#ffd58f]">
                  <Sparkles className="size-3.5 shrink-0" /> {autoFilled} bahan menipis otomatis masuk daftar (sampai stok target). Cek, ubah bila perlu, lalu kirim.
                </p>
              )}
              {templates.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-[#c4c4cc]">Paket rutin:</span>
                  {templates.map((t) => (
                    <button key={t.name} type="button" onClick={() => applyTemplate(t)} className="h-8 rounded-md border border-[#34343c] px-2.5 text-xs font-bold text-white hover:bg-white/5">
                      + {t.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Cari bahan..."
                  className="h-10 min-w-0 flex-1 border-[#34343c] bg-[#1b1b21] text-white placeholder:text-[#8d8d97]"
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-[#c4c4cc]">
                  <input type="checkbox" checked={onlyNeeded} onChange={(e) => setOnlyNeeded(e.target.checked)} className="size-4 accent-[#d11a2a]" />
                  Habis / menipis saja
                </label>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-[#26262d]">
                {loading ? (
                  <p className="flex items-center gap-2 p-4 text-sm text-[#c4c4cc]"><Loader2 className="size-4 animate-spin" /> Memuat bahan…</p>
                ) : products.length === 0 ? (
                  <p className="p-4 text-sm text-[#c4c4cc]">{onlyNeeded && !query ? "Tidak ada bahan habis / menipis. Matikan filter untuk melihat semua bahan." : "Bahan tidak ditemukan."}</p>
                ) : (
                  <ul className="divide-y divide-[#26262d]">
                    {products.map((p) => {
                      const qty = cart[p.id] ?? 0;
                      // +/− per kemasan hitung (1 kotak = 1000 ml); tanpa kemasan → langkah satuan.
                      const pack = countPack(p.uoms);
                      const step = pack ? pack.factor : stepFor(p.unit);
                      return (
                        <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                          <div className="w-full min-w-0 sm:w-auto sm:flex-1">
                            <p className="text-sm font-bold text-white">{p.name}</p>
                            <p className="text-xs text-[#c4c4cc]">
                              Sisa {formatPacks(p.onHand, p.unit, p.uoms)}
                              {p.minStock > 0 ? ` · min ${formatPacks(p.minStock, p.unit, p.uoms)}` : ""} · gudang {formatPacks(p.sourceOnHand, p.unit, p.uoms)}
                            </p>
                            {pack && <p className="text-[12px] text-[#9c9ca6]">1 {pack.uom} = {qtyFormat.format(pack.factor)} {p.unit}</p>}
                            {(p.runoutAt || p.portionsLeft != null) && p.status !== "out" ? (
                              <p className="text-[12px] font-semibold text-[#ffd58f]">
                                {p.portionsLeft != null ? `cukup ±${p.portionsLeft} porsi` : ""}
                                {p.portionsLeft != null && p.runoutAt ? " · " : ""}
                                {p.runoutAt ? `habis ±${clockFormat.format(new Date(p.runoutAt))}` : ""}
                              </p>
                            ) : null}
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                          {p.status !== "ok" && (
                            <Badge className={p.status === "out" ? "bg-[#d11a2a] text-white" : "bg-[#f5a742] text-black"}>{p.status === "out" ? "HABIS" : "MENIPIS"}</Badge>
                          )}
                          <div className="flex items-center gap-1">
                            <button type="button" aria-label={`Kurangi ${p.name}`} disabled={!qty} onClick={() => { setDraft(p, null); setQty(p, Math.max(0, qty - step)); }} className="grid size-9 place-items-center rounded-md border border-[#34343c] text-white disabled:opacity-40">
                              <Minus className="size-4" />
                            </button>
                            <input
                              aria-label={`Jumlah ${p.name}`}
                              inputMode="decimal"
                              value={drafts[p.id] ?? (qty ? String(qty).replace(".", ",") : "")}
                              placeholder="0"
                              onChange={(e) => {
                                const raw = e.target.value.replace(/[^\d.,]/g, "");
                                setDraft(p, raw);
                                setQty(p, Number(raw.replace(",", ".")) || 0);
                              }}
                              onBlur={() => setDraft(p, null)}
                              className="h-9 w-20 rounded-md border border-[#34343c] bg-[#1b1b21] text-center text-sm font-bold text-white"
                            />
                            <button type="button" aria-label={`Tambah ${p.name}`} onClick={() => { setDraft(p, null); setQty(p, qty + step); }} className="grid size-9 place-items-center rounded-md border border-[#34343c] text-white">
                              <Plus className="size-4" />
                            </button>
                            <span className="w-8 text-xs text-[#c4c4cc]">{p.unit}</span>
                          </div>
                          </div>
                          {pack && qty > 0 && <span className="w-full text-right text-xs font-semibold text-[#ffd58f]">= {formatPacks(qty, p.unit, p.uoms)}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div className="grid gap-2 border-t border-[#26262d] pt-3">
                {cartLines.length > 0 && (
                  <div className="flex gap-2">
                    <Input
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                      placeholder="Simpan daftar ini sebagai paket (mis. Buka toko Bar)"
                      maxLength={40}
                      className="h-10 min-w-0 flex-1 border-[#34343c] bg-[#1b1b21] text-white placeholder:text-[#8d8d97]"
                    />
                    <Button type="button" variant="outline" disabled={busy || !templateName.trim()} onClick={() => void saveTemplate()} className="h-10 border-[#34343c] bg-transparent text-xs text-white">
                      <BookmarkPlus className="mr-1.5 size-4" /> Simpan paket
                    </Button>
                  </div>
                )}
                <Input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Catatan untuk gudang (opsional)"
                  className="h-10 border-[#34343c] bg-[#1b1b21] text-white placeholder:text-[#8d8d97]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-[#ffd58f]">
                    <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="size-4 accent-[#d11a2a]" />
                    Urgent (dibutuhkan sekarang)
                  </label>
                  <div className="flex gap-2">
                    {cartLines.length > 0 && (
                      <Button type="button" variant="outline" className="h-11 border-[#34343c] bg-transparent text-[#c4c4cc]" onClick={() => setCart({})}>
                        <Trash2 className="mr-1.5 size-4" /> Kosongkan
                      </Button>
                    )}
                    <Button type="button" disabled={busy || !cartLines.length} onClick={() => void submit()} className="h-11 bg-[#d11a2a] px-5 font-bold text-white hover:bg-[#b51623]">
                      {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Send className="mr-1.5 size-4" />}
                      Kirim ke Gudang ({cartLines.length})
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {requests.length === 0 ? (
                <p className="p-4 text-sm text-[#c4c4cc]">Belum ada permintaan bahan.</p>
              ) : (
                <ul className="grid gap-2">
                  {requests.map((r) => (
                    <li key={r.id} className="rounded-md border border-[#26262d] bg-[#16161b] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white">{r.doc}</span>
                        {r.urgent && <Badge className="bg-[#d11a2a] text-white">URGENT</Badge>}
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_LABEL[r.status].cls}`}>{STATUS_LABEL[r.status].label}</span>
                        <span className="ml-auto text-xs text-[#c4c4cc]">{r.requestedByName}</span>
                      </div>
                      {/* M5: jejak status Diminta → Dikirim → Diterima. */}
                      <p className="mt-1 text-xs text-[#c4c4cc]">
                        Diminta {timeFormat.format(new Date(r.createdAt))}
                        {r.sentAt ? ` → Dikirim ${clockFormat.format(new Date(r.sentAt))}` : ""}
                        {r.receivedAt ? ` → Diterima ${clockFormat.format(new Date(r.receivedAt))}` : ""}
                      </p>
                      <ul className="mt-2 grid gap-0.5 text-sm text-[#e4e4ea]">
                        {r.items.map((i) => (
                          <li key={i.id} className="flex justify-between gap-2">
                            <span className="min-w-0">{i.name}</span>
                            <span className="shrink-0 tabular-nums">
                              {r.status === "submitted" || r.status === "cancelled"
                                ? formatPacks(i.qty, i.unit, i.uoms)
                                : `${formatPacks(i.sentQty, i.unit, i.uoms)} dari ${formatPacks(i.qty, i.unit, i.uoms)}${i.shortQty > 0 ? " · kurang, dibelikan" : ""}`}
                              {r.status === "received" && i.receivedQty != null && i.receivedQty < i.sentQty ? ` · diterima ${formatPacks(i.receivedQty, i.unit, i.uoms)}` : ""}
                            </span>
                            {r.status === "sent" && i.sentQty > 0 ? (
                              <label className="flex shrink-0 items-center gap-1 text-xs text-[#c4c4cc]">
                                datang
                                <input
                                  aria-label={`Jumlah ${i.name} yang datang`}
                                  inputMode="decimal"
                                  value={received[i.id] ?? ""}
                                  placeholder={String(i.sentQty).replace(".", ",")}
                                  onChange={(e) => setReceived((cur) => ({ ...cur, [i.id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                                  className="h-8 w-16 rounded border border-[#34343c] bg-[#1b1b21] text-center text-sm text-white"
                                />
                                {i.unit}
                              </label>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {r.status === "submitted" && (
                          <Button type="button" variant="outline" disabled={busy} onClick={() => void act(r.id, "cancel")} className="h-9 border-[#34343c] bg-transparent text-xs text-[#c4c4cc]">
                            Batalkan
                          </Button>
                        )}
                        {r.status === "sent" && (
                          <Button type="button" disabled={busy} onClick={() => void act(r.id, "receive")} className="h-10 bg-[#1f8f5f] px-4 text-sm font-bold text-white hover:bg-[#187a51]">
                            <Check className="mr-1.5 size-4" /> Terima bahan
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
