// Salinan data PUBLIK platform GIGS (Owner 23 Nov 2026, persiapan mematikan container platform).
// Diambil dari endpoint publik yang sama yang dibaca halaman event (tanpa data rahasia). Dipakai hanya bila platform
// tidak bisa dihubungi (mati / error 5xx), sehingga halaman event, beranda, dan Transparansi tetap jalan setelah
// platform dimatikan. Data Garage OS (Transparansi, lineup, Hari-H, …) tetap ditimpakan di atasnya seperti biasa.
// Selama platform hidup, data platform asli yang dipakai.

import snapshot from "@/data/event-platform-snapshot/snapshot.json";

type Snapshot = { capturedAt: string; events: unknown; bySlug: Record<string, Record<string, unknown>> };
const SNAP = snapshot as Snapshot;

/** `{ events: [...] }` daftar event platform (salinan). */
export function platformEventsSnapshot(): unknown {
  return SNAP.events;
}

/** Isi JSON salinan untuk `/event/<slug>/api/<path>`, atau undefined bila tidak ada. */
export function platformJsonSnapshot(slug: string, path: string): unknown {
  return SNAP.bySlug[slug]?.[path];
}
