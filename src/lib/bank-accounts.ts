// Rekening transfer pelanggan dari Pengaturan (aman untuk client component).
export type BankAccount = { id: string; bank: string; number: string; holder: string };

/** "BNI | 1234567890 | GARAGE" per baris → daftar rekening (baris tak lengkap diabaikan). */
export function parseBankAccounts(text: string | null | undefined): BankAccount[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length >= 2 && parts[0] && /\d/.test(parts[1] ?? ""))
    .slice(0, 10)
    .map(([bank, number, holder], index) => ({
      id: `${bank.toUpperCase()}-${index}`,
      bank: bank.toUpperCase().slice(0, 30),
      number: number.slice(0, 40),
      holder: (holder || "GARAGE Coffee & Motor").slice(0, 80),
    }));
}
