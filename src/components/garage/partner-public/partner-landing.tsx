"use client";

// Halaman publik "Jadi Mitra Garage Coffee" (/mitra) — Crystal V5. Calon mitra membaca cara kerja sama lalu
// mengirim penawaran produk (POST /api/partner-applications). Tidak ada harga/HPP Garage yang ditampilkan di sini.

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BadgeCheck, CheckCircle2, ClipboardList, FileText, HandCoins, Handshake, LogIn, Plus, Smartphone, Store, Trash2 } from "lucide-react";

import { CrystalButton, CrystalCard } from "@/components/crystal/crystal";
import { GarageBrandLogo } from "@/components/garage/member-auth/garage-brand-logo";

type ProductRow = { name: string; offerPrice: string; suggestedPrice: string; note: string };

const BENEFITS = [
  { icon: Store, title: "Dijual di kasir & waiter Garage", text: "Produk Anda tampil di POS kasir dan dipesankan waiter langsung dari meja pelanggan." },
  { icon: Smartphone, title: "Portal Mitra di HP", text: "Terima pesanan, tandai Siap Antar, atur Tersedia/Habis dan jam buka langsung dari HP." },
  { icon: FileText, title: "Laporan transparan", text: "Setiap transaksi tercatat: nomor order, meja, jumlah, dan setoran. Laporan PDF resmi per periode." },
  { icon: HandCoins, title: "Setoran terjadwal", text: "Pembayaran ke mitra lewat transfer sesuai kesepakatan, setelah rekonsiliasi — tercatat dan bisa dicek." },
];
const STEPS = [
  "Kirim penawaran lewat formulir di bawah.",
  "Tim Garage menghubungi Anda via WhatsApp untuk mencicipi & membahas harga.",
  "Kesepakatan harga, cara serah-terima, dan jadwal setoran ditandatangani.",
  "Akun Portal Mitra dibuat; produk Anda disetujui dan mulai dijual.",
];
const KINDS = ["Es krim / dessert", "Dimsum / gorengan", "Kue & roti", "Minuman", "Makanan berat", "Lainnya"];

const rupiahInput = (value: string) => value.replace(/\D/g, "").slice(0, 8);
const formatRp = (value: string) => (value ? `Rp ${new Intl.NumberFormat("id-ID").format(Number(value))}` : "");
const emptyRow = (): ProductRow => ({ name: "", offerPrice: "", suggestedPrice: "", note: "" });

export function PartnerLanding() {
  return (
    <main className="gc-root min-h-dvh bg-[var(--gc-bg)] pb-16 text-[var(--gc-text)]">
      <header className="sticky top-0 z-20 border-b border-[var(--gc-edge)] bg-[var(--gc-bg-2)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="block w-32 shrink-0" aria-label="Garage Coffee — beranda">
            <GarageBrandLogo sizes="128px" />
          </Link>
          <div className="flex items-center gap-2">
            <a href="/partner" className="gc-btn gc-btn-ghost min-h-11 px-3 text-sm">
              <LogIn className="size-4" aria-hidden /> Login Mitra
            </a>
            <a href="#daftar" className="gc-btn gc-btn-primary min-h-11 px-4 text-sm">
              Daftar
            </a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pt-10 sm:pt-16">
        <p className="gc-eyebrow">Kerja sama mitra resmi</p>
        <h1 className="gc-display mt-3 max-w-3xl text-4xl leading-[1.05] sm:text-6xl">
          Jadi Mitra <span className="text-[var(--gc-laser-bright)]">Garage Coffee</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--gc-text-2)] sm:text-lg">
          Punya es krim, dimsum, dessert, atau kuliner andalan? Titipkan di Garage Coffee Tebing Tinggi. Kami yang menjual di kasir &amp; meja
          pelanggan, Anda fokus membuat produk terbaik — semua pesanan dan setoran tercatat rapi.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#daftar" className="gc-btn gc-btn-primary min-h-12 px-5">
            Kirim penawaran <ArrowRight className="size-4" aria-hidden />
          </a>
          <a href="#cara-kerja" className="gc-btn gc-btn-secondary min-h-12 px-5">
            Cara kerja sama
          </a>
        </div>
      </section>

      <section className="mx-auto mt-12 grid max-w-6xl gap-3 px-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Keuntungan menjadi mitra">
        {BENEFITS.map(({ icon: Icon, title, text }) => (
          <CrystalCard key={title} className="p-5">
            <Icon className="size-6 text-[var(--gc-laser-bright)]" aria-hidden />
            <h2 className="mt-3 text-base font-bold">{title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--gc-text-2)]">{text}</p>
          </CrystalCard>
        ))}
      </section>

      <section id="cara-kerja" className="mx-auto mt-12 grid max-w-6xl gap-6 px-4 lg:grid-cols-2">
        <CrystalCard className="p-5 sm:p-6">
          <p className="gc-eyebrow">Alur</p>
          <h2 className="gc-display mt-2 text-2xl">Cara kerja sama</h2>
          <ol className="mt-4 grid gap-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--gc-red)] text-sm font-black text-white">{index + 1}</span>
                <span className="pt-1 text-sm leading-relaxed text-[var(--gc-text)]">{step}</span>
              </li>
            ))}
          </ol>
        </CrystalCard>
        <CrystalCard className="p-5 sm:p-6">
          <p className="gc-eyebrow">Yang perlu disiapkan</p>
          <h2 className="gc-display mt-2 text-2xl">Syarat mitra</h2>
          <ul className="mt-4 grid gap-2 text-sm leading-relaxed">
            {[
              "Produk siap jual dengan rasa & porsi konsisten.",
              "Harga ke Garage (HPP) per produk yang jelas.",
              "Nomor WhatsApp aktif & rekening bank atas nama usaha/pemilik.",
              "Bisa mengantar ke Garage atau membuat di area yang disepakati, sesuai jam buka.",
              "Izin usaha (NIB / PIRT / Halal) menjadi nilai tambah.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-[var(--gc-emerald)]" aria-hidden /> {item}
              </li>
            ))}
          </ul>
        </CrystalCard>
      </section>

      <section id="daftar" className="mx-auto mt-12 max-w-4xl scroll-mt-20 px-4">
        <ApplicationForm />
      </section>

      <section className="mx-auto mt-12 max-w-4xl px-4" aria-label="Pertanyaan umum">
        <h2 className="gc-display text-2xl">Pertanyaan umum</h2>
        <div className="mt-4 grid gap-2">
          {[
            ["Apakah ada biaya pendaftaran?", "Tidak. Mendaftar dan konsultasi gratis."],
            ["Berapa keuntungan Garage?", "Garage menjual dengan harga jual yang disepakati; mitra menerima harga ke Garage (HPP) per produk terjual. Detailnya dibahas saat pertemuan."],
            ["Kapan setoran dibayar?", "Sesuai kesepakatan (mis. setelah tutup operasional atau mingguan), lewat transfer setelah rekonsiliasi. Mitra bisa melihat laporan & PDF resmi di Portal Mitra."],
            ["Bagaimana jika produk habis?", "Tandai Habis di Portal Mitra — kasir & waiter langsung tidak bisa menjualnya. Tidak ada stok angka yang perlu dihitung."],
          ].map(([q, a]) => (
            <details key={q} className="gc-glass rounded-[var(--gc-radius)] p-4">
              <summary className="cursor-pointer text-sm font-semibold">{q}</summary>
              <p className="mt-2 text-sm leading-relaxed text-[var(--gc-text-2)]">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-[var(--gc-text-2)]">
          Sudah jadi mitra?{" "}
          <a href="/partner" className="font-semibold text-[var(--gc-laser-bright)] underline underline-offset-4">
            Masuk ke Portal Mitra
          </a>
        </p>
      </section>
    </main>
  );
}

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-semibold text-[var(--gc-cream)]">
        {label} {required ? <span className="text-[var(--gc-laser-bright)]">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs text-[var(--gc-text-2)]">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  "min-h-12 w-full rounded-[var(--gc-radius-sm)] border border-[var(--gc-edge-strong)] bg-[var(--gc-surface-2)] px-3 text-base text-white outline-none placeholder:text-[#8d8d94] focus-visible:border-[var(--gc-amber)] focus-visible:ring-2 focus-visible:ring-[var(--gc-amber)]/40";

function ApplicationForm() {
  const [form, setForm] = useState({
    businessName: "",
    ownerName: "",
    whatsapp: "",
    email: "",
    city: "Tebing Tinggi",
    address: "",
    productKind: "",
    instagram: "",
    deliveryMode: "",
    operatingHours: "",
    message: "",
    website: "",
  });
  const [legality, setLegality] = useState<string[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([emptyRow()]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm({ ...form, [key]: event.target.value });
  const setRow = (index: number, patch: Partial<ProductRow>) => setProducts(products.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const filled = products.filter((row) => row.name.trim() || row.offerPrice);
    if (!filled.length) return setError("Isi minimal satu produk yang ditawarkan.");
    if (filled.some((row) => !row.name.trim() || !row.offerPrice)) return setError("Setiap produk wajib punya nama dan harga ke Garage.");
    if (!consent) return setError("Centang persetujuan pemrosesan data.");
    setBusy(true);
    try {
      const res = await fetch("/api/partner-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          legality,
          consent,
          products: filled.map((row) => ({
            name: row.name.trim(),
            offerPrice: Number(row.offerPrice),
            suggestedPrice: row.suggestedPrice ? Number(row.suggestedPrice) : null,
            note: row.note.trim() || null,
          })),
        }),
      });
      const json = (await res.json().catch(() => null)) as { data?: { applicationNo: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Pendaftaran gagal dikirim. Coba lagi.");
      setDone(json.data.applicationNo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <CrystalCard className="p-6 text-center sm:p-8" laser>
        <CheckCircle2 className="mx-auto size-12 text-[var(--gc-emerald)]" aria-hidden />
        <h2 className="gc-display mt-3 text-2xl">Penawaran terkirim</h2>
        <p className="mt-2 text-sm text-[var(--gc-text-2)]">
          Nomor pendaftaran Anda <b className="text-white">{done}</b>. Tim Garage Coffee akan menghubungi lewat WhatsApp untuk langkah berikutnya.
        </p>
      </CrystalCard>
    );
  }

  return (
    <CrystalCard className="p-5 sm:p-7" laser>
      <div className="flex items-center gap-3">
        <Handshake className="size-7 text-[var(--gc-laser-bright)]" aria-hidden />
        <div>
          <p className="gc-eyebrow">Formulir mitra</p>
          <h2 className="gc-display text-2xl">Kirim penawaran kerja sama</h2>
        </div>
      </div>
      <form className="mt-6 grid gap-5" onSubmit={(event) => void submit(event)} noValidate>
        {/* Honeypot: tidak terlihat oleh manusia. */}
        <input type="text" name="website" value={form.website} onChange={set("website")} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama usaha / merek" required>
            <input value={form.businessName} onChange={set("businessName")} required maxLength={120} className={inputCls} placeholder="mis. Es Krim Pokat Au" />
          </Field>
          <Field label="Nama pemilik / PIC" required>
            <input value={form.ownerName} onChange={set("ownerName")} required maxLength={120} className={inputCls} autoComplete="name" />
          </Field>
          <Field label="Nomor WhatsApp" required>
            <input value={form.whatsapp} onChange={set("whatsapp")} required inputMode="tel" autoComplete="tel" maxLength={20} className={inputCls} placeholder="08xx" />
          </Field>
          <Field label="Email">
            <input value={form.email} onChange={set("email")} type="email" autoComplete="email" maxLength={160} className={inputCls} />
          </Field>
          <Field label="Jenis produk" required>
            <input value={form.productKind} onChange={set("productKind")} required list="mitra-kinds" maxLength={120} className={inputCls} placeholder="Pilih atau ketik" />
            <datalist id="mitra-kinds">
              {KINDS.map((kind) => (
                <option key={kind} value={kind} />
              ))}
            </datalist>
          </Field>
          <Field label="Instagram usaha">
            <input value={form.instagram} onChange={set("instagram")} maxLength={120} className={inputCls} placeholder="@namausaha" />
          </Field>
          <Field label="Kota">
            <input value={form.city} onChange={set("city")} maxLength={120} className={inputCls} />
          </Field>
          <Field label="Alamat produksi / usaha">
            <input value={form.address} onChange={set("address")} maxLength={300} className={inputCls} autoComplete="street-address" />
          </Field>
        </div>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold text-[var(--gc-cream)]">
            Produk yang ditawarkan <span className="text-[var(--gc-laser-bright)]">*</span>
          </legend>
          <p className="-mt-1 text-xs text-[var(--gc-text-2)]">
            <b className="text-white">Harga ke Garage</b> = harga yang Anda terima per porsi (HPP). Harga jual usulan boleh dikosongkan — dibahas bersama.
          </p>
          {products.map((row, index) => (
            <div key={index} className="grid gap-2 rounded-[var(--gc-radius-sm)] border border-[var(--gc-edge)] p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
              <Field label={`Produk ${index + 1}`}>
                <input value={row.name} onChange={(e) => setRow(index, { name: e.target.value })} maxLength={120} className={inputCls} placeholder="mis. Dimsum Ayam" />
              </Field>
              <Field label="Harga ke Garage" hint={formatRp(row.offerPrice)}>
                <input value={row.offerPrice} onChange={(e) => setRow(index, { offerPrice: rupiahInput(e.target.value) })} inputMode="numeric" className={inputCls} placeholder="22000" />
              </Field>
              <Field label="Harga jual usulan" hint={formatRp(row.suggestedPrice)}>
                <input value={row.suggestedPrice} onChange={(e) => setRow(index, { suggestedPrice: rupiahInput(e.target.value) })} inputMode="numeric" className={inputCls} placeholder="opsional" />
              </Field>
              <button
                type="button"
                onClick={() => setProducts(products.length > 1 ? products.filter((_, i) => i !== index) : [emptyRow()])}
                className="gc-btn gc-btn-ghost min-h-12 px-3"
                aria-label={`Hapus produk ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
              <div className="sm:col-span-4">
                <input value={row.note} onChange={(e) => setRow(index, { note: e.target.value })} maxLength={200} className={inputCls} placeholder="Catatan (isi per porsi, varian rasa, dll.) — opsional" aria-label={`Catatan produk ${index + 1}`} />
              </div>
            </div>
          ))}
          {products.length < 30 ? (
            <CrystalButton onClick={() => setProducts([...products, emptyRow()])} className="justify-self-start" icon={<Plus className="size-4" aria-hidden />}>
              Tambah produk
            </CrystalButton>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="grid gap-2">
            <legend className="text-sm font-semibold text-[var(--gc-cream)]">Cara serah-terima produk</legend>
            {[
              ["antar_ke_garage", "Saya mengantar produk ke Garage"],
              ["dibuat_di_garage", "Saya membuat di area Garage"],
              ["diambil_garage", "Garage mengambil ke tempat saya"],
            ].map(([value, label]) => (
              <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="radio" name="deliveryMode" value={value} checked={form.deliveryMode === value} onChange={set("deliveryMode")} className="size-4" />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="grid content-start gap-4">
            <Field label="Jam operasional">
              <input value={form.operatingHours} onChange={set("operatingHours")} maxLength={160} className={inputCls} placeholder="mis. Setiap hari 15.00–22.00" />
            </Field>
            <fieldset className="grid gap-1">
              <legend className="text-sm font-semibold text-[var(--gc-cream)]">Izin usaha yang dimiliki</legend>
              <div className="flex flex-wrap gap-3">
                {["NIB", "PIRT", "Halal", "BPOM"].map((item) => (
                  <label key={item} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={legality.includes(item)}
                      onChange={(e) => setLegality(e.target.checked ? [...legality, item] : legality.filter((x) => x !== item))}
                      className="size-4"
                    />
                    {item}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        <Field label="Pesan untuk tim Garage">
          <textarea value={form.message} onChange={set("message")} maxLength={2000} rows={4} className={`${inputCls} py-3`} placeholder="Ceritakan singkat produk & keunggulan Anda" />
        </Field>

        <label className="flex items-start gap-3 text-sm leading-relaxed text-[var(--gc-text-2)]">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-4 shrink-0" />
          Saya setuju data di atas dipakai Garage Coffee hanya untuk menilai dan menghubungi saya terkait kerja sama mitra.
        </label>

        {error ? (
          <p role="alert" className="rounded-[var(--gc-radius-sm)] border border-[var(--gc-edge-laser)] bg-[#3a1015] px-3 py-2 text-sm text-[#ffd0d4]">
            {error}
          </p>
        ) : null}
        <CrystalButton type="submit" tone="primary" loading={busy} className="min-h-12 w-full sm:w-auto sm:justify-self-start" icon={<ClipboardList className="size-4" aria-hidden />}>
          Kirim penawaran
        </CrystalButton>
      </form>
    </CrystalCard>
  );
}
