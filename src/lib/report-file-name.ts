// Nama file laporan standar Garage (tanpa dependensi berat → aman untuk klien).

/**
 * GARAGE_{JENIS}[_{DIVISI}]_{PERIODE}.{ext}
 *  - satu hari  → 2026-10-13
 *  - satu bulan penuh → 2026-10
 *  - satu tahun penuh → 2026
 *  - rentang lain → 2026-10-01_2026-10-13
 */
export function reportFileName(input: { kind: string; division?: string | null; from: string; to: string; ext: "pdf" | "xlsx" | "csv" }) {
  const slug = (text: string) =>
    text
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s-]+/g, "_")
      .toUpperCase();
  const parts = ["GARAGE", slug(input.kind)];
  if (input.division) parts.push(slug(input.division));
  parts.push(periodSlug(input.from, input.to));
  return `${parts.join("_")}.${input.ext}`;
}

function periodSlug(from: string, to: string) {
  if (from === to) return from;
  const [fy, fm, fd] = from.split("-");
  const [ty, tm, td] = to.split("-");
  const lastDay = new Date(Date.UTC(Number(ty), Number(tm), 0)).getUTCDate();
  if (fy === ty && fm === tm && fd === "01" && Number(td) === lastDay) return `${fy}-${fm}`;
  if (fy === ty && fm === "01" && fd === "01" && tm === "12" && td === "31") return fy;
  return `${from}_${to}`;
}
