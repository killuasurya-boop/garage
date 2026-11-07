import { describe, expect, it } from "vitest";

import { idempotencyAttemptFor } from "@/lib/idempotency-client";

function keyFactory() {
  let n = 0;
  return () => `key-${++n}`;
}

describe("idempotencyAttemptFor", () => {
  const body = { paymentMethod: "Cash", cashReceived: 50_000, items: [{ itemId: "kopi", qty: 1 }] };

  it("percobaan pertama membuat key baru", () => {
    const attempt = idempotencyAttemptFor(null, body, keyFactory());
    expect(attempt.key).toBe("key-1");
  });

  it("retry dengan isi sama memakai key yang sama (server kembalikan order yang sudah ada)", () => {
    const make = keyFactory();
    const first = idempotencyAttemptFor(null, body, make);
    const retry = idempotencyAttemptFor(first, { ...body, items: [{ itemId: "kopi", qty: 1 }] }, make);
    expect(retry.key).toBe(first.key);
  });

  it("isi berubah (qty/metode bayar) membuat key baru", () => {
    const make = keyFactory();
    const first = idempotencyAttemptFor(null, body, make);
    const changedQty = idempotencyAttemptFor(first, { ...body, items: [{ itemId: "kopi", qty: 2 }] }, make);
    expect(changedQty.key).not.toBe(first.key);
    const changedMethod = idempotencyAttemptFor(changedQty, { ...body, paymentMethod: "QRIS" }, make);
    expect(changedMethod.key).not.toBe(changedQty.key);
  });
});

import { isUncertainSubmitError, markAttemptAfterError } from "@/lib/idempotency-client";

describe("GOD++ F-03 — submit tidak pasti tidak boleh membuat order dobel", () => {
  const body = { paymentMethod: "Cash", cashReceived: 50_000, items: [{ itemId: "kopi", qty: 1 }] };

  it("error jaringan/timeout/5xx/409 = tidak pasti; 400 validasi = pasti", () => {
    expect(isUncertainSubmitError({ status: 0 })).toBe(true);
    expect(isUncertainSubmitError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isUncertainSubmitError({ status: 500 })).toBe(true);
    expect(isUncertainSubmitError({ status: 502 })).toBe(true);
    expect(isUncertainSubmitError({ status: 409 })).toBe(true);
    expect(isUncertainSubmitError({ status: 400 })).toBe(false);
    expect(isUncertainSubmitError({ status: 403 })).toBe(false);
  });

  it("setelah gagal tidak pasti, ganti metode/nominal tetap memakai key yang sama", () => {
    const make = keyFactory();
    const first = idempotencyAttemptFor(null, body, make);
    const failed = markAttemptAfterError(first, { status: 0 });
    const switched = idempotencyAttemptFor(failed, { ...body, paymentMethod: "QRIS", cashReceived: undefined }, make);
    expect(switched.key).toBe(first.key);
  });

  it("setelah gagal pasti (400), isi berubah = key baru (order belum tersimpan)", () => {
    const make = keyFactory();
    const first = idempotencyAttemptFor(null, body, make);
    const failed = markAttemptAfterError(first, { status: 400 });
    expect(idempotencyAttemptFor(failed, { ...body, cashReceived: 60_000 }, make).key).not.toBe(first.key);
  });

  it("pesanan lain (item berubah) tidak mewarisi key tidak pasti", () => {
    const make = keyFactory();
    const first = idempotencyAttemptFor(null, body, make);
    const failed = markAttemptAfterError(first, { status: 0 });
    expect(idempotencyAttemptFor(failed, { ...body, items: [{ itemId: "teh", qty: 2 }] }, make).key).not.toBe(first.key);
  });
});
