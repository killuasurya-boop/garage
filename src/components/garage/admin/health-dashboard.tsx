"use client";

import { useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Gauge,
  HardDrive,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Table as TableIcon,
  Terminal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import type { SystemHealth } from "@/lib/garage-health-service";

type BackupGuide = {
  manualCommand: string;
  scheduledCronExample: string;
  restoreCommand: string;
};

type Props = {
  initialHealth: SystemHealth;
  backupGuide: BackupGuide;
};

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("id-ID");
}

export function HealthDashboard({ initialHealth, backupGuide }: Props) {
  const [health, setHealth] = useState(initialHealth);
  const [refreshing, startRefresh] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  function refresh() {
    startRefresh(async () => {
      const res = await fetch("/api/admin/health", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setHealth(json.data.health);
    });
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  const dbStatusColor = health.database.connectionOk ? "emerald" : "rose";
  const overallStatusBadge = health.ok ? (
    <Badge className="border-emerald-700 bg-emerald-950/60 text-emerald-300">
      <CheckCircle2 className="mr-1 h-3 w-3" /> System Healthy
    </Badge>
  ) : (
    <Badge className="border-amber-700 bg-amber-950/60 text-amber-300">
      <AlertTriangle className="mr-1 h-3 w-3" /> {health.warnings.length} Warning
    </Badge>
  );

  return (
    <div className="px-4 py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--primary)]">
              <Gauge className="h-3.5 w-3.5" />
              Garage Control · System Health
            </div>
            <h1 className="mt-2 text-3xl font-semibold">Health & Pre-Deploy Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Database integrity, recent activity, dan production readiness checklist.
              Cek di sini sebelum deploy + monitoring rutin.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {overallStatusBadge}
            <Button variant="outline" onClick={refresh} disabled={refreshing}>
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </header>

        {/* Warnings */}
        {health.warnings.length > 0 ? (
          <Card className="border-amber-800 bg-amber-950/30">
            <CardContent className="p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                {health.warnings.length} Warning{health.warnings.length > 1 ? "s" : ""}
              </div>
              <ul className="space-y-1 text-xs text-amber-200/90">
                {health.warnings.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {/* Top stat cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Database}
            label="Database"
            value={health.database.connectionOk ? "Connected" : "Disconnected"}
            hint={
              health.database.version
                ? health.database.version.slice(0, 30)
                : health.database.error ?? "—"
            }
            tone={dbStatusColor as "emerald" | "rose"}
          />
          <StatCard
            icon={HardDrive}
            label="DB Size"
            value={health.database.sizePretty ?? "—"}
            hint={`${formatBytes(health.database.sizeBytes)} total`}
          />
          <StatCard
            icon={Activity}
            label="Latency"
            value={health.database.latencyMs !== null ? `${health.database.latencyMs}ms` : "—"}
            hint="DB query roundtrip"
            tone={
              health.database.latencyMs && health.database.latencyMs > 500
                ? "amber"
                : "emerald"
            }
          />
          <StatCard
            icon={ShieldAlert}
            label="Active Sessions"
            value={formatNumber(health.recentActivity.activeSessions)}
            hint={`${formatNumber(health.recentActivity.ordersLast24h)} order, ${formatNumber(health.recentActivity.auditLogsLast24h)} audit (24h)`}
          />
        </div>

        <Tabs defaultValue="tables">
          <TabsList className="bg-[var(--secondary)]">
            <TabsTrigger value="tables">Tables ({health.tables.length})</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
            <TabsTrigger value="checklist">Production Checklist</TabsTrigger>
          </TabsList>

          {/* TABLES TAB */}
          <TabsContent value="tables" className="mt-4">
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <TableIcon className="h-4 w-4 text-[var(--primary)]" />
                  Critical Tables
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Row count & disk size per tabel kritikal. Pakai buat detect anomali
                  (cth: tabel orders harus tumbuh, audit_logs growing slowly OK).
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-md border border-[var(--border)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Table</TableHead>
                        <TableHead className="text-right">Rows</TableHead>
                        <TableHead className="text-right">Size on Disk</TableHead>
                        <TableHead className="text-right">Bytes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {health.tables.map((row) => (
                        <TableRow key={row.name}>
                          <TableCell className="font-mono text-xs">{row.name}</TableCell>
                          <TableCell className="text-right">
                            {formatNumber(row.rowCount)}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {row.sizePretty}
                          </TableCell>
                          <TableCell className="text-right font-mono text-[10px] text-[var(--muted-foreground)]">
                            {formatNumber(row.sizeBytes)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CONFIG TAB */}
          <TabsContent value="config" className="mt-4">
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="text-lg font-semibold">Environment Configuration</h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Status environment variable kritikal. Item dengan ✗ harus di-set
                  sebelum deploy.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <ConfigRow
                    label="NODE_ENV"
                    value={health.configuration.nodeEnv}
                    ok={health.configuration.nodeEnv === "production"}
                    hint="Set ke 'production' saat deploy"
                  />
                  <ConfigRow
                    label="BETTER_AUTH_SECRET"
                    value={
                      health.configuration.betterAuthConfigured
                        ? "Configured (custom)"
                        : "Using dev default"
                    }
                    ok={health.configuration.betterAuthConfigured}
                    hint="Wajib custom secret untuk production"
                  />
                  <ConfigRow
                    label="DATABASE_URL"
                    value={
                      health.database.configured
                        ? "Configured"
                        : "Not set"
                    }
                    ok={health.database.configured}
                  />
                  <ConfigRow
                    label="GARAGE_SEED_PASSWORD"
                    value={
                      health.configuration.seedPasswordIsDefault
                        ? "Default 'garage12345'"
                        : "Custom"
                    }
                    ok={!health.configuration.seedPasswordIsDefault}
                    hint="Rotate sebelum production"
                  />
                  <ConfigRow
                    label="GOOGLE_DRIVE_CLIENT_ID / SECRET"
                    value={
                      health.configuration.googleDriveConfigured
                        ? "Configured"
                        : "Not set"
                    }
                    ok={health.configuration.googleDriveConfigured}
                    hint="Optional — untuk Google Drive sync"
                  />
                  <ConfigRow
                    label="POS_TERMINAL_API_KEY_PEPPER"
                    value={
                      health.configuration.posTerminalApiConfigured
                        ? "Configured"
                        : "Not set"
                    }
                    ok={health.configuration.posTerminalApiConfigured}
                    hint="Untuk POS terminal API key hashing"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* BACKUP TAB */}
          <TabsContent value="backup" className="mt-4">
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Terminal className="h-4 w-4 text-[var(--primary)]" />
                  Backup & Restore
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Garage OS pakai PostgreSQL — backup via{" "}
                  <code className="rounded bg-[var(--popover)] px-1">pg_dump</code>{" "}
                  standard. Pakai command di bawah untuk backup manual atau jadwal cron.
                  <br />
                  <strong className="text-amber-300">
                    Backup automation belum di-bundle — set up sendiri di server
                    deployment (cron + S3/GCS upload).
                  </strong>
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <BackupCommand
                  label="Manual backup (jalankan sekarang)"
                  command={backupGuide.manualCommand}
                  copied={copied === "manual"}
                  onCopy={() => copyToClipboard(backupGuide.manualCommand, "manual")}
                />
                <BackupCommand
                  label="Scheduled backup (crontab example)"
                  command={backupGuide.scheduledCronExample}
                  multiline
                  copied={copied === "cron"}
                  onCopy={() => copyToClipboard(backupGuide.scheduledCronExample, "cron")}
                />
                <BackupCommand
                  label="Restore dari backup file"
                  command={backupGuide.restoreCommand}
                  copied={copied === "restore"}
                  onCopy={() => copyToClipboard(backupGuide.restoreCommand, "restore")}
                />
                <div className="rounded-md border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-200/90">
                  <strong>Best practice:</strong>
                  <ul className="mt-1 space-y-0.5 pl-4 list-disc">
                    <li>Backup minimal harian (rentensi 7 hari) + mingguan (4 minggu)</li>
                    <li>Simpan ke external storage (S3, GCS, Backblaze B2)</li>
                    <li>Test restore minimal sekali sebulan ke staging</li>
                    <li>
                      Untuk Neon (managed Postgres) — gunakan{" "}
                      <code className="rounded bg-[var(--popover)] px-1">point-in-time recovery</code>{" "}
                      built-in
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CHECKLIST TAB */}
          <TabsContent value="checklist" className="mt-4">
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="text-lg font-semibold">Production Deploy Checklist</h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Auto-detect items berdasarkan environment + DB state. Item harus ✓
                  semua sebelum lo deploy ke production.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <ChecklistItem
                    ok={health.database.connectionOk}
                    label="Database connection working"
                  />
                  <ChecklistItem
                    ok={health.configuration.betterAuthConfigured}
                    label="BETTER_AUTH_SECRET set (custom, bukan dev default)"
                  />
                  <ChecklistItem
                    ok={!health.configuration.seedPasswordIsDefault}
                    label="GARAGE_SEED_PASSWORD di-rotate dari default"
                  />
                  <ChecklistItem
                    ok={health.configuration.nodeEnv === "production"}
                    label="NODE_ENV = 'production'"
                  />
                  <ChecklistItem
                    ok={
                      health.database.latencyMs !== null && health.database.latencyMs < 500
                    }
                    label={`Database latency < 500ms (current: ${health.database.latencyMs ?? "—"}ms)`}
                  />
                  <ChecklistItem
                    ok={health.recentActivity.activeSessions < 100}
                    label={`Active sessions reasonable (current: ${health.recentActivity.activeSessions}; > 100 mungkin perlu cleanup)`}
                  />
                  <ChecklistItem
                    ok={health.recentActivity.loginAttemptsLast24h < 1000}
                    label={`Login attempts 24h tidak suspicious (${health.recentActivity.loginAttemptsLast24h})`}
                  />
                  <ChecklistItem
                    manual
                    label="Backup automation set up (cron + offsite storage)"
                  />
                  <ChecklistItem
                    manual
                    label="Tested restore dari backup ke staging"
                  />
                  <ChecklistItem
                    manual
                    label="Monitoring + alerting (Sentry, log aggregator, uptime check)"
                  />
                  <ChecklistItem
                    manual
                    label="HTTPS + certificate auto-renewal"
                  />
                  <ChecklistItem
                    manual
                    label="Rate limiting di reverse proxy (nginx/cloudflare)"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "zinc",
}: {
  icon: typeof Database;
  label: string;
  value: string | number;
  hint: string;
  tone?: "zinc" | "emerald" | "amber" | "rose";
}) {
  const accent = {
    zinc: "text-[var(--foreground)]",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
  }[tone];
  return (
    <Card className="border-[var(--border)] bg-[var(--card)]">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
            {label}
          </span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <div className={`mt-2 text-2xl font-bold ${accent}`}>{value}</div>
        <div className="truncate text-[10px] text-[var(--muted-foreground)]" title={hint}>
          {hint}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigRow({
  label,
  value,
  ok,
  hint,
}: {
  label: string;
  value: string;
  ok: boolean;
  hint?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-md border p-3 ${
        ok
          ? "border-emerald-900/40 bg-emerald-950/20"
          : "border-rose-900/40 bg-rose-950/20"
      }`}
    >
      <div className="flex items-center gap-3">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
        )}
        <div>
          <div className="font-mono text-xs font-semibold">{label}</div>
          {hint ? (
            <div className="text-[10px] text-[var(--muted-foreground)]">{hint}</div>
          ) : null}
        </div>
      </div>
      <code className="font-mono text-xs text-[var(--muted-foreground)]">{value}</code>
    </div>
  );
}

function BackupCommand({
  label,
  command,
  copied,
  multiline,
  onCopy,
}: {
  label: string;
  command: string;
  copied: boolean;
  multiline?: boolean;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {label}
        </span>
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7">
          {copied ? (
            <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="mr-1 h-3 w-3" />
          )}
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <pre
        className={`rounded-md border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-[11px] text-[var(--foreground)] ${
          multiline ? "whitespace-pre-wrap" : "overflow-x-auto"
        }`}
      >
        {command}
      </pre>
    </div>
  );
}

function ChecklistItem({
  ok,
  manual,
  label,
}: {
  ok?: boolean;
  manual?: boolean;
  label: string;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-md border p-3 ${
        manual
          ? "border-zinc-700 bg-[var(--popover)]"
          : ok
            ? "border-emerald-900/40 bg-emerald-950/20"
            : "border-rose-900/40 bg-rose-950/20"
      }`}
    >
      {manual ? (
        <div className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-zinc-600" />
      ) : ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      )}
      <div className="text-sm">{label}</div>
      {manual ? (
        <Badge
          variant="outline"
          className="ml-auto border-zinc-700 text-[10px] text-zinc-400"
        >
          manual check
        </Badge>
      ) : null}
    </div>
  );
}
