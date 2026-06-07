import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { fail } from "@/lib/api-response";
import {
  trainingCourses,
  trainingLessons,
  sopChecklists,
  outlets
} from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";

export async function GET() {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    return session.response;
  }

  try {
    const db = getDb();
    
    const [outlet] = await db.select().from(outlets).limit(1);
    if (!outlet) {
      return fail(400, "NO_OUTLET", "No outlet found");
    }

    // 1. Onboarding Umum
    const [course1] = await db.insert(trainingCourses).values({
      slug: "onboarding-umum",
      title: "Onboarding Umum & Budaya GARAGE",
      category: "General",
      targetRoles: ["All"],
      summary: "Pelatihan dasar untuk semua karyawan baru mengenai visi, misi, dan penggunaan dasar Garage OS.",
      sortOrder: 1,
      status: "active"
    }).onConflictDoUpdate({
      target: trainingCourses.slug,
      set: { title: "Onboarding Umum & Budaya GARAGE", summary: "Pelatihan dasar untuk semua karyawan baru mengenai visi, misi, dan penggunaan dasar Garage OS.", updatedAt: new Date() }
    }).returning();

    await db.delete(trainingLessons).where(sql`course_id = ${course1.id}`);
    await db.insert(trainingLessons).values([
      {
        courseId: course1.id,
        title: "Budaya & Visi Misi Garage",
        summary: "Memahami budaya pelayanan yang cepat, tepat, dan ramah.",
        checklist: ["Tonton video sambutan CEO", "Baca manifesto Garage"],
        sortOrder: 1
      },
      {
        courseId: course1.id,
        title: "Pengenalan Garage OS Dasar",
        summary: "Cara login, absen, dan melihat profil.",
        checklist: ["Praktek login dengan PIN", "Praktek absen masuk dan keluar"],
        sortOrder: 2
      },
      {
        courseId: course1.id,
        title: "Lonceng Pengawasan AI",
        summary: "Memahami cara kerja pengawasan dan alert dari Garage AI.",
        checklist: ["Baca panduan Lonceng AI", "Simulasi menandai tugas selesai"],
        sortOrder: 3
      }
    ]);

    // 2. Modul Kasir
    const [course2] = await db.insert(trainingCourses).values({
      slug: "tutorial-kasir",
      title: "Modul Kasir & Front of House",
      category: "Operations",
      targetRoles: ["Kasir", "Waiter", "Supervisor Shift"],
      summary: "Panduan lengkap penggunaan POS, penerimaan pesanan, dan penyelesaian kas.",
      sortOrder: 2,
      status: "active"
    }).onConflictDoUpdate({
      target: trainingCourses.slug,
      set: { title: "Modul Kasir & Front of House", updatedAt: new Date() }
    }).returning();

    await db.delete(trainingLessons).where(sql`course_id = ${course2.id}`);
    await db.insert(trainingLessons).values([
      {
        courseId: course2.id,
        title: "Tutorial POS 101",
        summary: "Cara menerima pesanan, split tagihan, dan pembayaran.",
        checklist: ["Praktek input order Dine-In", "Praktek bayar QRIS dan Tunai"],
        sortOrder: 1
      },
      {
        courseId: course2.id,
        title: "SOP Shift Handovers",
        summary: "Cara buka kas, tutup kas, dan serah terima.",
        checklist: ["Praktek buka Cash Session", "Praktek tutup Cash Session"],
        sortOrder: 2
      }
    ]);

    // 3. Modul Kitchen
    const [course3] = await db.insert(trainingCourses).values({
      slug: "tutorial-kitchen",
      title: "Modul Dapur & Bar (BOH)",
      category: "Operations",
      targetRoles: ["Koki", "Barista", "Asisten Koki", "Kitchen / Barista"],
      summary: "Panduan lengkap KDS, manajemen resep, dan order prep.",
      sortOrder: 3,
      status: "active"
    }).onConflictDoUpdate({
      target: trainingCourses.slug,
      set: { title: "Modul Dapur & Bar (BOH)", updatedAt: new Date() }
    }).returning();

    await db.delete(trainingLessons).where(sql`course_id = ${course3.id}`);
    await db.insert(trainingLessons).values([
      {
        courseId: course3.id,
        title: "SOP KDS & Prioritas",
        summary: "Mengelola tiket pesanan di dapur.",
        checklist: ["Bump order selesai", "Identifikasi order overdue"],
        sortOrder: 1
      }
    ]);

    // SOP Checklists
    const sopSeed = [
      { title: "Opening Shift (Kasir)", description: "Persiapan area kasir sebelum toko buka.", roleTarget: "Kasir", shiftTarget: "morning" },
      { title: "Closing Shift (Kasir)", description: "Pembersihan area kasir dan perhitungan uang.", roleTarget: "Kasir", shiftTarget: "evening" },
      { title: "Opening Shift (Kitchen/Bar)", description: "Persiapan bahan baku dan kalibrasi mesin.", roleTarget: "Kitchen / Barista", shiftTarget: "morning" },
      { title: "Stock Opname Harian", description: "Pengecekan stok bahan kritis.", roleTarget: "Gudang", shiftTarget: "evening" }
    ];

    for (const sop of sopSeed) {
      const existing = await db.select().from(sopChecklists).where(sql`title = ${sop.title} AND outlet_id = ${outlet.id}`).limit(1);
      if (existing.length === 0) {
        await db.insert(sopChecklists).values({
          outletId: outlet.id,
          title: sop.title,
          description: sop.description,
          roleTarget: sop.roleTarget,
          shiftTarget: sop.shiftTarget,
          status: "active"
        });
      } else {
        await db.update(sopChecklists).set({
          description: sop.description,
          roleTarget: sop.roleTarget,
          shiftTarget: sop.shiftTarget,
          updatedAt: new Date()
        }).where(sql`id = ${existing[0].id}`);
      }
    }

    return NextResponse.json({ success: true, message: "Data training dan SOP berhasil di-seed" });
  } catch (error) {
    return fail(500, "INTERNAL_ERROR", String(error));
  }
}
