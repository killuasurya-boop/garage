// Unduh file laporan dari API (klien). Berhasil hanya bila server benar-benar
// mengirim file; pesan error API ({ error: { message } }) diteruskan apa adanya.
export async function downloadReportFile(url: string, fallbackName: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(json?.error?.message ?? `Gagal membuat laporan (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("File laporan kosong. Coba lagi.");
  const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  saveBlob(blob, filename);
  return { filename, size: blob.size };
}

export function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 2_000);
}

export function fileSizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
