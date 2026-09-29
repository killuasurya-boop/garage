// Kebijakan password akun staf (Better Auth). Menolak password default seed,
// password umum, dan pola mudah ditebak — dipakai saat staf mengganti password
// (termasuk "wajib ganti password" setelah login pertama).

const KNOWN_DEFAULTS = ["garage12345", "member12345", "password", "garage123", "12345678", "qwerty123"];

export function staffPasswordWeakness(password: string, context: { email?: string } = {}): string | null {
  const value = password.trim();
  const lower = value.toLowerCase();
  if (value.length < 8) return "Password minimal 8 karakter.";
  const seed = process.env.GARAGE_SEED_PASSWORD?.trim().toLowerCase();
  if (KNOWN_DEFAULTS.includes(lower) || (seed && lower === seed)) {
    return "Password bawaan/umum tidak boleh dipakai. Buat password baru milik Anda sendiri.";
  }
  if (/^(.)\1+$/.test(value) || "0123456789012345".includes(value) || "abcdefghijklmnopqrstuvwxyz".includes(lower)) {
    return "Password terlalu mudah ditebak (karakter kembar/berurutan).";
  }
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) {
    return "Password tidak boleh memuat nama akun/email.";
  }
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) {
    return "Password harus mengandung huruf dan angka.";
  }
  return null;
}
