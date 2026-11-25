import { describe, expect, it, vi } from "vitest";

import { GarageApiError } from "@/lib/api-client";
import { isInternalErrorMessage, serviceErrorResponse } from "@/lib/api-response";
import { idempotencyAttemptFor, markAttemptAfterError, submitErrorMessage, UNCERTAIN_SUBMIT_MESSAGE } from "@/lib/idempotency-client";
import { isKnownPaymentMethod } from "@/lib/payment-method-input";

// POS Fase 1 (audit 24 Nov 2026): S8 pesan error aman, S9 metode bayar, K6/K8 kunci tetap saat isi beda.

async function body(response: Response) {
  return { status: response.status, json: (await response.json()) as { error: { code: string; message: string } } };
}

describe("serviceErrorResponse (S8)", () => {
  it("pesan aturan bisnis diteruskan sebagai 400", async () => {
    const { status, json } = await body(serviceErrorResponse(new Error("Uang diterima kurang dari total tagihan."), "X_FAILED", "Gagal."));
    expect(status).toBe(400);
    expect(json.error).toEqual({ code: "X_FAILED", message: "Uang diterima kurang dari total tagihan." });
  });

  it("pesan SQL/DB tidak bocor: 500 + pesan umum", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const message of [
      'duplicate key value violates unique constraint "orders_client_request_key_idx"',
      'insert into "payments" ("id") values ($1) failed',
      "connect ECONNREFUSED 127.0.0.1:5432",
    ]) {
      const { status, json } = await body(serviceErrorResponse(new Error(message), "X_FAILED", "Gagal, coba lagi."));
      expect(status).toBe(500);
      expect(json.error.message).toBe("Gagal, coba lagi.");
      expect(JSON.stringify(json)).not.toMatch(/constraint|payments|ECONN/);
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("kode domain: IDEMPOTENCY_MISMATCH = 409, kode lain 400", async () => {
    const mismatch = Object.assign(new Error("Transaksi sebelumnya dengan isi berbeda sudah tersimpan."), { code: "IDEMPOTENCY_MISMATCH" });
    expect((await body(serviceErrorResponse(mismatch, "X", "y"))).status).toBe(409);
    const other = Object.assign(new Error("Meja sedang dipakai."), { code: "TABLE_TAKEN" });
    const res = await body(serviceErrorResponse(other, "X", "y"));
    expect(res).toEqual({ status: 400, json: { error: { code: "TABLE_TAKEN", message: "Meja sedang dipakai." } } });
    expect(isInternalErrorMessage("")).toBe(true);
  });
});

describe("metode bayar (S9)", () => {
  it("hanya metode yang dikenal", () => {
    for (const ok of ["Cash", "tunai", "QRIS", "Bank Transfer", "Transfer", "E-Wallet"]) expect(isKnownPaymentMethod(ok)).toBe(true);
    for (const bad of ["Cashless", "cash back", "QRIS2", ""]) expect(isKnownPaymentMethod(bad)).toBe(false);
  });
});

describe("submitErrorMessage (K6/K8)", () => {
  it("isi berbeda: pesan server tampil dan kunci lama tetap dipakai", () => {
    const mismatch = new GarageApiError("Transaksi sebelumnya dengan isi berbeda (item/metode) sudah tersimpan.", {
      code: "IDEMPOTENCY_MISMATCH",
      status: 409,
    });
    expect(submitErrorMessage(mismatch, "Gagal.")).toMatch(/isi berbeda/);
    const first = idempotencyAttemptFor(null, { items: [1], paymentMethod: "Cash" }, () => "key-1");
    const marked = markAttemptAfterError(first, mismatch);
    const retry = idempotencyAttemptFor(marked, { items: [1], paymentMethod: "QRIS" }, () => "key-2");
    expect(retry.key).toBe("key-1");
  });

  it("jaringan putus = pesan belum pasti; validasi = pesan server", () => {
    expect(submitErrorMessage(new GarageApiError("x", { code: "NETWORK_ERROR", status: 0 }), "Gagal.")).toBe(UNCERTAIN_SUBMIT_MESSAGE);
    expect(submitErrorMessage(new GarageApiError("Meja wajib dipilih.", { status: 400 }), "Gagal.")).toBe("Meja wajib dipilih.");
  });
});
