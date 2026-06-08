import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { operationLocations } from "@/db/schema";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";
import { eq } from "drizzle-orm";
import { fail, readJson } from "@/lib/api-response";

const numLike = z.union([z.string(), z.number()]);
const locationBodySchema = z.object({
  action: z.string().optional(),
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(160).optional(),
  type: z.string().trim().max(60).optional(),
  latitude: numLike.optional(),
  longitude: numLike.optional(),
  radius: numLike.optional(),
  address: z.string().trim().max(400).nullable().optional(),
  outletId: z.string().min(1).optional(),
});

export async function GET() {
  try {
    const session = await requireGarageSession();
    if (session.response) {
      return fail(401, "UNAUTHORIZED", "Unauthorized");
    }

    const db = await getDb();
    const list = await db.select().from(operationLocations);

    return NextResponse.json({ locations: list });
  } catch (error) {
    console.error("Failed to fetch locations:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const parsed = await readJson(req, locationBodySchema);
    if (parsed.error) return parsed.error;
    const { action, id, name, type, latitude, longitude, radius, address, outletId } = parsed.data;

    const db = await getDb();

    if (action === "delete") {
      if (!id) {
        return fail(400, "VALIDATION_ERROR", "id is required for deletion");
      }
      await db.delete(operationLocations).where(eq(operationLocations.id, id));
      return NextResponse.json({ success: true });
    }

    if (id) {
      // Update
      await db
        .update(operationLocations)
        .set({
          name,
          type,
          latitude: parseFloat(String(latitude)),
          longitude: parseFloat(String(longitude)),
          radius: parseInt(String(radius)) || 100,
          address: address || null,
        })
        .where(eq(operationLocations.id, id));
    } else {
      // Create
      if (!name || !type) {
        return fail(400, "VALIDATION_ERROR", "name dan type wajib diisi");
      }
      await db.insert(operationLocations).values({
        outletId: outletId || session.data.profile.outlet.id,
        name,
        type,
        latitude: parseFloat(String(latitude)),
        longitude: parseFloat(String(longitude)),
        radius: parseInt(String(radius)) || 100,
        address: address || null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to manage locations:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}
