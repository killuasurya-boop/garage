// =============================================================================
// Tulis universal untuk MCP ChatGPT (Owner, Okt 2026: "semua hal di Garage
// boleh saya ubah lewat ChatGPT").
//
// - katalog_endpoint (R0): daftar endpoint /api yang bisa dipanggil (hasil
//   generate dari src/app/api), supaya ChatGPT tahu path & method.
// - ubah_data_garage (R2): POST/PUT/PATCH/DELETE ke /api atas nama Owner,
//   HANYA lewat alur preview → konfirmasi Owner → eksekusi (`confirmOnly`).
//   Tidak tersedia di REST agent / MCP API key (tanpa konfirmasi, D-10).
//   Route yang dipanggil tetap memvalidasi body & aturan bisnisnya sendiri.
// Aksi kritis (R3) & yang selalu ditolak (R4) diblok di sini dan diarahkan ke
// tool khusus atau layar Garage OS.
// =============================================================================
import { z } from "zod";

import { AgentToolError, type AgentTool } from "@/lib/agent-tool-core";
import { isAgentForbiddenPath } from "@/lib/agent-api-key";
import { API_ROUTE_CATALOG } from "@/lib/api-route-catalog.generated";
import type { GarageSession } from "@/lib/server-auth";

export const UBAH_DATA_TOOL = "ubah_data_garage";
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;

type Block = { prefix?: string; pattern?: RegExp; reason: string };

/** Path yang tidak boleh lewat ubah_data_garage, dengan arahan penggantinya. */
const BLOCKED: Block[] = [
  { prefix: "/api/agent", reason: "Endpoint agent internal." },
  { prefix: "/api/mcp", reason: "Endpoint MCP internal." },
  { prefix: "/api/oauth", reason: "OAuth/izin koneksi hanya lewat layar Garage OS." },
  { prefix: "/api/ai/drive/oauth", reason: "Koneksi Google Drive hanya lewat layar Garage OS." },
  { prefix: "/api/member/", reason: "Endpoint akun member (sisi pelanggan) — pakai tool member." },
  { prefix: "/api/customer/", reason: "Endpoint sisi pelanggan — Owner memakai endpoint staf." },
  { prefix: "/api/admin/seed-training", reason: "Data latihan hanya dari layar Garage OS." },
  { prefix: "/api/payroll/backup", reason: "Backup/restore hanya dari layar Garage OS." },
  { prefix: "/api/finance/closing", reason: "Tutup/buka buku adalah aksi KRITIS (R3): pakai tool tutup_buku_harian." },
  { prefix: "/api/control/cash-opening", reason: "Sertifikasi saldo awal (R3) hanya dari layar Kontrol Kas dengan bukti." },
  { pattern: /^\/api\/marketing\/publishing\/[^/]+\/publish$/, reason: "Terbitkan konten (R3): pakai tool terbitkan_konten." },
  { pattern: /\/(pin|reset-pin|reset-password|password)(\/|$)/, reason: "PIN & password tidak pernah diubah atau dibaca lewat chat." },
  { pattern: /\/(bulk|import|master-import)(\/|$)/, reason: "Aksi massal/impor (R3) dilakukan dari layar Garage OS supaya bisa dicek dulu." },
];

/** Alasan path ditolak, atau null bila boleh. Murni — dites di agent-tools-ubah-data.test.ts. */
export function ubahDataBlockReason(path: string): string | null {
  if (!/^\/api\/[A-Za-z0-9/_\-.%]*$/.test(path) || path.includes("..")) return "Path harus diawali /api/ tanpa '..'.";
  if (isAgentForbiddenPath(path)) {
    return "Endpoint auth, API key, cron, webhook, akun & keamanan pengguna tidak boleh lewat chat (peran staf: pakai ubah_status_peran_staf).";
  }
  for (const block of BLOCKED) {
    if (block.prefix && path.startsWith(block.prefix)) return block.reason;
    if (block.pattern && block.pattern.test(path)) return block.reason;
  }
  return null;
}

function routePattern(template: string) {
  const source = template
    .split("/")
    .map((part) => (/^\{\.{3}.+\}$/.test(part) ? ".+" : /^\{.+\}$/.test(part) ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${source}$`);
}

const COMPILED = API_ROUTE_CATALOG.map((route) => ({ ...route, regex: routePattern(route.path) }));

/** Route katalog yang cocok dengan path nyata (mis. /api/orders/123 → /api/orders/{id}). */
export function matchApiRoute(path: string) {
  const exact = COMPILED.find((route) => route.path === path);
  return exact ?? COMPILED.find((route) => route.regex.test(path)) ?? null;
}

function assertOwnerViaChat(session: GarageSession) {
  if (session.profile.role !== "Owner" || session.profile.agentKey) {
    throw new AgentToolError("FORBIDDEN", "Ubah data universal hanya untuk Owner lewat ChatGPT.", 403);
  }
}

const ubahInput = z.object({
  method: z.enum(WRITE_METHODS),
  path: z.string().min(5).max(300),
  query: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  alasan: z.string().trim().min(3, "Tulis alasan singkat perubahan.").max(300),
});

export const ubahDataTools: AgentTool[] = [
  {
    name: "katalog_endpoint",
    title: "Katalog endpoint Garage OS",
    description:
      "Daftar endpoint /api Garage OS beserta method-nya (sumber: kode aplikasi). Filter dengan `cari` (mis. 'menu', 'promo', 'settings', 'wms'). Pakai sebelum ubah_data_garage untuk menemukan path & method yang benar; untuk tahu bentuk body, baca dulu datanya dengan garage_api (GET).",
    write: false,
    domain: "sistem",
    risk: "R0",
    permission: "company:manage",
    input: z.object({ cari: z.string().trim().max(60).optional(), hanyaUbah: z.boolean().optional() }),
    async run(_session, args) {
      const term = String(args.cari ?? "").toLowerCase();
      const onlyWrite = args.hanyaUbah !== false;
      const rows = API_ROUTE_CATALOG.filter((route) => (!term || `${route.path} ${route.note}`.toLowerCase().includes(term)))
        .map((route) => ({
          path: route.path,
          methods: onlyWrite ? route.methods.filter((method) => method !== "GET") : route.methods,
          keterangan: route.note || undefined,
          diblokir: ubahDataBlockReason(route.path.replace(/\{[^}]+\}/g, "x")) ?? undefined,
        }))
        .filter((route) => route.methods.length);
      return { total: rows.length, endpoint: rows.slice(0, 120), terpotong: rows.length > 120 };
    },
  },
  {
    name: UBAH_DATA_TOOL,
    title: "Ubah data Garage OS (universal)",
    description:
      "Ubah data apa pun yang bisa diubah di layar Garage OS: POST/PUT/PATCH/DELETE ke endpoint /api atas nama Owner (mis. tambah/edit produk, kategori, pengaturan toko, meja, promo, voucher, member, bahan, penerimaan, opname, karyawan, jadwal). Pakai tool bisnis khusus bila ada (lebih aman); pakai ini untuk sisanya. Cari path di katalog_endpoint, baca data sekarang dengan garage_api (GET), lalu kirim body JSON yang sama bentuknya dengan layar. Server memvalidasi body & aturan bisnis; error dikembalikan apa adanya. Selalu lewat preview + konfirmasi Owner. Ditolak: auth/API key/PIN/password, tutup buku, sertifikasi saldo, terbitkan konten, aksi massal/impor, hapus buku kas/audit.",
    write: true,
    domain: "sistem",
    risk: "R2",
    permission: "company:manage",
    confirmOnly: true,
    input: ubahInput,
    async preview(session, args) {
      assertOwnerViaChat(session);
      const path = String(args.path);
      const reason = ubahDataBlockReason(path);
      const route = matchApiRoute(path);
      const base = {
        aksi: `${args.method} ${path}`,
        endpoint: route ? `${route.path} (${route.methods.join(", ")})` : "TIDAK DIKENAL di katalog",
        alasan: args.alasan,
        body: args.body ?? null,
        ...(reason ? { DITOLAK: reason } : {}),
        ...(route && !route.methods.includes(String(args.method)) ? { PERINGATAN: `Endpoint ini tidak menerima ${args.method}.` } : {}),
      };
      if (reason || !route?.methods.includes("GET") || args.method === "POST") return base;
      // Data sekarang (bila endpoint punya GET) — key sementara BACA-SAJA.
      try {
        const { callApiAsOwner } = await import("@/lib/mcp-delegated-api");
        const { agentInternalOrigin } = await import("@/lib/agent-tools");
        const current = await callApiAsOwner(
          session,
          { method: "GET", path, query: args.query as Record<string, string> | undefined },
          { operationId: `preview-${Date.now()}`, internalOrigin: agentInternalOrigin(), scope: "readonly" },
        );
        return { ...base, dataSekarang: current.ok ? current.json ?? current.text : `tidak terbaca (HTTP ${current.status})` };
      } catch {
        return base;
      }
    },
    async run(session, args, ctx) {
      assertOwnerViaChat(session);
      if (!ctx.confirmedOperationId) {
        throw new AgentToolError("CONFIRMATION_REQUIRED", "ubah_data_garage hanya berjalan lewat konfirmasi Owner di ChatGPT.", 403);
      }
      const path = String(args.path);
      const reason = ubahDataBlockReason(path);
      if (reason) throw new AgentToolError("UBAH_DATA_DITOLAK", reason, 403);
      const route = matchApiRoute(path);
      if (!route) throw new AgentToolError("ENDPOINT_TIDAK_DIKENAL", `Endpoint ${path} tidak ada di katalog. Cek katalog_endpoint.`, 404);
      const method = args.method as (typeof WRITE_METHODS)[number];
      if (!route.methods.includes(method)) {
        throw new AgentToolError("METHOD_TIDAK_DIDUKUNG", `${route.path} hanya menerima ${route.methods.join(", ")}.`, 405);
      }
      const { callApiAsOwner } = await import("@/lib/mcp-delegated-api");
      const response = await callApiAsOwner(
        session,
        { method, path, query: args.query as Record<string, string> | undefined, body: args.body },
        { operationId: ctx.confirmedOperationId, internalOrigin: ctx.internalOrigin },
      );
      if (!response.ok) {
        const error = (response.json as { error?: { code?: string; message?: string } } | null)?.error;
        throw new AgentToolError(error?.code ?? `HTTP_${response.status}`, error?.message ?? response.text ?? `Gagal (HTTP ${response.status}).`, response.status);
      }
      return { status: response.status, endpoint: `${method} ${path}`, alasan: args.alasan, respons: response.json ?? response.text };
    },
  },
];
