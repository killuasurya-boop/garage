import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { staffPayrolls, staffProfiles, user, outlets } from "@/db/schema";
import { requirePermission } from "@/lib/server-auth";
import { and, eq } from "drizzle-orm";
import { generatePayrollSlipPdf } from "@/lib/garage-payroll-pdf";

export async function GET(req: Request) {
  try {
    const session = await requirePermission("finance:read");
    if (session.response) return session.response;

    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get("staffId");
    const period = searchParams.get("period");

    if (!staffId || !period) {
      return NextResponse.json({ error: "Missing staffId or period" }, { status: 400 });
    }

    const db = await getDb();

    // Query payroll record joined with staff profile, user name, and outlet name
    const [payroll] = await db
      .select({
        id: staffPayrolls.id,
        period: staffPayrolls.period,
        baseSalary: staffPayrolls.baseSalary,
        allowance: staffPayrolls.allowance,
        bonus: staffPayrolls.bonus,
        deduction: staffPayrolls.deduction,
        netSalary: staffPayrolls.netSalary,
        status: staffPayrolls.status,
        paidAt: staffPayrolls.paidAt,
        notes: staffPayrolls.notes,
        name: user.name,
        email: user.email,
        role: staffProfiles.role,
        division: staffProfiles.division,
        position: staffProfiles.position,
        outletName: outlets.name,
      })
      .from(staffPayrolls)
      .innerJoin(staffProfiles, eq(staffPayrolls.staffId, staffProfiles.id))
      .innerJoin(user, eq(staffProfiles.userId, user.id))
      .innerJoin(outlets, eq(staffProfiles.outletId, outlets.id))
      .where(
        and(
          eq(staffPayrolls.staffId, staffId),
          eq(staffPayrolls.period, period)
        )
      )
      .limit(1);

    if (!payroll) {
      return NextResponse.json(
        { error: "Slip gaji tidak ditemukan. Simpan gaji karyawan ke draf terlebih dahulu." },
        { status: 404 }
      );
    }

    const pdfBuffer = await generatePayrollSlipPdf({
      name: payroll.name,
      email: payroll.email,
      role: payroll.role,
      division: payroll.division,
      position: payroll.position,
      period: payroll.period,
      baseSalary: payroll.baseSalary,
      allowance: payroll.allowance,
      bonus: payroll.bonus,
      deduction: payroll.deduction,
      netSalary: payroll.netSalary,
      status: payroll.status,
      paidAt: payroll.paidAt,
      notes: payroll.notes,
      outletName: payroll.outletName,
    });

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="slip-gaji-${payroll.name.replace(/\s+/g, "-")}-${period}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Failed to generate payroll PDF:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
