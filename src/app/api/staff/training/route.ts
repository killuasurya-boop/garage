import { NextResponse } from "next/server";
import { asc, eq, and, or } from "drizzle-orm";
import { getDb } from "@/db";
import {
  trainingCourses,
  trainingLessons,
  trainingProgress,
  sopChecklists,
  sopLogs,
  staffProfiles
} from "@/db/schema";
import { requireGarageSession } from "@/lib/server-auth";
import { fail } from "@/lib/api-response";

export async function GET() {
  try {
    const { data: session, response } = await requireGarageSession();
    if (response) return response;

    const db = getDb();

    // Dapatkan data staff terkait
    const [staffProfile] = await db
      .select()
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, session.user.id))
      .limit(1);

    const userRole = staffProfile?.role || session.profile.role || "All";
    const outletId = staffProfile?.outletId || session.profile.outlet.id;

    // Ambil semua courses yang menargetkan All atau Role pengguna
    const activeCourses = await db
      .select()
      .from(trainingCourses)
      .where(eq(trainingCourses.status, "active"))
      .orderBy(asc(trainingCourses.sortOrder));

    const lessons = await db
      .select()
      .from(trainingLessons)
      .orderBy(asc(trainingLessons.sortOrder));

    const lessonsByCourse = new Map<string, typeof lessons>();
    for (const lesson of lessons) {
      const courseLessons = lessonsByCourse.get(lesson.courseId) ?? [];
      courseLessons.push(lesson);
      lessonsByCourse.set(lesson.courseId, courseLessons);
    }

    const courses = activeCourses.map((course) => ({
      ...course,
      lessons: lessonsByCourse.get(course.id) ?? [],
    }));

    // Filter by role di memori saja (array overlap bisa dilakukan di Drizzle tapi JSONB lebih gampang difilter di Node)
    const applicableCourses = courses.filter((c) => {
      const roles = c.targetRoles as string[];
      if (!roles || roles.length === 0) return true;
      return roles.includes("All") || roles.includes(userRole);
    });

    // Ambil progress pengguna
    const userProgress = await db.select().from(trainingProgress).where(eq(trainingProgress.userId, session.user.id));
    const progressMap = new Map(userProgress.map(p => [p.courseId, p]));

    const coursesDto = applicableCourses.map((c) => {
      const prog = progressMap.get(c.id);
      return {
        ...c,
        progressStatus: prog?.status || "pending",
        completedAt: prog?.completedAt || null,
      };
    });

    // Ambil SOP
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    
    let applicableSops: unknown[] = [];
    if (outletId && staffProfile) {
      const sops = await db.select().from(sopChecklists).where(
        and(
          eq(sopChecklists.outletId, outletId),
          eq(sopChecklists.status, "active"),
          or(
            eq(sopChecklists.roleTarget, "All"),
            eq(sopChecklists.roleTarget, userRole)
          )
        )
      ).orderBy(asc(sopChecklists.shiftTarget), asc(sopChecklists.title));
      
      const sopsLogs = await db.select().from(sopLogs).where(
        and(
          eq(sopLogs.staffId, staffProfile.id),
          eq(sopLogs.date, today)
        )
      );
      const logMap = new Map(sopsLogs.map(l => [l.checklistId, l]));

      applicableSops = sops.map(s => {
        const log = logMap.get(s.id);
        return {
          ...s,
          isCompletedToday: log?.status === "done",
          logId: log?.id || null
        };
      });
    }

    return NextResponse.json({
      courses: coursesDto,
      sops: applicableSops
    });
  } catch (error) {
    console.error("Training API Error:", error);
    return fail(500, "INTERNAL_ERROR", "Internal Server Error");
  }
}
