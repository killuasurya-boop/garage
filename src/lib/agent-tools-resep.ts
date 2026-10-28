// =============================================================================
// M3f — tool MCP domain Bahan & Resep (PRD V4.0 §04 domain 6, D-01).
// Resep usulan (draft) baru memotong stok & masuk HPP setelah disetujui
// (approveDraftRecipe: validasi bahan/BOM, sync WMS dalam satu transaksi).
// Menyetujui = R2 (mengubah HPP & pemotongan stok); menolak = R1.
// =============================================================================
import { z } from "zod";

import { AgentToolError, rupiah, type AgentTool } from "@/lib/agent-tool-core";
import type { GarageSession } from "@/lib/server-auth";
import { wmsIsElevated } from "@/lib/wms-access";

function actorOf(session: GarageSession) {
  if (!wmsIsElevated(session.profile.role)) throw new AgentToolError("FORBIDDEN", "Hanya Owner/Manajer.", 403);
  return { id: session.user.id, name: session.user.name };
}

async function draftOrThrow(menuId: string) {
  const { listDraftRecipes } = await import("@/lib/master-import");
  const draft = (await listDraftRecipes()).find((row) => row.menuItemId === menuId);
  if (!draft) throw new AgentToolError("NOT_FOUND", "Menu ini tidak punya resep draft.", 404);
  return draft;
}

export const recipeTools: AgentTool[] = [
  {
    name: "daftar_resep_draft",
    title: "Daftar resep usulan (draft)",
    description:
      "Resep usulan barista/koki yang belum aktif: bahan & qty per varian, HPP & food cost % per varian, dan baris bermasalah (bahan tidak ada, satuan beda) yang harus diperbaiki sebelum disetujui.",
    write: false,
    domain: "bahan_resep",
    risk: "R0",
    permission: "inventory:read",
    input: z.object({ cari: z.string().max(80).optional() }),
    async run(_session, args) {
      const { listDraftRecipes } = await import("@/lib/master-import");
      const term = String(args.cari ?? "").trim().toLowerCase();
      const rows = await listDraftRecipes();
      return term ? rows.filter((row) => row.menuName.toLowerCase().includes(term) || row.category.toLowerCase().includes(term)) : rows;
    },
  },
  {
    name: "margin_menu",
    title: "Margin & HPP menu",
    description: "HPP resep aktif, harga jual & margin per menu/varian (dari biaya bahan saat ini). Menu tanpa resep aktif = HPP belum lengkap.",
    write: false,
    domain: "bahan_resep",
    risk: "R0",
    permission: "finance:read",
    input: z.object({}),
    async run(session) {
      const { getMenuMarginReport } = await import("@/lib/garage-service");
      return getMenuMarginReport(session);
    },
  },
  {
    name: "setujui_resep_draft",
    title: "Setujui resep usulan",
    description:
      "Aktifkan resep draft satu menu: mulai memotong stok saat terjual dan HPP varian dihitung ulang. Ditolak bila ada baris bermasalah (pesan menyebut barisnya) atau menu sudah punya resep aktif.",
    write: true,
    domain: "bahan_resep",
    risk: "R2",
    permission: "inventory:write",
    input: z.object({ menuId: z.string().min(1).max(80) }),
    async run(session, args) {
      const { approveDraftRecipe } = await import("@/lib/master-import");
      return approveDraftRecipe(String(args.menuId), actorOf(session));
    },
    async preview(session, args) {
      actorOf(session);
      const draft = await draftOrThrow(String(args.menuId));
      return {
        aksi: `SETUJUI resep ${draft.menuName}`,
        kategori: draft.category,
        varian: draft.variants.map((v) => `${v.label}: harga ${rupiah(v.price)}, HPP ${rupiah(v.hpp)}${v.foodCostPct !== null ? ` (food cost ${v.foodCostPct}%)` : ""}`),
        bahan: draft.lines.map((line) => `${line.variantId === "all" ? "Semua varian" : line.variantId}: ${line.qty} ${line.unit} ${line.name}${line.problem ? ` — MASALAH: ${line.problem}` : ""}`),
        dampak: "Setelah aktif: setiap penjualan memotong stok bahan ini di WMS dan HPP varian ikut resep.",
        catatan: draft.problems ? `${draft.problems} baris bermasalah — eksekusi akan ditolak sampai diperbaiki.` : undefined,
      };
    },
  },
  {
    name: "tolak_resep_draft",
    title: "Tolak resep usulan",
    description: "Tolak resep draft satu menu dengan alasan (resep diarsipkan, tidak dihapus; impor ulang tidak memunculkannya lagi).",
    write: true,
    domain: "bahan_resep",
    risk: "R1",
    permission: "inventory:write",
    input: z.object({ menuId: z.string().min(1).max(80), alasan: z.string().min(3).max(300) }),
    async run(session, args) {
      const { rejectDraftRecipe } = await import("@/lib/master-import");
      return rejectDraftRecipe(String(args.menuId), String(args.alasan), actorOf(session));
    },
  },
];
