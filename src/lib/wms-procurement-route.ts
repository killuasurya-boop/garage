import type { GarageSession } from "@/lib/server-auth";
import type { ProcActor } from "@/lib/wms-procurement";

/** Aktor pengadaan dari sesi (peran dipakai untuk aturan persetujuan & verifikasi). */
export function procActor(session: Pick<GarageSession, "user" | "profile">): ProcActor {
  return { userId: session.user.id, name: session.user.name ?? "Gudang", role: session.profile.role };
}
