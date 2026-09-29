// Aturan PIN persetujuan (Owner/Manajer). PIN yang sama juga dipakai absensi
// untuk lookup staf BY pin, jadi PIN wajib unik antar staf — dicek di service.

export const PIN_FORMAT_MESSAGE = "PIN harus 4-8 digit angka.";

/** true bila PIN mudah ditebak: semua digit sama (1111) atau berurutan (1234 / 4321). */
export function isWeakPin(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = pin.split("").map(Number);
  const steps = digits.slice(1).map((digit, index) => digit - digits[index]);
  return steps.every((step) => step === 1) || steps.every((step) => step === -1);
}

/** Pesan error bila PIN persetujuan tidak valid, null bila boleh dipakai. */
export function validateApprovalPin(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return PIN_FORMAT_MESSAGE;
  if (isWeakPin(pin)) return "PIN terlalu mudah ditebak (angka sama semua atau berurutan). Pilih kombinasi lain.";
  return null;
}
