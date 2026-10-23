/**
 * ID acak untuk kunci idempotensi / id grup. `crypto.randomUUID` hanya ada di origin aman
 * (https/localhost); tablet di LAN http memakai fallback (tetap ≥ 8 karakter).
 */
export function randomId(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
