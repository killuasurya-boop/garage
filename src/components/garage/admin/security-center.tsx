"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Eye,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserX,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { LoginAttemptRow } from "@/lib/garage-login-attempts-service";
import type {
  ActiveSessionRow,
  SecurityAuditRow,
  SecurityOverview,
} from "@/lib/garage-security-service";

type SettingValue = string | number | boolean;

type LoginStats = {
  totalAttempts: number;
  failedAttempts: number;
  successAttempts: number;
  uniqueEmails: number;
  lockedNow: number;
};

type Props = {
  initialOverview: SecurityOverview;
  initialSessions: ActiveSessionRow[];
  initialAuditLogs: SecurityAuditRow[];
  securitySettings: Record<string, SettingValue>;
  loginStats: LoginStats;
  loginAttempts: LoginAttemptRow[];
  currentUserId: string;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/mobile/i.test(ua)) {
    if (/iphone|ipad/i.test(ua)) return "iOS";
    if (/android/i.test(ua)) return "Android";
    return "Mobile";
  }
  if (/macintosh/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows";
  if (/linux/i.test(ua)) return "Linux";
  return "Desktop";
}

export function SecurityCenter({
  initialOverview,
  initialSessions,
  initialAuditLogs,
  securitySettings,
  loginStats,
  loginAttempts,
  currentUserId,
}: Props) {
  const [overview, setOverview] = useState(initialOverview);
  const [sessions, setSessions] = useState(initialSessions);
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs);
  const [attempts] = useState(loginAttempts);
  const [loginStatsState] = useState(loginStats);
  const [query, setQuery] = useState("");
  const [auditFilter, setAuditFilter] = useState<"all" | "user" | "security">("all");
  const [refreshing, startRefresh] = useTransition();
  const [showEmergency, setShowEmergency] = useState(false);
  const [emergencyPreserveSelf, setEmergencyPreserveSelf] = useState(true);
  const [emergencyReason, setEmergencyReason] = useState("");
  const [emergencyRunning, setEmergencyRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const stats = [
    {
      key: "active",
      icon: Activity,
      label: "Sesi Aktif",
      value: overview.activeSessions,
      tone: "emerald",
      hint: `${overview.recentLoginCount24h} login dalam 24 jam`,
    },
    {
      key: "staff",
      icon: Users,
      label: "Total Staff",
      value: overview.totalStaff,
      tone: "zinc",
      hint: "Akun terdaftar di Garage OS",
    },
    {
      key: "suspended",
      icon: ShieldAlert,
      label: "Suspended",
      value: overview.suspendedAccounts,
      tone: "rose",
      hint: "Akun dinonaktifkan admin",
    },
    {
      key: "audit",
      icon: Eye,
      label: "Audit Events 24h",
      value: overview.recentAuditCount24h,
      tone: "amber",
      hint: "Aktivitas tercatat",
    },
  ];

  const filteredAudit = useMemo(() => {
    let rows = auditLogs;
    if (auditFilter === "user") rows = rows.filter((r) => r.action.startsWith("user."));
    if (auditFilter === "security") {
      rows = rows.filter(
        (r) => r.action.startsWith("security.") || r.action.includes("login"),
      );
    }
    if (query) {
      const lower = query.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.actor.toLowerCase().includes(lower) ||
          r.action.toLowerCase().includes(lower) ||
          r.object.toLowerCase().includes(lower),
      );
    }
    return rows;
  }, [auditLogs, auditFilter, query]);

  function refresh() {
    startRefresh(async () => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      const res = await fetch(`/api/admin/security/overview?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Gagal refresh data.");
        return;
      }
      setOverview(json.data.overview);
      setSessions(json.data.sessions);
      setAuditLogs(json.data.auditLogs);
      setError(null);
    });
  }

  async function runEmergencyLogout() {
    setEmergencyRunning(true);
    setError(null);
    const res = await fetch("/api/admin/security/force-logout-all", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        preserveSelf: emergencyPreserveSelf,
        reason: emergencyReason || undefined,
      }),
    });
    const json = await res.json();
    setEmergencyRunning(false);
    if (!res.ok) {
      setError(json?.error?.message ?? "Emergency logout gagal.");
      return;
    }
    setSuccess(`${json.data.revoked} sesi di-revoke.`);
    setShowEmergency(false);
    setEmergencyReason("");
    refresh();
  }

  return (
    <div className="px-4 py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--primary)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Garage Control · Security Center
            </div>
            <h1 className="mt-2 text-3xl font-semibold">Security Operations</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Active sessions, audit trail, dan emergency control untuk seluruh organisasi.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={refresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
            <Button
              onClick={() => setShowEmergency(true)}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              <Siren className="mr-2 h-4 w-4" /> Emergency Logout
            </Button>
          </div>
        </header>

        {error ? (
          <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
            {success}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card
                key={stat.key}
                className="border-[var(--border)] bg-[var(--card)]"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                      {stat.label}
                    </span>
                    <Icon className="h-4 w-4 text-[var(--primary)]" />
                  </div>
                  <div className="mt-2 text-3xl font-bold">{stat.value}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {stat.hint}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="border-[var(--border)] bg-[var(--card)]">
          <CardHeader>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Clock className="h-4 w-4 text-[var(--primary)]" />
              Security Policy Aktif
            </h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Konfigurasi dari{" "}
              <a
                href="/os?module=settings&scope=global"
                className="text-[var(--primary)] underline-offset-2 hover:underline"
              >
                Pengaturan → Global Sistem
              </a>{" "}
              → kategori Security.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <PolicyChip
                label="Sesi max"
                value={`${securitySettings["securitySessionMaxHours"] ?? "—"} jam`}
              />
              <PolicyChip
                label="Idle logout"
                value={
                  Number(securitySettings["securityIdleLogoutMinutes"]) > 0
                    ? `${securitySettings["securityIdleLogoutMinutes"]} menit`
                    : "Off"
                }
              />
              <PolicyChip
                label="Lockout setelah"
                value={`${securitySettings["securityFailedLoginLockoutCount"] ?? "—"} gagal`}
              />
              <PolicyChip
                label="Durasi lockout"
                value={`${securitySettings["securityLockoutDurationMinutes"] ?? "—"} menit`}
              />
              <PolicyChip
                label="2FA Owner/Admin"
                value={securitySettings["securityRequire2faForOwner"] ? "Wajib" : "Optional"}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--border)] bg-[var(--card)]">
          <CardHeader>
            <Tabs defaultValue="sessions">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <TabsList className="bg-[var(--secondary)]">
                  <TabsTrigger value="sessions">
                    Sesi Aktif ({sessions.length})
                  </TabsTrigger>
                  <TabsTrigger value="login">
                    Login Attempts ({attempts.length})
                  </TabsTrigger>
                  <TabsTrigger value="audit">
                    Audit Trail ({filteredAudit.length})
                  </TabsTrigger>
                </TabsList>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Cari user / aksi…"
                      className="w-60 border-[var(--border)] bg-[var(--background)] pl-9"
                    />
                  </div>
                </div>
              </div>

              <TabsContent value="sessions" className="mt-4">
                <ActiveSessionsTable
                  sessions={sessions}
                  query={query}
                  currentUserId={currentUserId}
                />
              </TabsContent>
              <TabsContent value="login" className="mt-4">
                <LoginAttemptsPanel attempts={attempts} stats={loginStatsState} query={query} />
              </TabsContent>
              <TabsContent value="audit" className="mt-4">
                <div className="mb-3 flex gap-2">
                  {(["all", "user", "security"] as const).map((key) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={auditFilter === key ? "default" : "outline"}
                      onClick={() => setAuditFilter(key)}
                      className={
                        auditFilter === key ? "bg-[var(--primary)] text-white" : ""
                      }
                    >
                      {key === "all"
                        ? "Semua"
                        : key === "user"
                          ? "User Management"
                          : "Security"}
                    </Button>
                  ))}
                </div>
                <AuditTable rows={filteredAudit} />
              </TabsContent>
            </Tabs>
          </CardHeader>
        </Card>
      </div>

      <Dialog open={showEmergency} onOpenChange={setShowEmergency}>
        <DialogContent className="max-w-md border-rose-900 bg-[var(--card)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              Emergency Force Logout
            </DialogTitle>
            <DialogDescription className="text-[var(--muted-foreground)]">
              Akan revoke semua sesi login aktif di seluruh organisasi. Pakai untuk
              insiden keamanan (akun bocor, device hilang, dll). Tidak bisa di-undo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--popover)] p-3">
              <input
                type="checkbox"
                checked={emergencyPreserveSelf}
                onChange={(event) => setEmergencyPreserveSelf(event.target.checked)}
                className="h-4 w-4 accent-rose-500"
              />
              <div>
                <div className="text-sm font-medium">Preserve sesi saya</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  Recommended — biar lo tetap login & bisa monitor recovery.
                </div>
              </div>
            </label>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Alasan (untuk audit log)
              </label>
              <Input
                value={emergencyReason}
                onChange={(event) => setEmergencyReason(event.target.value)}
                placeholder="cth: deteksi credential leak"
                className="mt-1 border-[var(--border)] bg-[var(--background)]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmergency(false)}>
              Batal
            </Button>
            <Button
              onClick={runEmergencyLogout}
              disabled={emergencyRunning}
              className="bg-rose-600 hover:bg-rose-500"
            >
              {emergencyRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Siren className="mr-2 h-4 w-4" />
              )}
              Confirm Emergency Logout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PolicyChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--popover)] p-3">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-0.5 font-semibold text-[var(--foreground)]">{value}</div>
    </div>
  );
}

function ActiveSessionsTable({
  sessions,
  query,
  currentUserId,
}: {
  sessions: ActiveSessionRow[];
  query: string;
  currentUserId: string;
}) {
  const filtered = useMemo(() => {
    if (!query) return sessions;
    const lower = query.toLowerCase();
    return sessions.filter(
      (s) =>
        s.userEmail.toLowerCase().includes(lower) ||
        s.userName.toLowerCase().includes(lower) ||
        s.role.toLowerCase().includes(lower) ||
        (s.ipAddress ?? "").includes(lower),
    );
  }, [sessions, query]);

  if (!filtered.length) {
    return (
      <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
        Tidak ada sesi aktif sesuai filter.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border)]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Login at</TableHead>
            <TableHead>Expires</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((session) => (
            <TableRow key={session.sessionId}>
              <TableCell>
                <div className="font-medium">
                  {session.userName}
                  {session.userId === currentUserId ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">
                      (anda)
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">
                  {session.userEmail}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="border-[var(--border)] text-xs">
                  {session.role}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="text-sm">{parseUserAgent(session.userAgent)}</div>
                <div
                  className="max-w-[220px] truncate text-[10px] text-[var(--muted-foreground)]"
                  title={session.userAgent ?? ""}
                >
                  {session.userAgent ?? "—"}
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {session.ipAddress ?? "—"}
              </TableCell>
              <TableCell className="text-xs">{formatDate(session.createdAt)}</TableCell>
              <TableCell className="text-xs">{formatDate(session.expiresAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LoginAttemptsPanel({
  attempts,
  stats,
  query,
}: {
  attempts: LoginAttemptRow[];
  stats: LoginStats;
  query: string;
}) {
  const filtered = useMemo(() => {
    if (!query) return attempts;
    const lower = query.toLowerCase();
    return attempts.filter(
      (a) =>
        a.email.toLowerCase().includes(lower) ||
        (a.ipAddress ?? "").includes(lower) ||
        (a.failureReason ?? "").toLowerCase().includes(lower),
    );
  }, [attempts, query]);

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <MicroStat label="Total 24h" value={stats.totalAttempts} icon={Activity} />
        <MicroStat
          label="Sukses"
          value={stats.successAttempts}
          icon={ShieldCheck}
          tone="emerald"
        />
        <MicroStat
          label="Gagal"
          value={stats.failedAttempts}
          icon={UserX}
          tone="rose"
        />
        <MicroStat label="Email unik" value={stats.uniqueEmails} icon={Users} />
        <MicroStat
          label="Locked"
          value={stats.lockedNow}
          icon={Lock}
          tone={stats.lockedNow > 0 ? "rose" : "zinc"}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          Belum ada login attempt yang cocok.
        </div>
      ) : (
        <div className="max-h-[600px] overflow-auto rounded-md border border-[var(--border)]">
          <Table>
            <TableHeader>
              <TableRow className="bg-[var(--popover)]">
                <TableHead>Waktu</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {formatDate(row.attemptedAt)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.email}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.ipAddress ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {parseUserAgent(row.userAgent)}
                  </TableCell>
                  <TableCell>
                    {row.success ? (
                      <Badge className="border-emerald-700 bg-emerald-950/40 text-[10px] text-emerald-300">
                        Sukses
                      </Badge>
                    ) : (
                      <Badge className="border-rose-700 bg-rose-950/40 text-[10px] text-rose-300">
                        Gagal
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className="max-w-[220px] truncate text-[11px] text-[var(--muted-foreground)]"
                    title={row.failureReason ?? ""}
                  >
                    {row.failureReason ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function MicroStat({
  label,
  value,
  icon: Icon,
  tone = "zinc",
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  tone?: "zinc" | "emerald" | "rose";
}) {
  const toneClass = {
    zinc: "text-[var(--foreground)]",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
  }[tone];
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--popover)] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
          {label}
        </span>
        <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
      </div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}

function AuditTable({ rows }: { rows: SecurityAuditRow[] }) {
  if (!rows.length) {
    return (
      <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
        Belum ada audit event yang cocok.
      </div>
    );
  }

  return (
    <div className="max-h-[600px] overflow-auto rounded-md border border-[var(--border)]">
      <Table>
        <TableHeader>
          <TableRow className="bg-[var(--popover)]">
            <TableHead>Waktu</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Object</TableHead>
            <TableHead>Device</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-xs">
                {formatDate(row.createdAt)}
              </TableCell>
              <TableCell className="text-sm font-medium">{row.actor}</TableCell>
              <TableCell>
                <code className="rounded bg-[var(--popover)] px-1.5 py-0.5 text-[11px]">
                  {row.action}
                </code>
              </TableCell>
              <TableCell
                className="max-w-[220px] truncate font-mono text-[11px] text-[var(--muted-foreground)]"
                title={row.object}
              >
                {row.object}
              </TableCell>
              <TableCell className="text-xs">{row.device}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    row.status === "ok"
                      ? "border-emerald-700 bg-emerald-950/40 text-[10px] text-emerald-300"
                      : "border-rose-700 bg-rose-950/40 text-[10px] text-rose-300"
                  }
                >
                  {row.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
