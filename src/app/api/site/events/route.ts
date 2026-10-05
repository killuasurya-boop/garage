import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getSiteEvents, saveSiteEvents } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publik: landing menampilkan event mendatang. `?all=1` (modul Website) memuat
// semua event tersimpan termasuk yang sudah lewat, khusus website:manage.
export async function GET(request: Request) {
  const all = new URL(request.url).searchParams.get("all") === "1";
  if (all) {
    const session = await requirePermission("website:manage");
    if (session.response) return session.response;
    return ok(await getSiteEvents());
  }
  return ok(await getSiteEvents({ upcomingOnly: true }));
}

const eventsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().max(40).optional(),
        title: z.string().trim().min(1, "Judul event wajib diisi.").max(80),
        tag: z.string().trim().max(40).default("Event"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal event tidak valid."),
        time: z.string().regex(/^\d{2}:\d{2}$/, "Jam event tidak valid."),
        desc: z.string().trim().max(400).default(""),
        capacity: z.number().int().min(0).max(5000).nullable().optional(),
      }),
    )
    .max(30, "Maksimal 30 event."),
});

export async function PUT(request: Request) {
  const session = await requirePermission("website:manage");
  if (session.response) return session.response;

  const body = await readJson(request, eventsSchema);
  if (body.error) return body.error;

  try {
    return ok(await saveSiteEvents(body.data.items, session.data.user.id));
  } catch (error) {
    return fail(400, "EVENTS_SAVE_FAILED", error instanceof Error ? error.message : "Event gagal disimpan.");
  }
}
