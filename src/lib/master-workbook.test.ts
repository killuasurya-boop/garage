import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readXlsxSheets } from "@/lib/master-workbook";

function zip(content: Buffer, declaredSize = content.length) {
  const name = Buffer.from("xl/workbook.xml");
  const raw = deflateRawSync(content);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(8, 8); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(raw.length, 20); central.writeUInt32LE(declaredSize, 24); central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + raw.length, 16);
  return Buffer.concat([local, name, raw, central, name, end]);
}
describe("Bounded master workbook decoding", () => {
  it("reads a bounded ZIP", () => expect(readXlsxSheets(zip(Buffer.from("<workbook/>"))).size).toBe(0));
  it("rejects a declared oversized entry before decompression", () => {
    expect(() => readXlsxSheets(zip(Buffer.from("small"), 17 * 1024 * 1024))).toThrow(/batas ukuran/);
  });
  it("bounds actual inflation even if the directory lies about size", () => {
    expect(() => readXlsxSheets(zip(Buffer.alloc(1024 * 1024, 65), 10))).toThrow(/batas ukuran/);
  });
  it("validates ZIP offsets rather than attempting out-of-bounds reads", () => {
    const bad = zip(Buffer.from("test")); bad.writeUInt32LE(0xfffffff0, bad.length - 6);
    expect(() => readXlsxSheets(bad)).toThrow(/Struktur ZIP/);
  });
});
