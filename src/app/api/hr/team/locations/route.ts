import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { operationLocations } from "@/db/schema";
import { requireGarageSession, requirePermission } from "@/lib/server-auth";
import { eq } from "drizzle-orm";
import { fail } from "@/lib/api-response";

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

    const body = await req.json();
    const { action, id, name, type, latitude, longitude, radius, address, outletId } = body;

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
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          radius: parseInt(radius) || 100,
          address: address || null,
        })
        .where(eq(operationLocations.id, id));
    } else {
      // Create
      await db.insert(operationLocations).values({
        outletId: outletId || session.data.profile.outlet.id,
        name,
        type,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        radius: parseInt(radius) || 100,
        address: address || null,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to manage locations:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}
