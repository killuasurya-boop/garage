// Tipe & helper bersama katalog tool agent (agent-tools.ts + modul tool per
// domain, M3). Dipisah agar modul domain tidak saling impor melingkar.
import { z } from "zod";

import { validateDateRange, todayWibKey } from "@/lib/date-range";
import type { GarageDomainId, ToolRisk } from "@/lib/mcp-tool-registry";
import type { Permission } from "@/lib/role-access";
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
  /**
   * Ringkasan dampak untuk preview R2/R3 sebelum Owner mengonfirmasi (M2).
   * Hanya membaca — tidak boleh mengubah data.
   */
  preview?: (session: GarageSession, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /**
   * Hanya ada di pintu masuk yang punya alur konfirmasi (MCP ChatGPT) dan hanya
   * jalan setelah Owner mengonfirmasi (`ctx.confirmedOperationId`).
   */
  confirmOnly?: boolean;
  /**
   * Risiko per argumen (mis. ubah_data_garage: path uang = R3 → wajib kode 2FA).
   * Hanya boleh MENAIKKAN dari `risk`, tidak menurunkan.
   */
  riskFor?: (args: Record<string, unknown>) => ToolRisk;
  /** `_meta` tambahan di deskriptor MCP (mis. `openai/fileParams` untuk argumen berupa file unggahan). */
  meta?: Record<string, unknown>;
};

export const rupiah = (value: number) => `Rp${Math.round(value).toLocaleString("id-ID")}`;

export type AgentToolContext = {
  /** Header Authorization asli (diteruskan oleh garage_api). */
  authorization: string;
  /** Origin internal untuk panggilan garage_api. */
  internalOrigin: string;
  /** Tool yang tidak tersedia di pintu masuk ini (mis. garage_api di MCP ChatGPT). */
  hiddenTools?: ReadonlySet<string>;
  /** Pintu masuk ini punya alur preview → konfirmasi (MCP ChatGPT). */
  confirmFlow?: boolean;
  /** Diisi runToolWithConfirmation setelah token konfirmasi Owner diklaim. */
  confirmedOperationId?: string;
  /** Koneksi ChatGPT terautentikasi (Owner AI Connect) — hanya di gateway MCP ChatGPT. */
  mcpConnection?: { id: string; provider: "chatgpt" };
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

export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD");

export function range(from?: string, to?: string) {
  const today = todayWibKey();
  const check = validateDateRange(from ?? today, to ?? from ?? today, { maxDays: 366 });
  if (!check.ok) throw new AgentToolError(check.code, check.message);
  return { from: check.from, to: check.to };
}
