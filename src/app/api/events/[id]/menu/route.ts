import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { eventActor, eventErrorResponse, invalidId } from "@/lib/event-api";
import { eventMenuEntrySchema, getEventMenuData, saveEventMenuEntry } from "@/lib/event-menu-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
const querySchema = z.object({
  q: z.string().max(120).default(""), status: z.enum(["all", "active", "inactive", "archived"]).default("all"),
  kind: z.enum(["all", "item", "bundle"]).default("all"), sort: z.enum(["sortOrder", "name", "price"]).default("sortOrder"),
  category: z.string().max(120).default(""), productId: z.string().max(120).default(""),
  page: z.coerce.number().int().min(1).max(100000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: Request, context: Context) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  const invalid = invalidId(id); if (invalid) return invalid;
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return fail(400, "INVALID_QUERY", "Filter menu event tidak valid.");
  try {
    const data = await getEventMenuData(id, { outletId: session.data.profile.outlet.id });
    const q = query.data;
    const entries = data.entries.filter(e => {
      const ids = e.kind === "item" ? [e.menuItemId] : e.groups.flatMap(group => group.options.map(option => option.itemId));
      const references = data.products.filter(product => ids.includes(product.id));
      return (q.status === "all" || e.status === q.status) && (q.kind === "all" || e.kind === q.kind)
        && (!q.category || references.some(product => product.category === q.category))
        && (!q.productId || ids.includes(q.productId))
        && (!q.q || `${e.name} ${e.description ?? ""} ${references.map(product => `${product.id} ${product.name}`).join(" ")}`.toLocaleLowerCase("id").includes(q.q.toLocaleLowerCase("id")));
    });
    entries.sort((a, b) => q.sort === "name" ? a.name.localeCompare(b.name, "id") : q.sort === "price" ? a.price - b.price || a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    return ok({ ...data, entries: entries.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), pagination: { page: q.page, pageSize: q.pageSize, total: entries.length, totalPages: Math.max(1, Math.ceil(entries.length / q.pageSize)) } });
  } catch (error) { return eventErrorResponse(error, "Gagal memuat menu event."); }
}
export async function POST(request: Request, context: Context) {
  const session = await requirePermission("events:manage");
  if (session.response) return session.response;
  const { id } = await context.params;
  const invalid = invalidId(id); if (invalid) return invalid;
  const body = await readJson(request, eventMenuEntrySchema); if (body.error) return body.error;
  try { return ok(await saveEventMenuEntry(id, body.data, { ...eventActor(session.data), outletId: session.data.profile.outlet.id }), { status: 201 }); }
  catch (error) { return eventErrorResponse(error, "Gagal menyimpan menu event."); }
}
