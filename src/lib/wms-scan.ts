// Normalisasi hasil scan label gudang. Label penerimaan berisi "SKU|BATCH"
// (receiving), label produk berisi SKU saja, kemasan supplier berisi barcode.
export function parseWmsScan(raw: string): { code: string; batch: string | null } {
  const value = raw.trim();
  const pipe = value.indexOf("|");
  if (pipe > 0) {
    return { code: value.slice(0, pipe).trim(), batch: value.slice(pipe + 1).trim() || null };
  }
  return { code: value, batch: null };
}
