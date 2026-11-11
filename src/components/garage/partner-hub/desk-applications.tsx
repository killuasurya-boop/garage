"use client";

// Pendaftar calon mitra dari halaman publik /mitra (Owner/Manajer). Tinjau penawaran, ubah status, hubungi lewat WA,
// lalu (Owner) "Jadikan mitra" → mitra DRAFT + produk NONAKTIF. Aktivasi tetap lewat Kelola Mitra.

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, RefreshCw, UserCheck } from "lucide-react";

import { api, Btn, Card, Chip, dateWib, Field, inputCls, Notice, rp } from "./desk-shared";

type Application = {
  id: string;
  applicationNo: string;
  businessName: string;
  ownerName: string;
  whatsapp: string;
  email: string | null;
  city: string | null;
  address: string | null;
  productKind: string;
  instagram: string | null;
  legality: string[];
  products: Array<{ name: string; offerPrice: number; suggestedPrice: number | null; note: string | null }>;
  deliveryMode: string | null;
  operatingHours: string | null;
  message: string | null;
  status: string;
  reviewNote: string | null;
  partnerId: string | null;
  createdAt: string;
};

const STATUS: Record<string, { label: string; tone: "amber" | "blue" | "green" | "red" }> = {
  baru: { label: "Baru", tone: "amber" },
  dihubungi: { label: "Sudah dihubungi", tone: "blue" },
  diterima: { label: "Diterima", tone: "green" },
  ditolak: { label: "Ditolak", tone: "red" },
};
const DELIVERY: Record<string, string> = {
  antar_ke_garage: "Mitra mengantar produk ke Garage",
  dibuat_di_garage: "Dibuat di area Garage",
  diambil_garage: "Diambil oleh Garage",
};

function waLink(app: Application) {
  const digits = app.whatsapp.replace(/\D/g, "");
  const wa = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  const text = `Halo ${app.ownerName}, terima kasih sudah mendaftar sebagai mitra Garage Coffee (${app.applicationNo} · ${app.businessName}). Kami ingin membahas penawaran produk Anda.`;
  return `https://wa.me/${wa}?text=${encodeURIComponent(text)}`;
}

export function DeskApplications({ role }: { role: string }) {
  const [rows, setRows] = useState<Application[] | null>(null);
  const [filter, setFilter] = useState<string>("aktif");
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);
  const isOwner = role === "Owner";

  const load = useCallback(async () => {
    try {
      setRows(await api<Application[]>("/api/partners/applications"));
    } catch (error) {
      setMessage({ tone: "error", text: (error as Error).message });
      setRows([]);
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

  const list = (rows ?? []).filter((row) => (filter === "aktif" ? row.status === "baru" || row.status === "dihubungi" : filter === "semua" ? true : row.status === filter));
  const fresh = (rows ?? []).filter((row) => row.status === "baru").length;

  return (
    <div className="grid gap-4">
      <Notice message={message} />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white">Pendaftar calon mitra {fresh ? <span className="ml-1 rounded-full bg-[#d11a2a] px-2 py-0.5 text-xs">{fresh} baru</span> : null}</h3>
            <p className="text-xs text-[#b8b8bf]">
              Dari halaman publik{" "}
              <a href="/mitra" target="_blank" rel="noopener" className="font-semibold text-[#ffd08a] underline underline-offset-2">
                garagecoffee.id/mitra
              </a>
              . Harga penawaran = HPP usulan mitra; belum mengikat sebelum disepakati.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Tampilkan">
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className={inputCls}>
                <option value="aktif">Perlu ditindak</option>
                <option value="diterima">Diterima</option>
                <option value="ditolak">Ditolak</option>
                <option value="semua">Semua</option>
              </select>
            </Field>
            <Btn onClick={() => void load()}>
              <RefreshCw className="size-4" /> Muat ulang
            </Btn>
          </div>
        </div>
      </Card>
      {rows === null ? (
        <Card>
          <p className="text-sm text-[#b8b8bf]">Memuat pendaftar…</p>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <p className="text-center text-sm text-[#b8b8bf]">Belum ada pendaftar di daftar ini.</p>
        </Card>
      ) : (
        list.map((app) => (
          <Card key={app.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-base font-bold text-white">
                  {app.businessName} <span className="text-xs font-semibold text-[#b8b8bf]">{app.applicationNo}</span>
                </h4>
                <p className="text-xs text-[#b8b8bf]">
                  {app.ownerName} · {app.whatsapp}
                  {app.email ? ` · ${app.email}` : ""} · {app.productKind}
                  {app.city ? ` · ${app.city}` : ""} · daftar {dateWib(app.createdAt)}
                </p>
                <p className="mt-1 text-xs text-[#d4d4d8]">
                  {app.deliveryMode ? DELIVERY[app.deliveryMode] ?? app.deliveryMode : "Cara serah-terima belum diisi"}
                  {app.operatingHours ? ` · Jam: ${app.operatingHours}` : ""}
                  {app.legality.length ? ` · Izin: ${app.legality.join(", ")}` : " · Izin usaha belum ada"}
                  {app.instagram ? ` · IG ${app.instagram}` : ""}
                </p>
              </div>
              <Chip tone={STATUS[app.status]?.tone ?? "amber"}>{STATUS[app.status]?.label ?? app.status}</Chip>
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-[#2a2a30]">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-[#0f0f12] text-xs uppercase tracking-wide text-[#b8b8bf]">
                  <tr>
                    <th className="px-2 py-2">Produk</th>
                    <th className="px-2 py-2">Harga ke Garage</th>
                    <th className="px-2 py-2">Harga jual usulan</th>
                    <th className="px-2 py-2">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {app.products.map((p, index) => (
                    <tr key={index} className="border-t border-[#2a2a30] text-[#f4f4f5]">
                      <td className="px-2 py-2">{p.name}</td>
                      <td className="px-2 py-2 tabular-nums">{rp(p.offerPrice)}</td>
                      <td className="px-2 py-2 tabular-nums">{p.suggestedPrice ? rp(p.suggestedPrice) : "-"}</td>
                      <td className="px-2 py-2 text-xs text-[#b8b8bf]">{p.note ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {app.message ? <p className="mt-2 text-sm text-[#e4e4e8]">“{app.message}”</p> : null}
            {app.reviewNote ? <p className="mt-1 text-xs text-[#ffd08a]">Catatan tim: {app.reviewNote}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={waLink(app)} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#22c55e]/50 px-3 text-sm font-semibold text-[#bbf7d0] hover:bg-[#14532d]/50">
                <MessageCircle className="size-4" /> Hubungi via WA
              </a>
              {app.status === "baru" ? (
                <Btn busy={busy === `${app.id}-contact`} onClick={() => void run(`${app.id}-contact`, () => api(`/api/partners/applications/${app.id}`, { method: "PATCH", body: JSON.stringify({ status: "dihubungi" }) }), "Ditandai sudah dihubungi.")}>
                  Tandai sudah dihubungi
                </Btn>
              ) : null}
              <Btn
                busy={busy === `${app.id}-note`}
                onClick={() => {
                  const note = window.prompt("Catatan tim untuk pendaftar ini", app.reviewNote ?? "");
                  if (note !== null) void run(`${app.id}-note`, () => api(`/api/partners/applications/${app.id}`, { method: "PATCH", body: JSON.stringify({ reviewNote: note }) }), "Catatan disimpan.");
                }}
              >
                Catatan
              </Btn>
              {app.status !== "ditolak" && !app.partnerId ? (
                <Btn
                  tone="danger"
                  busy={busy === `${app.id}-reject`}
                  onClick={() => {
                    const note = window.prompt("Alasan menolak (disimpan sebagai catatan tim)");
                    if (note?.trim()) void run(`${app.id}-reject`, () => api(`/api/partners/applications/${app.id}`, { method: "PATCH", body: JSON.stringify({ status: "ditolak", reviewNote: note }) }), "Pendaftar ditolak.");
                  }}
                >
                  Tolak
                </Btn>
              ) : null}
              {isOwner && !app.partnerId && app.status !== "ditolak" ? (
                <Btn tone="success" onClick={() => setConverting(converting === app.id ? null : app.id)}>
                  <UserCheck className="size-4" /> Jadikan mitra
                </Btn>
              ) : null}
              {app.partnerId ? <Chip tone="green">Sudah jadi mitra Draft — lanjutkan di Kelola Mitra</Chip> : null}
            </div>
            {converting === app.id ? <ConvertForm app={app} busy={busy} run={run} onDone={() => setConverting(null)} /> : null}
          </Card>
        ))
      )}
    </div>
  );
}

function ConvertForm({ app, busy, run, onDone }: { app: Application; busy: string | null; run: (key: string, fn: () => Promise<unknown>, ok: string) => Promise<void>; onDone: () => void }) {
  const [code, setCode] = useState(() => app.businessName.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase());
  const [margin, setMargin] = useState("3000");
  const [category, setCategory] = useState(app.productKind);
  return (
    <form
      className="mt-3 grid gap-2 rounded-lg border border-[#3a3a42] bg-black/20 p-3 sm:grid-cols-4 sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        void run(`${app.id}-convert`, () => api(`/api/partners/applications/${app.id}/convert`, { method: "POST", body: JSON.stringify({ code, margin: Number(margin), category }) }), "Mitra Draft dibuat dengan produk nonaktif. Lengkapi rekening, akun, lalu aktifkan di Kelola Mitra.").then(onDone);
      }}
    >
      <Field label="Kode mitra (2–8)">
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase())} required minLength={2} className={inputCls} />
      </Field>
      <Field label="Kategori produk">
        <input value={category} onChange={(e) => setCategory(e.target.value)} required minLength={2} className={inputCls} />
      </Field>
      <Field label="Laba Garage bila harga jual kosong (Rp)">
        <input inputMode="numeric" value={margin} onChange={(e) => setMargin(e.target.value.replace(/\D/g, ""))} className={inputCls} />
      </Field>
      <Btn type="submit" tone="primary" busy={busy === `${app.id}-convert`} disabled={code.length < 2}>
        Buat mitra Draft
      </Btn>
    </form>
  );
}
