// =============================================================================
// Unggah foto dari ChatGPT (Owner, 17 Nov 2026) — dua langkah:
//
// 1. siapkan_foto (R1): Owner mengunggah foto di chat → ChatGPT menyerahkan
//    `download_url` → server mengunduh, memvalidasi, meng-encode ulang, dan
//    menyimpannya SEMENTARA (mcp-photo-staging.ts). Belum mengubah data apa pun.
// 2. pasang_foto (R2): preview → konfirmasi Owner → foto sementara dikirim ke
//    endpoint unggah yang SUDAH ADA (validasi, kompresi & audit route itu tetap
//    berlaku) lewat API key sementara yang langsung dicabut.
//
// Dipisah dua langkah supaya argumen yang dikonfirmasi (`fotoId`) stabil — URL
// unduhan ChatGPT bisa berubah antarpanggilan dan tidak boleh tersimpan di
// mcp_operations/audit. Tujuan dibatasi daftar tetap (bukan path bebas); bukti
// uang (struk kas, bukti transfer, dokumen) sengaja TIDAK termasuk.
// Hanya Owner lewat pintu berkonfirmasi (`confirmOnly`), bukan API key agent.
// =============================================================================
import { z } from "zod";

import { AgentToolError, type AgentTool } from "@/lib/agent-tool-core";
import type { GarageSession } from "@/lib/server-auth";

export const PHOTO_TARGETS = ["produk_menu", "produk_mitra", "bahan_gudang", "hero_website", "suasana_website", "logo_sponsor", "logo_talent"] as const;
export type PhotoTarget = (typeof PHOTO_TARGETS)[number];

const TARGET_LABEL: Record<PhotoTarget, string> = {
  produk_menu: "Foto produk menu",
  produk_mitra: "Foto produk mitra",
  bahan_gudang: "Foto bahan/produk gudang",
  hero_website: "Foto hero website",
  suasana_website: "Foto suasana outlet di website",
  logo_sponsor: "Logo sponsor event",
  logo_talent: "Logo talent/band event",
};

/** Logo sponsor/talent disimpan LANGSUNG lewat service (Owner manusia), bukan rute delegasi (key agent ditolak di sana). */
const EVENT_LOGO_TARGETS = new Set<PhotoTarget>(["logo_sponsor", "logo_talent"]);

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export type PhotoRoute = { path: string; fields: Record<string, string>; infoPath: string | null; label: string };

/** Endpoint unggah untuk satu tujuan. Murni — dites di agent-tools-foto.test.ts. Melempar bila argumen tidak lengkap. */
export function photoRoute(tujuan: PhotoTarget, id: string | undefined, slot: number | undefined): PhotoRoute {
  const label = TARGET_LABEL[tujuan];
  if (tujuan === "hero_website") return { path: "/api/site/landing-hero", fields: { slot: "landing_hero" }, infoPath: null, label };
  if (tujuan === "suasana_website") {
    if (!slot || !Number.isInteger(slot) || slot < 1 || slot > 4) {
      throw new AgentToolError("VALIDATION_ERROR", "Foto suasana butuh `slot` 1–4.");
    }
    return { path: "/api/site/landing-hero", fields: { slot: `suasana_${slot}` }, infoPath: null, label: `${label} (slot ${slot})` };
  }
  if (!id || !SAFE_ID.test(id)) {
    throw new AgentToolError("VALIDATION_ERROR", `${label} butuh \`id\` (huruf, angka, - atau _). Cari id-nya dulu dengan tool baca.`);
  }
  if (tujuan === "produk_menu") return { path: `/api/menu/${id}/image`, fields: {}, infoPath: `/api/menu/${id}`, label };
  if (tujuan === "produk_mitra") return { path: `/api/partners/products/${id}/image`, fields: {}, infoPath: null, label };
  if (tujuan === "logo_sponsor") return { path: `/api/sponsors/${id}/logo`, fields: {}, infoPath: null, label };
  if (tujuan === "logo_talent") return { path: `/api/event-lineup/performers/${id}/logo`, fields: {}, infoPath: null, label };
  return { path: `/api/wms/products/${id}/image`, fields: {}, infoPath: `/api/wms/products/${id}`, label };
}

function assertOwnerViaChat(session: GarageSession) {
  if (session.profile.role !== "Owner" || session.profile.agentKey) {
    throw new AgentToolError("FORBIDDEN", "Unggah foto lewat chat hanya untuk Owner.", 403);
  }
}

const stagedSummary = (meta: { fotoId: string; width: number; height: number; bytes: number; sha256: string; expiresAt: string }) => ({
  fotoId: meta.fotoId,
  ukuran: `${meta.width}×${meta.height} px`,
  berat: `${Math.round(meta.bytes / 1024)} KB`,
  sidik: meta.sha256.slice(0, 16),
  berlakuSampai: meta.expiresAt,
});

const siapkanInput = z.object({
  foto: z.looseObject({
    download_url: z.string().url().max(4000),
    file_id: z.string().max(200).optional(),
  }),
});

const pasangInput = z.object({
  fotoId: z.string().regex(/^[a-f0-9]{32}$/, "fotoId berasal dari siapkan_foto."),
  tujuan: z.enum(PHOTO_TARGETS),
  id: z.string().trim().max(80).optional(),
  /** produk_menu / produk_mitra: cukup nama produk (mis. "Nasi Goreng", "Es Krim Pokat Au"); Garage & mitra dicari. */
  nama: z.string().trim().min(2).max(120).optional(),
  slot: z.number().int().min(1).max(4).optional(),
  alasan: z.string().trim().min(3, "Tulis alasan singkat.").max(300),
});

/**
 * Cari produk dari `nama` (Owner 18 Nov 2026: cukup sebut nama, produk Garage maupun mitra).
 * Produk menu yang tidak diarsip; produk mitra memakai id link-nya (termasuk yang menunggu persetujuan).
 * `hanya`: "mitra" = produk mitra saja, "garage" = produk Garage saja, kosong = keduanya.
 * Nama persis (tanpa beda huruf besar/kecil) menang; selain itu harus tepat satu yang mengandung kata itu.
 */
export async function resolveProductForPhoto(nama: string, hanya?: "mitra" | "garage", outletId?: string) {
  const { and, eq, ilike, ne } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { menuItems, partnerProductLinks, partners } = await import("@/db/schema");
  const pattern = `%${nama.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const filters = [ne(menuItems.status, "archived"), ilike(menuItems.name, pattern)];
  if (hanya === "mitra") filters.push(eq(menuItems.productType, "partner"));
  if (hanya === "garage") filters.push(ne(menuItems.productType, "partner"));
  const found = await getDb()
    .select({ menuId: menuItems.id, name: menuItems.name, productType: menuItems.productType, linkId: partnerProductLinks.id, partnerOutletId: partners.outletId })
    .from(menuItems)
    .leftJoin(partnerProductLinks, eq(partnerProductLinks.menuItemId, menuItems.id))
    .leftJoin(partners, eq(partners.id, partnerProductLinks.partnerId))
    .where(and(...filters))
    .limit(20);
  // Produk mitra tanpa link (data rusak) atau milik mitra outlet lain tidak bisa diberi foto dari sesi ini: lewati.
  // (menu_items global, mitra per outlet — Codex review #244.)
  const rows = found
    .filter((row) => row.productType !== "partner" || (row.linkId && (!outletId || row.partnerOutletId === outletId)))
    .map((row) => (row.productType === "partner" ? { tujuan: "produk_mitra" as const, id: row.linkId!, name: row.name } : { tujuan: "produk_menu" as const, id: row.menuId, name: row.name }));
  const exact = rows.filter((row) => row.name.trim().toLowerCase() === nama.trim().toLowerCase());
  const pick = exact.length === 1 ? exact : rows.length === 1 ? rows : [];
  if (pick.length === 1) return pick[0];
  const jenis = hanya === "mitra" ? "produk mitra" : hanya === "garage" ? "produk menu Garage" : "produk (Garage atau mitra)";
  if (!rows.length) {
    throw new AgentToolError("PRODUK_TIDAK_DITEMUKAN", `Tidak ada ${jenis} bernama "${nama}". Cek ejaan atau sebut nama lain.`, 404);
  }
  const pilihan = rows.slice(0, 8).map((row) => `${row.name}${row.tujuan === "produk_mitra" ? " [mitra]" : ""} (id ${row.id})`).join("; ");
  throw new AgentToolError("PRODUK_AMBIGU", `Ada ${rows.length} produk yang cocok dengan "${nama}": ${pilihan}. Tanyakan Owner produk yang mana, lalu kirim nama lengkapnya.`, 409);
}

/** Dipertahankan untuk pemanggil lama: produk menu Garage saja. */
export async function resolveMenuProductId(nama: string) {
  const found = await resolveProductForPhoto(nama, "garage");
  return { id: found.id, name: found.name };
}

/**
 * produk_menu / produk_mitra dengan `nama` → tujuan + id yang benar. `produk_menu` mencari produk Garage DAN mitra
 * (Owner cukup bilang "foto produk X"); bila ternyata produk mitra, foto dikirim ke endpoint mitra.
 */
/**
 * logo_sponsor / logo_talent dengan `nama`: sponsor/talent yang tidak batal. Nama persis menang; nama sama di beberapa
 * event = pilih lewat `id` (pilihan menyebut nama event).
 */
export async function resolveEventLogoTarget(kind: "logo_sponsor" | "logo_talent", nama: string) {
  const { and, ilike, ne } = await import("drizzle-orm");
  const { getDb } = await import("@/db");
  const { eventPerformers, eventSponsors } = await import("@/db/schema");
  const pattern = `%${nama.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const table = kind === "logo_sponsor" ? eventSponsors : eventPerformers;
  const rows = await getDb()
    .select({ id: table.id, name: table.name, eventName: table.eventName })
    .from(table)
    .where(and(ne(table.status, "batal"), ilike(table.name, pattern)))
    .limit(20);
  const exact = rows.filter((r) => r.name.trim().toLowerCase() === nama.trim().toLowerCase());
  const pick = exact.length === 1 ? exact : rows.length === 1 ? rows : [];
  if (pick.length === 1) return pick[0];
  const jenis = kind === "logo_sponsor" ? "sponsor" : "talent";
  if (!rows.length) throw new AgentToolError("TIDAK_DITEMUKAN", `Tidak ada ${jenis} event bernama "${nama}". Tambahkan dulu (simpan_${jenis === "sponsor" ? "sponsor" : "talent"}).`, 404);
  const pilihan = (exact.length > 1 ? exact : rows).slice(0, 8).map((r) => `${r.name} — ${r.eventName} (id ${r.id})`).join("; ");
  throw new AgentToolError("NAMA_AMBIGU", `Ada beberapa ${jenis} yang cocok: ${pilihan}. Tanyakan Owner yang mana, lalu kirim \`id\`-nya.`, 409);
}

async function withResolvedId(args: Record<string, unknown>, outletId: string): Promise<{ tujuan: PhotoTarget; id: string | undefined; nama: string | null }> {
  const tujuan = args.tujuan as PhotoTarget;
  if (EVENT_LOGO_TARGETS.has(tujuan) && !args.id && typeof args.nama === "string") {
    const found = await resolveEventLogoTarget(tujuan as "logo_sponsor" | "logo_talent", args.nama);
    return { tujuan, id: found.id, nama: `${found.name} (${found.eventName})` };
  }
  if ((tujuan !== "produk_menu" && tujuan !== "produk_mitra") || args.id || typeof args.nama !== "string") {
    return { tujuan, id: args.id as string | undefined, nama: null };
  }
  const found = await resolveProductForPhoto(args.nama, tujuan === "produk_mitra" ? "mitra" : undefined, outletId);
  return { tujuan: found.tujuan, id: found.id, nama: found.name };
}

/** Nama & foto sekarang dari respons GET (bentuk `{data:{...}}` atau langsung) — hanya untuk preview. */
function currentInfo(json: unknown) {
  const root = (json && typeof json === "object" ? ((json as { data?: unknown }).data ?? json) : null) as Record<string, unknown> | null;
  const item = (root && typeof root === "object" ? ((root.product ?? root.item ?? root) as Record<string, unknown>) : null) ?? null;
  if (!item) return null;
  const nama = typeof item.name === "string" ? item.name : null;
  const foto = typeof item.imageUrl === "string" && item.imageUrl ? item.imageUrl : null;
  return nama || foto ? { nama, fotoSekarang: foto ?? "(belum ada)" } : null;
}

export const fotoTools: AgentTool[] = [
  {
    name: "siapkan_foto",
    title: "Siapkan foto dari chat",
    description:
      "Langkah 1 unggah foto: ambil foto yang BARU diunggah Owner di percakapan ini (isi `foto` dengan file tersebut) dan simpan sementara di Garage OS (30 menit). Belum mengubah data. Balasannya `fotoId` untuk dipakai di pasang_foto. Hanya JPG/PNG/WebP maks 8 MB; foto di-encode ulang (metadata lokasi/EXIF dibuang). Jangan pakai URL dari internet — hanya file unggahan Owner.",
    write: true,
    domain: "sistem",
    risk: "R1",
    permission: "company:manage",
    confirmOnly: true,
    meta: { "openai/fileParams": ["foto"] },
    input: siapkanInput,
    async run(session, args) {
      assertOwnerViaChat(session);
      const { PhotoStagingError, stagePhotoFromUrl } = await import("@/lib/mcp-photo-staging");
      try {
        const foto = args.foto as { download_url: string };
        const meta = await stagePhotoFromUrl({ userId: session.user.id, downloadUrl: foto.download_url });
        return {
          ...stagedSummary(meta),
          langkahBerikut: "Panggil pasang_foto dengan fotoId ini + tujuan (produk_menu / produk_mitra / bahan_gudang / hero_website / suasana_website / logo_sponsor / logo_talent).",
        };
      } catch (error) {
        if (error instanceof PhotoStagingError) throw new AgentToolError(error.code, error.message, error.status);
        throw error;
      }
    },
  },
  {
    name: "pasang_foto",
    title: "Pasang foto ke Garage OS",
    description:
      "Langkah 2 unggah foto: pasang foto dari siapkan_foto ke tujuan tetap — `produk_menu` (isi `nama` produk, mis. \"Nasi Goreng\" — produk Garage MAUPUN produk mitra; produk mitra otomatis ke foto mitra), `produk_mitra` (isi `nama` produk mitra atau id link), `bahan_gudang` (id produk gudang), `hero_website`, `suasana_website` (slot 1–4, foto suasana outlet di homepage), `logo_sponsor` (isi `nama` sponsor event, mis. \"Desain Aja Dulu\") atau `logo_talent` (isi `nama` band/talent). Logo sponsor tampil di bagian \"Didukung oleh\" website hanya bila sponsor dicentang tampil di website. Mengganti foto yang ada. Selalu preview + konfirmasi Owner. Bukti uang (struk, bukti transfer, dokumen) tidak lewat sini. Menghapus foto suasana: ubah_data_garage DELETE /api/site/landing-hero?slot=suasana_N.",
    write: true,
    domain: "sistem",
    risk: "R2",
    permission: "company:manage",
    confirmOnly: true,
    input: pasangInput,
    async preview(session, args) {
      assertOwnerViaChat(session);
      const resolved = await withResolvedId(args, session.profile.outlet.id);
      const route = photoRoute(resolved.tujuan, resolved.id, args.slot as number | undefined);
      const { loadStagedPhoto } = await import("@/lib/mcp-photo-staging");
      const staged = await loadStagedPhoto(String(args.fotoId), session.user.id);
      const base: Record<string, unknown> = {
        aksi: `${route.label} → POST ${route.path}`,
        ...(resolved.nama ? { produk: `${resolved.nama} (id ${resolved.id})` } : {}),
        alasan: args.alasan,
        foto: staged ? stagedSummary(staged.meta) : "TIDAK DITEMUKAN / kedaluwarsa — jalankan siapkan_foto lagi.",
        catatan: "Foto lama di tujuan ini akan diganti.",
      };
      if (!staged || !route.infoPath) return base;
      try {
        const { callApiAsOwner } = await import("@/lib/mcp-delegated-api");
        const { agentInternalOrigin } = await import("@/lib/agent-tools");
        const current = await callApiAsOwner(
          session,
          { method: "GET", path: route.infoPath },
          { operationId: `preview-${Date.now()}`, internalOrigin: agentInternalOrigin(), scope: "readonly" },
        );
        const info = current.ok ? currentInfo(current.json) : null;
        return { ...base, target: info ?? `tidak terbaca (HTTP ${current.status}) — pastikan id benar` };
      } catch {
        return base;
      }
    },
    async run(session, args, ctx) {
      assertOwnerViaChat(session);
      if (!ctx.confirmedOperationId) {
        throw new AgentToolError("CONFIRMATION_REQUIRED", "pasang_foto hanya berjalan lewat konfirmasi Owner.", 403);
      }
      const resolved = await withResolvedId(args, session.profile.outlet.id);
      const route = photoRoute(resolved.tujuan, resolved.id, args.slot as number | undefined);
      const { discardStagedPhoto, loadStagedPhoto } = await import("@/lib/mcp-photo-staging");
      const staged = await loadStagedPhoto(String(args.fotoId), session.user.id);
      if (!staged) {
        throw new AgentToolError("FOTO_TIDAK_DITEMUKAN", "Foto sementara tidak ada atau sudah kedaluwarsa. Jalankan siapkan_foto lagi.", 404);
      }
      if (EVENT_LOGO_TARGETS.has(resolved.tujuan)) {
        // Sama dengan form Sponsor/Lineup: kompres webp ≤200 KB → simpan → setSponsorLogo/setPerformerLogo (audit di service).
        const { storeMenuImageBuffer } = await import("@/lib/menu-image-upload");
        const sponsor = resolved.tujuan === "logo_sponsor";
        const logoUrl = await storeMenuImageBuffer(staged.data, sponsor ? "event-sponsor" : "event-lineup", resolved.id!);
        if (sponsor) {
          const { setSponsorLogo } = await import("@/lib/event-sponsor-service");
          await setSponsorLogo(resolved.id!, logoUrl, session);
        } else {
          const { setPerformerLogo } = await import("@/lib/event-lineup-service");
          await setPerformerLogo(resolved.id!, logoUrl, session);
        }
        await discardStagedPhoto(staged.meta.fotoId);
        return { terpasang: `${route.label}: ${resolved.nama ?? resolved.id}`, alasan: args.alasan, fotoBaru: logoUrl, sidik: staged.meta.sha256.slice(0, 16) };
      }
      const form = new FormData();
      form.append("image", new Blob([new Uint8Array(staged.data)], { type: "image/webp" }), `chatgpt-${staged.meta.fotoId.slice(0, 8)}.webp`);
      for (const [name, value] of Object.entries(route.fields)) form.append(name, value);
      const { callApiAsOwner } = await import("@/lib/mcp-delegated-api");
      const response = await callApiAsOwner(
        session,
        { method: "POST", path: route.path, form },
        { operationId: ctx.confirmedOperationId, internalOrigin: ctx.internalOrigin },
      );
      if (!response.ok) {
        const error = (response.json as { error?: { code?: string; message?: string } } | null)?.error;
        throw new AgentToolError(error?.code ?? `HTTP_${response.status}`, error?.message ?? `Gagal memasang foto (HTTP ${response.status}).`, response.status);
      }
      await discardStagedPhoto(staged.meta.fotoId);
      const data = (response.json as { data?: Record<string, unknown> } | null)?.data ?? {};
      const url = typeof data.imageUrl === "string" ? data.imageUrl : typeof data.publicUrl === "string" ? data.publicUrl : null;
      return { terpasang: resolved.nama ? `${route.label}: ${resolved.nama}` : route.label, endpoint: `POST ${route.path}`, alasan: args.alasan, fotoBaru: url, sidik: staged.meta.sha256.slice(0, 16) };
    },
  },
];
