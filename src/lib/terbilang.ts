// Angka → kata (Bahasa Indonesia), mis. 2_100_000 → "dua juta seratus ribu".

const SATUAN = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

function below1000(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${SATUAN[n - 10]} belas`;
  if (n < 100) {
    const rest = n % 10;
    return `${SATUAN[Math.floor(n / 10)]} puluh${rest ? ` ${SATUAN[rest]}` : ""}`;
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 1 ? "seratus" : `${SATUAN[hundreds]} ratus`;
  return rest ? `${head} ${below1000(rest)}` : head;
}

const SCALES: Array<[number, string]> = [
  [1_000_000_000_000, "triliun"],
  [1_000_000_000, "miliar"],
  [1_000_000, "juta"],
  [1_000, "ribu"],
];

export function terbilang(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return "nol";
  const parts: string[] = [];
  for (const [size, word] of SCALES) {
    if (n >= size) {
      const count = Math.floor(n / size);
      parts.push(size === 1_000 && count === 1 ? "seribu" : `${below1000(count)} ${word}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(below1000(n));
  return `${value < 0 ? "minus " : ""}${parts.join(" ")}`;
}

/** "Dua juta seratus ribu rupiah" — huruf besar di awal, untuk slip/kuitansi. */
export function terbilangRupiah(value: number): string {
  const words = `${terbilang(value)} rupiah`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
