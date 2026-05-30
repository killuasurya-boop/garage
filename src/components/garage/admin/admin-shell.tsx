"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronsLeft,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Menu,
  Palette,
  ShieldCheck,
  Smartphone,
  Users,
} from "lucide-react";

import { useGarageTheme } from "@/components/garage/theme/garage-theme-provider";
import { getPreset, isThemePresetId } from "@/lib/garage-theme";

const NAV_ITEMS = [
  {
    href: "/control/admin",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Hub admin panel",
  },
  {
    href: "/control/users",
    label: "User Management",
    icon: Users,
    description: "Staff, role, sesi login",
  },
  {
    href: "/control/permissions",
    label: "Permissions",
    icon: KeyRound,
    description: "Matrix role × capability",
  },
  {
    href: "/control/themes",
    label: "Theme Engine",
    icon: Palette,
    description: "Preset + live preview",
  },
  // Pengaturan Sistem sudah dikonsolidasi ke modul Pengaturan di /os.
  // Akses cepat: /os?module=settings&scope=global.
  {
    href: "/control/security",
    label: "Security Center",
    icon: ShieldCheck,
    description: "Sesi + audit + emergency",
  },
  {
    href: "/control/2fa",
    label: "Two-Factor Auth",
    icon: Smartphone,
    description: "Aktifkan TOTP untuk akun",
  },
  {
    href: "/control/health",
    label: "System Health",
    icon: Gauge,
    description: "DB, backup, deploy checklist",
  },
];

export function AdminShell({
  currentPath,
  children,
}: {
  currentPath: string;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { theme, setPreset } = useGarageTheme();
  const themeLabel = getPreset(theme.presetId).label;

  useEffect(() => {
    let cancelled = false;

    async function syncThemeFromSettings() {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const preset = json?.data?.settings?.garageOsThemePreset;
        if (!cancelled && typeof preset === "string" && isThemePresetId(preset)) {
          setPreset(preset);
        }
      } catch {
        // Theme sync is best-effort; local/default theme remains usable.
      }
    }

    void syncThemeFromSettings();

    return () => {
      cancelled = true;
    };
  }, [setPreset]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="rounded-md p-2 hover:bg-[var(--secondary)]"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--primary)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          Garage Control
        </div>
        <div className="w-9" />
      </div>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside
          className={`sticky top-0 hidden h-screen shrink-0 border-r border-[var(--border)] bg-[var(--card)] transition-all lg:flex lg:flex-col ${
            collapsed ? "w-16" : "w-64"
          }`}
        >
          <SidebarContent
            currentPath={currentPath}
            collapsed={collapsed}
            themeLabel={themeLabel}
            onToggleCollapse={() => setCollapsed((prev) => !prev)}
          />
        </aside>

        {/* Mobile drawer */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <aside className="absolute left-0 top-0 h-full w-72 border-r border-[var(--border)] bg-[var(--card)] shadow-2xl">
              <SidebarContent
                currentPath={currentPath}
                collapsed={false}
                themeLabel={themeLabel}
                onItemClick={() => setDrawerOpen(false)}
              />
            </aside>
          </div>
        ) : null}

        {/* Main content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  currentPath,
  collapsed,
  onToggleCollapse,
  onItemClick,
  themeLabel,
}: {
  currentPath: string;
  collapsed: boolean;
  themeLabel: string;
  onToggleCollapse?: () => void;
  onItemClick?: () => void;
}) {
  return (
    <>
      <div
        className={`flex items-center gap-2 border-b border-[var(--border)] px-4 py-4 ${
          collapsed ? "justify-center" : "justify-between"
        }`}
      >
        {!collapsed ? (
          <Link
            href="/control/admin"
            onClick={onItemClick}
            className="flex items-center gap-2"
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{
                background:
                  "linear-gradient(135deg, var(--primary), var(--accent))",
              }}
            >
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold leading-tight">GARAGE</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                Control Panel
              </div>
            </div>
          </Link>
        ) : (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md"
            style={{
              background: "linear-gradient(135deg, var(--primary), var(--accent))",
            }}
          >
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
        )}
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden rounded p-1 text-[var(--muted-foreground)] hover:bg-[var(--secondary)] lg:block"
            aria-label="Toggle sidebar"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronsLeft className="h-4 w-4 rotate-180" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            currentPath === item.href ||
            (item.href !== "/control/admin" && currentPath.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 transition ${
                isActive
                  ? "bg-[var(--primary)] text-white"
                  : "text-[var(--foreground)] hover:bg-[var(--secondary)]"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed ? (
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div
                    className={`truncate text-[10px] ${
                      isActive
                        ? "opacity-80"
                        : "text-[var(--muted-foreground)]"
                    }`}
                  >
                    {item.description}
                  </div>
                </div>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {!collapsed ? (
        <div className="border-t border-[var(--border)] p-3">
          <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
              Tema aktif
            </div>
            <div className="mt-1 truncate text-xs font-semibold text-[var(--foreground)]">
              {themeLabel}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`border-t border-[var(--border)] p-3 ${
          collapsed ? "text-center" : ""
        }`}
      >
        <Link
          href="/os?module=dashboard"
          onClick={onItemClick}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-xs text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
          title={collapsed ? "Kembali ke Garage OS" : undefined}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {!collapsed ? <span>Kembali ke Garage OS</span> : null}
        </Link>
      </div>
    </>
  );
}
