// Setelah deploy, tab yang masih terbuka memegang JS versi lama; file chunk lama sudah
// tidak ada di server → "ChunkLoadError" saat pindah modul, halaman rusak & pengguna
// terpaksa login ulang. Solusi: muat ulang halaman SEKALI untuk mengambil versi baru.
// Jeda minimal mencegah reload berulang bila chunk memang rusak.

export const CHUNK_RELOAD_KEY = "garage:chunk-reload-at";
export const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR = /ChunkLoadError|Loading chunk [\w./-]+ failed|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isChunkLoadError(error: { name?: string | null; message?: string | null } | null | undefined) {
  if (!error) return false;
  return CHUNK_ERROR.test(`${error.name ?? ""} ${error.message ?? ""}`);
}

/** true = boleh reload sekarang (belum pernah, atau reload terakhir sudah lewat jeda). */
export function shouldReloadForChunk(lastReloadAt: number | null, now: number) {
  return lastReloadAt === null || !Number.isFinite(lastReloadAt) || now - lastReloadAt > CHUNK_RELOAD_COOLDOWN_MS;
}
