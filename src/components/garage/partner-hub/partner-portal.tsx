"use client";

// Portal Mitra (Smart Partner Hub, papan 03). Mobile-first; hanya data mitra yang login (partner_id dari sesi).
// Mitra: Buka/Jeda/Tutup, Tersedia/Habis per produk, Terima → Proses → Siap Antar, keuangan & PDF miliknya.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, BellRing, Check, CheckCircle2, ChefHat, CircleX, FileText, Loader2, LogOut, PackageCheck, RefreshCw, Store, Sun, Timer } from "lucide-react";

import { GarageBrandLogo } from "@/components/garage/member-auth/garage-brand-logo";

import { usePartnerAlerts } from "./partner-portal-alerts";

type Ticket = {
  ticketNo: string;
  orderNo: string;
  tableLabel: string | null;
  customerName: string | null;
  status: string;
  createdAt: string;
  readyAt: string | null;
  notes: Record<string, string>;
  items: Array<{ name: string; variant: string; qty: number }>;
};
type Overview = {
  partner: { id: string; name: string; code: string; status: string; operationalStatus: string };
  products: Array<{ linkId: string; name: string; category: string; imageUrl: string | null; active: boolean; available: boolean; variants: Array<{ label: string; sellPrice: number }> }>;
  activeTickets: Ticket[];
  today: { qty: number; gross: number; liability: number; orders: number };
  unpaid: number;
  settlements: Array<{ id: string; settlementNo: string; status: string; liabilityTotal: number; paidAmount: number; periodFrom: string; periodTo: string }>;
  slaWarnMinutes?: number;
};

const OP_STYLE: Record<string, string> = {
  buka: "border-[#22c55e] bg-[#15803d] text-white",
  jeda: "border-[#f59e0b] bg-[#b45309] text-white",
  tutup: "border-[#ff5a66] bg-[#b91c1c] text-white",
};

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;
const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const STATUS_LABEL: Record<string, string> = { queue: "Pesanan baru", accepted: "Diterima", cooking: "Diproses", ready: "Siap Antar" };
const SETTLEMENT_LABEL: Record<string, string> = { draft: "Draft", submitted: "Diajukan", approved: "Disetujui", partially_paid: "Dibayar sebagian", paid: "Lunas", disputed: "Sengketa" };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, ...init });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok) throw Object.assign(new Error(json?.error?.message ?? "Permintaan gagal."), { status: res.status });
  return json?.data as T;
}

function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function PartnerPortal() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const now = useNow();
  const queueNos = useMemo(() => (overview ? overview.activeTickets.filter((t) => t.status === "queue").map((t) => t.ticketNo) : null), [overview]);
  const alerts = usePartnerAlerts(queueNos);
  // Ringkasan yang harus dibuat (belum Siap Antar), dijumlah per produk — enak untuk membuat sekaligus.
  const toMake = useMemo(() => {
    const totals = new Map<string, number>();
    for (const ticket of overview?.activeTickets ?? []) {
      if (ticket.status === "ready") continue;
      for (const item of ticket.items) {
        const key = item.variant && item.variant !== "Regular" ? `${item.name} (${item.variant})` : item.name;
        totals.set(key, (totals.get(key) ?? 0) + item.qty);
      }
    }
    return [...totals.entries()];
  }, [overview]);

  const load = useCallback(async () => {
    try {
      const data = await api<Overview>("/api/partner/me");
      setOverview(data);
      setNeedLogin(false);
    } catch (error) {
      if ((error as { status?: number }).status === 401) setNeedLogin(true);
      else setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Ambil data saat tampil (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Fallback polling (realtime utama = notifikasi; status selalu dicek ulang server saat aksi).
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage({ tone: "ok", text: ok });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#0b0b0d] text-[#e4e4e8]">
        <Loader2 className="size-6 animate-spin" aria-label="Memuat" />
      </main>
    );
  }
  if (needLogin || !overview) return <PartnerLogin onDone={() => void load()} />;

  const p = overview.partner;
  const op = p.operationalStatus;

  return (
    <main className="min-h-dvh bg-[#0b0b0d] pb-10 text-[#f4f4f5]">
      <header className="border-b border-[#2a2a30] bg-[#111114]/95 px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="w-32 shrink-0">
            <GarageBrandLogo sizes="128px" />
          </div>
          <button
            type="button"
            onClick={() => void run("logout", () => alerts.releasePush().then(() => api("/api/partner/auth/logout", { method: "POST" })).then(() => setNeedLogin(true)))}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm text-[#d4d4d8] hover:bg-white/5"
          >
            <LogOut className="size-4" /> Keluar
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-3xl gap-4 px-4 pt-4">
        <section>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff5a66]">Garage OS · Portal Mitra</p>
          <h1 className="mt-1 text-2xl font-black text-white">{p.name}</h1>
          <p className="text-sm text-[#b8b8bf]">Kelola produk, pesanan, dan setoran milik usaha Anda.</p>
        </section>

        {message ? (
          <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${message.tone === "error" ? "border-[#ff5a66]/50 bg-[#3a1015] text-[#ffd0d4]" : "border-[#22c55e]/40 bg-[#0f2a1a] text-[#bbf7d0]"}`}>
            {message.text}
          </p>
        ) : null}

        <section className="rounded-xl border border-[#34343c] bg-[#17171c] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Store className="size-4 text-[#ff5a66]" /> Status layanan
            </p>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${op === "buka" ? "bg-[#14532d] text-[#bbf7d0]" : op === "jeda" ? "bg-[#78350f] text-[#fde68a]" : "bg-[#3f1d22] text-[#fecdd3]"}`}>
              {op === "buka" ? "BUKA" : op === "jeda" ? "JEDA" : "TUTUP"}
            </span>
          </div>
          {p.status !== "aktif" ? <p className="mt-2 text-sm text-[#fde68a]">Mitra sedang dihentikan sementara oleh Owner. Tiket lama tetap bisa diselesaikan.</p> : null}
          <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Status layanan">
            {(["buka", "jeda", "tutup"] as const).map((status) => {
              const selected = op === status;
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={selected}
                  disabled={busy !== null || (status === "buka" && p.status !== "aktif")}
                  onClick={() => {
                    if (selected) return;
                    void run(`op-${status}`, () => api("/api/partner/status", { method: "POST", body: JSON.stringify({ status }) }), `Status layanan: ${status.toUpperCase()}`);
                  }}
                  className={`inline-flex min-h-12 items-center justify-center gap-1.5 rounded-lg border text-sm font-bold transition-colors disabled:opacity-50 ${selected ? OP_STYLE[status] : "border-[#3a3a42] bg-white/[0.04] text-[#e4e4e8] hover:bg-white/10"}`}
                >
                  {selected ? <Check className="size-4" aria-hidden /> : null}
                  {status === "buka" ? "Buka" : status === "jeda" ? "Jeda" : "Tutup"}
                </button>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={alerts.soundOn}
              onClick={alerts.toggleSound}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-semibold ${alerts.soundOn ? "border-[#22c55e]/60 bg-[#0f2a1a] text-[#bbf7d0]" : "border-[#ffd08a]/50 bg-[#2a1d0a] text-[#ffe2b0]"}`}
            >
              {alerts.soundOn ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
              {alerts.soundOn ? "Bunyi pesanan: nyala" : alerts.soundPending ? "Ketuk untuk aktifkan bunyi" : "Nyalakan bunyi pesanan"}
            </button>
            {alerts.awakeSupported ? (
              <button
                type="button"
                aria-pressed={alerts.awakeOn}
                onClick={alerts.toggleAwake}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-semibold ${alerts.awakeOn ? "border-[#22c55e]/60 bg-[#0f2a1a] text-[#bbf7d0]" : "border-[#3a3a42] bg-white/[0.04] text-[#e4e4e8]"}`}
              >
                <Sun className="size-4" aria-hidden />
                {alerts.awakeOn ? "Layar tetap nyala" : "Jaga layar menyala"}
              </button>
            ) : (
              <p className="self-center text-xs text-[#b8b8bf]">Atur layar HP agar tidak cepat mati saat jualan.</p>
            )}
            {alerts.pushState === "on" ? (
              <p className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#22c55e]/60 bg-[#0f2a1a] px-2 text-sm font-semibold text-[#bbf7d0]">
                <BellRing className="size-4" aria-hidden /> Notifikasi HP aktif (juga saat layar terkunci)
              </p>
            ) : alerts.pushState === "off" ? (
              <button
                type="button"
                onClick={() => void alerts.enablePush()}
                className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#ffd08a]/50 bg-[#2a1d0a] px-2 text-sm font-semibold text-[#ffe2b0]"
              >
                <BellRing className="size-4" aria-hidden /> Aktifkan notifikasi saat layar terkunci
              </button>
            ) : (
              <p className="col-span-2 text-xs text-[#b8b8bf]">
                {alerts.pushState === "ios-needs-install"
                  ? "iPhone: buka menu Bagikan → \"Tambahkan ke Layar Utama\", lalu buka Portal Mitra dari ikon itu untuk mengaktifkan notifikasi."
                  : alerts.pushState === "denied"
                    ? "Notifikasi diblokir di browser ini. Izinkan notifikasi untuk situs ini di pengaturan browser."
                    : "Browser ini tidak mendukung notifikasi saat layar terkunci — biarkan Portal Mitra terbuka."}
              </p>
            )}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[#34343c] bg-[#17171c] p-4">
            <p className="text-xs text-[#b8b8bf]">Hak mitra hari ini</p>
            <p className="mt-1 text-xl font-black text-white">{rp(overview.today.liability)}</p>
            <p className="text-xs text-[#b8b8bf]">{overview.today.qty} item siap · {overview.today.orders} order</p>
          </div>
          <div className="rounded-xl border border-[#34343c] bg-[#17171c] p-4">
            <p className="text-xs text-[#b8b8bf]">Belum dibayar Garage</p>
            <p className="mt-1 text-xl font-black text-[#ffd08a]">{rp(overview.unpaid)}</p>
            <p className="text-xs text-[#b8b8bf]">dari settlement disetujui</p>
          </div>
        </section>

        <section className="rounded-xl border border-[#34343c] bg-[#17171c] p-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-white">
            <ChefHat className="size-4 text-[#ff5a66]" /> Pesanan masuk
            <span className="ml-auto rounded-full bg-[#d11a2a] px-2 py-0.5 text-xs">{overview.activeTickets.length}</span>
          </h2>
          {toMake.length ? (
            <p className="mt-2 rounded-lg bg-white/[0.06] px-3 py-2 text-sm text-[#f4f4f5]">
              <span className="font-semibold text-[#ffd08a]">Perlu dibuat:</span> {toMake.map(([name, qty]) => `${qty}× ${name}`).join(" · ")}
            </p>
          ) : null}
          {overview.activeTickets.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-[#3a3a42] p-4 text-center text-sm text-[#b8b8bf]">Belum ada pesanan aktif.</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {overview.activeTickets.map((ticket) => {
                const waitMin = Math.max(0, Math.floor((now - new Date(ticket.createdAt).getTime()) / 60_000));
                return (
                  <li key={ticket.ticketNo} className={`rounded-lg border bg-black/20 p-3 ${ticket.status === "queue" ? "border-[#ff5a66]/60" : "border-[#3a3a42]"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-white">
                        {ticket.orderNo} <span className="ml-1 rounded border border-[#4a4a54] px-1.5 py-0.5 text-xs text-[#e4e4e8]">{ticket.tableLabel ?? "Take away"}</span>
                      </p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${waitMin >= (overview.slaWarnMinutes ?? 2) && ticket.status === "queue" ? "bg-[#7f1d1d] text-[#fecaca]" : "bg-white/10 text-[#e4e4e8]"}`}>
                        <Timer className="size-3" /> {STATUS_LABEL[ticket.status] ?? ticket.status} · {waitMin} mnt
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#b8b8bf]">{ticket.customerName ?? "Tanpa nama"} · masuk {time(ticket.createdAt)}</p>
                    <ul className="mt-2 grid gap-1 text-sm text-[#f4f4f5]">
                      {ticket.items.map((item, index) => (
                        <li key={index}>
                          <b>{item.qty}×</b> {item.name}
                          {item.variant && item.variant !== "Regular" ? ` (${item.variant})` : ""}
                        </li>
                      ))}
                    </ul>
                    {Object.values(ticket.notes ?? {}).length ? <p className="mt-1 text-xs text-[#ffd08a]">Catatan: {Object.values(ticket.notes).join(" · ")}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ticket.status === "queue" ? (
                        <>
                          <ActionButton busy={busy === `${ticket.ticketNo}-accept`} onClick={() => void run(`${ticket.ticketNo}-accept`, () => api(`/api/partner/tickets/${ticket.ticketNo}/action`, { method: "POST", body: JSON.stringify({ action: "accept" }) }))} primary>
                            <CheckCircle2 className="size-4" /> Terima
                          </ActionButton>
                          <ActionButton
                            busy={busy === `${ticket.ticketNo}-reject`}
                            onClick={() => {
                              const reason = window.prompt("Alasan menolak pesanan ini? (mis. produk habis)");
                              if (reason?.trim()) void run(`${ticket.ticketNo}-reject`, () => api(`/api/partner/tickets/${ticket.ticketNo}/action`, { method: "POST", body: JSON.stringify({ action: "reject", reason }) }), "Pesanan ditolak, kasir diberi tahu.");
                            }}
                          >
                            <CircleX className="size-4" /> Tolak
                          </ActionButton>
                        </>
                      ) : null}
                      {ticket.status === "accepted" ? (
                        <ActionButton busy={busy === `${ticket.ticketNo}-start`} onClick={() => void run(`${ticket.ticketNo}-start`, () => api(`/api/partner/tickets/${ticket.ticketNo}/action`, { method: "POST", body: JSON.stringify({ action: "start" }) }))} primary>
                          <ChefHat className="size-4" /> Mulai Proses
                        </ActionButton>
                      ) : null}
                      {ticket.status === "accepted" || ticket.status === "cooking" ? (
                        <ActionButton busy={busy === `${ticket.ticketNo}-ready`} onClick={() => void run(`${ticket.ticketNo}-ready`, () => api(`/api/partner/tickets/${ticket.ticketNo}/action`, { method: "POST", body: JSON.stringify({ action: "ready" }) }), "Siap Antar — waiter diberi tahu.")} primary={ticket.status === "cooking"}>
                          <PackageCheck className="size-4" /> Siap Antar
                        </ActionButton>
                      ) : null}
                      {ticket.status === "ready" ? <p className="text-sm text-[#bbf7d0]">Menunggu waiter mengambil.</p> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-[#34343c] bg-[#17171c] p-4">
          <h2 className="text-base font-bold text-white">Ketersediaan produk</h2>
          <p className="text-xs text-[#b8b8bf]">Tanpa hitung stok — tandai Habis bila tidak bisa dibuat. Berlaku di kasir, waiter & menu digital.</p>
          <ul className="mt-3 grid gap-2">
            {overview.products.filter((product) => product.active).map((product) => (
              <li key={product.linkId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#3a3a42] bg-black/20 p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white">{product.name}</p>
                  <p className="text-xs text-[#b8b8bf]">
                    {product.category} · {product.variants.map((v) => rp(v.sellPrice)).join(" / ")}
                  </p>
                </div>
                <div className="flex gap-2" role="group" aria-label={`Ketersediaan ${product.name}`}>
                  <button
                    type="button"
                    aria-pressed={product.available}
                    disabled={busy !== null || product.available}
                    onClick={() => void run(`av-${product.linkId}`, () => api(`/api/partner/products/${product.linkId}/availability`, { method: "PATCH", body: JSON.stringify({ available: true }) }))}
                    className={`min-h-11 rounded-lg border px-3 text-sm font-bold ${product.available ? "border-[#22c55e] bg-[#14532d] text-[#bbf7d0]" : "border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10"}`}
                  >
                    Tersedia
                  </button>
                  <button
                    type="button"
                    aria-pressed={!product.available}
                    disabled={busy !== null || !product.available}
                    onClick={() => void run(`av-${product.linkId}`, () => api(`/api/partner/products/${product.linkId}/availability`, { method: "PATCH", body: JSON.stringify({ available: false }) }))}
                    className={`min-h-11 rounded-lg border px-3 text-sm font-bold ${!product.available ? "border-[#ff5a66] bg-[#3f1d22] text-[#fecdd3]" : "border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10"}`}
                  >
                    Habis
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <PartnerFinance settlements={overview.settlements} />
      </div>
    </main>
  );
}

function ActionButton({ children, onClick, busy, primary }: { children: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors disabled:opacity-60 ${primary ? "bg-[#d11a2a] text-white hover:bg-[#e3263a]" : "border border-[#3a3a42] text-[#e4e4e8] hover:bg-white/10"}`}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function PartnerFinance({ settlements }: { settlements: Overview["settlements"] }) {
  const [history, setHistory] = useState<Ticket[] | null>(null);
  useEffect(() => {
    void api<Ticket[]>("/api/partner/tickets?scope=history").then(setHistory).catch(() => setHistory([]));
  }, []);
  const dateFmt = useMemo(() => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short" }), []);
  return (
    <>
      <section className="rounded-xl border border-[#34343c] bg-[#17171c] p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-white">
          <FileText className="size-4 text-[#ff5a66]" /> Setoran & laporan
        </h2>
        {settlements.length === 0 ? (
          <p className="mt-3 text-sm text-[#b8b8bf]">Belum ada settlement. Rekap dibuat Garage setelah tutup operasional.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {settlements.map((s) => {
              const final = ["approved", "partially_paid", "paid"].includes(s.status);
              return (
                <li key={s.id} className="rounded-lg border border-[#3a3a42] bg-black/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-white">{s.settlementNo}</p>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-[#e4e4e8]">{SETTLEMENT_LABEL[s.status] ?? s.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#b8b8bf]">
                    {dateFmt.format(new Date(s.periodFrom))} – {dateFmt.format(new Date(new Date(s.periodTo).getTime() - 1))} · Setoran {rp(s.liabilityTotal)} · Dibayar {rp(s.paidAmount)} · Sisa {rp(s.liabilityTotal - s.paidAmount)}
                  </p>
                  {final ? (
                    <a href={`/api/partner/settlements/${s.id}/pdf`} target="_blank" rel="noopener" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
                      <FileText className="size-4" /> Lihat PDF resmi
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-[#ffd08a]">PDF resmi tersedia setelah disetujui Owner.</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-[#34343c] bg-[#17171c] p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-white">
          <RefreshCw className="size-4 text-[#ff5a66]" /> Riwayat terbaru
        </h2>
        {history === null ? (
          <p className="mt-3 text-sm text-[#b8b8bf]">Memuat…</p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-sm text-[#b8b8bf]">Belum ada riwayat.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {history.slice(0, 10).map((ticket) => (
              <li key={ticket.ticketNo} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#3a3a42] bg-black/20 px-3 py-2 text-sm">
                <span className="text-white">
                  {ticket.orderNo} · {ticket.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}
                </span>
                <span className="text-xs text-[#b8b8bf]">{ticket.status === "delivered" ? "Diantar" : ticket.status === "rejected" ? "Ditolak" : ticket.status === "cancelled" ? "Dibatalkan" : ticket.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function PartnerLogin({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/partner/auth/login", { method: "POST", body: JSON.stringify({ phone, pin }) });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b0b0d] px-4 py-10 text-[#f4f4f5]">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-[#34343c] bg-[#17171c] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <div className="mx-auto w-48">
          <GarageBrandLogo sizes="192px" />
        </div>
        <h1 className="mt-5 text-center text-xl font-black text-white">Portal Mitra</h1>
        <p className="mt-1 text-center text-sm text-[#b8b8bf]">Khusus mitra resmi Garage Coffee.</p>
        <label className="mt-5 block text-sm font-semibold text-[#e4e4e8]" htmlFor="partner-phone">
          Nomor HP
        </label>
        <input id="partner-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" required className="mt-1 h-12 w-full rounded-lg border border-[#3a3a42] bg-black/30 px-3 text-base text-white outline-none focus-visible:border-[#ff5a66] focus-visible:ring-2 focus-visible:ring-[#ff5a66]/40" />
        <label className="mt-4 block text-sm font-semibold text-[#e4e4e8]" htmlFor="partner-pin">
          PIN (6 angka)
        </label>
        <input id="partner-pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" autoComplete="current-password" required className="mt-1 h-12 w-full rounded-lg border border-[#3a3a42] bg-black/30 px-3 text-base tracking-[0.3em] text-white outline-none focus-visible:border-[#ff5a66] focus-visible:ring-2 focus-visible:ring-[#ff5a66]/40" />
        {error ? (
          <p role="alert" className="mt-3 rounded-lg border border-[#ff5a66]/50 bg-[#3a1015] px-3 py-2 text-sm text-[#ffd0d4]">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy || pin.length !== 6} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#d11a2a] text-base font-bold text-white hover:bg-[#e3263a] disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Masuk
        </button>
        <p className="mt-4 text-center text-xs text-[#b8b8bf]">Lupa PIN? Hubungi Owner Garage Coffee untuk mengatur ulang.</p>
      </form>
    </main>
  );
}
