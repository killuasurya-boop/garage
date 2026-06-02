import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/garage/admin/admin-shell";
import { UserManagement } from "@/components/garage/admin/user-management";
import { listAdminUsers } from "@/lib/admin-user-service";
import { listOutlets } from "@/lib/garage-service";
import { requireGarageSession } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — User Management",
  description: "Master kontrol user, role, sesi login, dan akses staff.",
};

export default async function AdminUsersPage() {
  const session = await requireGarageSession(["Owner / CEO", "Admin"]);
  if (session.response) {
    if (session.response.status === 401) {
      redirect("/login?next=%2Fcontrol%2Fusers");
    }
    redirect("/os?module=dashboard");
  }

  const [initial, outlets] = await Promise.all([
    listAdminUsers({ limit: 100 }),
    listOutlets(),
  ]);

  return (
    <AdminShell currentPath="/control/users">
      <UserManagement
        initialRows={initial.rows}
        initialTotal={initial.total}
        outlets={outlets.map((outlet) => ({
          id: outlet.id,
          code: outlet.code,
          name: outlet.name,
        }))}
        currentUserId={session.data.user.id}
        currentUserRole={session.data.profile.role}
      />
    </AdminShell>
  );
}
