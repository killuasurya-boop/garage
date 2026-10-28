// U1 (PRD §24.3 "Angka uang"): format Rp IDR, angka tabular, rata kanan di tabel,
// negatif ditulis dengan tanda minus (tidak hanya warna). Nilai tidak dibulatkan diam-diam.

export function formatRupiah(value: number, opts: { signed?: boolean } = {}) {
  const abs = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.abs(Math.round(value)));
  const sign = value < 0 ? "−" : opts.signed && value > 0 ? "+" : "";
  return `${sign}Rp${abs}`;
}

export function MoneyText({
  value,
  signed = false,
  tone = "auto",
  align = "inherit",
  className = "",
}: {
  value: number | null | undefined;
  /** Tampilkan "+" untuk nilai positif (selisih, mutasi). */
  signed?: boolean;
  /** auto = negatif berwarna bahaya; plain = selalu warna teks utama. */
  tone?: "auto" | "plain";
  align?: "inherit" | "right";
  className?: string;
}) {
  if (value === null || value === undefined) {
    return <span className={`font-mono tabular-nums text-[var(--gos-text-muted)] ${align === "right" ? "block text-right" : ""} ${className}`}>—</span>;
  }
  const color = tone === "auto" && value < 0 ? "text-[var(--gos-status-danger)]" : "text-[var(--gos-text-primary)]";
  return (
    <span className={`whitespace-nowrap font-mono tabular-nums ${color} ${align === "right" ? "block text-right" : ""} ${className}`}>
      {formatRupiah(value, { signed })}
    </span>
  );
}
