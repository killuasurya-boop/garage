// =============================================================================
// Katalog tool agent AI (OpenClaw / Hermes). Dipakai REST /api/agent/v1/tools
// dan server MCP /api/mcp. Tool memanggil service Garage langsung dengan sesi
// agent (hak = scope key). `garage_api` membuka akses ke endpoint /api lain.
// =============================================================================
import { z } from "zod";

import { validateDateRange, todayWibKey } from "@/lib/date-range";
import { buildCapabilities, type GarageDomainId, type ToolRisk } from "@/lib/mcp-tool-registry";
import { canUseApiAs, type Permission } from "@/lib/role-access";
import type { GarageSession } from "@/lib/server-auth";

export type AgentTool = {
  name: string;
  title: string;
  description: string;
  /** Tool mengubah data (ditolak untuk key baca-saja). Harus = risk !== "R0". */
  write: boolean;
  /** Domain PRD V4.0 §04 (registry kemampuan, mcp-tool-registry.ts). */
  domain: GarageDomainId;
  /** Risiko aksi PRD §07.2; R2/R3 wajib preview + konfirmasi (M2). */
  risk: ToolRisk;
  permission: Permission;
  input: z.ZodObject<z.ZodRawShape>;
  run: (session: GarageSession, args: Record<string, unknown>, ctx: AgentToolContext) => Promise<unknown>;
};

export type AgentToolContext = {
  /** Header Authorization asli (diteruskan oleh garage_api). */
  authorization: string;
  /** Origin internal untuk panggilan garage_api. */
  internalOrigin: string;
  /** Tool yang tidak tersedia di pintu masuk ini (mis. garage_api di MCP ChatGPT). */
  hiddenTools?: ReadonlySet<string>;
};

export class AgentToolError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD");

function range(from?: string, to?: string) {
  const today = todayWibKey();
  const check = validateDateRange(from ?? today, to ?? from ?? today, { maxDays: 366 });
  if (!check.ok) throw new AgentToolError(check.code, check.message);
  return { from: check.from, to: check.to };
}

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
    async run(_session, args) {
      const { getApprovalData } = await import("@/lib/garage-service");
      const status = (args.status as string | undefined) ?? "pending";
      return getApprovalData(status === "all" ? undefined : { status });
    },
  },
  {
    name: "putuskan_approval",
    title: "Setujui / tolak pengajuan",
    description: "Putuskan pengajuan berdasarkan id. Tolak wajib dengan alasan.",
    write: true,
    domain: "keuangan",
    risk: "R2",
    permission: "approvals:decide",
    input: z.object({ id: z.string().min(1), keputusan: z.enum(["approved", "rejected"]), alasan: z.string().max(500).optional() }),
    async run(session, args) {
      if (args.keputusan === "rejected" && !String(args.alasan ?? "").trim()) {
        throw new AgentToolError("REASON_REQUIRED", "Alasan wajib diisi untuk menolak.");
      }
      const { decideApproval } = await import("@/lib/garage-service");
      return decideApproval(String(args.id), { status: args.keputusan as "approved" | "rejected", reasonDecided: args.alasan as string | undefined }, session);
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
      return buildCapabilities(listAgentTools(session).filter((tool) => !ctx.hiddenTools?.has(tool.name)));
    },
  },
  {
    name: "garage_api",
    title: "Panggil endpoint Garage OS",
    description:
      "Akses penuh: panggil endpoint /api Garage OS mana pun dengan hak key ini (mis. GET /api/orders, POST /api/orders/{id}/void, GET /api/finance/overview). Respons JSON apa adanya. Endpoint kelola key, auth, cron & webhook diblokir.",
    write: true,
    domain: "sistem",
    risk: "R3",
    permission: "dashboard:read",
    input: z.object({
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z.string().regex(/^\/api\/[A-Za-z0-9/_\-.%]*$/, "Path harus diawali /api/"),
      query: z.record(z.string(), z.string()).optional(),
      body: z.unknown().optional(),
    }),
    async run(session, args, ctx) {
      const { isAgentForbiddenPath } = await import("@/lib/agent-api-key");
      const method = String(args.method);
      const path = String(args.path);
      if (isAgentForbiddenPath(path) || path.startsWith("/api/agent") || path === "/api/mcp") {
        throw new AgentToolError("AGENT_FORBIDDEN_PATH", "Endpoint ini tidak boleh dipanggil lewat agent.", 403);
      }
      if (session.profile.agentKey?.scope === "readonly" && method !== "GET") {
        throw new AgentToolError("AGENT_READONLY", "API key baca-saja hanya boleh GET.", 403);
      }
      const url = new URL(path, ctx.internalOrigin);
      for (const [key, value] of Object.entries((args.query as Record<string, string> | undefined) ?? {})) url.searchParams.set(key, value);
      const response = await fetch(url, {
        method,
        headers: { authorization: ctx.authorization, ...(args.body !== undefined ? { "content-type": "application/json" } : {}) },
        body: args.body !== undefined && method !== "GET" ? JSON.stringify(args.body) : undefined,
        cache: "no-store",
      });
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

export function listAgentTools(session?: GarageSession) {
  return tools
    .filter((tool) => !session || (canUseApiAs(session.profile, tool.permission) && !(tool.write && session.profile.agentKey?.scope === "readonly" && tool.name !== "garage_api")))
    .map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      write: tool.write,
      domain: tool.domain,
      risk: tool.risk,
      inputSchema: z.toJSONSchema(tool.input),
    }));
}

export function findAgentTool(name: string) {
  return tools.find((tool) => tool.name === name) ?? null;
}

/** Jalankan tool: validasi argumen, cek scope & izin. */
export async function runAgentTool(session: GarageSession, name: string, rawArgs: unknown, ctx: AgentToolContext) {
  const tool = findAgentTool(name);
  if (!tool) throw new AgentToolError("UNKNOWN_TOOL", `Tool "${name}" tidak dikenal.`, 404);
  if (tool.write && tool.name !== "garage_api" && session.profile.agentKey?.scope === "readonly") {
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
