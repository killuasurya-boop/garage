// =============================================================================
// M3g — tool MCP domain Konten & Marketing + Notifikasi (PRD V4.0 §04 domain 12, 15).
// Menerbitkan konten ke media sosial = tampil publik & tidak bisa ditarik → R3.
// Notifikasi hanya ke staf di dalam Garage OS (staff_notifications); TIDAK ada
// email/WA keluar — provider belum dipasang (CLAUDE.md: jangan tambah provider).
// =============================================================================
import { z } from "zod";

import { AgentToolError, rupiah, type AgentTool } from "@/lib/agent-tool-core";
import type { GarageSession } from "@/lib/server-auth";

function assertOwner(session: GarageSession) {
  if (session.profile.role !== "Owner") throw new AgentToolError("FORBIDDEN", "Hanya Owner.", 403);
}

async function promoOrThrow(id: string) {
  const { listMarketingPromos } = await import("@/lib/garage-marketing-service");
  const promo = (await listMarketingPromos({ limit: 200 })).find((row) => row.id === id);
  if (!promo) throw new AgentToolError("NOT_FOUND", "Promo tidak ditemukan.", 404);
  return promo;
}

async function contentOrThrow(id: string) {
  const { getDb } = await import("@/db");
  const { contentPublishingQueue } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const [row] = await getDb().select().from(contentPublishingQueue).where(eq(contentPublishingQueue.id, id)).limit(1);
  if (!row) throw new AgentToolError("NOT_FOUND", "Konten tidak ditemukan.", 404);
  return row;
}

const promoValue = (promo: { type: string; value: number; maxDiscount: number | null }) =>
  promo.type === "percent" ? `${promo.value}%${promo.maxDiscount ? ` (maks. ${rupiah(promo.maxDiscount)})` : ""}` : rupiah(promo.value);

export const marketingTools: AgentTool[] = [
  // ─── Marketing ────────────────────────────────────────────────────────────
  {
    name: "ringkasan_marketing",
    title: "Ringkasan marketing",
    description: "Ringkasan marketing: kampanye aktif, broadcast, promo/voucher & pemakaiannya, order per kampanye.",
    write: false,
    domain: "marketing",
    risk: "R0",
    permission: "marketing:read",
    input: z.object({}),
    async run() {
      const { getMarketingOverview } = await import("@/lib/garage-marketing-service");
      return getMarketingOverview();
    },
  },
  {
    name: "daftar_promo",
    title: "Daftar promo / voucher",
    description: "Promo & voucher (active/draft/paused/expired): kode, nilai, minimal belanja, periode, jumlah dipakai & total diskon.",
    write: false,
    domain: "marketing",
    risk: "R0",
    permission: "marketing:read",
    input: z.object({ status: z.enum(["active", "draft", "paused", "expired", "all"]).optional() }),
    async run(_session, args) {
      const { listMarketingPromos } = await import("@/lib/garage-marketing-service");
      return listMarketingPromos({ status: (args.status as string | undefined) ?? "all", limit: 100 });
    },
  },
  {
    name: "ubah_status_promo",
    title: "Aktifkan / jeda promo",
    description: "Ubah status promo/voucher: active (bisa dipakai pelanggan), paused, draft, expired. Promo aktif memengaruhi harga yang dibayar pelanggan.",
    write: true,
    domain: "marketing",
    risk: "R2",
    permission: "marketing:write",
    input: z.object({ promoId: z.string().min(1).max(80), status: z.enum(["active", "draft", "paused", "expired"]) }),
    async run(_session, args) {
      const { updateMarketingPromoStatus } = await import("@/lib/garage-marketing-service");
      const updated = await updateMarketingPromoStatus(String(args.promoId), String(args.status));
      if (!updated) throw new AgentToolError("NOT_FOUND", "Promo tidak ditemukan.", 404);
      return updated;
    },
    async preview(_session, args) {
      const promo = await promoOrThrow(String(args.promoId));
      return {
        aksi: `UBAH status promo ${promo.code} → ${args.status}`,
        promo: promo.title,
        nilai: promoValue(promo),
        minimalBelanja: promo.minSpend ? rupiah(promo.minSpend) : null,
        statusSaatIni: promo.status,
        dampak: args.status === "active" ? "Pelanggan bisa memakai kode ini saat bayar (mengurangi omzet per transaksi)." : "Kode tidak bisa dipakai lagi sampai diaktifkan.",
      };
    },
  },
  {
    name: "daftar_konten",
    title: "Antrean konten media sosial",
    description: "Konten publishing (draft, needs_approval, approved, scheduled, published, failed, rejected, revision): judul, caption, platform, jadwal.",
    write: false,
    domain: "marketing",
    risk: "R0",
    permission: "marketing:read",
    input: z.object({ status: z.string().max(30).optional() }),
    async run(_session, args) {
      const { listContentPublishingQueue } = await import("@/lib/garage-content-publishing");
      return listContentPublishingQueue({ status: (args.status as string | undefined) ?? "all", limit: 50 });
    },
  },
  {
    name: "putuskan_konten",
    title: "Setujui / tolak / minta revisi konten",
    description: "Owner memutuskan konten: approved (siap terbit), rejected (wajib alasan), revision (wajib catatan revisi). Belum menerbitkan apa pun.",
    write: true,
    domain: "marketing",
    risk: "R1",
    permission: "marketing:write",
    input: z.object({ kontenId: z.string().uuid(), keputusan: z.enum(["approved", "rejected", "revision"]), catatan: z.string().max(3000).optional() }),
    async run(session, args) {
      assertOwner(session);
      if (args.keputusan !== "approved" && !String(args.catatan ?? "").trim()) {
        throw new AgentToolError("REASON_REQUIRED", "Alasan / catatan revisi wajib diisi.");
      }
      const { updateContentPublishingStatus } = await import("@/lib/garage-content-publishing");
      const updated = await updateContentPublishingStatus({
        id: String(args.kontenId),
        userId: session.user.id,
        status: args.keputusan as "approved" | "rejected" | "revision",
        revisionNotes: args.keputusan === "revision" ? (args.catatan as string) : null,
        rejectionReason: args.keputusan === "rejected" ? (args.catatan as string) : null,
      });
      if (!updated) throw new AgentToolError("NOT_FOUND", "Konten tidak ditemukan.", 404);
      return updated;
    },
  },
  {
    name: "terbitkan_konten",
    title: "Terbitkan konten ke media sosial",
    description: "Posting konten yang sudah approved ke platform tujuan (Instagram/TikTok/…). Tampil publik dan tidak bisa ditarik dari Garage OS. Owner saja.",
    write: true,
    domain: "marketing",
    risk: "R3",
    permission: "marketing:write",
    input: z.object({ kontenId: z.string().uuid() }),
    async run(session, args) {
      assertOwner(session);
      const { publishApprovedContent } = await import("@/lib/garage-content-publishing");
      return publishApprovedContent(String(args.kontenId), session.user.id);
    },
    async preview(session, args) {
      assertOwner(session);
      const row = await contentOrThrow(String(args.kontenId));
      return {
        aksi: `TERBITKAN "${row.title}" ke ${(row.platforms ?? []).join(", ") || "-"}`,
        caption: row.caption,
        hashtag: row.hashtags,
        aset: row.assetUrl ?? row.assetUrls?.[0] ?? null,
        statusSaatIni: row.status,
        dampak: "Tampil PUBLIK di akun media sosial Garage. Menghapus postingan harus dilakukan langsung di aplikasi platform.",
        catatan: row.status !== "approved" ? "Konten belum approved — eksekusi akan ditolak." : undefined,
      };
    },
  },

  // ─── Notifikasi (internal staf) ───────────────────────────────────────────
  {
    name: "kirim_notifikasi_staf",
    title: "Kirim notifikasi ke staf",
    description:
      "Kirim pengumuman ke staf di dalam Garage OS (lonceng notifikasi): semua, kasir, produksi (bar/dapur), waiter, kurir, atau manajemen. Bukan WA/email.",
    write: true,
    domain: "notifikasi",
    risk: "R1",
    permission: "staff:manage",
    input: z.object({
      penerima: z.enum(["all", "cashier", "production", "waiter", "courier", "management"]),
      judul: z.string().min(3).max(140),
      isi: z.string().max(300).optional(),
      tingkat: z.enum(["info", "warning", "urgent"]).optional(),
    }),
    async run(session, args) {
      const { notifyStaff } = await import("@/lib/staff-notifications");
      return notifyStaff({
        outletId: session.profile.outlet.id,
        audience: args.penerima as "all",
        kind: "owner_announcement",
        severity: (args.tingkat as "info" | "warning" | "urgent" | undefined) ?? "info",
        title: String(args.judul),
        body: (args.isi as string | undefined) ?? null,
      });
    },
  },
];
