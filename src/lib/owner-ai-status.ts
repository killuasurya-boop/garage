// =============================================================================
// Status Owner AI Connect — fungsi MURNI (blueprint V3 §3.2): tiap dimensi berdiri
// sendiri, tidak digabung jadi satu "hijau". VERIFIED hanya dari bukti verifikasi
// end-to-end yang masih dalam TTL kebijakan, bukan dari koneksi yang "hidup".
// Aman diimpor di client (tanpa DB).
// =============================================================================

/** TTL kebijakan bukti verifikasi (bukan masa hidup token). */
export const AI_VERIFY_TTL_MS = 24 * 60 * 60_000;
/** Operasi terkonfirmasi tanpa hasil selama ini = sedang berjalan; lebih lama = UNKNOWN. */
const RUNNING_WINDOW_MS = 2 * 60_000;
const RECENT_FAILURE_MS = 24 * 60 * 60_000;

export type GatewayState = "ONLINE" | "PAUSED" | "OFFLINE";
export type IdentityState = "VERIFIED" | "NEEDS_2FA" | "UNKNOWN";
export type LinkState = "VERIFIED" | "NEEDS_REVERIFY" | "NEVER_VERIFIED" | "REVOKED";
export type ToolAccessState = "READ_WRITE" | "READ_ONLY" | "BLOCKED" | "UNKNOWN";
export type ExecutionState = "IDLE" | "RUNNING" | "FAILED";
export type ChipState = "AI_VERIFIED" | "AI_STANDBY" | "AI_RUNNING" | "AI_ERROR" | "AI_NOT_SETUP";

export type ConnectionFacts = {
  id: string;
  clientName: string | null;
  oauthClientId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastReadOkAt: Date | null;
  lastWriteOkAt: Date | null;
  lastVerifiedAt: Date | null;
  revokedAt: Date | null;
};

export type StatusFacts = {
  now: Date;
  gatewayConfigured: boolean;
  gatewayReason: string | null;
  paused: boolean;
  writeEnabled: boolean;
  ownerTwoFactor: boolean;
  connections: ConnectionFacts[];
  /** Operasi MCP terakhir (konfirmasi R2/R3). */
  lastOperation: { status: string; at: Date; tool: string } | null;
};

export type DimensionStatus<S extends string> = { state: S; detail: string };

export type AiStatus = {
  gateway: DimensionStatus<GatewayState>;
  identity: DimensionStatus<IdentityState>;
  link: DimensionStatus<LinkState> & { lastVerifiedAt: string | null; reverifyDueAt: string | null };
  toolAccess: DimensionStatus<ToolAccessState>;
  execution: DimensionStatus<ExecutionState>;
  chip: { state: ChipState; label: string };
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const latest = (dates: (Date | null)[]) =>
  dates.reduce<Date | null>((max, d) => (d && (!max || d > max) ? d : max), null);

export function computeAiStatus(facts: StatusFacts): AiStatus {
  const now = facts.now.getTime();
  const active = facts.connections.filter((c) => !c.revokedAt);

  const gateway: AiStatus["gateway"] = !facts.gatewayConfigured
    ? { state: "OFFLINE", detail: facts.gatewayReason ?? "MCP ChatGPT belum diaktifkan di server." }
    : facts.paused
      ? { state: "PAUSED", detail: "Dijeda Owner — semua panggilan ChatGPT ditolak sampai dilanjutkan." }
      : { state: "ONLINE", detail: "Server MCP aktif dan meminta OAuth (Owner + 2FA)." };

  const identity: AiStatus["identity"] = facts.ownerTwoFactor
    ? { state: "VERIFIED", detail: "Akun Owner ber-2FA — syarat masuk ChatGPT terpenuhi." }
    : { state: "NEEDS_2FA", detail: "Aktifkan 2FA akun Owner; tanpa itu ChatGPT ditolak." };

  const lastVerified = latest(active.map((c) => c.lastVerifiedAt));
  const reverifyDue = lastVerified ? new Date(lastVerified.getTime() + AI_VERIFY_TTL_MS) : null;
  const link: AiStatus["link"] =
    !active.length && facts.connections.length
      ? { state: "REVOKED", detail: "Semua koneksi ChatGPT sudah dicabut.", lastVerifiedAt: null, reverifyDueAt: null }
      : !lastVerified
        ? {
            state: "NEVER_VERIFIED",
            detail: active.length
              ? "ChatGPT sudah tersambung lewat OAuth, tetapi belum membuktikan dengan kode verifikasi."
              : "Belum ada ChatGPT yang tersambung.",
            lastVerifiedAt: null,
            reverifyDueAt: null,
          }
        : now - lastVerified.getTime() <= AI_VERIFY_TTL_MS
          ? { state: "VERIFIED", detail: "Terbukti lewat panggilan garage_verify_connection dari ChatGPT.", lastVerifiedAt: iso(lastVerified), reverifyDueAt: iso(reverifyDue) }
          : { state: "NEEDS_REVERIFY", detail: "Bukti verifikasi sudah lewat 24 jam — verifikasi ulang.", lastVerifiedAt: iso(lastVerified), reverifyDueAt: iso(reverifyDue) };

  const lastWrite = latest(active.map((c) => c.lastWriteOkAt));
  const lastRead = latest(active.map((c) => c.lastReadOkAt));
  const toolAccess: AiStatus["toolAccess"] =
    gateway.state !== "ONLINE" || identity.state !== "VERIFIED"
      ? { state: "BLOCKED", detail: gateway.state !== "ONLINE" ? gateway.detail : identity.detail }
      : !facts.writeEnabled
        ? { state: "READ_ONLY", detail: "Saklar Owner: ChatGPT hanya boleh membaca." }
        : lastWrite
          ? { state: "READ_WRITE", detail: `Tulis terbukti berhasil dari ChatGPT (${lastWrite.toISOString()}).` }
          : {
              state: "UNKNOWN",
              detail: lastRead
                ? "Baca terbukti; tulis belum pernah berhasil dari ChatGPT (bisa karena paket ChatGPT atau belum dicoba)."
                : "Belum ada panggilan tool yang berhasil.",
            };

  const op = facts.lastOperation;
  const execution: AiStatus["execution"] =
    op && op.status === "confirmed" && now - op.at.getTime() <= RUNNING_WINDOW_MS
      ? { state: "RUNNING", detail: `Menjalankan ${op.tool}…` }
      : op && (op.status === "failed" || op.status === "confirmed") && now - op.at.getTime() <= RECENT_FAILURE_MS
        ? { state: "FAILED", detail: `${op.tool}: ${op.status === "failed" ? "gagal" : "hasil tidak diketahui (cek status operasi)"}.` }
        : { state: "IDLE", detail: op ? `Terakhir: ${op.tool} (${op.status}).` : "Belum ada operasi ubah dari ChatGPT." };

  // Prioritas chip: error > berjalan > verified > standby > belum setup (§3.2). Merah hanya untuk
  // masalah koneksi/identitas; operasi gagal/ditolak kebijakan tampil di dimensi Eksekusi
  // (bukan alarm 24 jam karena satu permintaan AI ditolak aturan).
  const chip: AiStatus["chip"] =
    !facts.gatewayConfigured && !facts.connections.length
      ? { state: "AI_NOT_SETUP", label: "AI NOT SETUP" }
      : gateway.state === "OFFLINE" || identity.state !== "VERIFIED"
        ? { state: "AI_ERROR", label: "AI ERROR" }
        : execution.state === "RUNNING"
          ? { state: "AI_RUNNING", label: "AI RUNNING" }
          : link.state === "VERIFIED" && gateway.state === "ONLINE"
            ? { state: "AI_VERIFIED", label: "AI VERIFIED" }
            : !facts.connections.length
              ? { state: "AI_NOT_SETUP", label: "AI NOT SETUP" }
              : { state: "AI_STANDBY", label: "AI STANDBY" };

  return { gateway, identity, link, toolAccess, execution, chip };
}
