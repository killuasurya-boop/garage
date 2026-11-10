"use client";

// Kelola Mitra (Owner/Manajer, papan 05): registrasi, status siklus hidup, rekening, akun login, produk & harga.
// Aksi Owner-only (setujui/aktifkan, verifikasi rekening, setujui produk, ubah harga) dicek ulang di server.

import { useCallback, useEffect, useState } from "react";
import { Plus, ShieldCheck, UserPlus } from "lucide-react";

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
type Product = { linkId: string; code: string; name: string; category: string; active: boolean; available: boolean; variants: Array<{ variantId: string; label: string; sellPrice: number; unitCost?: number }> };

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
  const [lastOrder, setLastOrder] = useState<Record<string, string>>(() => Object.fromEntries(DAYS.map((_, i) => [String(i), partner.lastOrderByDay?.[String(i)] ?? ""])));
  const [bank, setBank] = useState({ bankName: "", accountName: "", accountNumber: "" });
  const [account, setAccount] = useState({ phone: partner.phone ?? "", displayName: partner.picName ?? "", pin: "" });
  const [product, setProduct] = useState({ code: "", name: "", category: partner.productKind ?? "", unitCost: "", sellPrice: "" });

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
    <div className="mt-4 grid gap-4 border-t border-[#2a2a30] pt-4 lg:grid-cols-2">
      <div className="grid gap-3">
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
        <Field label="Kesepakatan harga, pembatalan & serah-terima (wajib sebelum aktif)">
          <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className={`${inputCls} h-auto py-2`} />
        </Field>
        <div>
          <p className="text-sm font-semibold text-[#e4e4e8]">Last order (WIB, kosong = tanpa batas)</p>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DAYS.map((day, i) => (
              <label key={day} className="grid min-w-0 gap-1 text-xs text-[#b8b8bf]">
                {day}
                <input type="time" value={lastOrder[String(i)]} onChange={(e) => setLastOrder({ ...lastOrder, [String(i)]: e.target.value })} className={`${inputCls} h-10 min-w-0 px-2`} />
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
                () => api(`/api/partners/${partner.id}`, { method: "PATCH", body: JSON.stringify({ terms, lastOrderByDay: Object.fromEntries(Object.entries(lastOrder).map(([k, v]) => [k, v || null])) }) }),
                "Data mitra disimpan.",
              )
            }
          >
            Simpan kesepakatan & jam
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
            <span className="text-[#f4f4f5]">
              {a.displayName} · {a.phone}
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
          <input required placeholder="No. HP login" inputMode="tel" value={account.phone} onChange={(e) => setAccount({ ...account, phone: e.target.value })} className={inputCls} aria-label="Nomor HP login" />
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
                  {isOwner ? (
                    <Btn
                      busy={busy === `pprice-${p.linkId}`}
                      onClick={() => {
                        const v = p.variants[0];
                        const cost = window.prompt(`HPP baru ${p.name} (${v.label})`, String(v.unitCost ?? 0));
                        const sell = cost ? window.prompt(`Harga jual baru ${p.name} (${v.label})`, String(v.sellPrice)) : null;
                        const reason = sell ? window.prompt("Alasan perubahan harga") : null;
                        if (cost && sell && reason?.trim()) void runP(`pprice-${p.linkId}`, () => api(`/api/partners/products/${p.linkId}`, { method: "PATCH", body: JSON.stringify({ price: { variantId: v.variantId, unitCost: Number(cost), sellPrice: Number(sell), reason } }) }), "Harga baru berlaku untuk transaksi berikutnya.");
                      }}
                    >
                      Ubah harga
                    </Btn>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
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
