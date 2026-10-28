// Preview → konfirmasi Owner → eksekusi → receipt untuk tool R2/R3 lewat MCP
// ChatGPT (keputusan Owner D-01, PRD V4.0 §07.4–07.5, batch M2).
//
// Panggilan pertama tanpa `konfirmasi` → TIDAK dijalankan; dibuat operasi
// `pending` + token sekali pakai (berlaku 5 menit). Owner melihat ringkasan di
// chat; bila setuju, ChatGPT memanggil tool yang sama dengan argumen yang SAMA
// + `konfirmasi`. Token diklaim dengan satu UPDATE atomik (status pending →
// confirmed), jadi tidak bisa dipakai dua kali walau dikirim bersamaan.
import { createHash, randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { mcpOperations } from "@/db/schema";

export const CONFIRM_ARG = "konfirmasi";
/** D-01a: aksi R3 lewat chat butuh kode TOTP Owner (6 angka) di panggilan konfirmasi. */
export const TOTP_ARG = "kode2fa";
export const MCP_R3_PURPOSE = "mcp_r3";
export const CONFIRMATION_TTL_MS = 5 * 60_000;
const RESULT_SUMMARY_LIMIT = 4_000;

export function splitConfirmation(rawArgs: unknown): {
  args: Record<string, unknown>;
  token: string | null;
  totpCode: string | null;
} {
  const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? { ...(rawArgs as Record<string, unknown>) } : {};
  const token = typeof args[CONFIRM_ARG] === "string" ? (args[CONFIRM_ARG] as string) : null;
  const rawCode = args[TOTP_ARG];
  // Angka dari chat bisa kehilangan nol di depan (012345 → 12345).
  const totpCode =
    typeof rawCode === "number" ? String(Math.trunc(rawCode)).padStart(6, "0") : typeof rawCode === "string" ? rawCode.trim() : null;
  delete args[CONFIRM_ARG];
  delete args[TOTP_ARG];
  return { args, token, totpCode };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Sidik argumen (setelah validasi Zod) — konfirmasi berlaku hanya untuk argumen yang sama persis. */
export function argsDigest(tool: string, parsedArgs: Record<string, unknown>) {
  return createHash("sha256").update(`${tool}\n${stableStringify(parsedArgs)}`).digest("hex");
}

const hashNonce = (nonce: string) => createHash("sha256").update(nonce).digest("hex");

export async function createPendingOperation(input: {
  userId: string;
  oauthClientId: string | null;
  tool: string;
  risk: string;
  parsedArgs: Record<string, unknown>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const nonce = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS);
  const [row] = await getDb()
    .insert(mcpOperations)
    .values({
      userId: input.userId,
      oauthClientId: input.oauthClientId,
      tool: input.tool,
      risk: input.risk,
      argsDigest: argsDigest(input.tool, input.parsedArgs),
      argsPreview: input.parsedArgs,
      nonceHash: hashNonce(nonce),
      expiresAt,
    })
    .returning({ id: mcpOperations.id });
  return { operationId: row.id, token: `${row.id}.${nonce}`, expiresAt };
}

export type ClaimResult = { ok: true; operationId: string } | { ok: false; code: string; message: string };

/** Klaim token sekali pakai. Atomik: hanya satu pemanggil yang bisa mengubah pending → confirmed. */
export async function claimOperation(input: {
  token: string;
  userId: string;
  tool: string;
  parsedArgs: Record<string, unknown>;
  now?: Date;
}): Promise<ClaimResult> {
  const now = input.now ?? new Date();
  const [operationId, nonce] = input.token.split(".");
  if (!operationId || !nonce || !/^[0-9a-f-]{36}$/i.test(operationId)) {
    return { ok: false, code: "CONFIRMATION_INVALID", message: "Token konfirmasi tidak valid. Minta preview ulang." };
  }
  const db = getDb();
  const [row] = await db
    .select()
    .from(mcpOperations)
    .where(and(eq(mcpOperations.id, operationId), eq(mcpOperations.userId, input.userId)))
    .limit(1);
  if (!row || row.nonceHash !== hashNonce(nonce) || row.tool !== input.tool) {
    return { ok: false, code: "CONFIRMATION_INVALID", message: "Token konfirmasi tidak cocok dengan tool/akun ini. Minta preview ulang." };
  }
  if (row.argsDigest !== argsDigest(input.tool, input.parsedArgs)) {
    return { ok: false, code: "CONFIRMATION_ARGS_CHANGED", message: "Argumen berbeda dari yang dikonfirmasi Owner. Minta preview ulang." };
  }
  if (row.status !== "pending") {
    return { ok: false, code: "CONFIRMATION_USED", message: "Token konfirmasi sudah dipakai. Satu konfirmasi = satu eksekusi." };
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, code: "CONFIRMATION_EXPIRED", message: "Konfirmasi kedaluwarsa (5 menit). Minta preview ulang." };
  }
  const claimed = await db
    .update(mcpOperations)
    .set({ status: "confirmed", confirmedAt: now })
    .where(and(eq(mcpOperations.id, operationId), eq(mcpOperations.status, "pending")))
    .returning({ id: mcpOperations.id });
  if (!claimed.length) {
    return { ok: false, code: "CONFIRMATION_USED", message: "Token konfirmasi sudah dipakai. Satu konfirmasi = satu eksekusi." };
  }
  return { ok: true, operationId };
}

function summarize(result: unknown) {
  try {
    const text = JSON.stringify(result ?? null);
    return text.length > RESULT_SUMMARY_LIMIT ? { terpotong: true, awal: text.slice(0, RESULT_SUMMARY_LIMIT) } : JSON.parse(text);
  } catch {
    return { tidakBisaDiserialisasi: true };
  }
}

export async function completeOperation(operationId: string, outcome: { ok: true; result: unknown } | { ok: false; error: string }) {
  const now = new Date();
  await getDb()
    .update(mcpOperations)
    .set(
      outcome.ok
        ? { status: "executed", executedAt: now, resultSummary: summarize(outcome.result) }
        : { status: "failed", executedAt: now, error: outcome.error.slice(0, 1_000) },
    )
    .where(eq(mcpOperations.id, operationId));
  return now;
}

export async function getOperation(operationId: string, userId: string) {
  const [row] = await getDb()
    .select()
    .from(mcpOperations)
    .where(and(eq(mcpOperations.id, operationId), eq(mcpOperations.userId, userId)))
    .limit(1);
  if (!row) return null;
  return {
    operationId: row.id,
    tool: row.tool,
    risiko: row.risk,
    // confirmed tanpa executed = belum pasti (proses terputus) — jangan dianggap berhasil.
    status: row.status === "confirmed" ? "UNKNOWN" : row.status.toUpperCase(),
    argumen: row.argsPreview,
    dibuat: row.createdAt.toISOString(),
    dikonfirmasi: row.confirmedAt?.toISOString() ?? null,
    dijalankan: row.executedAt?.toISOString() ?? null,
    hasil: row.resultSummary ?? null,
    error: row.error,
  };
}

// ─── Orkestrasi untuk handleMcpMessage (dipasang gateway MCP ChatGPT) ─────────

export async function runToolWithConfirmation(input: {
  session: import("@/lib/server-auth").GarageSession;
  name: string;
  rawArgs: unknown;
  ctx: import("@/lib/agent-tools").AgentToolContext;
  oauthClientId: string | null;
}) {
  const { AgentToolError, findAgentTool, runAgentTool } = await import("@/lib/agent-tools");
  const { riskNeedsConfirmation } = await import("@/lib/mcp-tool-registry");
  const { canUseApiAs } = await import("@/lib/role-access");
  const { args, token, totpCode } = splitConfirmation(input.rawArgs);
  const tool = findAgentTool(input.name);
  if (!tool || !riskNeedsConfirmation(tool.risk)) return runAgentTool(input.session, input.name, args, input.ctx);

  if (!canUseApiAs(input.session.profile, tool.permission)) {
    throw new AgentToolError("FORBIDDEN", "Scope akun tidak punya akses untuk tool ini.", 403);
  }
  const parsed = tool.input.safeParse(args);
  // Argumen tidak valid → biarkan runAgentTool melempar VALIDATION_ERROR standar.
  if (!parsed.success) return runAgentTool(input.session, input.name, args, input.ctx);
  const parsedArgs = parsed.data as Record<string, unknown>;
  const userId = input.session.user.id;
  const needsTotp = tool.risk === "R3";

  if (!token) {
    const ringkasan = tool.preview ? await tool.preview(input.session, parsedArgs) : {};
    const op = await createPendingOperation({ userId, oauthClientId: input.oauthClientId, tool: tool.name, risk: tool.risk, parsedArgs });
    if (needsTotp) {
      // D-01a: tantangan 2FA terikat operasi + sidik argumen; nonce = nonce token konfirmasi.
      const { createStepUpChallenge } = await import("@/lib/step-up-totp");
      await createStepUpChallenge(
        { userId, purpose: MCP_R3_PURPOSE, subjectId: op.operationId, summaryHash: argsDigest(tool.name, parsedArgs) },
        getDb(),
        op.token.split(".")[1],
      );
    }
    return {
      status: "PERLU_KONFIRMASI",
      dijalankan: false,
      operasiId: op.operationId,
      tool: tool.name,
      judul: tool.title,
      risiko: tool.risk,
      ringkasan,
      argumen: parsedArgs,
      konfirmasi: op.token,
      berlakuSampai: op.expiresAt.toISOString(),
      ...(needsTotp ? { butuhKode2fa: true } : {}),
      instruksi: needsTotp
        ? "BELUM dijalankan. Aksi KRITIS (R3): tampilkan ringkasan ini ke Owner, minta persetujuan eksplisit DAN minta Owner mengetik kode 6 angka dari aplikasi authenticator-nya. Bila Owner setuju, panggil tool yang sama dengan argumen yang SAMA persis ditambah `konfirmasi` di atas dan `kode2fa` (6 angka yang diketik Owner). Jangan pernah menebak atau mengarang kode. Berlaku 5 menit, sekali pakai. Jangan menyatakan aksi berhasil sebelum ada receipt."
        : "BELUM dijalankan. Tampilkan ringkasan ini ke Owner dan minta persetujuan eksplisit. Bila Owner setuju, panggil tool yang sama dengan argumen yang SAMA persis ditambah `konfirmasi` di atas (berlaku 5 menit, sekali pakai). Jangan menyatakan aksi berhasil sebelum ada receipt.",
    };
  }

  if (needsTotp) {
    // D-01a: kode 2FA diverifikasi SEBELUM token diklaim — kode salah tidak menghanguskan token.
    if (!totpCode || !/^\d{6}$/.test(totpCode)) {
      throw new AgentToolError(
        "KODE_2FA_WAJIB",
        "Aksi kritis (R3) butuh kode 2FA Owner: minta Owner mengetik 6 angka dari aplikasi authenticator, lalu kirim sebagai `kode2fa` bersama `konfirmasi`.",
        409,
      );
    }
    const { StepUpError, consumeStepUpChallenge } = await import("@/lib/step-up-totp");
    const [operationId, nonce] = token.split(".");
    try {
      await getDb().transaction((tx) =>
        consumeStepUpChallenge(tx, {
          nonce: nonce ?? "",
          userId,
          purpose: MCP_R3_PURPOSE,
          subjectId: operationId ?? "",
          summaryHash: argsDigest(tool.name, parsedArgs),
          code: totpCode,
        }),
      );
    } catch (error) {
      if (error instanceof StepUpError) {
        // STALE di sini = argumen berubah dari yang di-preview.
        const code = error.code === "STALE" ? "CONFIRMATION_ARGS_CHANGED" : error.code;
        throw new AgentToolError(code, error.message, error.status);
      }
      throw error;
    }
  }

  const claim = await claimOperation({ token, userId, tool: tool.name, parsedArgs });
  if (!claim.ok) throw new AgentToolError(claim.code, claim.message, 409);
  try {
    const hasil = await runAgentTool(input.session, input.name, parsedArgs, input.ctx);
    const executedAt = await completeOperation(claim.operationId, { ok: true, result: hasil });
    return {
      status: "BERHASIL",
      hasil,
      receipt: { operasiId: claim.operationId, tool: tool.name, risiko: tool.risk, dijalankan: executedAt.toISOString(), audit: "tercatat (sumber ChatGPT)" },
    };
  } catch (error) {
    await completeOperation(claim.operationId, { ok: false, error: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    throw error;
  }
}
