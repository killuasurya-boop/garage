"use client";

import Link from "next/link";
import {
  ArrowRight,
  Activity,
  Clock,
  Gauge,
  KeyRound,
  Palette,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type HubStats = {
  totalStaff: number;
  activeSessions: number;
  suspendedAccounts: number;
  recentAuditCount24h: number;
};

type Props = {
  stats: HubStats;
  currentUser: { name: string; role: string };
};

const MODULES = [
  {
    href: "/control/users",
    title: "User Management",
    description:
      "Tambah, edit, suspend, dan reset password staff. Bulk action + session viewer per user.",
    icon: Users,
    accent: "from-red-500 to-amber-500",
    badge: "Master",
  },
  {
    href: "/control/permissions",
    title: "Permission Matrix",
    description:
      "Visualisasi role × capability + module access. 30+ permission, 14 role, type-safe.",
    icon: KeyRound,
    accent: "from-emerald-500 to-cyan-500",
    badge: "Read-only",
  },
  {
    href: "/control/themes",
    title: "Theme Engine",
    description:
      "6 preset enterprise + custom color picker + UI tweaks + live preview multi-device.",
    icon: Palette,
    accent: "from-purple-500 to-pink-500",
    badge: "Premium",
  },
  // Pengaturan Sistem digabung ke modul Pengaturan di /os
  // (toggle scope: Outlet vs Global Sistem). Card di hub dihapus.
  {
    href: "/control/security",
    title: "Security Center",
    description:
      "Sesi aktif org-wide, audit trail, emergency force-logout, security policy view.",
    icon: ShieldCheck,
    accent: "from-rose-500 to-red-600",
    badge: "Live",
  },
  {
    href: "/control/2fa",
    title: "Two-Factor Auth",
    description:
      "Aktifkan TOTP untuk akun lo. Compatible dengan Google Authenticator, 1Password, Authy.",
    icon: Smartphone,
    accent: "from-indigo-500 to-blue-600",
    badge: "Personal",
  },
  {
    href: "/control/health",
    title: "System Health",
    description:
      "DB integrity, recent activity, backup guide, dan production-deploy checklist auto-detect.",
    icon: Gauge,
    accent: "from-teal-500 to-emerald-600",
    badge: "Critical",
  },
];

export function AdminHub({ stats, currentUser }: Props) {
  return (
    <div className="px-4 py-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--primary)]">
              <Sparkles className="h-3.5 w-3.5" />
              Garage Control · Admin Hub
            </div>
            <h1 className="mt-2 text-3xl font-semibold">
              Selamat datang, {currentUser.name.split(" ")[0]}
            </h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Pusat kontrol Garage OS — user, role, theme, settings, dan security.
              Login sebagai <span className="font-semibold">{currentUser.role}</span>.
            </p>
          </div>
        </header>

        {/* Quick stats */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Total Staff"
            value={stats.totalStaff}
            hint="Akun terdaftar"
            href="/control/users"
          />
          <StatCard
            icon={Activity}
            label="Sesi Aktif"
            value={stats.activeSessions}
            hint="Sedang login"
            href="/control/security"
            accent="emerald"
          />
          <StatCard
            icon={ShieldCheck}
            label="Suspended"
            value={stats.suspendedAccounts}
            hint="Akun dinonaktifkan"
            href="/control/users?status=suspended"
            accent={stats.suspendedAccounts > 0 ? "rose" : "zinc"}
          />
          <StatCard
            icon={Clock}
            label="Audit 24h"
            value={stats.recentAuditCount24h}
            hint="Event tercatat"
            href="/control/security"
            accent="amber"
          />
        </div>

        {/* Modules grid */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Modul Admin</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {MODULES.map((module) => {
              const Icon = module.icon;
              return (
                <Link
                  key={module.href}
                  href={module.href}
                  className="group relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 transition hover:border-[var(--primary)] hover:shadow-lg"
                >
                  <div
                    className={`absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${module.accent} opacity-10 blur-2xl transition group-hover:opacity-20`}
                  />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br ${module.accent}`}
                      >
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <Badge
                        variant="outline"
                        className="border-[var(--border)] text-[10px] uppercase tracking-wider"
                      >
                        {module.badge}
                      </Badge>
                    </div>
                    <h3 className="mt-3 text-base font-semibold">
                      {module.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
                      {module.description}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-medium text-[var(--primary)] opacity-0 transition group-hover:opacity-100">
                      Buka modul <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Tips */}
        <Card className="border-[var(--border)] bg-[var(--card)]">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent), var(--primary))",
                }}
              >
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Tips untuk admin baru</h3>
                <ul className="mt-2 space-y-1 text-xs text-[var(--muted-foreground)]">
                  <li>
                    • Mulai dari{" "}
                    <Link
                      href="/control/users"
                      className="text-[var(--primary)] hover:underline"
                    >
                      User Management
                    </Link>{" "}
                    untuk assign role ke staff baru.
                  </li>
                  <li>
                    • Cek{" "}
                    <Link
                      href="/control/permissions"
                      className="text-[var(--primary)] hover:underline"
                    >
                      Permission Matrix
                    </Link>{" "}
                    untuk paham siapa bisa apa.
                  </li>
                  <li>
                    • Custom tampilan via{" "}
                    <Link
                      href="/control/themes"
                      className="text-[var(--primary)] hover:underline"
                    >
                      Theme Engine
                    </Link>{" "}
                    — pilih dari 6 preset atau bikin sendiri.
                  </li>
                  <li>
                    • Konfigurasi tax, receipt, dan notifikasi di{" "}
                    <Link
                      href="/os?module=settings&scope=global"
                      className="text-[var(--primary)] hover:underline"
                    >
                      Pengaturan → Global Sistem
                    </Link>
                    .
                  </li>
                  <li>
                    • Saat insiden keamanan, gunakan{" "}
                    <Link
                      href="/control/security"
                      className="text-[var(--primary)] hover:underline"
                    >
                      Emergency Logout
                    </Link>
                    {" "}untuk revoke semua sesi.
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  accent = "zinc",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  hint: string;
  href: string;
  accent?: "zinc" | "emerald" | "rose" | "amber";
}) {
  const accentClass = {
    zinc: "text-zinc-300",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
  }[accent];
  return (
    <Link
      href={href}
      className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--primary)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${accentClass}`} />
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      <div className="text-xs text-[var(--muted-foreground)]">{hint}</div>
    </Link>
  );
}
