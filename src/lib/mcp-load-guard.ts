// Pelindung POS dari beban ChatGPT (blueprint V3 §13 & AC-08, ADR-002 sementara gateway masih
// satu proses dengan POS): batas panggilan tool bersamaan per Owner + batas waktu untuk tool BACA.
// Tool tulis tidak pernah dipotong waktunya — memotong tulis = hasil tidak pasti (EXECUTION_UNKNOWN).
import { AgentToolError } from "@/lib/agent-tool-core";

export const MCP_MAX_IN_FLIGHT = 4;
export const MCP_READ_TIMEOUT_MS = 25_000;

const inFlight = new Map<string, number>();

/** Jalankan `run` bila slot tersedia; selalu melepas slot (berhasil/gagal). */
export async function withConcurrencySlot<T>(key: string, run: () => Promise<T>, max = MCP_MAX_IN_FLIGHT): Promise<T> {
  const current = inFlight.get(key) ?? 0;
  if (current >= max) {
    throw new AgentToolError(
      "CONCURRENCY_LIMIT",
      `Terlalu banyak perintah ChatGPT berjalan bersamaan (maks. ${max}). Tunggu sebentar — kasir & POS diprioritaskan.`,
      429,
    );
  }
  inFlight.set(key, current + 1);
  try {
    return await run();
  } finally {
    const left = (inFlight.get(key) ?? 1) - 1;
    if (left <= 0) inFlight.delete(key);
    else inFlight.set(key, left);
  }
}

/** Batas waktu untuk tool baca saja. */
export async function withReadTimeout<T>(write: boolean, run: () => Promise<T>, ms = MCP_READ_TIMEOUT_MS): Promise<T> {
  if (write) return run();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new AgentToolError("EXECUTION_TIMEOUT", `Membaca data melewati ${Math.round(ms / 1000)} detik. Persempit rentang/tanggal lalu coba lagi.`, 504)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Untuk tes. */
export function inFlightCount(key: string) {
  return inFlight.get(key) ?? 0;
}
