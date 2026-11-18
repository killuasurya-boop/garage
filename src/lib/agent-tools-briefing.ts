// =============================================================================
// Briefing pagi Owner (Owner 18 Nov 2026): satu perintah merangkum kondisi usaha dari tool BACA yang sudah ada
// (angka sama persis dengan layar Garage OS — tidak ada perhitungan baru). Tiap bagian berdiri sendiri: bila satu
// gagal / tidak berhak, bagian lain tetap tampil dengan keterangan. Tidak mengubah data (R0).
// =============================================================================
import { z } from "zod";

import { AgentToolError, type AgentTool } from "@/lib/agent-tool-core";

const MAX_LIST = 8;

/** Ringkas hasil tool untuk chat: daftar panjang dipotong (jumlah total tetap disebut). */
export function compactForBriefing(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_LIST).map((item) => compactForBriefing(item, depth + 1));
    return value.length > MAX_LIST ? { total: value.length, contoh: items } : items;
  }
  if (value && typeof value === "object" && depth < 4) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, compactForBriefing(v, depth + 1)]));
  }
  return value;
}

/** Tanggal WIB (YYYY-MM-DD) `offset` hari dari sekarang. */
export function wibDateKey(offsetDays = 0, now = new Date()) {
  return new Date(now.getTime() + 7 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export const BRIEFING_SECTIONS: Array<{ key: string; label: string; tool: string; args: (today: string, yesterday: string) => Record<string, unknown> }> = [
  { key: "hariIni", label: "Hari ini (omzet, antrean, stok menipis)", tool: "ringkasan_hari_ini", args: () => ({}) },
  { key: "penjualanKemarin", label: "Penjualan kemarin", tool: "laporan_penjualan", args: (_t, y) => ({ from: y, to: y }) },
  { key: "closingKemarin", label: "Tutup buku kemarin", tool: "status_closing_harian", args: (_t, y) => ({ tanggal: y }) },
  { key: "approvalMenunggu", label: "Approval menunggu keputusan", tool: "daftar_approval", args: () => ({ status: "pending" }) },
  { key: "bahanMenipis", label: "Bahan menipis", tool: "cek_stok_bahan", args: () => ({ hanyaMenipis: true }) },
  { key: "pesananMitraAktif", label: "Pesanan mitra aktif", tool: "pesanan_mitra", args: () => ({ hanyaAktif: true }) },
  { key: "usulanHargaMitra", label: "Usulan harga mitra", tool: "usulan_harga_mitra", args: () => ({}) },
  { key: "eventTerdekat", label: "Event terdekat (kesiapan & tugas panitia)", tool: "papan_event", args: () => ({}) },
];

export const briefingTools: AgentTool[] = [
  {
    name: "briefing_pagi",
    title: "Briefing pagi Owner",
    description:
      "SATU perintah untuk kondisi usaha: omzet & antrean hari ini, penjualan kemarin, status tutup buku kemarin, approval menunggu, bahan menipis, pesanan & usulan harga mitra, kesiapan event terdekat + tugas panitia telat. Baca saja; bagian yang tidak bisa dibaca diberi keterangan. Pakai ini saat Owner bilang \"briefing\", \"gimana hari ini\", atau \"cek semua\". Owner/Manajer.",
    write: false,
    domain: "dashboard",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({ bagian: z.array(z.string()).max(10).optional().describe("Opsional: hanya bagian tertentu (key), mis. [\"hariIni\",\"approvalMenunggu\"]") }),
    async run(session, args, ctx) {
      if (session.profile.role !== "Owner" && session.profile.role !== "Manajer") throw new AgentToolError("FORBIDDEN", "Hanya Owner atau Manajer.", 403);
      const today = wibDateKey(0);
      const yesterday = wibDateKey(-1);
      const wanted = (args.bagian as string[] | undefined)?.length ? new Set(args.bagian as string[]) : null;
      const { runAgentTool } = await import("@/lib/agent-tools");
      const sections = BRIEFING_SECTIONS.filter((s) => !wanted || wanted.has(s.key));
      const results = await Promise.all(
        sections.map(async (s) => {
          try {
            return [s.key, { judul: s.label, data: compactForBriefing(await runAgentTool(session, s.tool, s.args(today, yesterday), ctx)) }] as const;
          } catch (error) {
            const reason = error instanceof AgentToolError ? error.message : "tidak bisa dibaca sekarang";
            return [s.key, { judul: s.label, tidakTersedia: reason }] as const;
          }
        }),
      );
      return {
        tanggal: today,
        petunjuk: "Ringkas untuk Owner: sebut dulu yang butuh tindakan (approval, tutup buku belum, bahan habis, pesanan mitra terlambat, tugas panitia telat), lalu angka penjualan.",
        ...Object.fromEntries(results),
      };
    },
  },
];
