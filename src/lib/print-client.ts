// Jalur cetak struk sisi-klien untuk deployment VPS.
//
// Saat app dijalankan di VPS (Linux, di datacenter), server TIDAK bisa menyentuh
// printer fisik di warung. Jadi konten struk dibentuk di browser kasir lalu
// dikirim ke "agen cetak lokal" (scripts/thermal-print-server.js) yang berjalan
// di PC kasir — mesin yang sama yang colok printer USB.
//
// Catatan keamanan browser: halaman HTTPS BOLEH memanggil http://localhost
// (localhost dianggap secure context), tapi http://192.168.x.x diblokir
// mixed-content. Karena itu agen WAJIB di PC yang sama dengan browser kasir.
//
// Fungsi ini mengembalikan `Response` agar jadi pengganti drop-in untuk
// `fetch("/api/print/thermal", ...)` di seluruh pemanggil lama.

import { buildThermalContent, type ThermalReceiptInput } from "@/lib/thermal-receipt";

export interface PrintThermalPayload {
  receipt: ThermalReceiptInput;
  printerName?: string;
  copies?: number | null;
}

function agentBaseUrl() {
  // Override per-device lewat env build-time bila agen pakai port lain.
  return (
    process.env.NEXT_PUBLIC_PRINT_AGENT_URL?.replace(/\/$/, "") ||
    "http://localhost:9100"
  );
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const AGENT_DOWN_ERROR = {
  error: {
    code: "PRINT_AGENT_OFFLINE",
    message: "Agen cetak lokal tidak berjalan",
    title: "Agen cetak lokal tidak berjalan",
    hint:
      "Aplikasi tidak bisa menemukan program pencetak di komputer kasir ini. " +
      "Struk dibentuk di browser dan butuh agen lokal untuk dikirim ke printer.",
    actions: [
      "Pastikan 'Garage Print Agent' berjalan di komputer kasir (cek ikon/jendela hitam)",
      "Jalankan ulang: npm run print:server (atau shortcut start agen)",
      "Pastikan printer RPP02N menyala dan kertas terpasang",
      "Setelah agen jalan, klik Cetak lagi",
    ],
    detail: "",
  },
};

/**
 * Drop-in pengganti fetch("/api/print/thermal"). Membentuk konten di browser,
 * mengirim ke agen cetak lokal. Bila agen tak terjangkau, fallback ke route
 * server (berguna di dev saat server == PC warung). Selalu resolve dengan
 * Response — pemanggil cukup baca res.ok / res.json() seperti biasa.
 */
export async function printThermal(payload: PrintThermalPayload): Promise<Response> {
  const content = buildThermalContent(payload.receipt);
  const copies = payload.copies ?? 1;

  // 1) Coba agen cetak lokal di PC kasir.
  try {
    const res = await fetch(`${agentBaseUrl()}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        copies,
        printerName: payload.printerName,
      }),
    });

    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { printer?: string };
      return jsonResponse(
        { success: true, printer: data.printer ?? "local-agent", method: "local-agent" },
        200,
      );
    }

    // Agen menjawab tapi gagal cetak (printer mati/kertas habis, dll.).
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return jsonResponse(
      {
        error: {
          code: "PRINT_FAILED",
          message: data.error || "Gagal mencetak struk",
          title: "Gagal mencetak struk",
          hint: "Agen cetak menerima perintah tapi printer gagal merespon.",
          actions: [
            "Pastikan printer RPP02N menyala (lampu indikator hidup)",
            "Cek kertas masih ada dan tidak tersangkut",
            "Coba cetak lagi",
          ],
          detail: data.error || "",
        },
      },
      502,
    );
  } catch {
    // 2) Agen tak terjangkau → fallback ke route server (dev / server lokal).
    try {
      const res = await fetch("/api/print/thermal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      // Lewatkan apa adanya dari server (sudah punya bentuk error yang sama).
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      // 3) Dua-duanya gagal → agen offline.
      return jsonResponse(AGENT_DOWN_ERROR, 503);
    }
  }
}
