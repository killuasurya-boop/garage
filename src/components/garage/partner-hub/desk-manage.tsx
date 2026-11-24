"use client";

// Kelola Mitra (Owner/Manajer, papan 05): registrasi, status siklus hidup, rekening, akun login, produk & harga.
// Aksi Owner-only (setujui/aktifkan, verifikasi rekening, setujui produk, ubah harga) dicek ulang di server.

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Plus, ShieldCheck, UserPlus } from "lucide-react";

import { PartnerHealthBoard, PartnerPerformanceStaff, PriceProposalQueue } from "./desk-growth";
import { api, Btn, Card, Chip, Field, inputCls, Notice, rp } from "./desk-shared";
import { SubmissionQueue, type SubmissionQueue as SubmissionQueueData, type SubmissionItem } from "./partner-submission-queue";
import { matchesPartnerFilter, PartnerStatusControl, PartnerStatusFilter, type PartnerFilter } from "./partner-status-control";

type Partner = {
  id: string;
  code: string;
  name: string;
  picName: string | null;
  phone: string | null;
  address: string | null;
  productKind: string | null;
  handoverPoint: string | null;
  status: string;
  operationalStatus: string;
  terms: string | null;
  payoutSchedule: string | null;
  lastOrderByDay: Record<string, string | null>;
  productCount: number;
  /** Produk yang diajukan mitra dan menunggu keputusan Owner. */
  pendingSubmissions?: number;
  availableCount: number;
  soldOutCount: number;
  bank: Array<{ id: string; bankName: string; accountName: string; accountMasked: string; status: string; accountNumber?: string }>;
  accounts: Array<{ id: string; phone: string; displayName: string; status: string }>;
  readiness?: { total: number; done: number; missing: string[] };
  activeOrders?: number;
  productActiveCount?: number;
};
type Product = {
  linkId: string;
  code: string;
  name: string;
  category: string;
  imageUrl: string | null;
  description: string | null;
  showInDigitalMenu: boolean;
  promotedOnWebsite?: boolean;
  active: boolean;
  available: boolean;
  /** Produk mandiri mitra: pending | revision | approved (NULL = didaftarkan staf). */
  submissionStatus?: string | null;
  submissionNote?: string | null;
  reviewNote?: string | null;
  variants: Array<{ variantId: string; label: string; sellPrice: number; unitCost?: number }>;
};

const STATUS_LABEL: Record<string, string> = { draft: "Draft", verifikasi: "Verifikasi", disetujui: "Disetujui", aktif: "Aktif", dibekukan: "Dibekukan", nonaktif: "Nonaktif" };
const NEXT: Record<string, Array<{ to: string; label: string; owner?: boolean }>> = {
  draft: [{ to: "verifikasi", label: "Ajukan verifikasi" }],
  verifikasi: [{ to: "disetujui", label: "Setujui (Owner)", owner: true }, { to: "draft", label: "Kembalikan ke draft" }],
  disetujui: [{ to: "aktif", label: "Aktifkan (Owner)", owner: true }],
  aktif: [{ to: "dibekukan", label: "Bekukan sementara" }, { to: "nonaktif", label: "Nonaktifkan mitra (Owner)", owner: true }],
  dibekukan: [{ to: "aktif", label: "Aktifkan lagi (Owner)", owner: true }, { to: "nonaktif", label: "Nonaktifkan mitra (Owner)", owner: true }],
  nonaktif: [{ to: "draft", label: "Buka ulang (draft)" }],
};
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function DeskManage({ role }: { role: string }) {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [healthKey, setHealthKey] = useState(0);
  const [filter, setFilter] = useState<PartnerFilter>("all");
  const [submissions, setSubmissions] = useState<SubmissionQueueData | null>(null);
  // Produk yang disorot setelah "Periksa" (dari Dashboard / antrean pengajuan).
  const [focusProduct, setFocusProduct] = useState<string | null>(null);
  const isOwner = role === "Owner";

  const load = useCallback(async () => {
    try {
      const [list, queue] = await Promise.all([api<Partner[]>("/api/partners"), api<SubmissionQueueData>("/api/partners/product-submissions").catch(() => null)]);
      setPartners(list);
      setSubmissions(queue);
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
      setPartners([]);
    }
  }, []);
  useEffect(() => {
    // Ambil data saat tampil (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // Tautan dari Dashboard: ?partner=<id>&product=<linkId> → buka mitra & sorot produknya.
    const params = new URLSearchParams(window.location.search);
    const partnerParam = params.get("partner");
    if (partnerParam) {
      setOpenId(partnerParam);
      setFilter("all");
      setFocusProduct(params.get("product"));
    }
  }, [load]);
  const review = (item: SubmissionItem) => {
    setFilter("all");
    setOpenId(item.partnerId);
    setFocusProduct(item.linkId);
  };

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: "ok", text: ok });
      await load();
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4">
      <Notice message={message} />
      {submissions && (submissions.pending || submissions.revision) ? <SubmissionQueue queue={submissions} variant="desk" onReview={review} /> : null}
      <PartnerHealthBoard refreshKey={healthKey} />
      <PriceProposalQueue isOwner={isOwner} onDecided={() => setHealthKey((k) => k + 1)} />
      {isOwner ? <ImportCatalogCard busy={busy === "import"} onImport={() => void run("import", () => api("/api/partners/import-catalog", { method: "POST" }), "Katalog awal diimpor: mitra Draft + produk nonaktif. Lengkapi data & setujui produk satu per satu.")} /> : null}
      <CreatePartner busy={busy === "create"} onCreate={(body) => void run("create", () => api("/api/partners", { method: "POST", body: JSON.stringify(body) }), "Mitra terdaftar sebagai Draft.")} />
      {partners === null ? (
        <Card>
          <p className="text-sm text-[#b8b8bf]">Memuat mitra…</p>
        </Card>
      ) : partners.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-[#b8b8bf]">Belum ada mitra terdaftar.</p>
        </Card>
      ) : (
        <>
        <PartnerStatusFilter partners={partners} value={filter} onChange={setFilter} />
        {partners.filter((p) => matchesPartnerFilter(p.status, filter)).length === 0 ? (
          <Card>
            <p className="text-center text-sm text-[#b8b8bf]">Tidak ada mitra dengan status ini.</p>
          </Card>
        ) : null}
        {partners.filter((p) => matchesPartnerFilter(p.status, filter)).map((partner) => (
          <Card key={partner.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white">
                  {partner.name} <span className="text-xs text-[#b8b8bf]">#{partner.code}</span>
                </h3>
                <p className="break-words text-xs text-[#b8b8bf]">
                  {partner.productKind ?? "-"} · {partner.phone ?? "tanpa WA"}
                </p>
                <p className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Kesiapan mitra">
                  {partner.pendingSubmissions ? <Chip tone="amber">{partner.pendingSubmissions} pengajuan produk menunggu</Chip> : null}
                  <Chip tone={partner.productCount ? "default" : "amber"}>
                    {partner.productCount ? `${partner.productCount} produk · ${partner.availableCount} tersedia · ${partner.soldOutCount} habis` : "Belum ada produk"}
                  </Chip>
                  <Chip tone={partner.bank.some((b) => b.status === "verified") ? "green" : "amber"}>
                    {partner.bank.some((b) => b.status === "verified") ? "Rekening terverifikasi" : partner.bank.length ? "Rekening belum diverifikasi" : "Belum ada rekening"}
                  </Chip>
                  <Chip tone={partner.accounts.some((a) => a.status === "active") ? "green" : "amber"}>
                    {partner.accounts.some((a) => a.status === "active") ? `Akun portal ${partner.accounts.filter((a) => a.status === "active").length}` : "Belum ada akun portal"}
                  </Chip>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {partner.readiness && ["draft", "verifikasi", "disetujui"].includes(partner.status) ? (
                  <Chip tone={partner.readiness.done === partner.readiness.total ? "green" : "amber"}>
                    Siap aktif {partner.readiness.done}/{partner.readiness.total}
                  </Chip>
                ) : null}
                <PartnerStatusControl partner={partner} role={role} busy={busy} run={run} onOpenDetail={() => setOpenId(partner.id)} />
                <Chip tone={partner.operationalStatus === "buka" ? "green" : partner.operationalStatus === "jeda" ? "amber" : "red"}>{partner.operationalStatus.toUpperCase()}</Chip>
                <Btn onClick={() => setOpenId(openId === partner.id ? null : partner.id)}>{openId === partner.id ? "Tutup" : "Kelola"}</Btn>
              </div>
            </div>
            {openId === partner.id ? <PartnerDetail partner={partner} allPartners={partners} isOwner={isOwner} busy={busy} run={run} focusProduct={focusProduct} /> : null}
          </Card>
        ))}
        </>
      )}
    </div>
  );
}

function CreatePartner({ onCreate, busy }: { onCreate: (body: Record<string, unknown>) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", picName: "", phone: "", productKind: "", handoverPoint: "" });
  if (!open) {
    return (
      <div>
        <Btn tone="primary" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Daftarkan mitra
        </Btn>
      </div>
    );
  }
  return (
    <Card>
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({ ...form, code: form.code.toUpperCase() });
        }}
      >
        <Field label="Kode mitra">
          <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="PAU" className={inputCls} />
        </Field>
        <Field label="Nama usaha">
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es Krim Pokat Au" className={inputCls} />
        </Field>
        <Field label="Penanggung jawab">
          <input value={form.picName} onChange={(e) => setForm({ ...form, picName: e.target.value })} className={inputCls} />
        </Field>
        <Field label="WhatsApp">
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" className={inputCls} />
        </Field>
        <Field label="Jenis produk">
          <input value={form.productKind} onChange={(e) => setForm({ ...form, productKind: e.target.value })} placeholder="Es krim · Dessert" className={inputCls} />
        </Field>
        <Field label="Titik serah-terima">
          <input value={form.handoverPoint} onChange={(e) => setForm({ ...form, handoverPoint: e.target.value })} placeholder="Meja mitra lantai 1" className={inputCls} />
        </Field>
        <div className="flex gap-2 sm:col-span-3">
          <Btn type="submit" tone="primary" busy={busy}>
            Simpan sebagai Draft
          </Btn>
          <Btn onClick={() => setOpen(false)}>Batal</Btn>
        </div>
      </form>
    </Card>
  );
}

function PartnerDetail({
  partner,
  allPartners,
  isOwner,
  busy,
  run,
  focusProduct,
}: {
  partner: Partner;
  allPartners: Partner[];
  isOwner: boolean;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;
  focusProduct?: string | null;
}) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const focused = useRef<string | null>(null);
  const [terms, setTerms] = useState(partner.terms ?? "");
  const [profile, setProfile] = useState({
    name: partner.name,
    picName: partner.picName ?? "",
    phone: partner.phone ?? "",
    handoverPoint: partner.handoverPoint ?? "",
    address: partner.address ?? "",
  });
  const [lastOrder, setLastOrder] = useState<Record<string, string>>(() => Object.fromEntries(DAYS.map((_, i) => [String(i), partner.lastOrderByDay?.[String(i)] ?? ""])));
  const [bank, setBank] = useState({ bankName: "", accountName: "", accountNumber: "" });
  const [account, setAccount] = useState({ phone: partner.phone ?? "", displayName: partner.picName ?? "", pin: "" });
  const [product, setProduct] = useState({ code: "", name: "", category: partner.productKind ?? "", unitCost: "", sellPrice: "" });
  const [editing, setEditing] = useState<string | null>(null);
  const [revising, setRevising] = useState<string | null>(null);
  const [pinReset, setPinReset] = useState<{ id: string; pin: string } | null>(null);
  const [hideInactive, setHideInactive] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ to: string; label: string } | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [productQuery, setProductQuery] = useState("");

  const loadProducts = useCallback(async () => setProducts(await api<Product[]>(`/api/partners/${partner.id}/products`)), [partner.id]);
  useEffect(() => {
    // Ambil data saat tampil (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProducts();
  }, [loadProducts]);
  const runP = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    await run(key, fn, ok);
    await loadProducts();
  };
  useEffect(() => {
    // Gulir ke produk yang diminta (sekali per tautan) setelah daftar produk termuat.
    if (!products || !focusProduct || focused.current === focusProduct) return;
    const el = document.getElementById(`partner-product-${focusProduct}`);
    if (!el) return;
    focused.current = focusProduct;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }, [products, focusProduct]);
  const query = productQuery.trim().toLowerCase();
  const shownProducts = (products ?? []).filter((p) => (!hideInactive || p.active) && (!query || `${p.code} ${p.name}`.toLowerCase().includes(query)));
  const moveTargets = allPartners.filter((x) => x.id !== partner.id && x.status !== "nonaktif");

  return (
    <div className="mt-4 grid items-start gap-4 border-t border-[#2a2a30] pt-4 lg:grid-cols-2">
      <div className="grid content-start gap-3">
        <ActivationChecklist partner={partner} products={products} isOwner={isOwner} busy={busy} run={runP} />
        <h4 className="text-sm font-bold text-white">Status & kesepakatan</h4>
        <div className="flex flex-wrap gap-2">
          {(NEXT[partner.status] ?? [])
            .filter((n) => !n.owner || isOwner)
            .map((n) => (
              <Btn
                key={n.to}
                tone={n.owner ? "success" : "ghost"}
                busy={busy === `status-${partner.id}-${n.to}`}
                onClick={() => {
                  setStatusReason("");
                  setStatusTarget(statusTarget?.to === n.to ? null : n);
                }}
              >
                {n.label}
              </Btn>
            ))}
          {(["buka", "jeda", "tutup"] as const).map((status) => (
            <Btn key={status} disabled={partner.operationalStatus === status} busy={busy === `op-${partner.id}-${status}`} onClick={() => void run(`op-${partner.id}-${status}`, () => api(`/api/partners/${partner.id}/operational`, { method: "POST", body: JSON.stringify({ status }) }), `Layanan: ${status.toUpperCase()}`)}>
              {status === "buka" ? "Buka" : status === "jeda" ? "Jeda" : "Tutup"}
            </Btn>
          ))}
        </div>
        {statusTarget ? (
          <form
            className="grid gap-2 rounded-lg border border-[#f5a742]/40 bg-[#2a1d0a]/40 p-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const target = statusTarget;
              const reason = statusReason.trim();
              if (!reason) return;
              void run(`status-${partner.id}-${target.to}`, () => api(`/api/partners/${partner.id}/status`, { method: "POST", body: JSON.stringify({ to: target.to, reason }) }), `Status mitra: ${STATUS_LABEL[target.to]}`).then(() => setStatusTarget(null));
            }}
          >
            <Field label={`Alasan: ${statusTarget.label}`}>
              <input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} required maxLength={300} placeholder="mis. data sudah lengkap…" className={inputCls} />
            </Field>
            <Btn type="submit" tone="primary" busy={busy === `status-${partner.id}-${statusTarget.to}`} disabled={!statusReason.trim()}>
              Simpan status
            </Btn>
            <Btn onClick={() => setStatusTarget(null)}>Batal</Btn>
          </form>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Nama mitra">
            <input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Nama PIC">
            <input value={profile.picName} onChange={(e) => setProfile({ ...profile, picName: e.target.value })} className={inputCls} />
          </Field>
          <Field label="WhatsApp mitra (wajib sebelum aktif)">
            <input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} inputMode="tel" placeholder="0812xxxxxxx" className={inputCls} />
          </Field>
          <Field label="Titik serah-terima">
            <input value={profile.handoverPoint} onChange={(e) => setProfile({ ...profile, handoverPoint: e.target.value })} placeholder="mis. meja pass dekat kasir" className={inputCls} />
          </Field>
        </div>
        <Field label="Alamat mitra">
          <input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Kesepakatan harga, pembatalan & serah-terima (wajib sebelum aktif)">
          <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className={`${inputCls} h-auto py-2`} />
        </Field>
        <div>
          <p className="text-sm font-semibold text-[#e4e4e8]">Last order (WIB, kosong = tanpa batas)</p>
          <p className="text-xs text-[#b8b8bf]">
            Jam terakhir pesanan diterima. Malam hari pilih PM: 21:45 = 09:45 PM. 11:00 AM = jam 11 siang, 12:00 AM = tengah malam (pesanan hari itu ditolak).
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DAYS.map((day, i) => (
              <label key={day} className="grid min-w-0 gap-1 text-xs text-[#b8b8bf]">
                {day}
                <input type="time" value={lastOrder[String(i)]} onChange={(e) => setLastOrder({ ...lastOrder, [String(i)]: e.target.value })} className={`${inputCls} h-10 min-w-0 px-2`} />
                <span className={lastOrderWarn(lastOrder[String(i)]) ? "font-semibold text-amber-300" : ""}>{lastOrderText(lastOrder[String(i)])}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Btn
            tone="primary"
            busy={busy === `profile-${partner.id}`}
            onClick={() =>
              void run(
                `profile-${partner.id}`,
                () => api(`/api/partners/${partner.id}`, { method: "PATCH", body: JSON.stringify({ ...profile, picName: profile.picName || null, phone: profile.phone || null, handoverPoint: profile.handoverPoint || null, address: profile.address || null, terms, lastOrderByDay: Object.fromEntries(Object.entries(lastOrder).map(([k, v]) => [k, v || null])) }) }),
                "Data mitra disimpan.",
              )
            }
          >
            Simpan data mitra, kesepakatan & jam
          </Btn>
        </div>

        <h4 className="mt-2 text-sm font-bold text-white">Rekening penerima</h4>
        {partner.bank.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a2a30] px-3 py-2 text-sm">
            <span className="text-[#f4f4f5]">
              {b.bankName} · {b.accountName} · {b.accountNumber ?? b.accountMasked}
            </span>
            <span className="flex items-center gap-2">
              <Chip tone={b.status === "verified" ? "green" : "amber"}>{b.status === "verified" ? "Terverifikasi" : "Menunggu verifikasi"}</Chip>
              {isOwner && b.status === "pending" ? (
                <Btn tone="success" busy={busy === `bank-${b.id}`} onClick={() => void run(`bank-${b.id}`, () => api(`/api/partners/bank-accounts/${b.id}/verify`, { method: "POST" }), "Rekening diverifikasi.")}>
                  <ShieldCheck className="size-4" /> Verifikasi
                </Btn>
              ) : null}
            </span>
          </div>
        ))}
        <form
          className="grid gap-2 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(`addbank-${partner.id}`, () => api(`/api/partners/${partner.id}/bank-accounts`, { method: "POST", body: JSON.stringify(bank) }), "Rekening dicatat — menunggu verifikasi Owner.").then(() => setBank({ bankName: "", accountName: "", accountNumber: "" }));
          }}
        >
          <input required placeholder="Bank" value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} className={inputCls} aria-label="Nama bank" />
          <input required placeholder="Atas nama" value={bank.accountName} onChange={(e) => setBank({ ...bank, accountName: e.target.value })} className={inputCls} aria-label="Atas nama" />
          <input required placeholder="No. rekening" inputMode="numeric" value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} className={inputCls} aria-label="Nomor rekening" />
          <Btn type="submit" busy={busy === `addbank-${partner.id}`}>
            Tambah rekening
          </Btn>
        </form>

        <h4 className="mt-2 text-sm font-bold text-white">Akun Portal Mitra</h4>
        {partner.accounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#2a2a30] px-3 py-2 text-sm">
            <span className="min-w-0 text-[#f4f4f5]">
              {a.displayName} · {a.phone || "tanpa nomor HP"}
              {!/^0\d{8,14}$/.test(a.phone) ? (
                <span className="block text-xs font-semibold text-amber-300">Nomor login tidak valid: mitra tidak bisa login. Nonaktifkan akun ini lalu buat ulang dengan nomor HP.</span>
              ) : null}
            </span>
            <span className="flex gap-2">
              <Chip tone={a.status === "active" ? "green" : "red"}>{a.status === "active" ? "Aktif" : "Nonaktif"}</Chip>
              <Btn onClick={() => setPinReset(pinReset?.id === a.id ? null : { id: a.id, pin: "" })}>Reset PIN</Btn>
              <Btn tone="danger" busy={busy === `accs-${a.id}`} onClick={() => void run(`accs-${a.id}`, () => api(`/api/partners/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: a.status === "active" ? "disabled" : "active" }) }), "Status akun diubah.")}>
                {a.status === "active" ? "Nonaktifkan" : "Aktifkan"}
              </Btn>
            </span>
            {pinReset?.id === a.id ? (
              <form
                className="flex w-full flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(`acc-${a.id}`, () => api(`/api/partners/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ pin: pinReset.pin }) }), "PIN mitra direset. Berikan PIN langsung ke mitra; HP lama otomatis keluar.").then(() => setPinReset(null));
                }}
              >
                <input
                  value={pinReset.pin}
                  onChange={(e) => setPinReset({ id: a.id, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                  inputMode="numeric"
                  placeholder="PIN baru 6 angka"
                  aria-label="PIN baru mitra"
                  className={`${inputCls} max-w-[200px]`}
                />
                <Btn type="submit" tone="primary" busy={busy === `acc-${a.id}`} disabled={pinReset.pin.length !== 6}>
                  Simpan PIN
                </Btn>
                <span className="text-xs text-[#b8b8bf]">Minta mitra mengganti PIN sendiri di Portal setelah masuk.</span>
              </form>
            ) : null}
          </div>
        ))}
        <form
          className="grid gap-2 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(`addacc-${partner.id}`, () => api(`/api/partners/${partner.id}/accounts`, { method: "POST", body: JSON.stringify(account) }), "Akun mitra dibuat. Berikan PIN langsung ke mitra.").then(() => setAccount({ ...account, pin: "" }));
          }}
        >
          <Field label="No. HP login">
            <input required placeholder="0812…" inputMode="tel" autoComplete="off" value={account.phone} onChange={(e) => setAccount({ ...account, phone: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Nama akun">
            <input required placeholder="mis. Bu Cidut…" autoComplete="off" value={account.displayName} onChange={(e) => setAccount({ ...account, displayName: e.target.value })} className={inputCls} />
          </Field>
          <Field label="PIN awal (6 angka)">
            <input required placeholder="6 angka…" inputMode="numeric" type="password" autoComplete="new-password" value={account.pin} onChange={(e) => setAccount({ ...account, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} className={inputCls} />
          </Field>
          <div className="flex items-end">
            <Btn type="submit" busy={busy === `addacc-${partner.id}`} disabled={account.pin.length !== 6}>
              <UserPlus className="size-4" aria-hidden /> Buat akun
            </Btn>
          </div>
          <p className="text-xs text-[#b8b8bf] sm:col-span-4">Mitra akan diminta membuat PIN sendiri saat pertama masuk.</p>
        </form>
      </div>

      <div className="grid content-start gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-white">Produk mitra & harga</h4>
          {products?.some((p) => !p.active) && products.some((p) => p.active) ? (
            <label className="flex min-h-11 items-center gap-2 text-xs text-[#d4d4d8]">
              <input type="checkbox" checked={hideInactive} onChange={(e) => setHideInactive(e.target.checked)} className="size-4" />
              Sembunyikan produk nonaktif ({products.filter((p) => !p.active).length})
            </label>
          ) : null}
        </div>
        {products && products.length > 6 ? (
          <Field label="Cari produk">
            <input type="search" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder="nama atau kode…" autoComplete="off" className={inputCls} />
          </Field>
        ) : null}
        {isOwner && products !== null ? <MoveAllProducts partner={partner} products={products} targets={moveTargets} busy={busy} runP={runP} /> : null}
        {products === null ? (
          <p className="text-sm text-[#b8b8bf]">Memuat…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-[#b8b8bf]">Belum ada produk.</p>
        ) : (
          <ul className="grid gap-2">
            {shownProducts.length === 0 ? <li className="text-sm text-[#b8b8bf]">Tidak ada produk yang cocok dengan pencarian.</li> : null}
            {shownProducts.map((p) => (
              <li
                key={p.linkId}
                id={`partner-product-${p.linkId}`}
                tabIndex={-1}
                className={`scroll-mt-24 rounded-lg border p-3 text-sm outline-none ${focusProduct === p.linkId ? "border-[#f5a742] bg-[#f5a742]/[0.06] ring-2 ring-[#f5a742]/50" : "border-[#2a2a30]"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">
                    {p.code} · {p.name}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {!p.active && p.submissionStatus === "pending" ? <Chip tone="amber">Diajukan mitra</Chip> : null}
                    {!p.active && p.submissionStatus === "revision" ? <Chip tone="red">Dikembalikan ke mitra</Chip> : null}
                    <Chip tone={p.active ? "green" : "amber"}>{p.active ? "Disetujui" : "Menunggu Owner"}</Chip>
                    <Chip tone={p.available ? "green" : "red"}>{p.available ? "Tersedia" : "Habis"}</Chip>
                  </span>
                </div>
                {!p.active && (p.submissionStatus === "pending" || p.submissionStatus === "revision") ? (
                  <div className="mt-2 grid gap-1 rounded-lg border border-[#ffd08a]/30 bg-[#2a1d0a]/50 px-3 py-2 text-xs text-[#ffe2b0]">
                    <p>
                      Diajukan sendiri oleh mitra dari Portal Mitra. Periksa nama, harga, dan foto. Harga jual masih usulan — ubah lewat Pengaturan sebelum menyetujui bila perlu.
                    </p>
                    {p.description ? <p className="text-[#f4f4f5]">Deskripsi: {p.description}</p> : null}
                    {p.submissionNote ? <p className="text-[#f4f4f5]">Catatan mitra: {p.submissionNote}</p> : null}
                    {p.submissionStatus === "revision" && p.reviewNote ? <p className="text-[#ffd0d4]">Diminta perbaikan: {p.reviewNote} — menunggu mitra mengirim ulang.</p> : null}
                  </div>
                ) : null}
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[#b8b8bf]">
                      <tr>
                        <th className="py-1 pr-2 font-semibold">Varian</th>
                        <th className="py-1 pr-2 text-right font-semibold">HPP mitra</th>
                        <th className="py-1 pr-2 text-right font-semibold">Harga jual</th>
                        <th className="py-1 text-right font-semibold">Laba Garage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.variants.map((v) => {
                        const margin = v.sellPrice - (v.unitCost ?? 0);
                        return (
                          <tr key={v.variantId} className="border-t border-[#2a2a30] text-[#f4f4f5]">
                            <td className="py-1 pr-2 break-words">{v.label}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">{rp(v.unitCost ?? 0)}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">{rp(v.sellPrice)}</td>
                            <td className={`py-1 text-right font-semibold tabular-nums ${margin < 0 ? "text-[#ff8a94]" : "text-[#86efac]"}`}>{rp(margin)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {isOwner ? (
                    <Btn tone={p.active ? "danger" : "success"} busy={busy === `pact-${p.linkId}`} onClick={() => void runP(`pact-${p.linkId}`, () => api(`/api/partners/products/${p.linkId}`, { method: "PATCH", body: JSON.stringify({ active: !p.active }) }), p.active ? "Produk dinonaktifkan." : "Produk disetujui.")}>
                      {p.active ? "Nonaktifkan" : "Setujui produk"}
                    </Btn>
                  ) : null}
                  <Btn busy={busy === `pav-${p.linkId}`} onClick={() => void runP(`pav-${p.linkId}`, () => api(`/api/partners/products/${p.linkId}`, { method: "PATCH", body: JSON.stringify({ available: !p.available }) }), "Ketersediaan diubah.")}>
                    Tandai {p.available ? "Habis" : "Tersedia"}
                  </Btn>
                  <Btn onClick={() => setEditing(editing === p.linkId ? null : p.linkId)}>{editing === p.linkId ? "Tutup pengaturan" : "Pengaturan"}</Btn>
                  {!p.active && p.submissionStatus === "pending" ? (
                    <Btn tone="danger" onClick={() => setRevising(revising === p.linkId ? null : p.linkId)}>
                      {revising === p.linkId ? "Batal" : "Minta perbaikan"}
                    </Btn>
                  ) : null}
                </div>
                {revising === p.linkId ? (
                  <RevisionRequest
                    product={p}
                    busy={busy === `prev-${p.linkId}`}
                    onSend={(note) =>
                      void runP(`prev-${p.linkId}`, () => api(`/api/partners/products/${p.linkId}/revision`, { method: "POST", body: JSON.stringify({ note }) }), "Pengajuan dikembalikan ke mitra untuk diperbaiki.").then(() => setRevising(null))
                    }
                  />
                ) : null}
                {editing === p.linkId ? (
                  // key ikut harga terkini: setelah aturan harga/perubahan lain, form dibuat ulang dari data server
                  // (tidak menyimpan harga lama sebagai "perubahan" yang bisa membatalkan aturan).
                  <>
                    <ProductSettings key={`${p.linkId}:${p.variants.map((v) => `${v.variantId}=${v.unitCost ?? 0}/${v.sellPrice}`).join(",")}`} product={p} isOwner={isOwner} busy={busy} runP={runP} />
                    {isOwner ? (
                      <MoveProduct product={p} targets={moveTargets} busy={busy} runP={runP} />
                    ) : null}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {isOwner && products?.length ? <MarginRule partnerId={partner.id} busy={busy} runP={runP} /> : null}
        <form
          className="grid gap-2 rounded-lg border border-[#2a2a30] p-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            void runP(
              `addprod-${partner.id}`,
              () =>
                api(`/api/partners/${partner.id}/products`, {
                  method: "POST",
                  body: JSON.stringify({ code: product.code.toUpperCase(), name: product.name, category: product.category, variants: [{ variantId: "reg", label: "Regular", unitCost: Number(product.unitCost), sellPrice: Number(product.sellPrice) }] }),
                }),
              "Produk didaftarkan — menunggu persetujuan Owner.",
            ).then(() => setProduct({ ...product, code: "", name: "", unitCost: "", sellPrice: "" }));
          }}
        >
          <p className="text-sm font-bold text-white sm:col-span-2">Tambah produk</p>
          <Field label="Kode produk">
            <input required placeholder="PAU-001…" autoComplete="off" value={product.code} onChange={(e) => setProduct({ ...product, code: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Nama produk">
            <input required placeholder="mis. Dimsum Ayam…" autoComplete="off" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Kategori">
            <input required placeholder="mis. Dimsum…" autoComplete="off" value={product.category} onChange={(e) => setProduct({ ...product, category: e.target.value })} className={inputCls} />
          </Field>
          <Field label="HPP mitra (Rp)">
            <input required placeholder="22000…" inputMode="numeric" autoComplete="off" value={product.unitCost} onChange={(e) => setProduct({ ...product, unitCost: e.target.value.replace(/\D/g, "") })} className={inputCls} />
          </Field>
          <Field label="Harga jual (Rp)">
            <input required placeholder="25000…" inputMode="numeric" autoComplete="off" value={product.sellPrice} onChange={(e) => setProduct({ ...product, sellPrice: e.target.value.replace(/\D/g, "") })} className={inputCls} />
          </Field>
          <div className="flex items-end">
            <Btn type="submit" tone="primary" busy={busy === `addprod-${partner.id}`}>
              <Plus className="size-4" aria-hidden /> Tambah produk
            </Btn>
          </div>
        </form>
        <PartnerPerformanceStaff partnerId={partner.id} />
        <PartnerAuditPanel partnerId={partner.id} />
      </div>
    </div>
  );
}

const EVENT_LABEL: Record<string, string> = {
  partner_created: "Mitra didaftarkan",
  partner_profile_updated: "Data mitra diubah",
  partner_status: "Status mitra diubah",
  operational_status: "Buka/Jeda/Tutup",
  availability: "Tersedia/Habis",
  account_updated: "Akun portal diubah",
  adjustment_created: "Penyesuaian dicatat",
  adjustment_decided: "Penyesuaian diputuskan",
  settlement_created: "Settlement dibuat",
  settlement_submitted: "Settlement diajukan",
  payout_proof: "Bukti transfer diunggah",
  report_generated: "Laporan PDF diterbitkan",
  website_promoted: "Dipromosikan di website",
  website_unpromoted: "Dilepas dari website",
  bank_added: "Rekening ditambahkan",
  bank_verified: "Rekening diverifikasi",
  account_created: "Akun portal dibuat",
  account_pin_changed_by_partner: "Mitra mengganti PIN",
  product_created: "Produk didaftarkan",
  product_approved: "Produk disetujui",
  product_deactivated: "Produk dinonaktifkan",
  ticket_cancelled_by_garage: "Pesanan dibatalkan Garage",
  product_moved_out: "Produk dipindah ke mitra lain",
  product_moved_in: "Produk dipindah dari mitra lain",
  price_proposal_submitted: "Mitra mengajukan harga",
  price_proposal_approved: "Pengajuan harga disetujui",
  price_proposal_rejected: "Pengajuan harga ditolak",
  price_proposal_cancelled: "Pengajuan harga dibatalkan mitra",
  product_settings: "Pengaturan produk diubah",
  product_photo: "Foto produk diganti",
  price_changed: "Harga diubah",
  variant_added: "Varian ditambah",
  variant_removed: "Varian dihapus",
  settlement_approved: "Settlement disetujui",
  settlement_cancelled: "Settlement dibatalkan",
  payout_recorded: "Pembayaran dicatat",
  payout_verified: "Pembayaran diverifikasi",
  payout_void: "Pembayaran dibatalkan",
};

/** Riwayat harga & log kejadian mitra (hanya baca, Owner/Manajer). Dimuat saat dibuka. */
function PartnerAuditPanel({ partnerId }: { partnerId: string }) {
  const [tab, setTab] = useState<"none" | "price" | "log">("none");
  const [prices, setPrices] = useState<Array<{ id: string; code: string; productName: string; variantId: string; unitCost: number; sellPrice: number; reason: string; createdAt: string }> | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; kind: string; fromStatus: string | null; toStatus: string | null; reason: string | null; actorName: string | null; actorType: string; createdAt: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fmt = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  const open = async (next: "price" | "log") => {
    setTab(tab === next ? "none" : next);
    setError(null);
    try {
      if (next === "price") setPrices(await api(`/api/partners/${partnerId}/price-history`));
      else setEvents(await api(`/api/partners/${partnerId}/events`));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="grid gap-2 rounded-lg border border-[#2a2a30] p-3">
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => void open("price")}>{tab === "price" ? "Tutup riwayat harga" : "Riwayat harga"}</Btn>
        <Btn onClick={() => void open("log")}>{tab === "log" ? "Tutup log" : "Log kejadian"}</Btn>
      </div>
      {error ? <p className="text-sm text-[#ffb3b8]">{error}</p> : null}
      {tab === "price" ? (
        prices === null ? (
          <p className="text-sm text-[#b8b8bf]">Memuat…</p>
        ) : prices.length === 0 ? (
          <p className="text-sm text-[#b8b8bf]">Belum ada riwayat harga.</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="sticky top-0 bg-[#16161a] text-xs text-[#b8b8bf]">
                <tr>
                  <th className="py-1 pr-2">Waktu</th>
                  <th className="py-1 pr-2">Produk</th>
                  <th className="py-1 pr-2 text-right">HPP</th>
                  <th className="py-1 pr-2 text-right">Jual</th>
                  <th className="py-1">Alasan</th>
                </tr>
              </thead>
              <tbody>
                {prices.map((row) => (
                  <tr key={row.id} className="border-t border-[#2a2a30] text-[#f4f4f5]">
                    <td className="py-1 pr-2 whitespace-nowrap text-xs">{fmt.format(new Date(row.createdAt))}</td>
                    <td className="py-1 pr-2">
                      {row.productName} <span className="text-xs text-[#b8b8bf]">({row.variantId})</span>
                    </td>
                    <td className="py-1 pr-2 text-right font-mono">{rp(row.unitCost)}</td>
                    <td className="py-1 pr-2 text-right font-mono">{rp(row.sellPrice)}</td>
                    <td className="py-1 text-xs text-[#d4d4d8]">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
      {tab === "log" ? (
        events === null ? (
          <p className="text-sm text-[#b8b8bf]">Memuat…</p>
        ) : (
          <ul className="grid max-h-80 gap-1 overflow-auto text-sm">
            {events.map((e) => (
              <li key={e.id} className="rounded border border-[#2a2a30] px-2 py-1 text-[#f4f4f5]">
                <span className="text-xs text-[#b8b8bf]">{fmt.format(new Date(e.createdAt))}</span> · {EVENT_LABEL[e.kind] ?? e.kind}
                {e.fromStatus || e.toStatus ? ` (${e.fromStatus ?? "-"} → ${e.toStatus ?? "-"})` : ""}
                {e.reason ? ` · "${e.reason}"` : ""}
                <span className="text-xs text-[#b8b8bf]"> · {e.actorName ?? e.actorType}</span>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

type RunP = (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;

/**
 * Pindahkan produk ke mitra lain (Owner) — untuk produk yang tersambung ke data mitra yang salah (mis. katalog impor
 * vs mitra hasil pendaftaran). Hanya pesanan berikutnya yang ikut mitra baru; riwayat & setoran lama tidak berubah.
 */
function MoveProduct({ product, targets, busy, runP }: { product: Product; targets: Partner[]; busy: string | null; runP: RunP }) {
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  if (!targets.length) return null;
  const key = `move-${product.linkId}`;
  return (
    <form
      className="mt-2 grid gap-2 rounded-lg border border-[#f5a742]/40 bg-[#2a1d0a]/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const target = targets.find((x) => x.id === to);
        if (!target) return;
        void runP(
          key,
          () => api(`/api/partners/products/${product.linkId}/move`, { method: "POST", body: JSON.stringify({ toPartnerId: to, reason }) }),
          `${product.name} dipindah ke ${target.name}. Status Buka/Jeda & Tersedia/Habis kini mengikuti ${target.name}.`,
        );
      }}
    >
      <p className="text-xs text-[#ffe2b0] sm:col-span-3">
        Salah mitra? Pindahkan produk ini. Pesanan berikutnya, status Buka/Jeda dan Tersedia/Habis ikut mitra tujuan; pesanan & setoran lama tetap milik mitra ini.
      </p>
      <Field label="Pindahkan ke mitra">
        <select value={to} onChange={(e) => setTo(e.target.value)} required className={inputCls}>
          <option value="">Pilih mitra…</option>
          {targets.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} (#{x.code} · {x.operationalStatus.toUpperCase()})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Alasan">
        <input value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} placeholder="mis. produk milik Dimsum Cidut" className={inputCls} />
      </Field>
      <Btn type="submit" tone="primary" busy={busy === key} disabled={!to || reason.trim().length < 3}>
        Pindahkan
      </Btn>
    </form>
  );
}

/**
 * Pindahkan semua (atau sebagian terpilih) produk mitra ini ke mitra lain sekaligus (Owner) — mis. 20 SKU katalog impor
 * yang ternyata milik mitra hasil pendaftaran. Satu transaksi di server; selalu mengirim daftar produk yang dilihat Owner
 * (produk baru yang muncul setelah layar dimuat tidak ikut terpindah diam-diam).
 */
function MoveAllProducts({ partner, products, targets, busy, runP }: { partner: Partner; products: Product[]; targets: Partner[]; busy: string | null; runP: RunP }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  if (!targets.length) return null;
  if (!products.length && !done) return null;
  const key = `moveall-${partner.id}`;
  const selected = products.filter((p) => !excluded.has(p.linkId));
  const target = targets.find((x) => x.id === to);
  const ready = Boolean(target) && reason.trim().length >= 3 && selected.length > 0;

  const toggle = (linkId: string) => {
    setConfirming(false);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  };
  const submit = () => {
    if (!target || !selected.length) return;
    const count = selected.length;
    void runP(
      key,
      async () => {
        const result = await api<{ moved: number; cancelledProposals: number }>(`/api/partners/${partner.id}/products/move`, {
          method: "POST",
          body: JSON.stringify({ toPartnerId: target.id, reason, linkIds: selected.map((p) => p.linkId) }),
        });
        setDone(
          `${result.moved} produk dipindah ke ${target.name}${result.cancelledProposals ? ` · ${result.cancelledProposals} pengajuan harga dibatalkan` : ""}. Status Buka/Jeda & Tersedia/Habis kini mengikuti ${target.name}.`,
        );
        setOpen(false);
        setExcluded(new Set());
        setReason("");
      },
      `${count} produk dipindah ke ${target.name}. Pesanan & setoran lama tetap milik ${partner.name}.`,
    ).finally(() => setConfirming(false));
  };

  return (
    <div className="grid gap-2 rounded-lg border border-[#f5a742]/40 bg-[#2a1d0a]/40 p-3">
      {done ? (
        <p role="status" className="text-sm text-[#bbf7d0]">
          {done}
          {!products.length ? ` ${partner.name} kini tanpa produk — bila tidak dipakai lagi, ubah statusnya ke "Nonaktifkan mitra".` : ""}
        </p>
      ) : null}
      {!products.length ? null : !open ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-xs text-[#ffe2b0]">Produk mitra ini sebenarnya milik mitra lain? Pindahkan sekaligus, tidak perlu satu per satu.</p>
          <Btn
            onClick={() => {
              setOpen(true);
              setDone(null);
            }}
          >
            Pindahkan semua produk…
          </Btn>
        </div>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) setConfirming(true);
          }}
        >
          <p className="text-xs text-[#ffe2b0]">
            Pesanan berikutnya, status Buka/Jeda dan Tersedia/Habis ikut mitra tujuan. Pesanan, tiket & setoran lama tetap milik {partner.name}; pengajuan harga yang
            masih menunggu dibatalkan.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Pindahkan ke mitra">
              <select
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setConfirming(false);
                }}
                required
                className={inputCls}
              >
                <option value="">Pilih mitra…</option>
                {targets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} (#{x.code} · {x.operationalStatus.toUpperCase()})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Alasan">
              <input
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setConfirming(false);
                }}
                required
                minLength={3}
                maxLength={300}
                placeholder="mis. semua produk milik Dimsum Cidut"
                className={inputCls}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#e4e4e8]">
              Produk dipilih: {selected.length} dari {products.length}
            </span>
            <span className="flex flex-wrap gap-2">
              <Btn
                onClick={() => {
                  setExcluded(new Set());
                  setConfirming(false);
                }}
              >
                Pilih semua
              </Btn>
              <Btn
                onClick={() => {
                  setExcluded(new Set(products.map((p) => p.linkId)));
                  setConfirming(false);
                }}
              >
                Kosongkan
              </Btn>
            </span>
          </div>
          <ul className="grid max-h-64 overflow-auto rounded-lg border border-[#3a3a42] bg-black/20 px-2" aria-label="Produk yang dipindah">
            {products.map((p) => (
              <li key={p.linkId}>
                <label className="flex min-h-11 items-center gap-2 text-sm text-[#f4f4f5]">
                  <input type="checkbox" checked={!excluded.has(p.linkId)} onChange={() => toggle(p.linkId)} className="size-4 shrink-0" />
                  <span className="min-w-0 break-words">
                    {p.code} · {p.name}
                  </span>
                  {!p.active ? <span className="shrink-0 text-xs text-[#ffd28a]">nonaktif</span> : null}
                </label>
              </li>
            ))}
          </ul>
          {confirming && target ? (
            <div className="grid gap-2 rounded-lg border border-[#ff5a66]/50 bg-[#3a1015]/60 p-3">
              <p role="alert" className="text-sm text-[#ffd0d4]">
                Yakin pindahkan <b>{selected.length} produk</b> dari <b>{partner.name}</b> ke <b>{target.name}</b>? Pesanan, tiket & setoran lama tetap milik {partner.name}.
              </p>
              <div className="flex flex-wrap gap-2">
                <Btn tone="danger" busy={busy === key} onClick={submit}>
                  Ya, pindahkan {selected.length} produk
                </Btn>
                <Btn onClick={() => setConfirming(false)}>Kembali</Btn>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Btn type="submit" tone="primary" disabled={!ready}>
                Pindahkan {selected.length} produk
              </Btn>
              <Btn
                onClick={() => {
                  setOpen(false);
                  setConfirming(false);
                }}
              >
                Batal
              </Btn>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

/** Impor katalog PRD 05 sekali tekan (Owner). Idempoten: kode yang sudah ada dilewati. */
function ImportCatalogCard({ busy, onImport }: { busy: boolean; onImport: () => void }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold text-white">
            <Download className="size-4 text-[#ff5a66]" /> Katalog awal PRD (Es Krim Pokat Au + Dimsum)
          </h3>
          <p className="mt-1 text-xs text-[#b8b8bf]">
            4 produk Es Krim (HPP 19.000–25.000) dan 20 produk Dimsum (harga jual = HPP + Rp3.000) dari PRD bagian 05. Masuk sebagai mitra <b>Draft</b> &amp;
            produk <b>nonaktif</b> — belum bisa dijual sampai data mitra lengkap dan tiap produk Anda setujui. Data Dimsum wajib dikonfirmasi dengan mitra.
          </p>
        </div>
        <Btn tone="primary" busy={busy} onClick={onImport}>
          <Download className="size-4" /> Impor katalog
        </Btn>
      </div>
    </Card>
  );
}

/** Pengaturan khusus satu produk mitra: tampilan (Owner/Manajer) + HPP & harga jual per varian (Owner, wajib alasan). */
function ProductSettings({ product, isOwner, busy, runP }: { product: Product; isOwner: boolean; busy: string | null; runP: RunP }) {
  const [form, setForm] = useState({
    name: product.name,
    category: product.category,
    imageUrl: product.imageUrl ?? "",
    description: product.description ?? "",
    showInDigitalMenu: product.showInDigitalMenu,
  });
  const [prices, setPrices] = useState(() => Object.fromEntries(product.variants.map((v) => [v.variantId, { cost: String(v.unitCost ?? 0), sell: String(v.sellPrice) }])));
  const [reason, setReason] = useState("");
  const changedPrices = product.variants.filter((v) => Number(prices[v.variantId]?.cost) !== (v.unitCost ?? 0) || Number(prices[v.variantId]?.sell) !== v.sellPrice);
  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-[#3a3a42] bg-black/20 p-3">
      <form
        className="grid gap-2 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void runP(
            `pset-${product.linkId}`,
            () => api(`/api/partners/products/${product.linkId}`, { method: "PATCH", body: JSON.stringify({ settings: { ...form, imageUrl: form.imageUrl || null, description: form.description || null } }) }),
            "Pengaturan produk disimpan.",
          );
        }}
      >
        <Field label="Nama di POS & menu">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} className={inputCls} />
        </Field>
        <Field label="Kategori">
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required minLength={2} className={inputCls} />
        </Field>
        <Field label="Foto produk">
          <div className="flex flex-wrap items-center gap-2">
            {form.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt={`Foto ${form.name}`} className="size-14 rounded-lg border border-[#3a3a42] object-cover" />
            ) : null}
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-[#3a3a42] px-3 text-sm font-semibold text-[#e4e4e8] hover:bg-white/10">
              {busy === `pimg-${product.linkId}` ? "Mengunggah…" : form.imageUrl ? "Ganti foto" : "Unggah foto"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label={`Unggah foto ${product.name}`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void runP(
                    `pimg-${product.linkId}`,
                    async () => {
                      const body = new FormData();
                      body.append("image", file);
                      const res = await fetch(`/api/partners/products/${product.linkId}/image`, { method: "POST", body, credentials: "include" });
                      const json = (await res.json().catch(() => null)) as { data?: { imageUrl: string }; error?: { message?: string } } | null;
                      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Foto gagal diunggah.");
                      setForm((f) => ({ ...f, imageUrl: json.data!.imageUrl }));
                    },
                    "Foto produk diperbarui.",
                  );
                }}
              />
            </label>
            {form.imageUrl ? (
              <button type="button" onClick={() => setForm({ ...form, imageUrl: "" })} className="min-h-11 px-2 text-sm text-[#ffb3b8] underline">
                Hapus foto
              </button>
            ) : null}
          </div>
        </Field>
        <Field label="Deskripsi singkat">
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} className={inputCls} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm text-[#e4e4e8] sm:col-span-2">
          <input type="checkbox" checked={form.showInDigitalMenu} onChange={(e) => setForm({ ...form, showInDigitalMenu: e.target.checked })} className="size-4" />
          Tampil di menu digital pelanggan (pelanggan bisa pesan bila Pengaturan → Partner Hub mengizinkan; pesanan masuk kasir dulu)
        </label>
        <div className="sm:col-span-2">
          <Btn type="submit" tone="primary" busy={busy === `pset-${product.linkId}`}>
            Simpan pengaturan
          </Btn>
        </div>
      </form>
      {isOwner ? (
        <form
          className="grid gap-2 border-t border-[#2a2a30] pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void runP(
              `pprice-${product.linkId}`,
              async () => {
                for (const v of changedPrices) {
                  await api(`/api/partners/products/${product.linkId}`, {
                    method: "PATCH",
                    body: JSON.stringify({ price: { variantId: v.variantId, unitCost: Number(prices[v.variantId].cost), sellPrice: Number(prices[v.variantId].sell), reason } }),
                  });
                }
              },
              "Harga baru berlaku untuk transaksi berikutnya (transaksi lama tetap memakai harga lama).",
            ).then(() => setReason(""));
          }}
        >
          <p className="text-sm font-semibold text-white">HPP &amp; harga jual (Owner)</p>
          {product.variants.map((v) => {
            const cost = Number(prices[v.variantId]?.cost) || 0;
            const sell = Number(prices[v.variantId]?.sell) || 0;
            return (
              <div key={v.variantId} className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
                <p className="col-span-2 text-xs text-[#b8b8bf] sm:col-span-1">{v.label}</p>
                <Field label="HPP mitra">
                  <input inputMode="numeric" value={prices[v.variantId]?.cost ?? ""} onChange={(e) => setPrices({ ...prices, [v.variantId]: { ...prices[v.variantId], cost: e.target.value.replace(/\D/g, "") } })} className={inputCls} />
                </Field>
                <Field label="Harga jual">
                  <input inputMode="numeric" value={prices[v.variantId]?.sell ?? ""} onChange={(e) => setPrices({ ...prices, [v.variantId]: { ...prices[v.variantId], sell: e.target.value.replace(/\D/g, "") } })} className={inputCls} />
                </Field>
                <p className={`text-sm font-semibold ${sell - cost < 0 ? "text-[#ff8a94]" : "text-[#86efac]"}`}>Laba Garage {rp(sell - cost)}</p>
              </div>
            );
          })}
          <Field label="Alasan perubahan (wajib, tercatat di riwayat)">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. kesepakatan baru dengan mitra 12 Nov" className={inputCls} />
          </Field>
          <div>
            <Btn type="submit" tone="primary" busy={busy === `pprice-${product.linkId}`} disabled={!changedPrices.length || reason.trim().length < 3}>
              Simpan harga baru
            </Btn>
          </div>
        </form>
      ) : (
        <p className="text-xs text-[#b8b8bf]">Perubahan HPP &amp; harga jual hanya oleh Owner.</p>
      )}
      {isOwner ? <VariantManager product={product} busy={busy} runP={runP} /> : null}
      <MarketingPanel product={product} isOwner={isOwner} busy={busy} runP={runP} />
    </div>
  );
}

/** Media marketing website: checklist syarat + pilih produk untuk halaman utama (Owner). */
function MarketingPanel({ product, isOwner, busy, runP }: { product: Product; isOwner: boolean; busy: string | null; runP: RunP }) {
  const [status, setStatus] = useState<{ promoted: boolean; blockers: string[] } | null>(null);
  const load = useCallback(async () => {
    try {
      setStatus(await api(`/api/partners/products/${product.linkId}/marketing`));
    } catch {
      setStatus(null);
    }
  }, [product.linkId]);
  useEffect(() => {
    // Ambil data saat tampil (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, product.imageUrl, product.description, product.active, product.showInDigitalMenu]);
  if (!status) return null;
  const eligible = status.blockers.length === 0;
  return (
    <div className="grid gap-2 border-t border-[#2a2a30] pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">Media marketing website (halaman utama)</p>
        <Chip tone={status.promoted ? "green" : eligible ? "amber" : "red"}>{status.promoted ? "Tampil di website" : eligible ? "Memenuhi syarat" : "Belum memenuhi syarat"}</Chip>
      </div>
      {status.blockers.length ? (
        <ul className="grid gap-1 text-sm text-amber-300">
          {status.blockers.map((b) => (
            <li key={b}>✗ {b}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-emerald-300">✓ Semua syarat terpenuhi: mitra aktif & rekening terverifikasi, produk disetujui, foto asli, deskripsi, tampil di menu digital, harga di atas HPP.</p>
      )}
      {isOwner ? (
        <div>
          <Btn
            tone={status.promoted ? "danger" : "primary"}
            disabled={!status.promoted && !eligible}
            busy={busy === `mkt-${product.linkId}`}
            onClick={() =>
              void runP(
                `mkt-${product.linkId}`,
                () => api(`/api/partners/products/${product.linkId}/marketing`, { method: "POST", body: JSON.stringify({ promoted: !status.promoted }) }).then(load),
                status.promoted ? "Produk dilepas dari halaman utama website." : "Produk tampil di halaman utama website (section Produk Mitra).",
              )
            }
          >
            {status.promoted ? "Lepas dari website" : "Promosikan di website"}
          </Btn>
        </div>
      ) : (
        <p className="text-xs text-[#b8b8bf]">Pilihan produk untuk website hanya oleh Owner.</p>
      )}
    </div>
  );
}

/** Tambah / hapus varian (mis. Small/Large) — Owner. Harga awal varian baru tercatat di riwayat harga. */
function VariantManager({ product, busy, runP }: { product: Product; busy: string | null; runP: RunP }) {
  const [draft, setDraft] = useState({ label: "", cost: "", sell: "" });
  return (
    <div className="grid gap-2 border-t border-[#2a2a30] pt-3">
      <p className="text-sm font-semibold text-white">Varian</p>
      <ul className="flex flex-wrap gap-2">
        {product.variants.map((v) => (
          <li key={v.variantId} className="inline-flex items-center gap-2 rounded-lg border border-[#3a3a42] px-2 py-1 text-sm text-[#f4f4f5]">
            {v.label} · {rp(v.sellPrice)}
            {product.variants.length > 1 ? (
              <button
                type="button"
                aria-label={`Hapus varian ${v.label}`}
                className="min-h-9 px-1 text-[#ffb3b8]"
                onClick={() => {
                  const reason = window.confirm(`Hapus varian ${v.label}? Transaksi lama tetap tersimpan.`) ? "Varian tidak dijual lagi" : "";
                  if (reason) void runP(`pvar-del-${v.variantId}`, () => api(`/api/partners/products/${product.linkId}/variants`, { method: "DELETE", body: JSON.stringify({ variantId: v.variantId, reason }) }), `Varian ${v.label} dihapus.`);
                }}
              >
                ✕
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void runP(
            `pvar-${product.linkId}`,
            () => api(`/api/partners/products/${product.linkId}/variants`, { method: "POST", body: JSON.stringify({ label: draft.label, unitCost: Number(draft.cost), sellPrice: Number(draft.sell), reason: "Varian baru" }) }),
            `Varian ${draft.label} ditambahkan.`,
          ).then(() => setDraft({ label: "", cost: "", sell: "" }));
        }}
      >
        <Field label="Nama varian">
          <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="mis. Large" required className={inputCls} />
        </Field>
        <Field label="HPP mitra">
          <input inputMode="numeric" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value.replace(/\D/g, "") })} required className={inputCls} />
        </Field>
        <Field label="Harga jual">
          <input inputMode="numeric" value={draft.sell} onChange={(e) => setDraft({ ...draft, sell: e.target.value.replace(/\D/g, "") })} required className={inputCls} />
        </Field>
        <Btn type="submit" busy={busy === `pvar-${product.linkId}`} disabled={!draft.label.trim() || !draft.sell}>
          Tambah varian
        </Btn>
      </form>
    </div>
  );
}

/** Aturan harga satu mitra: harga jual = HPP + laba per unit (mis. Dimsum +Rp3.000). Owner. */
function MarginRule({ partnerId, busy, runP }: { partnerId: string; busy: string | null; runP: RunP }) {
  const [margin, setMargin] = useState("3000");
  const [reason, setReason] = useState("");
  return (
    <form
      className="grid gap-2 rounded-lg border border-[#2a2a30] p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        void runP(`margin-${partnerId}`, () => api(`/api/partners/${partnerId}/margin-rule`, { method: "POST", body: JSON.stringify({ margin: Number(margin), reason }) }), "Aturan harga diterapkan ke semua produk mitra ini.").then(() => setReason(""));
      }}
    >
      <Field label="Aturan harga: HPP + laba (Rp)">
        <input inputMode="numeric" value={margin} onChange={(e) => setMargin(e.target.value.replace(/\D/g, ""))} className={inputCls} />
      </Field>
      <Field label="Alasan (wajib)">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. kesepakatan harga jual = HPP + 3.000" className={inputCls} />
      </Field>
      <Btn type="submit" busy={busy === `margin-${partnerId}`} disabled={!margin || reason.trim().length < 3}>
        Terapkan ke semua produk
      </Btn>
    </form>
  );
}

function lastOrderText(value: string) {
  if (!value) return "tanpa batas";
  return `berhenti ${value} WIB`;
}

/** Jam yang hampir pasti salah ketik AM/PM: sebelum 15:00 (tengah malam/pagi/siang). */
function lastOrderWarn(value: string) {
  if (!value) return false;
  const hour = Number(value.slice(0, 2));
  return hour < 15;
}

/** Syarat aktivasi (sama dengan partnerActivationBlockers di server) agar Owner tahu apa yang kurang. */
function ActivationChecklist({
  partner,
  products,
  isOwner,
  busy,
  run,
}: {
  partner: Partner;
  products: Product[] | null;
  isOwner: boolean;
  busy: string | null;
  run: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  if (partner.status === "aktif") return null;
  const approvedProducts = products?.filter((p) => p.active).length ?? 0;
  const pendingProducts = products?.filter((p) => !p.active) ?? [];
  const prereqOk = (ok: boolean[]) => ok.every(Boolean);
  const statusStep =
    partner.status === "disetujui" || partner.status === "dibekukan"
      ? "Status sudah Disetujui Owner"
      : partner.status === "verifikasi"
        ? "Status: tekan \"Setujui (Owner)\""
        : partner.status === "nonaktif"
          ? "Status Nonaktif: dibuka ulang otomatis saat \"Aktifkan mitra sekarang\""
          : "Status: tekan \"Ajukan verifikasi\", lalu \"Setujui (Owner)\"";
  const items: Array<{ ok: boolean; label: string }> = [
    { ok: Boolean(partner.phone?.trim()), label: "WhatsApp mitra diisi lalu disimpan" },
    { ok: Boolean(partner.terms?.trim()), label: "Kesepakatan harga, pembatalan & serah-terima disimpan" },
    { ok: partner.bank.some((b) => b.status === "verified"), label: "Rekening penerima ditambah dan diverifikasi Owner" },
    { ok: partner.accounts.some((a) => a.status === "active" && /^0\d{8,14}$/.test(a.phone)), label: "Akun Portal Mitra aktif dengan nomor HP" },
    { ok: approvedProducts > 0, label: "Minimal satu produk disetujui" },
    { ok: partner.status === "disetujui" || partner.status === "dibekukan", label: statusStep },
  ];
  const dataReady = prereqOk(items.slice(0, 5).map((i) => i.ok));
  // Urutan transisi sah (PARTNER_STATUS_FLOW): nonaktif harus dibuka ulang ke draft dulu.
  const STATUS_PATH: Record<string, string[]> = {
    nonaktif: ["draft", "verifikasi", "disetujui", "aktif"],
    draft: ["verifikasi", "disetujui", "aktif"],
    verifikasi: ["disetujui", "aktif"],
    disetujui: ["aktif"],
    dibekukan: ["aktif"],
  };
  const statusPath = STATUS_PATH[partner.status] ?? [];
  const activateNow = () => {
    const reason = window.prompt("Alasan aktivasi (tercatat di riwayat), mis. kontrak & harga sudah disepakati");
    if (!reason?.trim()) return;
    void run(
      `quick-${partner.id}`,
      async () => {
        for (const to of statusPath) await api(`/api/partners/${partner.id}/status`, { method: "POST", body: JSON.stringify({ to, reason }) });
      },
      "Mitra AKTIF. Minta mitra login di garagecoffee.id/partner lalu tekan BUKA.",
    );
  };
  const approveAll = () =>
    void run(
      `approve-all-${partner.id}`,
      async () => {
        for (const p of pendingProducts) await api(`/api/partners/products/${p.linkId}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
      },
      `${pendingProducts.length} produk disetujui.`,
    );
  return (
    <div className="rounded-lg border border-[#3a3a42] bg-[#16161a] p-3">
      <p className="text-sm font-bold text-white">Syarat aktivasi</p>
      <ul className="mt-2 grid gap-1 text-sm">
        {items.map((item) => (
          <li key={item.label} className={item.ok ? "text-emerald-300" : "text-amber-300"}>
            {item.ok ? "✓" : "✗"} {item.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-[#b8b8bf]">
        {dataReady
          ? isOwner
            ? "Data lengkap. Tekan \"Aktifkan mitra sekarang\" (status otomatis: verifikasi → disetujui → aktif)."
            : "Data lengkap. Owner tinggal menekan \"Aktifkan mitra sekarang\"."
          : "Lengkapi yang bertanda ✗ (isi lalu simpan di bawah)."}
      </p>
      {isOwner ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {pendingProducts.length > 0 ? (
            <Btn tone="success" busy={busy === `approve-all-${partner.id}`} onClick={approveAll}>
              Setujui semua produk ({pendingProducts.length})
            </Btn>
          ) : null}
          <Btn tone="primary" disabled={!dataReady || statusPath.length === 0} busy={busy === `quick-${partner.id}`} onClick={activateNow}>
            <ShieldCheck className="size-4" /> Aktifkan mitra sekarang
          </Btn>
        </div>
      ) : null}
    </div>
  );
}

/** Owner/Manajer mengembalikan pengajuan produk mitra dengan catatan (tampil di Portal Mitra + push ke HP mitra). */
function RevisionRequest({ product, busy, onSend }: { product: Product; busy: boolean; onSend: (note: string) => void }) {
  const [note, setNote] = useState("");
  const quick = ["Foto kurang jelas", "Harga perlu disesuaikan", "Deskripsi kurang lengkap", "Nama produk perlu diganti"];
  return (
    <div className="mt-2 grid gap-2 rounded-lg border border-[#ff5a66]/40 bg-black/30 p-3">
      <Field label={`Apa yang perlu diperbaiki di ${product.name}?`}>
        <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2} className="min-h-16 w-full rounded-lg border border-[#3a3a42] bg-black/30 px-3 py-2 text-sm text-white outline-none focus-visible:border-[#ff5a66] focus-visible:ring-2 focus-visible:ring-[#ff5a66]/40" placeholder="Contoh: Foto kurang terang, harga jual Rp 25.000 terlalu tinggi." />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {quick.map((text) => (
          <button key={text} type="button" onClick={() => setNote((n) => (n.trim() ? `${n.trim()}. ${text}` : text))} className="min-h-9 rounded-full border border-[#3a3a42] px-3 text-xs font-semibold text-[#e4e4e8] hover:bg-white/10">
            + {text}
          </button>
        ))}
      </div>
      <div>
        <Btn tone="danger" busy={busy} disabled={note.trim().length < 5} onClick={() => onSend(note.trim())}>
          Kirim ke mitra
        </Btn>
      </div>
    </div>
  );
}
