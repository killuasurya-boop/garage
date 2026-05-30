import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/garage/admin/admin-shell";
import { PermissionMatrix } from "@/components/garage/admin/permission-matrix";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — Permission Matrix",
  description: "Visualisasi role & permission untuk seluruh staff Garage.",
};

export default async function PermissionMatrixPage() {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fcontrol%2Fpermissions");
    }
    redirect("/os?module=dashboard");
  }

  return (
    <AdminShell currentPath="/control/permissions">
      <PermissionMatrix />
    </AdminShell>
  );
}
