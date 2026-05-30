import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "GARAGE — Pengaturan Sistem",
  description: "Konfigurasi global Garage OS — POS, receipt, tax, security, AI, dll.",
};

/**
 * `/control/settings` sudah dikonsolidasi ke modul Pengaturan di `/os`.
 * Halaman ini tetap ada sebagai redirect supaya bookmark / link lama tidak
 * 404. Server auth (requireGarageSession) dilakukan di tujuan akhir
 * (`/os?module=settings`) sehingga login flow tidak berubah.
 */
export default function SystemSettingsPage() {
  redirect("/os?module=settings&scope=global");
}
