import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { staffSalaries, staffPayrolls, staffProfiles, user, kpiEvaluations, employeeAttendances, staffAdvances } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { and, eq, gte, lt } from "drizzle-orm";
import { computeWorkedStats, formatWorkedHours } from "@/lib/attendance";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("finance:read");
    if (session.response) return session.response;

    const { searchParams } = new URL(req.url);
    const period = searchParams.get("period"); // YYYY-MM

    if (!period) {
      return NextResponse.json({ error: "period is required" }, { status: 400 });
    }

    const db = await getDb();

    // 1. Fetch active staff members
    const staffList = await db
      .select({
        id: staffProfiles.id,
        role: staffProfiles.role,
        name: user.name,
        email: user.email,
        outletId: staffProfiles.outletId,
      })
      .from(staffProfiles)
      .innerJoin(user, eq(staffProfiles.userId, user.id))
      .where(eq(staffProfiles.status, "active"));

    // 2. Fetch master base salaries
    const baseSalaries = await db.select().from(staffSalaries);
    const salaryMap = new Map(baseSalaries.map(s => [s.staffId, s]));

    // 3. Fetch saved payroll records for the period
    const savedPayrolls = await db
      .select()
      .from(staffPayrolls)
      .where(eq(staffPayrolls.period, period));
    const payrollMap = new Map(savedPayrolls.map(p => [p.staffId, p]));

    // 4. Fetch KPI evaluations for calculations
    const kpiEvals = await db
      .select()
      .from(kpiEvaluations)
      .where(eq(kpiEvaluations.period, period));
    const kpiMap = new Map(kpiEvals.map(k => [k.staffId, k.score]));

    // 5. Fetch approved cash advances (kasbon) in this period
    const approvedAdvances = await db
      .select()
      .from(staffAdvances)
      .where(
        and(
          eq(staffAdvances.period, period),
          eq(staffAdvances.status, "approved")
        )
      );

    const advanceMap = new Map<string, number>();
    approvedAdvances.forEach((adv) => {
      const current = advanceMap.get(adv.staffId) || 0;
      advanceMap.set(adv.staffId, current + adv.amount);
    });

    // 6. Absensi sepanjang periode -> jam kerja, hari hadir, jumlah telat.
    // period = "YYYY-MM"; rentang [bulan, bulan+1).
    const [yearText, monthText] = period.split("-");
    const year = Number(yearText);
    const month = Number(monthText); // 1-12
    const attendanceStatsMap = new Map<string, ReturnType<typeof computeWorkedStats>>();
    if (Number.isFinite(year) && Number.isFinite(month)) {
      const periodStart = new Date(Date.UTC(year, month - 1, 1) - 7 * 60 * 60 * 1000);
      const periodEnd = new Date(Date.UTC(year, month, 1) - 7 * 60 * 60 * 1000);
      const punches = await db
        .select({
          staffId: employeeAttendances.staffId,
          action: employeeAttendances.action,
          timestamp: employeeAttendances.timestamp,
          status: employeeAttendances.status,
        })
        .from(employeeAttendances)
        .where(
          and(
            gte(employeeAttendances.timestamp, periodStart),
            lt(employeeAttendances.timestamp, periodEnd),
          ),
        );
      const byStaff = new Map<string, typeof punches>();
      for (const p of punches) {
        const list = byStaff.get(p.staffId) ?? [];
        list.push(p);
        byStaff.set(p.staffId, list);
      }
      for (const [staffId, list] of byStaff) {
        attendanceStatsMap.set(staffId, computeWorkedStats(list));
      }
    }

    // Enrich the staff list with payroll calculation data
    const payrollList = staffList.map((st) => {
      const masterSal = salaryMap.get(st.id);
      const savedPay = payrollMap.get(st.id);
      const kpiScore = kpiMap.get(st.id) || 0;

      // Base & Fixed Allowance defaults (1,500,000 to 4,000,000 depending on role if not set)
      const baseSalary = masterSal?.baseSalary ?? (
        st.role.includes("Owner") ? 5000000 :
        st.role.includes("Admin") || st.role.includes("Manager") ? 4000000 :
        st.role.includes("Finance") ? 3800000 :
        st.role.includes("Kasir") || st.role.includes("Barista") || st.role.includes("Koki") ? 3200000 : 2500000
      );
      const allowance = masterSal?.allowance ?? 300000;

      // Auto Bonus calculation from KPI:
      // KPI A (score >= 90): +250,000, KPI B (80 - 89): +100,000
      let autoBonus = 0;
      if (kpiScore >= 90) autoBonus = 250000;
      else if (kpiScore >= 80) autoBonus = 100000;

      // Auto Deduction calculation (includes approved cash advances!)
      const autoDeduction = advanceMap.get(st.id) || 0;

      const att = attendanceStatsMap.get(st.id);

      return {
        staffId: st.id,
        name: st.name,
        role: st.role,
        outletId: st.outletId,
        kpiScore,

        // Statistik absensi periode (display & verifikasi payroll)
        presentDays: att?.presentDays ?? 0,
        workedMinutes: att?.workedMinutes ?? 0,
        workedHoursLabel: att ? formatWorkedHours(att.workedMinutes) : "0j 0m",
        lateCount: att?.lateCount ?? 0,
        earlyLeaveCount: att?.earlyLeaveCount ?? 0,
        unpairedCount: att?.unpairedCount ?? 0,
        
        // Master Configs
        masterBaseSalary: masterSal?.baseSalary ?? 0,
        masterAllowance: masterSal?.allowance ?? 0,

        // Monthly payroll dynamic stats
        baseSalary: savedPay?.baseSalary ?? baseSalary,
        allowance: savedPay?.allowance ?? allowance,
        bonus: savedPay ? savedPay.bonus : autoBonus,
        deduction: savedPay ? savedPay.deduction : autoDeduction,
        netSalary: savedPay ? savedPay.netSalary : (baseSalary + allowance + autoBonus - autoDeduction),
        status: savedPay?.status ?? "draft",
        paidAt: savedPay?.paidAt ?? null,
        notes: savedPay?.notes ?? "",
        payrollId: savedPay?.id ?? null,
        
        // Default suggestions
        suggestedBonus: autoBonus,
        suggestedDeduction: autoDeduction,
      };
    });

    return NextResponse.json({ payrolls: payrollList });
  } catch (error) {
    console.error("Failed to fetch payroll data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await requirePermission("finance:write");
    if (session.response) return session.response;

    const body = await req.json();
    const { action } = body;

    const db = await getDb();

    if (action === "save_base_salary") {
      const { staffId, baseSalary, allowance } = body;

      if (!staffId || baseSalary === undefined || allowance === undefined) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }

      // Check if master salary already exists
      const [existing] = await db
        .select()
        .from(staffSalaries)
        .where(eq(staffSalaries.staffId, staffId))
        .limit(1);

      if (existing) {
        await db
          .update(staffSalaries)
          .set({
            baseSalary: parseInt(baseSalary),
            allowance: parseInt(allowance),
            updatedAt: new Date(),
          })
          .where(eq(staffSalaries.id, existing.id));
      } else {
        await db.insert(staffSalaries).values({
          staffId,
          baseSalary: parseInt(baseSalary),
          allowance: parseInt(allowance),
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "save_monthly_payroll") {
      const { staffId, period, baseSalary, allowance, bonus, deduction, notes } = body;

      if (!staffId || !period || baseSalary === undefined || allowance === undefined || bonus === undefined || deduction === undefined) {
        return NextResponse.json({ error: "Missing required fields for payroll record" }, { status: 400 });
      }

      const intBase = parseInt(baseSalary);
      const intAllow = parseInt(allowance);
      const intBonus = parseInt(bonus);
      const intDeduct = parseInt(deduction);
      const netSalary = (intBase + intAllow + intBonus) - intDeduct;

      // Check if monthly record already exists
      const [existing] = await db
        .select()
        .from(staffPayrolls)
        .where(
          and(
            eq(staffPayrolls.staffId, staffId),
            eq(staffPayrolls.period, period)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(staffPayrolls)
          .set({
            baseSalary: intBase,
            allowance: intAllow,
            bonus: intBonus,
            deduction: intDeduct,
            netSalary,
            notes: notes || null,
            updatedAt: new Date(),
          })
          .where(eq(staffPayrolls.id, existing.id));
      } else {
        await db.insert(staffPayrolls).values({
          staffId,
          period,
          baseSalary: intBase,
          allowance: intAllow,
          bonus: intBonus,
          deduction: intDeduct,
          netSalary,
          status: "draft",
          notes: notes || null,
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "pay_salary") {
      const { staffId, period } = body;

      if (!staffId || !period) {
        return NextResponse.json({ error: "Missing required fields for paying salary" }, { status: 400 });
      }

      // Check if monthly record exists
      const [existing] = await db
        .select()
        .from(staffPayrolls)
        .where(
          and(
            eq(staffPayrolls.staffId, staffId),
            eq(staffPayrolls.period, period)
          )
        )
        .limit(1);

      if (existing) {
        await db
          .update(staffPayrolls)
          .set({
            status: "paid",
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(staffPayrolls.id, existing.id));
      } else {
        // If not saved yet, we'll query master config and fetch it first
        const [masterSal] = await db
          .select()
          .from(staffSalaries)
          .where(eq(staffSalaries.staffId, staffId))
          .limit(1);

        const baseSalary = masterSal?.baseSalary ?? 2500000;
        const allowance = masterSal?.allowance ?? 300000;
        const netSalary = baseSalary + allowance;

        await db.insert(staffPayrolls).values({
          staffId,
          period,
          baseSalary,
          allowance,
          bonus: 0,
          deduction: 0,
          netSalary,
          status: "paid",
          paidAt: new Date(),
        });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Failed to manage payroll:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
