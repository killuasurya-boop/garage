// =============================================================================
// M3a — tool MCP domain Shift & Kas + Keuangan (PRD V4.0 §04 domain 3–4, D-01).
// Setiap tool memanggil service yang sama dengan layar/route Garage OS, jadi
// semua aturan (Owner/Manajer, pemeriksa ≠ pembuat, kunci shift, buku kas)
// tetap berlaku. R2/R3 hanya jalan setelah preview + konfirmasi Owner (M2);
// `preview` hanya membaca.
// =============================================================================
import { z } from "zod";

import { AgentToolError, dateKey, range, rupiah, type AgentTool } from "@/lib/agent-tool-core";
import { todayWibKey } from "@/lib/date-range";
import type { GarageSession } from "@/lib/server-auth";

const uuid = z.string().uuid();

function assertOwner(session: GarageSession) {
  if (session.profile.role !== "Owner") throw new AgentToolError("FORBIDDEN", "Hanya Owner.", 403);
}

async function cashMovementOrThrow(session: GarageSession, id: string) {
  const { getCashMovementDetail } = await import("@/lib/garage-service");
  const detail = await getCashMovementDetail(id, session);
  if (!detail) throw new AgentToolError("NOT_FOUND", "Catatan kas laci tidak ditemukan di outlet ini.", 404);
  return detail.movement;
}

async function pettyEntryOrThrow(session: GarageSession, id: string) {
  const { listPettyCashEntries } = await import("@/lib/cashier-accountability");
  // Rentang kosong (epoch) + includeIds = hanya entri ini.
  const [entry] = await listPettyCashEntries({ outletId: session.profile.outlet.id, from: new Date(0), to: new Date(0), includeIds: [id] });
  if (!entry) throw new AgentToolError("NOT_FOUND", "Entri petty cash tidak ditemukan di outlet ini.", 404);
  return entry;
}

const describeMovement = (row: { refNo: string | null; type: "in" | "out"; category: string; description: string; amount: number; status: string; createdByName: string | null }) => ({
  ref: row.refNo,
  arah: row.type === "out" ? "Kas KELUAR laci" : "Kas MASUK laci",
  kategori: row.category,
  deskripsi: row.description,
  nominal: rupiah(row.amount),
  diajukanOleh: row.createdByName,
  statusSaatIni: row.status,
});

export const kasTools: AgentTool[] = [
  // ─── Baca (R0) ────────────────────────────────────────────────────────────
  {
    name: "pengawasan_kas",
    title: "Pengawasan kas Owner",
    description:
      "Panel pengawasan kas Owner untuk rentang tanggal: saldo akun (laci, petty, bank, transit setoran), antrean tindakan (selisih shift belum diakui, setoran belum dikonfirmasi, kas keluar menunggu, petty diajukan/disetujui-belum-dibayar, insiden, QRIS) dan pengecualian kontrol.",
    write: false,
    domain: "shift_kas",
    risk: "R0",
    permission: "finance:read",
    input: z.object({ from: dateKey.optional(), to: dateKey.optional() }),
    async run(session, args) {
      assertOwner(session);
      const { getCashOversight } = await import("@/lib/cash-oversight");
      const r = range(args.from as string | undefined, args.to as string | undefined);
      return getCashOversight({ fromDate: r.from, toDate: r.to, outletId: session.profile.outlet.id });
    },
  },
  {
    name: "daftar_kas_laci",
    title: "Daftar kas keluar/masuk laci",
    description: "Riwayat kas keluar/masuk laci outlet (ref KAS-…), bisa difilter status (recorded, pending_approval, rejected, voided) dan tanggal. Pakai id dari sini untuk putuskan_kas_laci / konfirmasi_setoran.",
    write: false,
    domain: "shift_kas",
    risk: "R0",
    permission: "finance:read",
    input: z.object({
      status: z.enum(["recorded", "pending_approval", "rejected", "voided"]).optional(),
      from: dateKey.optional(),
      to: dateKey.optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    async run(session, args) {
      const { listCashMovements } = await import("@/lib/garage-service");
      const result = await listCashMovements(
        { status: args.status as string | undefined, from: args.from as string | undefined, to: args.to as string | undefined, limit: (args.limit as number | undefined) ?? 50 },
        session,
      );
      return { items: result.items, totals: result.totals };
    },
  },
  {
    name: "daftar_petty_cash",
    title: "Daftar petty cash",
    description: "Entri petty cash outlet (pengeluaran & top-up) dengan status submitted/approved/rejected/cancelled (paidAt terisi = sudah dibayar) pada rentang tanggal. Pakai id dari sini untuk putuskan_petty_cash.",
    write: false,
    domain: "shift_kas",
    risk: "R0",
    permission: "finance:read",
    input: z.object({ from: dateKey.optional(), to: dateKey.optional() }),
    async run(session, args) {
      const { listPettyCashEntries, pettyCashBalance } = await import("@/lib/cashier-accountability");
      const r = range(args.from as string | undefined, args.to as string | undefined);
      const from = new Date(`${r.from}T00:00:00+07:00`);
      const to = new Date(new Date(`${r.to}T00:00:00+07:00`).getTime() + 86_400_000);
      const [entries, saldo] = await Promise.all([
        listPettyCashEntries({ outletId: session.profile.outlet.id, from, to }),
        pettyCashBalance(session.profile.outlet.id),
      ]);
      return { saldoPettyCash: saldo, entries };
    },
  },
  {
    name: "status_closing_harian",
    title: "Status closing keuangan harian",
    description: "Pemeriksaan closing satu hari: status (open/closed), cek yang memblokir/peringatan, angka laba-rugi hari itu, shift kasir & selisihnya. Panggil sebelum tutup_buku_harian.",
    write: false,
    domain: "keuangan",
    risk: "R0",
    permission: "finance:read",
    input: z.object({ tanggal: dateKey.optional().describe("Default hari ini") }),
    async run(_session, args) {
      const { getDailyClosingReview } = await import("@/lib/finance-closing");
      return getDailyClosingReview((args.tanggal as string | undefined) ?? todayWibKey());
    },
  },

  // ─── Aksi (R2/R3, wajib preview + konfirmasi) ─────────────────────────────
  {
    name: "putuskan_kas_laci",
    title: "Setujui / tolak kas laci",
    description: "Setujui atau tolak pengajuan kas keluar/masuk laci dari kasir (status pending_approval). Disetujui = uang benar-benar bergerak di buku kas laci. Tolak wajib alasan.",
    write: true,
    domain: "shift_kas",
    risk: "R2",
    permission: "finance:write",
    input: z.object({ id: uuid, keputusan: z.enum(["approve", "reject"]), catatan: z.string().max(300).optional() }),
    async run(session, args) {
      if (args.keputusan === "reject" && !String(args.catatan ?? "").trim()) {
        throw new AgentToolError("REASON_REQUIRED", "Alasan wajib diisi untuk menolak.");
      }
      const { decideCashMovement } = await import("@/lib/garage-service");
      return decideCashMovement(String(args.id), { action: args.keputusan as "approve" | "reject", note: (args.catatan as string | undefined) ?? null }, session);
    },
    async preview(session, args) {
      const row = await cashMovementOrThrow(session, String(args.id));
      return {
        aksi: args.keputusan === "approve" ? "SETUJUI kas laci" : "TOLAK kas laci",
        ...describeMovement(row),
        shift: row.sessionCode,
        dampak: args.keputusan === "approve" ? "Uang bergerak di laci shift ini & tercatat di buku kas (tidak bisa dihapus; koreksi lewat pembalik)." : "Tidak ada uang bergerak.",
        catatan: row.status !== "pending_approval" ? "Status bukan menunggu persetujuan — eksekusi kemungkinan ditolak." : undefined,
      };
    },
  },
  {
    name: "konfirmasi_setoran",
    title: "Konfirmasi setoran bank",
    description: "Konfirmasi setoran tunai laci yang sudah masuk rekening (uang pindah dari transit ke bank Jago/BNI). Wajib nomor bukti setor/mutasi bank. Pengonfirmasi tidak boleh penyetor; setoran terkonfirmasi tidak bisa dibatalkan.",
    write: true,
    domain: "shift_kas",
    risk: "R2",
    permission: "finance:write",
    input: z.object({ id: uuid, buktiBank: z.string().min(3).max(80), catatan: z.string().max(300).optional() }),
    async run(session, args) {
      const { confirmCashDeposit } = await import("@/lib/garage-service");
      return confirmCashDeposit(String(args.id), { bankRef: String(args.buktiBank), note: (args.catatan as string | undefined) ?? null }, session);
    },
    async preview(session, args) {
      const row = await cashMovementOrThrow(session, String(args.id));
      return {
        aksi: "KONFIRMASI setoran masuk bank",
        ...describeMovement(row),
        rekeningTujuan: row.depositAccount,
        buktiBank: args.buktiBank,
        dampak: "Saldo transit setoran → rekening bank di buku kas. Setelah dikonfirmasi tidak bisa dibatalkan.",
        catatan: row.categoryKey !== "setoran" ? "Ini bukan setoran — eksekusi akan ditolak." : row.depositConfirmedAt ? "Setoran ini sudah dikonfirmasi." : undefined,
      };
    },
  },
  {
    name: "putuskan_petty_cash",
    title: "Setujui / bayar / tolak petty cash",
    description:
      "Putuskan entri petty cash: approve (setujui), pay (bayarkan — saldo petty berkurang/bertambah, pengeluaran wajib penerima), reject (tolak, wajib alasan), cancel (batalkan; setelah dibayar = pembalik buku kas). Persetujuan ≠ pembayaran; pemeriksa ≠ pembuat.",
    write: true,
    domain: "shift_kas",
    risk: "R2",
    permission: "finance:write",
    input: z.object({
      id: uuid,
      keputusan: z.enum(["approve", "pay", "reject", "cancel"]),
      catatan: z.string().max(500).optional(),
      penerima: z.string().max(120).optional(),
      noNota: z.string().max(80).optional(),
    }),
    async run(session, args) {
      if ((args.keputusan === "reject" || args.keputusan === "cancel") && !String(args.catatan ?? "").trim()) {
        throw new AgentToolError("REASON_REQUIRED", "Alasan wajib diisi untuk menolak/membatalkan.");
      }
      const { decidePettyCashEntry } = await import("@/lib/cashier-accountability");
      return decidePettyCashEntry(
        String(args.id),
        {
          decision: args.keputusan as "approve" | "pay" | "reject" | "cancel",
          note: (args.catatan as string | undefined) ?? null,
          recipient: (args.penerima as string | undefined) ?? null,
          receiptNo: (args.noNota as string | undefined) ?? null,
        },
        session,
      );
    },
    async preview(session, args) {
      const entry = await pettyEntryOrThrow(session, String(args.id));
      const label = { approve: "SETUJUI", pay: "BAYARKAN", reject: "TOLAK", cancel: "BATALKAN" }[args.keputusan as "approve" | "pay" | "reject" | "cancel"];
      return {
        aksi: `${label} petty cash ${entry.entryNo}`,
        jenis: entry.type,
        kategori: entry.category,
        deskripsi: entry.description,
        nominal: rupiah(entry.amount),
        diajukanOleh: entry.createdByName,
        statusSaatIni: entry.paidAt ? `${entry.status} (dibayar ${entry.paidAt})` : entry.status,
        penerima: args.penerima ?? entry.recipient ?? null,
        dampak:
          args.keputusan === "pay"
            ? "Saldo petty cash bergerak & tercatat di buku kas."
            : args.keputusan === "cancel" && entry.paidAt && !entry.reversed
              ? "Sudah dibayar → dibuat baris pembalik di buku kas (riwayat tetap)."
              : "Belum ada uang bergerak.",
      };
    },
  },
  {
    name: "verifikasi_shift",
    title: "Verifikasi laporan shift kasir",
    description:
      "Periksa shift kasir yang sudah ditutup: verified atau needs_followup. Bila ada selisih, verified wajib akuiSelisih=true + catatan. Pemeriksa tidak boleh pembuka/penutup shift itu (Owner = tanpa pemeriksa kedua). Hitung ulang uang tidak bisa lewat chat.",
    write: true,
    domain: "shift_kas",
    risk: "R2",
    permission: "finance:write",
    input: z.object({
      sessionId: uuid,
      status: z.enum(["verified", "needs_followup"]),
      catatan: z.string().max(1000).optional(),
      akuiSelisih: z.boolean().optional(),
    }),
    async run(session, args) {
      const { reviewCashSession } = await import("@/lib/cashier-accountability");
      return reviewCashSession(
        String(args.sessionId),
        {
          status: args.status as "verified" | "needs_followup",
          note: (args.catatan as string | undefined) ?? undefined,
          acknowledgeDiscrepancy: (args.akuiSelisih as boolean | undefined) ?? false,
        },
        session,
      );
    },
    async preview(session, args) {
      const { assertSessionAccess } = await import("@/lib/cashier-accountability");
      const { getDb } = await import("@/db");
      const { cashSessions } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      await assertSessionAccess(String(args.sessionId), session);
      const [row] = await getDb()
        .select({
          code: cashSessions.code,
          status: cashSessions.status,
          expectedCash: cashSessions.expectedCash,
          actualCash: cashSessions.actualCash,
          discrepancy: cashSessions.discrepancy,
          discrepancyStatus: cashSessions.discrepancyStatus,
          reviewStatus: cashSessions.reviewStatus,
        })
        .from(cashSessions)
        .where(eq(cashSessions.id, String(args.sessionId)))
        .limit(1);
      return {
        aksi: args.status === "verified" ? `VERIFIKASI shift ${row.code}` : `TANDAI shift ${row.code} perlu tindak lanjut`,
        statusShift: row.status,
        tunaiSeharusnya: rupiah(row.expectedCash),
        tunaiDihitung: row.actualCash == null ? null : rupiah(row.actualCash),
        selisih: rupiah(row.discrepancy),
        statusSelisih: row.discrepancyStatus,
        statusPemeriksaanSaatIni: row.reviewStatus,
        akuiSelisih: args.akuiSelisih ?? false,
        catatan: args.catatan ?? null,
      };
    },
  },
  {
    name: "tutup_buku_harian",
    title: "Tutup buku harian (closing)",
    description:
      "Closing keuangan satu hari: angka laba-rugi hari itu dibekukan dan transaksi mundur ke tanggal itu ditolak. Gagal bila ada cek yang memblokir; peringatan wajib diakui (akuiPeringatan=true). Panggil status_closing_harian dulu.",
    write: true,
    domain: "keuangan",
    risk: "R3",
    permission: "finance:write",
    input: z.object({ tanggal: dateKey, catatan: z.string().max(500).optional(), akuiPeringatan: z.boolean().optional() }),
    async run(session, args) {
      const { closeFinanceDay } = await import("@/lib/finance-closing");
      return closeFinanceDay(
        { date: String(args.tanggal), notes: args.catatan as string | undefined, acknowledgeWarnings: (args.akuiPeringatan as boolean | undefined) ?? false },
        session,
      );
    },
    async preview(_session, args) {
      const { getDailyClosingReview } = await import("@/lib/finance-closing");
      const review = await getDailyClosingReview(String(args.tanggal));
      return {
        aksi: `TUTUP BUKU ${review.label}`,
        statusSaatIni: review.status,
        penjualanBersih: rupiah(review.figures.netSales),
        labaBersih: rupiah(review.figures.netProfit),
        cekMemblokir: review.checks.filter((check) => check.status === "block").map((check) => check.label),
        peringatan: review.checks.filter((check) => check.status === "warn").map((check) => check.label),
        akuiPeringatan: args.akuiPeringatan ?? false,
        dampak: "Angka hari ini dibekukan; transaksi/biaya mundur ke tanggal ini ditolak sampai Owner membuka ulang.",
      };
    },
  },
];
