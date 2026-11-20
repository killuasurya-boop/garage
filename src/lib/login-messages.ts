/** Pesan error Better Auth / rate-limit → bahasa Indonesia yang jelas untuk karyawan. */
export function loginErrorMessage(status: number, code?: string | null, message?: string | null) {
  if (status === 429) {
    if (message?.startsWith("Akun dikunci")) return message;
    return "Terlalu banyak percobaan login. Tunggu 1 menit, lalu coba lagi.";
  }
  if (status === 0 || status >= 500) {
    return "Server tidak bisa dihubungi. Periksa koneksi internet, lalu coba lagi.";
  }
  switch (code) {
    case "INVALID_EMAIL_OR_PASSWORD":
    case "USER_NOT_FOUND":
    case "INVALID_PASSWORD":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return "Email atau password salah.";
    case "INVALID_EMAIL":
      return "Format email tidak valid.";
    case "EMAIL_NOT_VERIFIED":
      return "Email belum diverifikasi. Hubungi Owner atau Manajer.";
    default:
      break;
  }
  if (message && /invalid (email|password)/i.test(message)) return "Email atau password salah.";
  // Pesan kustom server (mis. akun nonaktif) sudah berbahasa Indonesia → tampilkan apa adanya.
  if (message && !/^[A-Za-z ]+\.?$/.test(message)) return message;
  return "Login gagal. Periksa email dan password, lalu coba lagi.";
}

/** Hanya kode tetap dari guard halaman; jangan tampilkan teks mentah dari URL. */
export function loginAccessMessage(reason: string | null) {
  switch (reason) {
    case "ACCOUNT_SUSPENDED":
      return "Akun Anda ditangguhkan. Hubungi Owner atau Manajer, atau masuk dengan akun lain.";
    case "ACCOUNT_INACTIVE":
      return "Akun Anda sudah tidak aktif. Hubungi Owner atau Manajer, atau masuk dengan akun lain.";
    case "STAFF_PROFILE_MISSING":
      return "Profil staf Garage tidak ditemukan. Hubungi Owner atau Manajer untuk memeriksa akses akun.";
    case "ACCESS_DENIED":
      return "Akun Anda belum bisa membuka area kerja ini. Hubungi Owner atau Manajer, atau masuk dengan akun lain.";
    default:
      return null;
  }
}
