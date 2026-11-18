// =============================================================================
// Katalog tool agent AI (OpenClaw / Hermes). Dipakai REST /api/agent/v1/tools
// dan server MCP /api/mcp. Tool memanggil service Garage langsung dengan sesi
// agent (hak = scope key). `garage_api` membaca (GET) endpoint /api lain.
// =============================================================================
import { z } from "zod";

import { AgentToolError, dateKey, range, rupiah, type AgentTool, type AgentToolContext } from "@/lib/agent-tool-core";
import { fraudTools } from "@/lib/agent-tools-fraud";
import { masterTools } from "@/lib/agent-tools-master";
import { supplierAssignmentTools } from "@/lib/agent-tools-supplier-assignment";
import { ownerAiTools } from "@/lib/agent-tools-owner-ai";
import { kasTools } from "@/lib/agent-tools-kas";
import { posStaffTools } from "@/lib/agent-tools-pos-staf";
import { ubahDataTools } from "@/lib/agent-tools-ubah-data";
import { briefingTools } from "@/lib/agent-tools-briefing";
import { eventLineupTools } from "@/lib/agent-tools-event-lineup";
import { fotoTools } from "@/lib/agent-tools-foto";
import { mitraTools } from "@/lib/agent-tools-mitra";
import { produkCepatTools } from "@/lib/agent-tools-produk-cepat";
import { productTools } from "@/lib/agent-tools-produk";
import { warehouseTools } from "@/lib/agent-tools-gudang";
import { memberTableEventTools } from "@/lib/agent-tools-member-meja-event";
import { recipeTools } from "@/lib/agent-tools-resep";
import { marketingTools } from "@/lib/agent-tools-marketing";
import { todayWibKey } from "@/lib/date-range";
import { buildCapabilities } from "@/lib/mcp-tool-registry";
import { canUseApiAs } from "@/lib/role-access";
import type { GarageSession } from "@/lib/server-auth";

export { AgentToolError, type AgentTool, type AgentToolContext } from "@/lib/agent-tool-core";

const tools: AgentTool[] = [
  {
    name: "ringkasan_hari_ini",
    title: "Ringkasan hari ini",
    description: "Omzet, transaksi, produk terlaris, metode bayar hari ini + status antrean produksi & stok menipis.",
    write: false,
    domain: "dashboard",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({}),
    async run(session) {
      const { getSalesReport } = await import("@/lib/sales-report");
      const { getOpsCenter } = await import("@/lib/ops-center");
      const today = todayWibKey();
      const [sales, ops] = await Promise.all([
        getSalesReport({ outletId: session.profile.outlet.id, range: { from: today, to: today } }),
        getOpsCenter(session),
      ]);
      return {
        tanggal: today,
        outlet: session.profile.outlet.name,
        penjualan: sales.summary,
        produkTerlaris: sales.products.slice(0, 5),
        metodeBayar: sales.paymentMethods,
        operasional: { status: ops.status, antrean: ops.live },
        stokMenipis: ops.prep.low,
        peringatan: ops.alerts.map((a) => ({ judul: a.title, detail: a.description, level: a.severity })),
      };
    },
  },
  {
    name: "status_operasional",
    title: "Status operasional",
    description: "Antrean Bar/Dapur, pesanan siap antar, ketepatan waktu, peringatan Control Center.",
    write: false,
    domain: "dapur_bar",
    risk: "R0",
    permission: "kitchen:read",
    input: z.object({}),
    async run(session) {
      const { getOpsCenter } = await import("@/lib/ops-center");
      const ops = await getOpsCenter(session);
      return { status: ops.status, live: ops.live, stations: ops.stations.map(({ suggestions: _s, ...rest }) => rest), alerts: ops.alerts, queue: ops.queue.slice(0, 30) };
    },
  },
  {
    name: "laporan_penjualan",
    title: "Laporan penjualan",
    description: "Laporan penjualan rentang tanggal (WIB): omzet, penjualan bersih, diskon, void/refund, per produk/kategori/kasir/metode bayar/jam.",
    write: false,
    domain: "dashboard",
    risk: "R0",
    permission: "finance:read",
    input: z.object({ from: dateKey.optional().describe("Tanggal mulai, default hari ini"), to: dateKey.optional().describe("Tanggal akhir, default = from") }),
    async run(session, args) {
      const { getSalesReport } = await import("@/lib/sales-report");
      const r = range(args.from as string | undefined, args.to as string | undefined);
      const report = await getSalesReport({ outletId: session.profile.outlet.id, range: r });
      const { transactions: _t, ...rest } = report;
      return { ...rest, jumlahTransaksi: report.transactions.length };
    },
  },
  {
    name: "daftar_order",
    title: "Daftar order",
    description: "Daftar order terbaru (status: open, paid, voided, refunded, all).",
    write: false,
    domain: "pos",
    risk: "R0",
    permission: "orders:read",
    input: z.object({ status: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }),
    async run(_session, args) {
      const { getOrderData } = await import("@/lib/garage-service");
      const rows = await getOrderData({ status: (args.status as string | undefined) ?? "all" });
      return rows.slice(0, (args.limit as number | undefined) ?? 30);
    },
  },
  {
    name: "cek_stok_bahan",
    title: "Cek stok bahan baku",
    description: "Cari bahan baku gudang (nama/SKU) beserta stok total, minimum, HPP, status.",
    write: false,
    domain: "gudang",
    risk: "R0",
    permission: "inventory:read",
    input: z.object({ cari: z.string().optional().describe("Nama atau SKU bahan"), hanyaMenipis: z.boolean().optional() }),
    async run(_session, args) {
      const { getWmsProducts } = await import("@/lib/wms-service");
      const rows = await getWmsProducts({ search: (args.cari as string | undefined) || undefined, warehouseId: "all" });
      const filtered = args.hanyaMenipis ? rows.filter((r) => r.onHand <= r.minStock) : rows;
      return filtered.slice(0, 60).map((r) => ({ sku: r.sku, nama: r.name, kategori: r.category, stok: r.onHand, minimum: r.minStock, satuan: r.unit, hpp: r.hpp }));
    },
  },
  {
    name: "daftar_menu",
    title: "Daftar menu",
    description: "Cari menu POS: id, nama, kategori, status stok, varian & harga.",
    write: false,
    domain: "produk_harga",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({ cari: z.string().optional() }),
    async run(_session, args) {
      const { getMenuData } = await import("@/lib/garage-service");
      const rows = await getMenuData({ q: (args.cari as string | undefined) || undefined });
      return rows.slice(0, 60);
    },
  },
  {
    name: "ubah_status_menu",
    title: "Tandai menu habis/tersedia",
    description: "Ubah status stok menu POS & menu digital: ready (tersedia), limited (terbatas), sold_out (habis).",
    write: true,
    domain: "produk_harga",
    risk: "R1",
    permission: "inventory:write",
    input: z.object({ menuId: z.string().min(1), status: z.enum(["ready", "limited", "sold_out"]) }),
    async run(session, args) {
      const { updateMenuProductStock } = await import("@/lib/garage-service");
      return updateMenuProductStock(String(args.menuId), args.status as "ready" | "limited" | "sold_out", session);
    },
  },
  {
    name: "daftar_approval",
    title: "Daftar persetujuan",
    description: "Pengajuan yang menunggu keputusan (diskon, void, refund, pengeluaran, selisih kas, opname).",
    write: false,
    domain: "keuangan",
    risk: "R0",
    permission: "approvals:read",
    input: z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).optional() }),
    async run(session, args) {
      const { getApprovalData } = await import("@/lib/garage-service");
      const status = (args.status as string | undefined) ?? "pending";
      // Smart Approval V3: Manajer hanya melihat pengajuan outletnya (Owner semua).
      return getApprovalData({ status: status === "all" ? undefined : status, viewer: session });
    },
  },
  {
    name: "putuskan_approval",
    title: "Setujui / tolak pengajuan",
    description:
      "Putuskan pengajuan berdasarkan id. Tolak wajib dengan alasan. Hanya Owner lewat ChatGPT (konfirmasi + kode 2FA); API key agent tidak boleh memutus.",
    write: true,
    domain: "keuangan",
    // Audit SA-01/SA-02: keputusan dari chat selalu R3 (kode 2FA Owner), karena tier pengajuan baru
    // diketahui dari DB. API key agent ditolak di decideApproval.
    risk: "R3",
    permission: "approvals:decide",
    input: z.object({ id: z.string().min(1), keputusan: z.enum(["approved", "rejected"]), alasan: z.string().max(500).optional() }),
    async run(session, args, ctx) {
      if (args.keputusan === "rejected" && !String(args.alasan ?? "").trim()) {
        throw new AgentToolError("REASON_REQUIRED", "Alasan wajib diisi untuk menolak.");
      }
      const { decideApproval } = await import("@/lib/garage-service");
      return decideApproval(
        String(args.id),
        { status: args.keputusan as "approved" | "rejected", reasonDecided: args.alasan as string | undefined },
        session,
        // Kode 2FA sudah diverifikasi oleh alur konfirmasi R3 sebelum token diklaim.
        {
          via: session.profile.agentKey ? "agent_key" : ctx.mcpConnection ? "chatgpt" : "owner_command",
          stepUpVerified: Boolean(ctx.confirmFlow && ctx.confirmedOperationId),
        },
      );
    },
    async preview(_session, args) {
      const { getApprovalById } = await import("@/lib/garage-service");
      const approval = await getApprovalById(String(args.id));
      if (!approval) throw new AgentToolError("NOT_FOUND", "Pengajuan tidak ditemukan.", 404);
      return {
        aksi: args.keputusan === "approved" ? "SETUJUI pengajuan" : "TOLAK pengajuan",
        pengajuan: `${approval.categoryLabel} (${approval.type}) dari ${approval.requester}`,
        nominal: approval.amountValue !== null && approval.amountValue !== undefined ? rupiah(approval.amountValue) : approval.amount || null,
        tingkatRisiko: approval.riskTier,
        alasanPengajuan: approval.reason,
        statusSaatIni: approval.status,
        alasanKeputusan: args.alasan ?? null,
        catatan: approval.status !== "pending" ? "Pengajuan ini sudah diputuskan — eksekusi kemungkinan ditolak." : undefined,
      };
    },
  },
  {
    name: "catat_pengeluaran",
    title: "Catat pengeluaran",
    description: "Catat pengeluaran kas outlet (kategori, deskripsi, nominal Rupiah, metode bayar).",
    write: true,
    domain: "keuangan",
    risk: "R2",
    permission: "finance:write",
    input: z.object({
      kategori: z.string().min(2),
      deskripsi: z.string().min(2).max(300),
      nominal: z.number().int().positive().max(1_000_000_000),
      metodeBayar: z.enum(["Cash", "Transfer", "QRIS"]).optional(),
      tanggal: dateKey.optional(),
      catatan: z.string().max(500).optional(),
    }),
    async run(session, args) {
      const { createExpense } = await import("@/lib/garage-service");
      return createExpense(
        {
          category: String(args.kategori),
          description: String(args.deskripsi),
          amount: Number(args.nominal),
          paymentMethod: (args.metodeBayar as string | undefined) ?? "Cash",
          // Biaya dari agent tidak memotong laci kasir; uang tunai = uang pribadi Owner.
          cashSource: "external",
          expenseDate: args.tanggal as string | undefined,
          notes: (args.catatan as string | undefined) ?? "Dicatat lewat agent AI",
        },
        session,
      );
    },
    async preview(_session, args) {
      return {
        aksi: "CATAT pengeluaran",
        nominal: rupiah(Number(args.nominal)),
        kategori: args.kategori,
        deskripsi: args.deskripsi,
        metodeBayar: args.metodeBayar ?? "Cash",
        tanggal: args.tanggal ?? "hari ini",
        sumberDana: "Uang Owner di luar laci — TIDAK memotong laci kasir",
        dampak: "Masuk biaya (expenses) & laporan laba-rugi; tidak bisa dihapus, koreksi lewat pembatalan.",
      };
    },
  },
  {
    name: "rekap_kas_harian",
    title: "Rekap kas & shift harian",
    description: "Rekap shift kasir pada tanggal tertentu: modal, penjualan, tunai seharusnya, selisih, QRIS.",
    write: false,
    domain: "shift_kas",
    risk: "R0",
    permission: "finance:read",
    input: z.object({ tanggal: dateKey.optional() }),
    async run(session, args) {
      const { getDailyCashSessionReport } = await import("@/lib/garage-service");
      return getDailyCashSessionReport({ date: (args.tanggal as string | undefined) ?? todayWibKey(), outletId: session.profile.outlet.id, requesterUserId: session.user.id });
    },
  },
  {
    name: "buat_laporan",
    title: "Buat file laporan",
    description:
      "Buat file laporan resmi (PDF/XLSX/CSV) untuk dikirim ke WhatsApp/Telegram. modul: penjualan (tipe day|week|month|year), pembelian (detail), stok (posisi), produksi (ringkasan), keuangan (pnl|daily|cashflow|expense|rekonsiliasi|pembayaran-supplier|payroll|hpp|product|bep|capital). divisi: semua|bar|kitchen.",
    write: false,
    domain: "dokumen",
    risk: "R0",
    permission: "finance:read",
    input: z.object({
      modul: z.enum(["penjualan", "pembelian", "stok", "produksi", "keuangan"]),
      tipe: z.string().optional(),
      format: z.enum(["pdf", "xlsx", "csv"]).optional(),
      from: dateKey.optional(),
      to: dateKey.optional(),
      divisi: z.enum(["semua", "bar", "kitchen"]).optional(),
    }),
    async run(session, args) {
      const { exportModuleReport, REPORT_CATALOG } = await import("@/lib/reports");
      const modul = args.modul as keyof typeof REPORT_CATALOG;
      const tipe = (args.tipe as string | undefined) ?? REPORT_CATALOG[modul].types[0].id;
      if (!REPORT_CATALOG[modul].types.some((t) => t.id === tipe)) {
        throw new AgentToolError("UNKNOWN_REPORT", `Tipe laporan untuk ${modul}: ${REPORT_CATALOG[modul].types.map((t) => t.id).join(", ")}.`);
      }
      const file = await exportModuleReport({
        module: modul,
        type: tipe,
        format: (args.format as "pdf" | "xlsx" | "csv" | undefined) ?? "pdf",
        range: range(args.from as string | undefined, args.to as string | undefined),
        division: (args.divisi as "semua" | "bar" | "kitchen" | undefined) ?? "semua",
        outletId: session.profile.outlet.id,
        outletName: session.profile.outlet.name,
      });
      return { filename: file.filename, contentType: file.contentType, sizeBytes: file.body.length, base64: file.body.toString("base64") };
    },
  },
  {
    name: "kemampuan_sistem",
    title: "Peta kemampuan AI Garage OS",
    description:
      "Daftar 16 domain Garage OS, tool yang tersedia per domain beserta tingkat risiko (R0 baca … R3 kritis), domain yang belum punya tool, dan hal yang selalu ditolak. Panggil saat Owner bertanya 'bisa apa saja'.",
    write: false,
    domain: "sistem",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({}),
    async run(session, _args, ctx) {
      return buildCapabilities(listAgentTools(session, { includeConfirmOnly: Boolean(ctx.confirmFlow) }).filter((tool) => !ctx.hiddenTools?.has(tool.name)));
    },
  },
  {
    name: "status_operasi",
    title: "Status & receipt operasi AI",
    description:
      "Cek status operasi berisiko (R2/R3) dari preview/konfirmasi berdasarkan operasiId: PENDING, EXECUTED (berhasil + ringkasan hasil), FAILED, atau UNKNOWN (terputus — jangan dianggap berhasil).",
    write: false,
    domain: "sistem",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({ operasiId: z.string().uuid() }),
    async run(session, args) {
      const { getOperation } = await import("@/lib/mcp-confirmation");
      const operation = await getOperation(String(args.operasiId), session.user.id);
      if (!operation) throw new AgentToolError("NOT_FOUND", "Operasi tidak ditemukan untuk akun ini.", 404);
      return operation;
    },
  },
  // M3a: Shift & Kas + Keuangan (aksi Owner/Manajer, R2/R3 lewat konfirmasi).
  ...kasTools,
  ...ownerAiTools,
  ...masterTools,
  ...supplierAssignmentTools,
  ...fraudTools,
  // M3b: POS/Order (batal/refund lewat pengajuan, koreksi metode bayar) + Karyawan.
  ...posStaffTools,
  // M3c: Produk & Harga (harga per varian, aksi produk, kategori).
  ...productTools,
  // M3d: Gudang / WMS (Minta Bahan, waste, PO, saran belanja).
  ...warehouseTools,
  // M3e: Member/CRM, Meja/QR, Event.
  ...memberTableEventTools,
  // M3f: Bahan & Resep (resep usulan, margin).
  ...recipeTools,
  // M3g: Konten & Marketing + Notifikasi staf (internal).
  ...marketingTools,
  // Tulis universal (Owner via ChatGPT, selalu lewat konfirmasi).
  ...ubahDataTools,
  ...fotoTools,
  // Owner 18 Nov 2026: produk/mitra/event cukup dengan NAMA + briefing pagi.
  ...produkCepatTools,
  ...mitraTools,
  ...eventLineupTools,
  ...briefingTools,
  {
    name: "garage_api",
    title: "Baca endpoint Garage OS",
    description:
      "BACA SAJA (GET): ambil data dari endpoint /api Garage OS yang belum punya tool, dengan hak key ini (mis. GET /api/orders, GET /api/finance/overview). Respons JSON apa adanya. Mengubah data wajib lewat tool bisnis. Endpoint kelola key, auth, cron & webhook diblokir.",
    // D-10 (Owner, Okt 2026): 16/16 domain sudah punya tool bisnis (M3), jadi tulis lewat
    // wildcard yang melewati preview/konfirmasi tidak dibutuhkan → GET saja.
    write: false,
    domain: "sistem",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({
      method: z.literal("GET").optional(),
      path: z.string().regex(/^\/api\/[A-Za-z0-9/_\-.%]*$/, "Path harus diawali /api/"),
      query: z.record(z.string(), z.string()).optional(),
    }),
    async run(session, args, ctx) {
      const { isAgentForbiddenPath } = await import("@/lib/agent-api-key");
      const path = String(args.path);
      if (isAgentForbiddenPath(path) || path.startsWith("/api/agent") || path === "/api/mcp") {
        throw new AgentToolError("AGENT_FORBIDDEN_PATH", "Endpoint ini tidak boleh dipanggil lewat agent.", 403);
      }
      if (ctx.confirmFlow && !ctx.authorization) {
        // MCP ChatGPT: token OAuth tidak diteruskan; baca lewat key sementara BACA-SAJA atas nama Owner.
        const { callApiAsOwner } = await import("@/lib/mcp-delegated-api");
        const { randomUUID } = await import("node:crypto");
        const response = await callApiAsOwner(
          session,
          { method: "GET", path, query: args.query as Record<string, string> | undefined },
          { operationId: randomUUID(), internalOrigin: ctx.internalOrigin, scope: "readonly" },
        );
        return { status: response.status, json: response.json ?? undefined, text: response.text ?? undefined };
      }
      const url = new URL(path, ctx.internalOrigin);
      for (const [key, value] of Object.entries((args.query as Record<string, string> | undefined) ?? {})) url.searchParams.set(key, value);
      const response = await fetch(url, { method: "GET", headers: { authorization: ctx.authorization }, cache: "no-store" });
      const type = response.headers.get("content-type") ?? "";
      if (type.includes("application/json")) {
        return { status: response.status, json: await response.json().catch(() => null) };
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? null;
      return { status: response.status, contentType: type, filename, sizeBytes: buffer.length, base64: buffer.length <= 8 * 1024 * 1024 ? buffer.toString("base64") : null };
    },
  },
];

export function listAgentTools(session?: GarageSession, options: { includeConfirmOnly?: boolean } = {}) {
  return tools
    .filter((tool) => options.includeConfirmOnly || !tool.confirmOnly)
    .filter((tool) => !session || (canUseApiAs(session.profile, tool.permission) && !(tool.write && session.profile.agentKey?.scope === "readonly")))
    .map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      write: tool.write,
      domain: tool.domain,
      risk: tool.risk,
      inputSchema: z.toJSONSchema(tool.input),
      meta: tool.meta,
    }));
}

export function findAgentTool(name: string) {
  return tools.find((tool) => tool.name === name) ?? null;
}

/** Jalankan tool: validasi argumen, cek scope & izin. */
export async function runAgentTool(session: GarageSession, name: string, rawArgs: unknown, ctx: AgentToolContext) {
  const tool = findAgentTool(name);
  if (!tool) throw new AgentToolError("UNKNOWN_TOOL", `Tool "${name}" tidak dikenal.`, 404);
  if (tool.confirmOnly && !ctx.confirmFlow) throw new AgentToolError("UNKNOWN_TOOL", `Tool "${name}" tidak dikenal.`, 404);
  if (tool.write && session.profile.agentKey?.scope === "readonly") {
    throw new AgentToolError("AGENT_READONLY", "API key baca-saja tidak boleh menjalankan tool yang mengubah data.", 403);
  }
  if (!canUseApiAs(session.profile, tool.permission)) {
    throw new AgentToolError("FORBIDDEN", "Scope API key tidak punya akses untuk tool ini.", 403);
  }
  const parsed = tool.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    throw new AgentToolError("VALIDATION_ERROR", parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; "));
  }
  return tool.run(session, parsed.data as Record<string, unknown>, ctx);
}

/** Origin untuk panggilan internal garage_api (server yang sama). */
export function agentInternalOrigin() {
  return process.env.GARAGE_INTERNAL_BASE_URL?.trim() || `http://127.0.0.1:${process.env.PORT || 3000}`;
}
