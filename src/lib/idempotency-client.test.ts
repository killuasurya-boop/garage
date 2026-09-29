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
