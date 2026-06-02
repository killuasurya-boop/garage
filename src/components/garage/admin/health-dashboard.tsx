"use client";

import { useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Copy,
  Database,
  Gauge,
  HardDrive,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Table as TableIcon,
  Terminal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
import type { HealthSeverity, SystemHealth } from "@/lib/garage-health-service";

type BackupGuide = {
  manualCommand: string;
  scheduledCronExample: string;
  restoreCommand: string;
};

type Props = {
  initialHealth: SystemHealth;
  backupGuide: BackupGuide;
};

type AuditRun = {
  status: "pass" | "fail";
  exitCode: number | null;
  output: string;
  generatedAt: string;
};

function formatNumber(n: number): string {
  return n.toLocaleString("id-ID");
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function statusTone(status: HealthSeverity | SystemHealth["readiness"]["status"]) {
  if (status === "GO" || status === "healthy") {
    return "border-emerald-700 bg-emerald-950/60 text-emerald-300";
  }
  if (status === "CONDITIONAL_GO" || status === "watch" || status === "manual") {
    return "border-amber-700 bg-amber-950/60 text-amber-300";
  }
  return "border-rose-700 bg-rose-950/60 text-rose-300";
}

function severityLabel(status: HealthSeverity) {
  if (status === "healthy") return "Healthy";
  if (status === "watch") return "Watch";
  if (status === "critical") return "Critical";
  return "Manual";
}

export function HealthDashboard({ initialHealth, backupGuide }: Props) {
  const [health, setHealth] = useState(initialHealth);
  const [refreshing, startRefresh] = useTransition();
  const [runningAudit, startAudit] = useTransition();
  const [auditRun, setAuditRun] = useState<AuditRun | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function refresh() {
    startRefresh(async () => {
      const res = await fetch("/api/admin/health", { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setHealth(json.data.health);
    });
  }

  function runAudit() {
    startAudit(async () => {
      setAuditError(null);
      setAuditRun(null);
      try {
        const res = await fetch("/api/admin/health/readiness-audit", {
          method: "POST",
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const message = json?.error?.message ?? json?.message ?? "Readiness audit gagal dijalankan.";
          setAuditError(`${message} (HTTP ${res.status})`);
          return;
        }
        if (!json?.data) {
          setAuditError("Readiness audit tidak mengembalikan data valid.");
          return;
        }
        setAuditRun(json.data);
        if (json.data.health) {
          setHealth(json.data.health);
        } else {
          void refresh();
        }
      } catch (error) {
        setAuditError(
          error instanceof Error
            ? `Readiness audit gagal dijalankan: ${error.message}`
            : "Readiness audit gagal dijalankan.",
        );
      }
    });
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  const overallStatusBadge = (
    <Badge className={statusTone(health.readiness.status)}>
      {health.readiness.status === "GO" ? (
        <CheckCircle2 className="mr-1 h-3 w-3" />
      ) : (
        <AlertTriangle className="mr-1 h-3 w-3" />
      )}
      {health.readiness.label}
    </Badge>
  );

  return (
    <div className="px-4 py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--primary)]">
              <Gauge className="h-3.5 w-3.5" />
              Garage Control - System Health
            </div>
            <h1 className="mt-2 text-3xl font-semibold">Health & Pre-Deploy Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Readiness score, blocker queue, backup status, dan guard operasional sebelum deploy.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {overallStatusBadge}
            <Button variant="outline" onClick={runAudit} disabled={runningAudit}>
              {runningAudit ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              Run Audit
            </Button>
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

        <div className="grid gap-3 lg:grid-cols-[1.2fr_2fr]">
          <Card className="border-[var(--border)] bg-[var(--card)]">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                    Production Readiness
                  </div>
                  <div className="mt-2 flex items-end gap-2">
                    <span className="text-5xl font-bold">{health.readiness.score}</span>
                    <span className="pb-1 text-sm text-[var(--muted-foreground)]">/ 100</span>
                  </div>
                </div>
                <Badge className={statusTone(health.readiness.status)}>{health.readiness.label}</Badge>
              </div>
              <Progress value={health.readiness.score} className="mt-4 h-2" />
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <MiniMetric label="Blockers" value={health.readiness.blockers} tone="critical" />
                <MiniMetric label="Warnings" value={health.readiness.warnings} tone="watch" />
                <MiniMetric label="Generated" value={formatDateTime(health.readiness.generatedAt)} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Database}
              label="Database"
              value={health.database.connectionOk ? "Connected" : "Disconnected"}
              hint={health.database.version ? health.database.version.slice(0, 30) : health.database.error ?? "-"}
              tone={health.database.connectionOk ? "emerald" : "rose"}
            />
            <StatCard
              icon={HardDrive}
              label="Backup"
              value={health.backup.latestFile ? `${health.backup.latestAgeHours ?? "-"}h ago` : "Missing"}
              hint={health.backup.latestFile ?? health.backup.directory}
              tone={health.backup.status === "healthy" ? "emerald" : health.backup.status === "watch" ? "amber" : "rose"}
            />
            <StatCard
              icon={Activity}
              label="Latency"
              value={health.database.latencyMs !== null ? `${health.database.latencyMs}ms` : "-"}
              hint="DB query roundtrip"
              tone={health.performance.status === "critical" ? "rose" : health.performance.status === "watch" ? "amber" : "emerald"}
            />
            <StatCard
              icon={ShieldAlert}
              label="Security"
              value={severityLabel(health.security.status)}
              hint={`${formatNumber(health.security.loginAttemptsLast24h)} login attempts (24h)`}
              tone={health.security.status === "critical" ? "rose" : health.security.status === "watch" ? "amber" : "emerald"}
            />
          </div>
        </div>

        {auditError ? (
          <Card className="border-rose-800 bg-rose-950/30">
            <CardContent className="p-4 text-sm text-rose-200">{auditError}</CardContent>
          </Card>
        ) : null}

        {auditRun ? (
          <Card className={auditRun.status === "pass" ? "border-emerald-800 bg-emerald-950/20" : "border-amber-800 bg-amber-950/20"}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">
                  Readiness audit {auditRun.status === "pass" ? "PASS" : "FAILED"} - exit {auditRun.exitCode ?? "-"}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">{formatDateTime(auditRun.generatedAt)}</div>
              </div>
              <pre className="max-h-72 overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-[11px]">
                {auditRun.output || "No output"}
              </pre>
            </CardContent>
          </Card>
        ) : null}

        <Tabs defaultValue="summary">
          <TabsList className="flex h-auto flex-wrap justify-start bg-[var(--secondary)]">
            <TabsTrigger value="summary">Action Queue ({health.issueQueue.length})</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="tables">Tables ({health.tables.length})</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="backup">Backup & Restore</TabsTrigger>
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <ClipboardList className="h-4 w-4 text-[var(--primary)]" />
                  Actionable Warning Queue
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Setiap item punya severity, impact, dan tindakan teknis berikutnya.
                </p>
              </CardHeader>
              <CardContent>
                {health.issueQueue.length ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {health.issueQueue.map((issue) => (
                      <div key={issue.id} className="rounded-md border border-[var(--border)] bg-[var(--popover)] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge className={statusTone(issue.severity)}>
                                {issue.severity.toUpperCase()}
                              </Badge>
                              <span className="text-xs text-[var(--muted-foreground)]">{issue.area}</span>
                            </div>
                            <div className="mt-2 font-semibold">{issue.title}</div>
                          </div>
                          {issue.href ? (
                            <Button asChild size="sm" variant="outline">
                              <a href={issue.href}>Open</a>
                            </Button>
                          ) : null}
                        </div>
                        <p className="mt-3 text-sm text-[var(--muted-foreground)]">{issue.impact}</p>
                        <p className="mt-2 text-sm">{issue.action}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-md border border-emerald-900/40 bg-emerald-950/20 p-4 text-sm text-emerald-200">
                    Tidak ada blocker otomatis saat ini. Tetap jalankan checklist manual sebelum deploy.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-4">
            <MetricGrid
              items={[
                ["Owner/Admin tanpa 2FA", health.security.activeAdminWithout2fa, health.security.activeAdminWithout2fa > 0 ? "critical" : "healthy"],
                ["Login attempts 24h", health.security.loginAttemptsLast24h, health.security.loginAttemptsLast24h >= 1000 ? "critical" : "healthy"],
                ["Suspended staff", health.security.suspendedStaff, health.security.suspendedStaff > 5 ? "watch" : "healthy"],
                ["Unresolved errors 24h", health.security.unresolvedErrors24h, health.security.unresolvedErrors24h > 0 ? "critical" : "healthy"],
              ]}
            />
          </TabsContent>

          <TabsContent value="operations" className="mt-4">
            <MetricGrid
              items={[
                ["Pending order lewat SLA", health.operations.pendingOrdersOverSla, health.operations.pendingOrdersOverSla > 0 ? "watch" : "healthy"],
                ["Awaiting payment lewat SLA", health.operations.awaitingPaymentOverSla, health.operations.awaitingPaymentOverSla > 0 ? "watch" : "healthy"],
                ["Kitchen ticket lewat SLA", health.operations.kitchenTicketsOverSla, health.operations.kitchenTicketsOverSla > 0 ? "watch" : "healthy"],
                ["Low/critical stock", health.operations.lowStockItems, health.operations.lowStockItems > 0 ? "watch" : "healthy"],
                ["Print failed 24h", health.operations.failedPrintJobs24h, health.operations.failedPrintJobs24h > 0 ? "watch" : "healthy"],
                ["Open cash sessions", health.operations.openCashSessions, "manual"],
              ]}
            />
          </TabsContent>

          <TabsContent value="performance" className="mt-4">
            <MetricGrid
              items={[
                ["DB latency", health.performance.databaseLatencyMs !== null ? `${health.performance.databaseLatencyMs}ms` : "-", (health.performance.databaseLatencyMs ?? 0) > 1000 ? "critical" : (health.performance.databaseLatencyMs ?? 0) > 500 ? "watch" : "healthy"],
                ["Runtime errors 24h", health.performance.errorEvents24h, health.performance.errorEvents24h > 0 ? "watch" : "healthy"],
                ["Unresolved errors", health.performance.unresolvedErrors, health.performance.unresolvedErrors > 0 ? "watch" : "healthy"],
                ["Largest table", health.performance.largestTable ? `${health.performance.largestTable.name} (${health.performance.largestTable.sizePretty})` : "-", "manual"],
              ]}
            />
          </TabsContent>

          <TabsContent value="tables" className="mt-4">
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <TableIcon className="h-4 w-4 text-[var(--primary)]" />
                  Critical Tables
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Row count dan disk size untuk tabel inti.
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
                          <TableCell className="text-right">{formatNumber(row.rowCount)}</TableCell>
                          <TableCell className="text-right text-xs">{row.sizePretty}</TableCell>
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

          <TabsContent value="config" className="mt-4">
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="text-lg font-semibold">Environment Configuration</h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Status environment variable kritikal sebelum deploy.
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <ConfigRow label="NODE_ENV" value={health.configuration.nodeEnv} ok={health.configuration.nodeEnv === "production"} hint="Set ke production saat deploy" />
                  <ConfigRow label="BETTER_AUTH_SECRET" value={health.configuration.betterAuthConfigured ? "Configured (custom)" : "Using dev default"} ok={health.configuration.betterAuthConfigured} hint="Wajib custom secret untuk production" />
                  <ConfigRow label="DATABASE_URL" value={health.database.configured ? "Configured" : "Not set"} ok={health.database.configured} />
                  <ConfigRow label="GARAGE_SEED_PASSWORD" value={health.configuration.seedPasswordIsDefault ? "Default garage12345" : "Custom"} ok={!health.configuration.seedPasswordIsDefault} hint="Rotate sebelum production" />
                  <ConfigRow label="GOOGLE_DRIVE_CLIENT_ID / SECRET" value={health.configuration.googleDriveConfigured ? "Configured" : "Not set"} ok={health.configuration.googleDriveConfigured} hint="Optional untuk Google Drive sync" />
                  <ConfigRow label="POS_TERMINAL_API_KEY_PEPPER" value={health.configuration.posTerminalApiConfigured ? "Configured" : "Not set"} ok={health.configuration.posTerminalApiConfigured} hint="Untuk POS terminal API key hashing" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backup" className="mt-4">
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Terminal className="h-4 w-4 text-[var(--primary)]" />
                  Backup & Restore
                </h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Dashboard membaca `scripts/backup.mjs`, folder backup lokal, dan status konfigurasi S3.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <MetricGrid
                  items={[
                    ["Script backup", health.backup.scriptAvailable ? "Available" : "Missing", health.backup.scriptAvailable ? "healthy" : "critical"],
                    ["Latest backup", health.backup.latestFile ?? "Missing", health.backup.latestFile ? health.backup.status : "critical"],
                    ["Latest age", health.backup.latestAgeHours !== null ? `${health.backup.latestAgeHours}h` : "-", health.backup.status],
                    ["S3 offsite", health.backup.s3Configured ? "Configured" : "Not set", health.backup.s3Configured ? "healthy" : "watch"],
                  ]}
                />
                <BackupCommand label="Manual backup" command={backupGuide.manualCommand} copied={copied === "manual"} onCopy={() => copyToClipboard(backupGuide.manualCommand, "manual")} />
                <BackupCommand label="Scheduled backup" command={backupGuide.scheduledCronExample} multiline copied={copied === "cron"} onCopy={() => copyToClipboard(backupGuide.scheduledCronExample, "cron")} />
                <BackupCommand label="Restore dari backup file" command={backupGuide.restoreCommand} copied={copied === "restore"} onCopy={() => copyToClipboard(backupGuide.restoreCommand, "restore")} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="checklist" className="mt-4">
            <Card className="border-[var(--border)] bg-[var(--card)]">
              <CardHeader>
                <h2 className="text-lg font-semibold">Production Deploy Checklist</h2>
                <p className="text-xs text-[var(--muted-foreground)]">
                  Auto-detect items plus manual gate yang tetap perlu dikonfirmasi operator.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <ChecklistItem ok={health.database.connectionOk} label="Database connection working" />
                  <ChecklistItem ok={health.configuration.betterAuthConfigured} label="BETTER_AUTH_SECRET set custom" />
                  <ChecklistItem ok={!health.configuration.seedPasswordIsDefault} label="GARAGE_SEED_PASSWORD sudah di-rotate" />
                  <ChecklistItem ok={health.configuration.nodeEnv === "production"} label="NODE_ENV = production" />
                  <ChecklistItem ok={health.database.latencyMs !== null && health.database.latencyMs < 500} label={`Database latency < 500ms (current: ${health.database.latencyMs ?? "-"}ms)`} />
                  <ChecklistItem ok={health.backup.status !== "critical"} label="Backup terbaru tersedia dan script backup ada" />
                  <ChecklistItem ok={health.security.activeAdminWithout2fa === 0} label="Owner/Admin sudah aktif 2FA" />
                  <ChecklistItem ok={health.operations.failedPrintJobs24h === 0} label="Tidak ada print job gagal 24 jam terakhir" />
                  <ChecklistItem manual label="Monitoring external aktif (Sentry/log aggregator/uptime check)" />
                  <ChecklistItem manual label="HTTPS + certificate auto-renewal" />
                  <ChecklistItem manual label="Rate limiting di reverse proxy atau platform hosting" />
                  <ChecklistItem manual label="Test restore backup ke staging" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "watch" | "critical";
}) {
  const color =
    tone === "critical" ? "text-rose-300" : tone === "watch" ? "text-amber-300" : "text-[var(--foreground)]";
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--popover)] p-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</div>
      <div className={`mt-1 truncate text-sm font-semibold ${color}`} title={String(value)}>{value}</div>
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
  icon: LucideIcon;
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
          <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">{label}</span>
          <Icon className={`h-4 w-4 ${accent}`} />
        </div>
        <div className={`mt-2 truncate text-2xl font-bold ${accent}`} title={String(value)}>{value}</div>
        <div className="truncate text-[10px] text-[var(--muted-foreground)]" title={hint}>{hint}</div>
      </CardContent>
    </Card>
  );
}

function MetricGrid({
  items,
}: {
  items: Array<[string, string | number, HealthSeverity]>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value, status]) => (
        <Card key={label} className="border-[var(--border)] bg-[var(--card)]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
              <Badge className={statusTone(status)}>{severityLabel(status)}</Badge>
            </div>
            <div className="mt-3 truncate text-xl font-semibold" title={String(value)}>{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
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
    <div className={`flex items-center justify-between gap-4 rounded-md border p-3 ${ok ? "border-emerald-900/40 bg-emerald-950/20" : "border-rose-900/40 bg-rose-950/20"}`}>
      <div className="flex items-center gap-3">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
        )}
        <div>
          <div className="font-mono text-xs font-semibold">{label}</div>
          {hint ? <div className="text-[10px] text-[var(--muted-foreground)]">{hint}</div> : null}
        </div>
      </div>
      <code className="truncate font-mono text-xs text-[var(--muted-foreground)]" title={value}>{value}</code>
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
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{label}</span>
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7">
          {copied ? (
            <CheckCircle2 className="mr-1 h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="mr-1 h-3 w-3" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className={`rounded-md border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-[11px] text-[var(--foreground)] ${multiline ? "whitespace-pre-wrap" : "overflow-x-auto"}`}>
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
    <div className={`flex items-start gap-3 rounded-md border p-3 ${manual ? "border-zinc-700 bg-[var(--popover)]" : ok ? "border-emerald-900/40 bg-emerald-950/20" : "border-rose-900/40 bg-rose-950/20"}`}>
      {manual ? (
        <div className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-zinc-600" />
      ) : ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      )}
      <div className="text-sm">{label}</div>
      {manual ? (
        <Badge variant="outline" className="ml-auto border-zinc-700 text-[10px] text-zinc-400">
          manual check
        </Badge>
      ) : null}
    </div>
  );
}
