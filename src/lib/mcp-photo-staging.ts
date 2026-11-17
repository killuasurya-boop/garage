// =============================================================================
// Foto dari ChatGPT (Owner, 17 Nov 2026) — tahap 1: ambil & simpan SEMENTARA.
//
// ChatGPT menyerahkan file yang diunggah Owner sebagai `download_url` bertanda
// tangan (Apps SDK `openai/fileParams`). Server Garage yang mengunduhnya, jadi
// ini titik rawan SSRF & file berbahaya. Pengaman:
// - hanya https + host OpenAI yang di-allowlist (GARAGE_MCP_PHOTO_HOSTS menambah);
//   redirect diikuti manual & tiap lompatan dicek ulang; tanpa kredensial/cookie;
// - batas ukuran (8 MB) dibaca sebagai stream, batas waktu 15 detik;
// - isi WAJIB bisa di-decode `sharp` sebagai JPG/PNG/WebP (bukan percaya
//   content-type), piksel dibatasi, lalu DI-ENCODE ULANG ke WebP → metadata/EXIF
//   dan muatan tersembunyi hilang;
// - hasil disimpan di folder sementara NON-publik, terikat ke user Owner,
//   kedaluwarsa 30 menit, maksimal 10 foto menunggu per Owner.
// URL unduhan tidak pernah disimpan atau dicatat (hanya host-nya).
// =============================================================================
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

export const PHOTO_MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const PHOTO_STAGE_TTL_MS = 30 * 60 * 1000;
export const PHOTO_MAX_STAGED_PER_USER = 10;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const MAX_STAGED_WIDTH = 2400;
const MAX_INPUT_PIXELS = 50_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

/** Host tempat ChatGPT menaruh file unggahan pengguna (akhiran domain). */
const DEFAULT_PHOTO_HOST_SUFFIXES = ["oaiusercontent.com", "openai.com", "chatgpt.com", "oaistatic.com"];

export class PhotoStagingError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export type StagedPhoto = {
  fotoId: string;
  userId: string;
  sha256: string;
  width: number;
  height: number;
  bytes: number;
  sourceHost: string;
  createdAt: string;
  expiresAt: string;
};

export function allowedPhotoHostSuffixes(env: string | undefined = process.env.GARAGE_MCP_PHOTO_HOSTS) {
  const extra = (env ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase().replace(/^\*?\./, ""))
    .filter((host) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host));
  return [...DEFAULT_PHOTO_HOST_SUFFIXES, ...extra];
}

/** Alasan URL sumber foto ditolak, atau null bila boleh. Murni — dites di mcp-photo-staging.test.ts. */
export function photoSourceBlockReason(rawUrl: string, suffixes: string[] = allowedPhotoHostSuffixes()): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "URL foto tidak valid.";
  }
  if (url.protocol !== "https:") return "Foto hanya diambil lewat https.";
  if (url.username || url.password) return "URL foto tidak boleh memuat kredensial.";
  if (url.port && url.port !== "443") return "URL foto tidak boleh memakai port khusus.";
  const host = url.hostname.toLowerCase();
  // Alamat IP (v4/v6) tidak pernah diterima: hanya nama host yang di-allowlist.
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return "URL foto harus nama host, bukan alamat IP.";
  if (!suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return "Foto hanya diterima dari file yang diunggah Owner di ChatGPT (host tidak dikenal).";
  }
  return null;
}

const FOTO_ID = /^[a-f0-9]{32}$/;
export const isFotoId = (value: unknown): value is string => typeof value === "string" && FOTO_ID.test(value);

function stagingDir() {
  // GARAGE_STORAGE_BASE_DIR hanya untuk tes; produksi = folder sementara OS (non-publik, hilang saat restart).
  const base = process.env.GARAGE_STORAGE_BASE_DIR ? path.join(process.env.GARAGE_STORAGE_BASE_DIR, "storage") : os.tmpdir();
  return path.join(base, "garage-mcp-photos");
}
const dataPath = (fotoId: string) => path.join(stagingDir(), `${fotoId}.webp`);
const metaPath = (fotoId: string) => path.join(stagingDir(), `${fotoId}.json`);

async function readMeta(fotoId: string): Promise<StagedPhoto | null> {
  try {
    return JSON.parse(await readFile(metaPath(fotoId), "utf8")) as StagedPhoto;
  } catch {
    return null;
  }
}

export async function discardStagedPhoto(fotoId: string) {
  if (!isFotoId(fotoId)) return;
  await Promise.all([rm(dataPath(fotoId), { force: true }), rm(metaPath(fotoId), { force: true })]);
}

/** Buang foto kedaluwarsa; kembalikan foto yang masih menunggu milik user ini. */
async function sweepAndList(userId: string, now = Date.now()) {
  let names: string[] = [];
  try {
    names = await readdir(stagingDir());
  } catch {
    return [];
  }
  const mine: StagedPhoto[] = [];
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    const fotoId = name.slice(0, -5);
    const meta = await readMeta(fotoId);
    if (!meta || Date.parse(meta.expiresAt) <= now) {
      await discardStagedPhoto(fotoId);
      continue;
    }
    if (meta.userId === userId) mine.push(meta);
  }
  // File .webp yatim (meta hilang) lebih tua dari TTL ikut dibuang.
  for (const name of names.filter((n) => n.endsWith(".webp"))) {
    const file = path.join(stagingDir(), name);
    const info = await stat(file).catch(() => null);
    if (info && now - info.mtimeMs > PHOTO_STAGE_TTL_MS) await rm(file, { force: true });
  }
  return mine;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function downloadLimited(rawUrl: string, fetcher: Fetcher, suffixes: string[]) {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const reason = photoSourceBlockReason(current, suffixes);
    if (reason) throw new PhotoStagingError("FOTO_SUMBER_DITOLAK", reason, 403);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetcher(current, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
        headers: { accept: "image/*" },
      });
      if (response.status >= 300 && response.status < 400) {
        const next = response.headers.get("location");
        if (!next) throw new PhotoStagingError("FOTO_GAGAL_DIAMBIL", "Sumber foto mengalihkan tanpa tujuan.", 502);
        current = new URL(next, current).toString();
        continue;
      }
      if (!response.ok) {
        throw new PhotoStagingError("FOTO_GAGAL_DIAMBIL", `Foto tidak bisa diambil dari ChatGPT (HTTP ${response.status}). Minta Owner mengunggah ulang.`, 502);
      }
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > PHOTO_MAX_INPUT_BYTES) throw new PhotoStagingError("FOTO_TERLALU_BESAR", "Ukuran foto maksimal 8 MB.", 413);
      if (!response.body) throw new PhotoStagingError("FOTO_GAGAL_DIAMBIL", "Foto kosong.", 502);
      const chunks: Buffer[] = [];
      let total = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > PHOTO_MAX_INPUT_BYTES) {
          await reader.cancel().catch(() => undefined);
          throw new PhotoStagingError("FOTO_TERLALU_BESAR", "Ukuran foto maksimal 8 MB.", 413);
        }
        chunks.push(Buffer.from(value));
      }
      if (total === 0) throw new PhotoStagingError("FOTO_GAGAL_DIAMBIL", "Foto kosong.", 502);
      return { buffer: Buffer.concat(chunks), host: new URL(current).hostname.toLowerCase() };
    } catch (error) {
      if (error instanceof PhotoStagingError) throw error;
      // Jangan teruskan teks error jaringan (bisa memuat URL bertanda tangan).
      throw new PhotoStagingError("FOTO_GAGAL_DIAMBIL", "Foto tidak bisa diambil dari ChatGPT (jaringan/waktu habis). Coba unggah ulang.", 502);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new PhotoStagingError("FOTO_GAGAL_DIAMBIL", "Sumber foto mengalihkan terlalu banyak kali.", 502);
}

/** Validasi isi sebagai gambar lalu encode ulang ke WebP (membuang metadata). */
export async function normalizePhoto(input: Buffer) {
  try {
    const probe = sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
    const info = await probe.metadata();
    if (!info.format || !ACCEPTED_FORMATS.has(info.format)) {
      throw new PhotoStagingError("FOTO_FORMAT_DITOLAK", "Format belum didukung. Gunakan JPG, PNG, atau WebP.");
    }
    if ((info.pages ?? 1) > 1) throw new PhotoStagingError("FOTO_FORMAT_DITOLAK", "Gambar beranimasi tidak didukung.");
    const result = await sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_STAGED_WIDTH, withoutEnlargement: true })
      .webp({ quality: 88, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { data: result.data, width: result.info.width ?? 0, height: result.info.height ?? 0 };
  } catch (error) {
    if (error instanceof PhotoStagingError) throw error;
    throw new PhotoStagingError("FOTO_TIDAK_VALID", "File bukan gambar yang valid (JPG/PNG/WebP) atau rusak.");
  }
}

export async function stagePhotoFromUrl(input: {
  userId: string;
  downloadUrl: string;
  fetcher?: Fetcher;
  hostSuffixes?: string[];
  now?: number;
}): Promise<StagedPhoto> {
  const now = input.now ?? Date.now();
  const waiting = await sweepAndList(input.userId, now);
  if (waiting.length >= PHOTO_MAX_STAGED_PER_USER) {
    throw new PhotoStagingError("FOTO_ANTRIAN_PENUH", `Masih ada ${waiting.length} foto yang belum dipasang. Pasang atau tunggu 30 menit sampai kedaluwarsa.`, 429);
  }
  const { buffer, host } = await downloadLimited(input.downloadUrl, input.fetcher ?? ((url, init) => fetch(url, init)), input.hostSuffixes ?? allowedPhotoHostSuffixes());
  const normalized = await normalizePhoto(buffer);
  const fotoId = randomBytes(16).toString("hex");
  const meta: StagedPhoto = {
    fotoId,
    userId: input.userId,
    sha256: createHash("sha256").update(normalized.data).digest("hex"),
    width: normalized.width,
    height: normalized.height,
    bytes: normalized.data.length,
    sourceHost: host,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PHOTO_STAGE_TTL_MS).toISOString(),
  };
  await mkdir(stagingDir(), { recursive: true, mode: 0o700 });
  await writeFile(dataPath(fotoId), normalized.data, { mode: 0o600 });
  await writeFile(metaPath(fotoId), JSON.stringify(meta), { mode: 0o600 });
  return meta;
}

/** Foto sementara milik user ini (null bila tidak ada, milik orang lain, atau kedaluwarsa). */
export async function loadStagedPhoto(fotoId: string, userId: string, now = Date.now()) {
  if (!isFotoId(fotoId)) return null;
  const meta = await readMeta(fotoId);
  if (!meta || meta.userId !== userId) return null;
  if (Date.parse(meta.expiresAt) <= now) {
    await discardStagedPhoto(fotoId);
    return null;
  }
  try {
    const data = await readFile(dataPath(fotoId));
    // Isi berubah di disk = jangan dipakai.
    if (createHash("sha256").update(data).digest("hex") !== meta.sha256) return null;
    return { meta, data };
  } catch {
    return null;
  }
}
