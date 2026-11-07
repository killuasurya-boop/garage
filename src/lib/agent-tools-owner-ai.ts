// Tool koneksi Owner AI Connect (blueprint V3 §6.1, Phase 1): garage_ping & garage_verify_connection.
// Keduanya R0: tidak mengubah data bisnis. Verifikasi hanya menulis metadata koneksi
// (bukti), jadi tetap jalan walau saklar "ChatGPT boleh mengubah data" dimatikan.
import { z } from "zod";

import { AgentToolError, type AgentTool } from "@/lib/agent-tool-core";

export const ownerAiTools: AgentTool[] = [
  {
    name: "garage_ping",
    title: "Cek koneksi Garage OS",
    description: "Cek bahwa server Garage OS terjangkau & token Anda sah. Tidak membaca data bisnis.",
    write: false,
    domain: "sistem",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({}),
    async run(session, _args, ctx) {
      return {
        status: "OK",
        server: "Garage OS",
        serverTime: new Date().toISOString(),
        akun: session.user.name,
        peran: session.profile.role,
        jalur: ctx.mcpConnection ? "chatgpt_mcp" : session.profile.agentKey ? "agent_api" : "garage_owner_ui",
        catatan: ctx.mcpConnection
          ? "Untuk menandai koneksi TERVERIFIKASI, buat kode di Garage OS → AI Connect lalu panggil garage_verify_connection."
          : null,
      };
    },
  },
  {
    name: "garage_verify_connection",
    title: "Verifikasi koneksi ChatGPT",
    description:
      "Buktikan ChatGPT ini tersambung ke Garage OS milik Owner. Minta Owner membuat kode verifikasi di Garage OS → AI Connect, lalu panggil tool ini dengan kode tersebut (contoh: AB3D-EF9H). Kode berlaku 10 menit, sekali pakai.",
    write: false,
    domain: "sistem",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({ kode: z.string().trim().min(8).max(12).describe("Kode verifikasi dari halaman AI Connect, mis. AB3D-EF9H") }),
    async run(session, args, ctx) {
      if (!ctx.mcpConnection) {
        throw new AgentToolError("CAPABILITY_UNAVAILABLE", "Verifikasi koneksi hanya untuk ChatGPT (MCP OAuth), bukan API key.", 400);
      }
      const { verifyConnectionChallenge, AiConnectError } = await import("@/lib/owner-ai-connect");
      try {
        const result = await verifyConnectionChallenge({
          ownerUserId: session.user.id,
          connectionId: ctx.mcpConnection.id,
          code: String(args.kode),
        });
        return {
          verified: true,
          connectionId: ctx.mcpConnection.id,
          verifiedAt: result.verifiedAt.toISOString(),
          pesan: "Koneksi ChatGPT terverifikasi. Status di Garage OS → AI Connect kini AI VERIFIED (berlaku 24 jam, lalu verifikasi ulang).",
        };
      } catch (error) {
        if (error instanceof AiConnectError) throw new AgentToolError(error.code, error.message, error.status);
        throw error;
      }
    },
  },
  {
    name: "garage_analisis_masalah",
    title: "AYA — Analisis masalah lintas Garage OS",
    description: "Terima keluhan atau ide Owner, baca bukti dari tool R0 POS/WMS/Kas/Finance/Produksi dan sajikan fakta, hipotesis, rekomendasi, serta tindakan DRAFT. Tidak mengubah data bisnis.",
    write: false,
    domain: "sistem",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({
      masalah: z.string().trim().min(5).max(3000),
      mode: z.enum(["quick", "full"]).optional(),
      gunakanAi: z.boolean().optional(),
    }),
    async run(session, args) {
      if (session.profile.role !== "Owner")
        throw new AgentToolError("FORBIDDEN", "Analisis lintas modul hanya untuk Owner.", 403);
      const { runGarageProblemSolver } = await import("@/lib/garage-problem-solver-service");
      return runGarageProblemSolver({
        session,
        message: String(args.masalah),
        mode: (args.mode as "quick" | "full" | undefined) ?? "quick",
        withAi: args.gunakanAi !== false,
      });
    },
  },

];
