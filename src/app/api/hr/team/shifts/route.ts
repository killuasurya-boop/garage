import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { shiftSchedules } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { fail, readJson } from "@/lib/api-response";

class ShiftOutletMissingError extends Error {}

const timeSchema = z.string().max(8).nullish();
const shiftsBodySchema = z.object({
  shifts: z
    .array(
      z.object({
        id: z.string().max(64).nullish(),
        staffId: z.string().trim().min(1).max(64),
        outletId: z.string().max(64).nullish(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date harus YYYY-MM-DD"),
        shiftType: z.string().trim().min(1).max(30),
        startTime: timeSchema,
        endTime: timeSchema,
        notes: z.string().max(1000).nullish(),
      }),
    )
    .max(500),
});

export async function GET(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return fail(400, "VALIDATION_ERROR", "startDate and endDate are required");
    }

    const db = await getDb();

    // Query schedules in the date range
    const schedules = await db
      .select()
      .from(shiftSchedules)
      .where(
        and(
          gte(shiftSchedules.date, startDate),
          lte(shiftSchedules.date, endDate)
        )
      );

    return NextResponse.json({ schedules });
  } catch (error) {
    console.error("Failed to fetch shift schedules:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("staff:manage");
    if (session.response) return session.response;

    const parsed = await readJson(req, shiftsBodySchema);
    if (parsed.error) return parsed.error;
    const { shifts } = parsed.data;

    const db = await getDb();

    await db.transaction(async (tx) => {
      for (const shift of shifts) {
        // Query to check if shift exists for staffId and date
        const [existing] = await tx
          .select()
          .from(shiftSchedules)
          .where(
            and(
              eq(shiftSchedules.staffId, shift.staffId),
              eq(shiftSchedules.date, shift.date)
            )
          )
          .limit(1);

        if (existing) {
          // Update existing shift
          await tx
            .update(shiftSchedules)
            .set({
              shiftType: shift.shiftType,
              startTime: shift.startTime || null,
              endTime: shift.endTime || null,
              notes: shift.notes || null,
              updatedAt: new Date(),
            })
            .where(eq(shiftSchedules.id, existing.id));
        } else {
          // Insert new shift
          if (!shift.outletId) {
            throw new ShiftOutletMissingError();
          }
          await tx.insert(shiftSchedules).values({
            staffId: shift.staffId,
            outletId: shift.outletId,
            date: shift.date,
            shiftType: shift.shiftType,
            startTime: shift.startTime || null,
            endTime: shift.endTime || null,
            notes: shift.notes || null,
          });
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ShiftOutletMissingError) {
      return fail(400, "VALIDATION_ERROR", "Staf belum terhubung ke outlet; atur outlet staf dulu.");
    }
    console.error("Failed to save shift schedules:", error);
    return fail(500, "INTERNAL_ERROR", "Internal server error");
  }
}
