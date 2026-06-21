import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { candidates } from "@/db/schema";

export const runtime = "nodejs";

const trackStatusSchema = z.object({
  whatsapp: z.string().min(8).max(20),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = trackStatusSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Nomor WhatsApp tidak valid." },
        { status: 400 }
      );
    }

    const db = getDb();
    
    // Cari kandidat berdasarkan whatsapp, ambil yang terbaru (desc createdAt)
    const records = await db
      .select({
        id: candidates.id,
        fullName: candidates.fullName,
        status: candidates.status,
        appliedPosition: candidates.appliedPosition,
        createdAt: candidates.createdAt,
        interviewDate: candidates.interviewDate,
        interviewLink: candidates.interviewLink,
      })
      .from(candidates)
      .where(eq(candidates.whatsapp, parsed.data.whatsapp))
      .orderBy(desc(candidates.createdAt))
      .limit(1);

    if (records.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Data lamaran tidak ditemukan. Pastikan nomor WhatsApp sesuai dengan yang didaftarkan." },
        { status: 404 }
      );
    }

    // Hanya return field yang boleh diakses publik (tanpa score, dll)
    return NextResponse.json({
      ok: true,
      data: records[0]
    });
    
  } catch (err) {
    console.error("Failed to track recruitment status", err);
    return NextResponse.json(
      { ok: false, error: "Gagal mengambil status lamaran" },
      { status: 500 }
    );
  }
}
