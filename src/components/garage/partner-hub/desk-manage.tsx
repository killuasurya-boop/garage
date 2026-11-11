"use client";

// Kelola Mitra (Owner/Manajer, papan 05): registrasi, status siklus hidup, rekening, akun login, produk & harga.
// Aksi Owner-only (setujui/aktifkan, verifikasi rekening, setujui produk, ubah harga) dicek ulang di server.

import { useCallback, useEffect, useState } from "react";
import { Download, Plus, ShieldCheck, UserPlus } from "lucide-react";

import { api, Btn, Card, Chip, Field, inputCls, Notice, rp } from "./desk-shared";

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
  availableCount: number;
  soldOutCount: number;
  bank: Array<{ id: string; bankName: string; accountName: string; accountMasked: string; status: string; accountNumber?: string }>;
  accounts: Array<{ id: string; phone: string; displayName: string; status: string }>;
};
type Product = {
  linkId: string;
  code: string;
  name: string;
  category: string;
  imageUrl: string | null;
  description: string | null;
  showInDigitalMenu: boolean;
  active: boolean;
  available: boolean;
  variants: Array<{ variantId: string; label: string; sellPrice: number; unitCost?: number }>;
};

const STATUS_LABEL: Record<string, string> = { draft: "Draft", verifikasi: "Verifikasi", disetujui: "Disetujui", aktif: "Aktif", dibekukan: "Dibekukan", nonaktif: "Nonaktif" };
const NEXT: Record<string, Array<{ to: string; label: string; owner?: boolean }>> = {
  draft: [{ to: "verifikasi", label: "Ajukan verifikasi" }],
  verifikasi: [{ to: "disetujui", label: "Setujui (Owner)", owner: true }, { to: "draft", label: "Kembalikan ke draft" }],
  disetujui: [{ to: "aktif", label: "Aktifkan (Owner)", owner: true }],
  aktif: [{ to: "dibekukan", label: "Bekukan sementara" }],
  dibekukan: [{ to: "aktif", label: "Aktifkan lagi (Owner)", owner: true }],
  nonaktif: [{ to: "draft", label: "Buka ulang (draft)" }],
};
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function DeskManage({ role }: { role: string }) {
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const isOwner = role === "Owner";

  const load = useCallback(async () => {
    try {
      setPartners(await api<Partner[]>("/api/partners"));
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
      setPartners([]);
    }
  }, []);
  useEffect(() => {
    // Ambil data saat tampil (pola repo: fetch-on-mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

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
        partners.map((partner) => (
          <Card key={partner.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white">
                  {partner.name} <span className="text-xs text-[#b8b8bf]">#{partner.code}</span>
                </h3>
                <p className="text-xs text-[#b8b8bf]">
                  {partner.productKind ?? "-"} · {partner.phone ?? "tanpa WA"} · {partner.productCount} produk ({partner.availableCount} tersedia, {partner.soldOutCount} habis)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={partner.status === "aktif" ? "green" : partner.status === "dibekukan" || partner.status === "nonaktif" ? "red" : "amber"}>{STATUS_LABEL[partner.status]}</Chip>
                <Chip tone={partner.operationalStatus === "buka" ? "green" : partner.operationalStatus === "jeda" ? "amber" : "red"}>{partner.operationalStatus.toUpperCase()}</Chip>
                <Btn onClick={() => setOpenId(openId === partner.id ? null : partner.id)}>{openId === partner.id ? "Tutup" : "Kelola"}</Btn>
              </div>
            </div>
            {openId === partner.id ? <PartnerDetail partner={partner} isOwner={isOwner} busy={busy} run={run} /> : null}
          </Card>
        ))
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

function PartnerDetail({ partner, isOwner, busy, run }: { partner: Partner; isOwner: boolean; busy: string | null; run: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void> }) {
  const [products, setProducts] = useState<Product[] | null>(null);
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
                  const reason = window.prompt(`Alasan: ${n.label}`);
                  if (reason?.trim()) void run(`status-${partner.id}-${n.to}`, () => api(`/api/partners/${partner.id}/status`, { method: "POST", body: JSON.stringify({ to: n.to, reason }) }), `Status mitra: ${STATUS_LABEL[n.to]}`);
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
              <Btn
                busy={busy === `acc-${a.id}`}
                onClick={() => {
                  const pin = window.prompt("PIN baru untuk mitra (6 angka). Sesi lama otomatis keluar.");
                  if (pin && /^\d{6}$/.test(pin)) void run(`acc-${a.id}`, () => api(`/api/partners/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ pin }) }), "PIN mitra diganti.");
                }}
              >
                Ganti PIN
              </Btn>
              <Btn tone="danger" busy={busy === `accs-${a.id}`} onClick={() => void run(`accs-${a.id}`, () => api(`/api/partners/accounts/${a.id}`, { method: "PATCH", body: JSON.stringify({ status: a.status === "active" ? "disabled" : "active" }) }), "Status akun diubah.")}>
                {a.status === "active" ? "Nonaktifkan" : "Aktifkan"}
              </Btn>
            </span>
          </div>
        ))}
        <form
          className="grid gap-2 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(`addacc-${partner.id}`, () => api(`/api/partners/${partner.id}/accounts`, { method: "POST", body: JSON.stringify(account) }), "Akun mitra dibuat. Berikan PIN langsung ke mitra.").then(() => setAccount({ ...account, pin: "" }));
          }}
        >
          <input required placeholder="No. HP login (0812…)" inputMode="tel" value={account.phone} onChange={(e) => setAccount({ ...account, phone: e.target.value })} className={inputCls} aria-label="Nomor HP login" />
          <input required placeholder="Nama" value={account.displayName} onChange={(e) => setAccount({ ...account, displayName: e.target.value })} className={inputCls} aria-label="Nama akun" />
          <input required placeholder="PIN 6 angka" inputMode="numeric" type="password" value={account.pin} onChange={(e) => setAccount({ ...account, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })} className={inputCls} aria-label="PIN" />
          <Btn type="submit" busy={busy === `addacc-${partner.id}`} disabled={account.pin.length !== 6}>
            <UserPlus className="size-4" /> Buat akun
          </Btn>
        </form>
      </div>

      <div className="grid content-start gap-3">
        <h4 className="text-sm font-bold text-white">Produk mitra & harga</h4>
        {products === null ? (
          <p className="text-sm text-[#b8b8bf]">Memuat…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-[#b8b8bf]">Belum ada produk.</p>
        ) : (
          <ul className="grid gap-2">
            {products.map((p) => (
              <li key={p.linkId} className="rounded-lg border border-[#2a2a30] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">
                    {p.code} · {p.name}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Chip tone={p.active ? "green" : "amber"}>{p.active ? "Disetujui" : "Menunggu Owner"}</Chip>
                    <Chip tone={p.available ? "green" : "red"}>{p.available ? "Tersedia" : "Habis"}</Chip>
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#b8b8bf]">{p.variants.map((v) => `${v.label}: HPP ${rp(v.unitCost ?? 0)} · jual ${rp(v.sellPrice)} · laba ${rp(v.sellPrice - (v.unitCost ?? 0))}`).join(" | ")}</p>
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
                </div>
                {editing === p.linkId ? (
                  // key ikut harga terkini: setelah aturan harga/perubahan lain, form dibuat ulang dari data server
                  // (tidak menyimpan harga lama sebagai "perubahan" yang bisa membatalkan aturan).
                  <ProductSettings key={`${p.linkId}:${p.variants.map((v) => `${v.variantId}=${v.unitCost ?? 0}/${v.sellPrice}`).join(",")}`} product={p} isOwner={isOwner} busy={busy} runP={runP} />
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
          <input required placeholder="Kode (PAU-001)" value={product.code} onChange={(e) => setProduct({ ...product, code: e.target.value })} className={inputCls} aria-label="Kode produk" />
          <input required placeholder="Nama produk" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} className={inputCls} aria-label="Nama produk" />
          <input required placeholder="Kategori" value={product.category} onChange={(e) => setProduct({ ...product, category: e.target.value })} className={inputCls} aria-label="Kategori" />
          <input required placeholder="HPP mitra" inputMode="numeric" value={product.unitCost} onChange={(e) => setProduct({ ...product, unitCost: e.target.value.replace(/\D/g, "") })} className={inputCls} aria-label="HPP mitra" />
          <input required placeholder="Harga jual" inputMode="numeric" value={product.sellPrice} onChange={(e) => setProduct({ ...product, sellPrice: e.target.value.replace(/\D/g, "") })} className={inputCls} aria-label="Harga jual" />
          <Btn type="submit" tone="primary" busy={busy === `addprod-${partner.id}`}>
            <Plus className="size-4" /> Tambah produk
          </Btn>
        </form>
      </div>
    </div>
  );
}

type RunP = (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;

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
        <Field label="Foto produk (https:// atau /garage-uploads/…)">
          <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="kosongkan bila belum ada foto" className={inputCls} />
        </Field>
        <Field label="Deskripsi singkat">
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} className={inputCls} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm text-[#e4e4e8] sm:col-span-2">
          <input type="checkbox" checked={form.showInDigitalMenu} onChange={(e) => setForm({ ...form, showInDigitalMenu: e.target.checked })} className="size-4" />
          Tampil di menu digital pelanggan (lihat saja — pelanggan tetap pesan lewat waiter/kasir)
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
