import { describe, expect, it } from "vitest";

import { formToArgs, parseIdNumber } from "@/components/ceo/ai/SchemaForm";

describe("parseIdNumber", () => {
  it("ribuan & desimal gaya Indonesia, tanpa salah baca 2.5 → 25", () => {
    expect(parseIdNumber("20.000")).toBe(20_000);
    expect(parseIdNumber("1.250.000")).toBe(1_250_000);
    expect(parseIdNumber("2,5")).toBe(2.5);
    expect(parseIdNumber("2.5")).toBe(2.5);
    expect(parseIdNumber("12500")).toBe(12_500);
    expect(parseIdNumber("Rp 5")).toBeNaN();
    expect(parseIdNumber("1.2.3")).toBeNaN();
  });
});

describe("formToArgs", () => {
  const schema = {
    properties: {
      hargaBaru: { type: "integer" },
      alasan: { type: "string" },
      catatan: { type: "string" },
      aktif: { type: "boolean" },
      body: { type: "object" },
    },
    required: ["hargaBaru", "alasan"],
  };
  it("kosong opsional tidak dikirim; integer dibulatkan; JSON di-parse", () => {
    expect(formToArgs(schema, { hargaBaru: "20.000", alasan: " naik ", catatan: "", body: '{"a":1}' })).toEqual({
      hargaBaru: 20_000,
      alasan: "naik",
      body: { a: 1 },
    });
  });
  it("angka/JSON tidak valid → pesan jelas", () => {
    expect(() => formToArgs(schema, { hargaBaru: "dua puluh", alasan: "x" })).toThrow(/harus angka/);
    expect(() => formToArgs(schema, { hargaBaru: "1", alasan: "x", body: "{a:" })).toThrow(/JSON tidak valid/);
  });
});
