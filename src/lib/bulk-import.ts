// Parser impor massal (CSV / XLSX) bersama: baca sheet pertama / CSV, petakan
// header ke kolom kanonik lewat alias, kembalikan baris sebagai teks + nomor
// baris asli (untuk pesan error per baris). Validasi isi dilakukan per modul.

export type ImportColumn = {
  key: string;
  label: string;
  /** Nama header lain yang diterima (huruf kecil, tanpa spasi berlebih). */
  aliases: string[];
  required?: boolean;
};

export type ImportRowAction = "create" | "update" | "unchanged" | "error";
export type ImportRowResult = {
  row: number;
  key: string;
  name: string;
  action: ImportRowAction;
  message?: string;
  changes?: string[];
};

export type ParsedSheet = {
  /** key kanonik → nama header asli di file. */
  mapping: Record<string, string>;
  /** Header file yang tidak dikenali (diabaikan). */
  ignored: string[];
  missingRequired: string[];
  rows: Array<{ rowNo: number; values: Record<string, string> }>;
};

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function normalizeHeader(value: string) {
  return value
    .replace(/^﻿/, "")
    .trim()
    .toLowerCase()
    .replace(/[*()]/g, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

/** Parser CSV (RFC 4180): kutip ganda, koma/titik koma (deteksi otomatis), BOM, CRLF. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }> };
    if (v.result !== undefined) return cellToText(v.result);
    if (Array.isArray(v.richText)) return v.richText.map((part) => part.text).join("");
    if (v.text !== undefined) return String(v.text);
  }
  return String(value);
}

async function readGrid(buffer: Buffer, filename: string): Promise<string[][]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    return parseCsv(buffer.toString("utf8"));
  }
  if (!lower.endsWith(".xlsx")) {
    throw new Error("Format file harus .xlsx atau .csv.");
  }
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    throw new Error("File Excel rusak atau bukan .xlsx yang valid.");
  }
  const sheet = workbook.worksheets.find((ws) => ws.state !== "hidden" && ws.rowCount > 0) ?? workbook.worksheets[0];
  if (!sheet) throw new Error("File Excel tidak punya sheet.");
  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNo) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellToText(cell.value);
    });
    grid[rowNo - 1] = Array.from(cells, (c) => c ?? "");
  });
  return Array.from(grid, (r) => r ?? []);
}

/** Baca file & petakan header. Baris yang semua selnya kosong dilewati. */
export async function parseImportFile(buffer: Buffer, filename: string, columns: ImportColumn[]): Promise<ParsedSheet> {
  if (buffer.length === 0) throw new Error("File kosong.");
  if (buffer.length > MAX_IMPORT_BYTES) throw new Error("Ukuran file maksimal 5 MB.");
  const grid = await readGrid(buffer, filename);
  const headerIndex = grid.findIndex((row) => row.some((cell) => cell.trim() !== ""));
  if (headerIndex < 0) throw new Error("File tidak berisi data.");
  const header = grid[headerIndex];

  const mapping: Record<string, string> = {};
  const colIndex: Record<string, number> = {};
  const ignored: string[] = [];
  header.forEach((raw, index) => {
    const name = normalizeHeader(raw);
    if (!name) return;
    const column = columns.find((c) => normalizeHeader(c.label) === name || c.aliases.includes(name));
    if (column && colIndex[column.key] === undefined) {
      mapping[column.key] = raw.trim();
      colIndex[column.key] = index;
    } else {
      ignored.push(raw.trim());
    }
  });
  const missingRequired = columns.filter((c) => c.required && colIndex[c.key] === undefined).map((c) => c.label);

  const rows: ParsedSheet["rows"] = [];
  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const cells = grid[i] ?? [];
    if (!cells.some((cell) => String(cell ?? "").trim() !== "")) continue;
    const values: Record<string, string> = {};
    for (const [key, index] of Object.entries(colIndex)) values[key] = String(cells[index] ?? "").trim();
    rows.push({ rowNo: i + 1, values });
  }
  if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Maksimal ${MAX_IMPORT_ROWS} baris per impor (file berisi ${rows.length}).`);
  return { mapping, ignored, missingRequired, rows };
}

/**
 * Angka gaya Indonesia/Excel: "22000", "22.000", "Rp 22.000", "0,12", "1.234,5",
 * "1,234.5". Kosong → null. Tidak valid → NaN (pemanggil menolak barisnya).
 */
export function parseLocaleNumber(raw: string): number | null {
  const text = raw.replace(/rp/gi, "").replace(/\s/g, "");
  if (!text) return null;
  if (!/^-?[\d.,]+$/.test(text)) return Number.NaN;
  const lastDot = text.lastIndexOf(".");
  const lastComma = text.lastIndexOf(",");
  let normalized = text;
  if (lastDot >= 0 && lastComma >= 0) {
    // Pemisah yang muncul terakhir = desimal.
    normalized = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // "22,000" (ribuan) vs "0,12" (desimal): 3 digit setelah koma tunggal & >1 grup = ribuan.
    const groups = text.split(",");
    normalized = groups.length > 2 || (groups.length === 2 && groups[1].length === 3 && groups[0] !== "0" && groups[0] !== "-0")
      ? text.replace(/,/g, "")
      : text.replace(",", ".");
  } else if (lastDot >= 0) {
    const groups = text.split(".");
    normalized = groups.length > 2 || (groups.length === 2 && groups[1].length === 3 && groups[0] !== "0" && groups[0] !== "-0")
      ? text.replace(/\./g, "")
      : text;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function parseYesNo(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (["ya", "y", "yes", "true", "1", "aktif", "tampil"].includes(value)) return true;
  if (["tidak", "t", "no", "n", "false", "0", "nonaktif", "sembunyi"].includes(value)) return false;
  return null;
}

/** Template CSV dari daftar kolom + baris contoh. */
export function templateCsv(columns: ImportColumn[], examples: string[][]) {
  const escape = (value: string) => (/[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [columns.map((c) => escape(c.label)).join(","), ...examples.map((row) => row.map(escape).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Template XLSX: header tebal, contoh, sheet "Petunjuk" berisi aturan kolom. */
export async function templateXlsx(input: {
  sheetName: string;
  columns: ImportColumn[];
  examples: string[][];
  notes: string[];
  lists?: Record<string, string[]>;
}) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Garage OS";
  const sheet = workbook.addWorksheet(input.sheetName);
  sheet.addRow(input.columns.map((c) => c.label));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A1D26" } };
  });
  for (const example of input.examples) sheet.addRow(example);
  input.columns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = Math.max(14, column.label.length + 4);
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (input.lists) {
    const master = workbook.addWorksheet("Daftar");
    master.state = "hidden";
    let col = 1;
    for (const [key, values] of Object.entries(input.lists)) {
      const index = input.columns.findIndex((c) => c.key === key);
      if (index < 0 || !values.length) continue;
      values.forEach((value, i) => {
        master.getCell(i + 1, col).value = value;
      });
      const letter = master.getColumn(col).letter;
      for (let r = 2; r <= 1000; r += 1) {
        sheet.getCell(r, index + 1).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`Daftar!$${letter}$1:$${letter}$${values.length}`],
        };
      }
      col += 1;
    }
  }
  const help = workbook.addWorksheet("Petunjuk");
  help.getColumn(1).width = 110;
  help.addRow(["GARAGE COFFEE — Petunjuk impor"]).font = { bold: true, size: 13 };
  for (const note of input.notes) help.addRow([note]);
  help.addRow([]);
  help.addRow(["Kolom:"]).font = { bold: true };
  for (const column of input.columns) help.addRow([`${column.label}${column.required ? " (wajib)" : ""}`]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
