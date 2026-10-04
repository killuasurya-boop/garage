import { describe, expect, it } from "vitest";

import { loginErrorMessage } from "./login-messages";

describe("loginErrorMessage", () => {
  it("menerjemahkan kredensial salah dari Better Auth", () => {
    expect(loginErrorMessage(401, "INVALID_EMAIL_OR_PASSWORD", "Invalid email or password")).toBe(
      "Email atau password salah.",
    );
    expect(loginErrorMessage(401, null, "Invalid email or password")).toBe("Email atau password salah.");
  });

  it("membedakan rate-limit umum dan kunci akun", () => {
    expect(loginErrorMessage(429, null, "Terlalu banyak request. Coba lagi sebentar.")).toMatch(
      /Tunggu 1 menit/,
    );
    const locked = "Akun dikunci sementara karena 5 login gagal. Coba lagi setelah 15 menit.";
    expect(loginErrorMessage(429, "TOO_MANY_REQUESTS", locked)).toBe(locked);
  });

  it("jaringan putus / server error → pesan koneksi", () => {
    expect(loginErrorMessage(0)).toMatch(/Server tidak bisa dihubungi/);
    expect(loginErrorMessage(503, null, "fetch failed")).toMatch(/Server tidak bisa dihubungi/);
  });

  it("pesan Indonesia dari server diteruskan, pesan Inggris lain diganti umum", () => {
    expect(loginErrorMessage(403, "FORBIDDEN", "Akun nonaktif, hubungi owner.")).toBe(
      "Akun nonaktif, hubungi owner.",
    );
    expect(loginErrorMessage(400, "SOMETHING", "Something went wrong")).toMatch(/^Login gagal/);
  });
});
