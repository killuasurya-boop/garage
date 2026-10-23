import { inflateRawSync } from "node:zlib";

// =============================================================================
// Pembaca workbook master Garage Coffee (.xlsx) tanpa dependensi tambahan:
// (tag XML boleh ber-prefix namespace, mis. <x:sheet> dari workbook ekspor .NET)
// unzip (zlib bawaan Node) + XML sederhana. Kolom dibaca berdasarkan JUDUL
// kolom di baris header, bukan huruf kolom, sehingga versi workbook yang
// menggeser kolom tetap terbaca. Hanya nilai sel (hasil rumus) yang dibaca.
// =============================================================================

export type SheetRow = { row: number; cells: Record<string, string> };

const MAX_ZIP_ENTRIES = 512;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;

function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const invalid = () => new Error("Struktur ZIP .xlsx tidak valid atau melebihi batas ukuran.");
  const range = (offset: number, size: number) => {
    if (offset < 0 || size < 0 || offset + size > buf.length) throw invalid();
  };
  if (buf.length > 10 * 1024 * 1024) throw invalid();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw invalid();
  const count = buf.readUInt16LE(eocd + 10);
  const directorySize = buf.readUInt32LE(eocd + 12);
  let ptr = buf.readUInt32LE(eocd + 16);
  const directoryEnd = ptr + directorySize;
  if (count > MAX_ZIP_ENTRIES || directoryEnd > eocd ||
    buf.readUInt16LE(eocd + 4) !== 0 || buf.readUInt16LE(eocd + 6) !== 0 ||
    buf.readUInt16LE(eocd + 8) !== count) throw invalid();
  let total = 0;
  for (let n = 0; n < count; n++) {
    range(ptr, 46);
    if (ptr + 46 > directoryEnd || buf.readUInt32LE(ptr) !== 0x02014b50) throw invalid();
    const flags = buf.readUInt16LE(ptr + 8);
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const expandedSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const next = ptr + 46 + nameLen + extraLen + commentLen;
    if (next > directoryEnd || flags & 1 || ![0, 8].includes(method) ||
      expandedSize > MAX_ENTRY_BYTES || total + expandedSize > MAX_EXPANDED_BYTES) throw invalid();
    range(ptr + 46, nameLen + extraLen + commentLen);
    const name = buf.toString("utf8", ptr + 46, ptr + 46 + nameLen);
    range(localOffset, 30);
    if (buf.readUInt32LE(localOffset) !== 0x04034b50 || buf.readUInt16LE(localOffset + 8) !== method) throw invalid();
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    range(start, compSize);
    if (start + compSize > buf.readUInt32LE(eocd + 16) || entries.has(name)) throw invalid();
    const raw = buf.subarray(start, start + compSize);
    let content: Buffer;
    try {
      content = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, {
        maxOutputLength: Math.max(1, Math.min(MAX_ENTRY_BYTES, MAX_EXPANDED_BYTES - total, expandedSize)),
      });
    } catch { throw invalid(); }
    if (content.length !== expandedSize) throw invalid();
    total += content.length;
    entries.set(name, content);
    ptr = next;
  }
  if (ptr !== directoryEnd) throw invalid();
  return entries;
}

function decodeXml(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = decodeXml(m[2]);
  return out;
}

function textOf(xml: string) {
  return [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decodeXml(m[1])).join("");
}

/** Semua sheet sebagai baris berisi nilai sel (string) per huruf kolom. */
export function readXlsxSheets(buf: Buffer): Map<string, SheetRow[]> {
  const files = readZipEntries(buf);
  const text = (name: string) => files.get(name)?.toString("utf8") ?? "";
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textOf(m[1]));
  const rels = new Map<string, string>();
  for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.Id && a.Target) rels.set(a.Id, a.Target.replace(/^\/?(xl\/)?/, "xl/"));
  }
  const sheets = new Map<string, SheetRow[]>();
  for (const m of text("xl/workbook.xml").matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    const target = rels.get(a["r:id"] ?? "");
    if (!a.name || !target) continue;
    const rows: SheetRow[] = [];
    for (const rowMatch of text(target).matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const rowNo = Number(attrs(rowMatch[1]).r);
      const cells: Record<string, string> = {};
      for (const c of rowMatch[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const ca = attrs(c[1]);
        const col = (ca.r ?? "").replace(/\d+/g, "");
        const body = c[2] ?? "";
        const v = body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1];
        let value: string | undefined;
        if (ca.t === "s" && v !== undefined) value = shared[Number(v)];
        else if (ca.t === "inlineStr") value = textOf(body);
        else if (v !== undefined) value = decodeXml(v);
        if (col && value !== undefined && value !== "") cells[col] = value.trim();
      }
      rows.push({ row: rowNo, cells });
    }
    sheets.set(a.name, rows);
  }
  return sheets;
}

/** Baris data di bawah header yang kolom pertamanya = `firstHeader`; kunci = judul kolom. */
export function sheetRecords(rows: SheetRow[] | undefined, firstHeader: string) {
  if (!rows) return [];
  const headerIdx = rows.findIndex((r) => Object.values(r.cells)[0]?.toLowerCase() === firstHeader.toLowerCase());
  if (headerIdx < 0) return [];
  const header = rows[headerIdx].cells;
  const out: Array<{ row: number; get: (title: string) => string }> = [];
  for (const r of rows.slice(headerIdx + 1)) {
    if (Object.keys(r.cells).length === 0) continue;
    const byTitle = new Map<string, string>();
    for (const [col, title] of Object.entries(header)) byTitle.set(title.toLowerCase(), r.cells[col] ?? "");
    out.push({
      row: r.row,
      get: (title: string) => {
        const exact = byTitle.get(title.toLowerCase());
        if (exact !== undefined) return exact;
        for (const [key, value] of byTitle) if (key.startsWith(title.toLowerCase())) return value;
        return "";
      },
    });
  }
  return out;
}
