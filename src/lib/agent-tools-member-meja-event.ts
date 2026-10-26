// =============================================================================
// M3e — tool MCP domain Member/CRM, Meja/QR, Event (PRD V4.0 §04 domain 9, 11, 13).
// Membungkus service yang sama dengan layar CRM, waiter & event manager. Data
// pribadi member hanya untuk Owner/Manajer; poin = penyesuaian bertanda ADJUSTMENT
// (tercatat), bukan menulis saldo bebas. R2 lewat preview + konfirmasi (M2).
// =============================================================================
import { z } from "zod";

import { AgentToolError, type AgentTool } from "@/lib/agent-tool-core";
import { parseTableNumber } from "@/lib/garage-tables";
import type { GarageSession } from "@/lib/server-auth";

function assertOwnerOrManager(session: GarageSession) {
  if (session.profile.role !== "Owner" && session.profile.role !== "Manajer") {
    throw new AgentToolError("FORBIDDEN", "Hanya Owner atau Manajer.", 403);
  }
}

function tableOrThrow(value: unknown) {
  const number = parseTableNumber(String(value));
  if (!number) throw new AgentToolError("INVALID_TABLE", `Nomor meja tidak valid: ${String(value)}`);
  return number;
}

async function memberOrThrow(id: string) {
  const { getCustomerDetailForCrm } = await import("@/lib/garage-service");
  const member = await getCustomerDetailForCrm(id);
  if (!member) throw new AgentToolError("NOT_FOUND", "Member tidak ditemukan.", 404);
  return member;
}

export const memberTableEventTools: AgentTool[] = [
  // ─── Member / CRM ─────────────────────────────────────────────────────────
  {
    name: "cari_member",
    title: "Cari member",
    description: "Cari member CRM (nama/telepon/kode member): tier kartu, poin, kunjungan, total belanja. Urutkan: recent, spend, visits, points, name.",
    write: false,
    domain: "member_crm",
    risk: "R0",
    permission: "crm:read",
    input: z.object({
      cari: z.string().max(80).optional(),
      tier: z.string().max(20).optional(),
      urut: z.enum(["recent", "spend", "visits", "points", "name"]).optional(),
    }),
    async run(session, args) {
      assertOwnerOrManager(session);
      const { listCustomersForCrm } = await import("@/lib/garage-service");
      return listCustomersForCrm({ search: args.cari as string | undefined, tier: args.tier as string | undefined, sort: args.urut as "recent" | undefined, limit: 50 });
    },
  },
  {
    name: "detail_member",
    title: "Detail member",
    description: "Profil satu member: kode, tier, poin, kunjungan, belanja, riwayat transaksi & catatan staf.",
    write: false,
    domain: "member_crm",
    risk: "R0",
    permission: "crm:read",
    input: z.object({ memberId: z.string().min(1).max(80) }),
    async run(session, args) {
      assertOwnerOrManager(session);
      return memberOrThrow(String(args.memberId));
    },
  },
  {
    name: "sesuaikan_poin_member",
    title: "Sesuaikan poin member",
    description: "Tambah (+) atau kurangi (−) poin member dengan alasan; tercatat sebagai transaksi ADJUSTMENT. Saldo tidak bisa di bawah 0. Owner/Manajer.",
    write: true,
    domain: "member_crm",
    risk: "R2",
    permission: "crm:write",
    input: z.object({
      memberId: z.string().min(1).max(80),
      poin: z.number().int().gte(-1_000_000).lte(1_000_000).refine((value) => value !== 0, "Poin tidak boleh 0."),
      alasan: z.string().min(3).max(240),
    }),
    async run(session, args) {
      assertOwnerOrManager(session);
      const { adjustCrmMemberPoints } = await import("@/lib/garage-service");
      const result = await adjustCrmMemberPoints({ customerId: String(args.memberId), delta: Number(args.poin), reason: String(args.alasan), actor: session });
      if (!result.data) throw new AgentToolError("NOT_FOUND", result.error ?? "Member tidak ditemukan.", 404);
      return result.data;
    },
    async preview(session, args) {
      assertOwnerOrManager(session);
      const member = await memberOrThrow(String(args.memberId));
      const delta = Number(args.poin);
      const after = Math.max(0, member.points + delta);
      return {
        aksi: `${delta > 0 ? "TAMBAH" : "KURANGI"} ${Math.abs(delta)} poin`,
        member: `${member.name} (${member.memberCode ?? "-"}, ${member.tier})`,
        poinSaatIni: member.points,
        poinSetelah: after,
        alasan: args.alasan,
        catatan: member.points + delta < 0 ? "Saldo dibatasi 0 — pengurangan efektif lebih kecil." : undefined,
      };
    },
  },

  // ─── Meja / QR ────────────────────────────────────────────────────────────
  {
    name: "status_meja",
    title: "Status meja live",
    description: "Status semua meja outlet: kosong/dipilih/terisi (belum bayar/di kasir/lunas)/reserved/perlu dibersihkan, bill terbuka & tagihan lama dari hari sebelumnya.",
    write: false,
    domain: "meja_qr",
    risk: "R0",
    permission: "tables:read",
    input: z.object({ meja: z.string().max(12).optional().describe("Nomor/label meja, mis. 6 atau Meja 06") }),
    async run(session, args) {
      const { getTableLiveData } = await import("@/lib/garage-service");
      return getTableLiveData({ outletId: session.profile.outlet.id, tableNumber: args.meja ? tableOrThrow(args.meja) : undefined });
    },
  },
  {
    name: "pindah_meja",
    title: "Pindah meja",
    description: "Pindahkan semua bill terbuka + tiket dapur/bar + panggilan layanan dari satu meja ke meja lain dalam satu transaksi (kode gabung ikut pindah).",
    write: true,
    domain: "meja_qr",
    risk: "R1",
    permission: "tables:write",
    input: z.object({ dari: z.string().min(1).max(12), ke: z.string().min(1).max(12) }),
    async run(session, args) {
      const { moveTable } = await import("@/lib/garage-service");
      return moveTable(tableOrThrow(args.dari), tableOrThrow(args.ke), session);
    },
  },

  // ─── Event ────────────────────────────────────────────────────────────────
  {
    name: "daftar_event",
    title: "Daftar event",
    description: "Event outlet (draft/published/archived): judul, tanggal, slug, tampil di beranda.",
    write: false,
    domain: "event",
    risk: "R0",
    permission: "events:manage",
    input: z.object({}),
    async run(session) {
      const { listEventsForAdmin } = await import("@/lib/event-service");
      return listEventsForAdmin(session.profile.outlet.id);
    },
  },
  {
    name: "ringkasan_event",
    title: "Ringkasan event",
    description: "Ringkasan satu event: tamu undangan, RSVP/check-in, dan aktivitas terbaru.",
    write: false,
    domain: "event",
    risk: "R0",
    permission: "events:manage",
    input: z.object({ eventId: z.string().min(1).max(80) }),
    async run(_session, args) {
      const { getEventSummary } = await import("@/lib/event-invitations");
      return getEventSummary(String(args.eventId));
    },
  },
  {
    name: "ubah_status_event",
    title: "Terbitkan / arsipkan event",
    description: "Ubah status event: published (tampil publik; wajib alamat, link Maps, WhatsApp), draft, atau archived.",
    write: true,
    domain: "event",
    risk: "R1",
    permission: "events:manage",
    input: z.object({ eventId: z.string().min(1).max(80), status: z.enum(["draft", "published", "archived"]) }),
    async run(session, args) {
      const { setEventStatus } = await import("@/lib/event-service");
      return setEventStatus(String(args.eventId), args.status as "draft" | "published" | "archived", session.user.id, session.profile.outlet.id);
    },
  },
];

