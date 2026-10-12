"use client";

/**
 * Catat & cek batas cetak ulang struk SEBELUM mengirim ke printer
 * (maks. 3x per order untuk kasir; Manajer/Owner boleh lebih, tetap diaudit).
 */
export async function claimReprint(orderRef: string): Promise<{ ok: true; remaining: number } | { ok: false; message: string }> {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderRef)}/log-reprint`, {
      method: "POST",
      credentials: "same-origin",
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: { remaining?: number };
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, message: body.error?.message ?? "Cetak ulang tidak diizinkan." };
    }
    return { ok: true, remaining: body.data?.remaining ?? 0 };
  } catch {
    return { ok: false, message: "Koneksi gagal. Coba lagi." };
  }
}
