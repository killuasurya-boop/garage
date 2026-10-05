// Checklist tutup shift kasir. Tidak ada yang tercentang otomatis — kasir harus
// benar-benar mengecek. Sign-off Manajer bukan checkbox: sah hanya lewat PIN.
export const CLOSING_CHECKLIST_LABELS = [
  "Semua pesanan sudah lunas atau diserahkan ke shift berikutnya",
  "Uang di laci sudah dihitung dua kali",
  "Bukti kas keluar / pengeluaran sudah dikumpulkan",
  "Total QRIS sudah dicek atau diserahkan ke Owner",
] as const;

export function freshClosingChecklist() {
  return CLOSING_CHECKLIST_LABELS.map((label) => ({ label, done: false }));
}
