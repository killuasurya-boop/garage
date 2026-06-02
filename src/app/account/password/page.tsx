import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PasswordChangePanel } from "@/components/garage/admin/password-change-panel";
import { requireGarageSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "GARAGE - Ganti Password",
  description: "Ganti password akun staff Garage.",
};

// Halaman ini membaca session/DB saat render → jangan di-prerender statis
// (build harus tetap jalan tanpa koneksi DB live).
export const dynamic = "force-dynamic";

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ required?: string | string[] }>;
}) {
  const session = await requireGarageSession();
  if (session.response) {
    redirect("/login?next=%2Faccount%2Fpassword");
  }

  const requiredParam = (await searchParams).required;
  const required = Array.isArray(requiredParam)
    ? requiredParam[0] === "1"
    : requiredParam === "1" || session.data.profile.passwordResetRequired;

  return <PasswordChangePanel required={required} />;
}
