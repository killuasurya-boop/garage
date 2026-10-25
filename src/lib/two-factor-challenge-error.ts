/** Keep an expired/missing login challenge distinct from an invalid OTP. */
export function twoFactorChallengeError(error: { code?: string; message?: string; status?: number }, mode: "totp" | "backup") {
  const code = error.code ?? "";
  if (code === "INVALID_TWO_FACTOR_COOKIE" || /invalid two factor cookie|verification.*(?:expired|not found)|challenge.*expired/i.test(error.message ?? "")) {
    return { restartRequired: true, message: "Sesi verifikasi sudah berakhir atau tidak tersedia. Login ulang untuk membuat sesi baru, lalu masukkan kode terbaru. Kode Anda belum dinyatakan salah." };
  }
  if (code === "TOO_MANY_REQUESTS" || error.status === 429) {
    return { restartRequired: false, message: "Terlalu banyak percobaan. Tunggu sebentar sebelum mencoba kembali." };
  }
  if (code === "INVALID_BACKUP_CODE") return { restartRequired: false, message: "Backup code tidak valid atau sudah pernah dipakai. Gunakan kode lain yang Anda simpan." };
  if (code === "INVALID_CODE" || code === "OTP_HAS_EXPIRED" || /invalid code|incorrect|otp has expired/i.test(error.message ?? "")) {
    return { restartRequired: false, message: mode === "backup" ? "Backup code tidak valid atau sudah pernah dipakai. Gunakan kode lain yang Anda simpan." : "Kode authenticator belum cocok atau sudah berganti. Masukkan kode terbaru dari entri Garage OS dan periksa sinkronisasi waktu perangkat." };
  }
  return { restartRequired: false, message: "Verifikasi belum berhasil. Coba kembali; bila berulang, login ulang untuk membuat sesi verifikasi baru." };
}
