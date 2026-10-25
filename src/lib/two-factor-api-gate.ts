// Kebijakan 2FA wajib (Pengaturan → Keamanan, `securityRequire2faForOwner`)
// ditegakkan juga di API, bukan hanya di halaman (page-access.ts). Tanpa ini
// Owner/Manajer tanpa 2FA tetap bisa memanggil /api langsung (audit
// docs/master-2026 F-04).
//
// Header path diisi src/proxy.ts untuk setiap request /api — nilai dari klien
// selalu ditimpa, jadi tidak bisa dipalsukan. Halaman (server component) tidak
// lewat proxy sehingga header kosong dan alurnya tetap redirect ke /control/2fa.
import type { Role } from "@/lib/garage-data";

export const API_PATH_HEADER = "x-garage-api-path";

// Tetap terbuka tanpa 2FA: identitas sendiri & ganti password/PIN (wajib ganti
// password diproses sebelum setup 2FA). Setup 2FA sendiri lewat /api/auth
// (Better Auth) yang tidak memakai requireGarageSession.
const EXEMPT_ROOTS = ["/api/me", "/api/account"];

function isExemptPath(path: string) {
  return EXEMPT_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

/**
 * true bila request ini perlu cek kebijakan 2FA (lalu policy dibaca dari DB).
 * Murni — tanpa I/O — supaya mudah dites.
 */
export function needsTwoFactorPolicyCheck(input: { apiPath: string | null; role: Role; twoFactorEnabled: boolean }) {
  if (!input.apiPath) return false;
  if (input.twoFactorEnabled) return false;
  if (input.role !== "Owner" && input.role !== "Manajer") return false;
  return !isExemptPath(input.apiPath);
}
