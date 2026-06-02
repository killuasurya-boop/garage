import { sql } from "drizzle-orm";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { getDb, isDatabaseConfigured } from "@/db";

export type HealthSeverity = "healthy" | "watch" | "critical" | "manual";

export type HealthIssue = {
  id: string;
  severity: Exclude<HealthSeverity, "healthy">;
  area: "Database" | "Security" | "Backup" | "Operations" | "Performance" | "Configuration";
  title: string;
  impact: string;
  action: string;
  href?: string;
};

export type SystemHealth = {
  database: {
    configured: boolean;
    connectionOk: boolean;
    version: string | null;
    sizeBytes: number | null;
    sizePretty: string | null;
    latencyMs: number | null;
    error: string | null;
  };
  tables: Array<{
    name: string;
    rowCount: number;
    sizeBytes: number;
    sizePretty: string;
  }>;
  recentActivity: {
    ordersLast24h: number;
    auditLogsLast24h: number;
    loginAttemptsLast24h: number;
    activeSessions: number;
  };
  configuration: {
    nodeEnv: string;
    nextBuildId: string | null;
    betterAuthConfigured: boolean;
    googleDriveConfigured: boolean;
    posTerminalApiConfigured: boolean;
    seedPasswordIsDefault: boolean;
  };
  backup: {
    scriptAvailable: boolean;
    directory: string;
    latestFile: string | null;
    latestAt: string | null;
    latestAgeHours: number | null;
    latestSizeBytes: number | null;
    latestSizePretty: string | null;
    s3Configured: boolean;
    status: HealthSeverity;
  };
  security: {
    status: HealthSeverity;
    activeAdminWithout2fa: number;
    suspendedStaff: number;
    unresolvedErrors24h: number;
    loginAttemptsLast24h: number;
  };
  operations: {
    status: HealthSeverity;
    pendingOrdersOverSla: number;
    awaitingPaymentOverSla: number;
    kitchenTicketsOverSla: number;
    lowStockItems: number;
    failedPrintJobs24h: number;
    openCashSessions: number;
  };
  performance: {
    status: HealthSeverity;
    databaseLatencyMs: number | null;
    errorEvents24h: number;
    unresolvedErrors: number;
    largestTable: {
      name: string;
      sizeBytes: number;
      sizePretty: string;
    } | null;
  };
  readiness: {
    score: number;
    status: "GO" | "CONDITIONAL_GO" | "NO_GO";
    label: string;
    blockers: number;
    warnings: number;
    generatedAt: string;
  };
  issueQueue: HealthIssue[];
  warnings: string[];
  ok: boolean;
};

const CRITICAL_TABLES = [
  "user",
  "session",
  "two_factor",
  "staff_profiles",
  "outlets",
  "orders",
  "order_items",
  "payments",
  "menu_items",
  "menu_variants",
  "inventory_items",
  "customers",
  "audit_logs",
  "login_attempts",
  "app_settings",
] as const;

function formatBytes(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

function severityFromCounts(critical: number, watch: number): HealthSeverity {
  if (critical > 0) return "critical";
  if (watch > 0) return "watch";
  return "healthy";
}

async function getBackupStatus(): Promise<SystemHealth["backup"]> {
  const backupDir = process.env.GARAGE_BACKUP_DIR?.trim();
  const resolvedDir = backupDir
    ? path.resolve(/* turbopackIgnore: true */ backupDir)
    : path.join(process.cwd(), "backups");
  const scriptPath = path.join(process.cwd(), "scripts", "backup.mjs");
  const s3Configured = Boolean(
    process.env.GARAGE_BACKUP_S3_BUCKET || process.env.GARAGE_BACKUP_OFFSITE_DIR,
  );

  let scriptAvailable = false;
  try {
    await stat(scriptPath);
    scriptAvailable = true;
  } catch {
    scriptAvailable = false;
  }

  let latestFile: string | null = null;
  let latestAt: string | null = null;
  let latestAgeHours: number | null = null;
  let latestSizeBytes: number | null = null;

  try {
    const entries = await readdir(resolvedDir, { withFileTypes: true });
    const candidates = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /\.(dump|sql|backup)$/i.test(entry.name))
        .map(async (entry) => {
          const filePath = path.join(resolvedDir, entry.name);
          const info = await stat(filePath);
          return { name: entry.name, mtime: info.mtime, size: info.size };
        }),
    );
    const latest = candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
    if (latest) {
      latestFile = latest.name;
      latestAt = latest.mtime.toISOString();
      latestAgeHours = Math.round(((Date.now() - latest.mtime.getTime()) / 3_600_000) * 10) / 10;
      latestSizeBytes = latest.size;
    }
  } catch {
    // Missing local backup directory is reported through status below.
  }

  const status: HealthSeverity =
    !scriptAvailable || !latestFile || latestAgeHours === null || latestAgeHours > 48
      ? "critical"
      : latestAgeHours > 24 || !s3Configured
        ? "watch"
        : "healthy";

  return {
    scriptAvailable,
    directory: resolvedDir,
    latestFile,
    latestAt,
    latestAgeHours,
    latestSizeBytes,
    latestSizePretty: formatBytes(latestSizeBytes),
    s3Configured,
    status,
  };
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const warnings: string[] = [];
  const dbConfigured = isDatabaseConfigured();

  let connectionOk = false;
  let version: string | null = null;
  let sizeBytes: number | null = null;
  let sizePretty: string | null = null;
  let latencyMs: number | null = null;
  let dbError: string | null = null;

  if (dbConfigured) {
    const db = getDb();
    const probeStart = Date.now();
    try {
      const versionRow = await db.execute<{ version: string }>(sql`SELECT version() as version`);
      latencyMs = Date.now() - probeStart;
      const rawVersion = versionRow.rows?.[0]?.version ?? null;
      version = rawVersion?.split(",")[0]?.trim() ?? rawVersion;
      connectionOk = true;
    } catch (error) {
      dbError = error instanceof Error ? error.message : "Connection failed";
      warnings.push(`Database connection error: ${dbError}`);
    }

    if (connectionOk) {
      try {
        const sizeRow = await db.execute<{ size_bytes: string; size_pretty: string }>(
          sql`SELECT pg_database_size(current_database())::text as size_bytes, pg_size_pretty(pg_database_size(current_database())) as size_pretty`,
        );
        sizeBytes = Number(sizeRow.rows?.[0]?.size_bytes ?? 0);
        sizePretty = sizeRow.rows?.[0]?.size_pretty ?? null;
      } catch {
        // Size is informational.
      }
    }
  } else {
    warnings.push("DATABASE_URL belum di-set - sistem berjalan tanpa persistence.");
  }

  const tables: SystemHealth["tables"] = [];
  if (connectionOk) {
    const db = getDb();
    for (const tableName of CRITICAL_TABLES) {
      try {
        const countRow = await db.execute<{ c: string }>(
          sql`SELECT count(*)::text as c FROM ${sql.identifier(tableName)}`,
        );
        const rowCount = Number(countRow.rows?.[0]?.c ?? 0);

        const sizeRow = await db.execute<{ size_bytes: string; size_pretty: string }>(
          sql`SELECT pg_total_relation_size(${tableName}::regclass)::text as size_bytes,
              pg_size_pretty(pg_total_relation_size(${tableName}::regclass)) as size_pretty`,
        );
        const tBytes = Number(sizeRow.rows?.[0]?.size_bytes ?? 0);
        const tPretty = sizeRow.rows?.[0]?.size_pretty ?? `${tBytes} bytes`;

        tables.push({
          name: tableName,
          rowCount,
          sizeBytes: tBytes,
          sizePretty: tPretty,
        });
      } catch {
        tables.push({ name: tableName, rowCount: 0, sizeBytes: 0, sizePretty: "-" });
      }
    }
  }

  let ordersLast24h = 0;
  let auditLogsLast24h = 0;
  let loginAttemptsLast24h = 0;
  let activeSessions = 0;
  if (connectionOk) {
    const db = getDb();
    try {
      const rows = await db.execute<{ kind: string; c: string }>(
        sql`
          SELECT 'orders' as kind, count(*)::text as c FROM orders WHERE created_at > now() - interval '24 hours'
          UNION ALL
          SELECT 'audit', count(*)::text FROM audit_logs WHERE created_at > now() - interval '24 hours'
          UNION ALL
          SELECT 'login_attempts', count(*)::text FROM login_attempts WHERE attempted_at > now() - interval '24 hours'
          UNION ALL
          SELECT 'sessions', count(*)::text FROM "session" WHERE expires_at > now()
        `,
      );
      for (const row of rows.rows) {
        const c = Number(row.c);
        if (row.kind === "orders") ordersLast24h = c;
        else if (row.kind === "audit") auditLogsLast24h = c;
        else if (row.kind === "login_attempts") loginAttemptsLast24h = c;
        else if (row.kind === "sessions") activeSessions = c;
      }
    } catch (error) {
      warnings.push(
        `Activity counters failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  const backup = await getBackupStatus();

  const betterAuthConfigured = Boolean(
    process.env.BETTER_AUTH_SECRET &&
      process.env.BETTER_AUTH_SECRET.trim().length > 0 &&
      process.env.BETTER_AUTH_SECRET.trim() !== "garage-dev-only-auth-secret",
  );
  if (!betterAuthConfigured && process.env.NODE_ENV === "production") {
    warnings.push("BETTER_AUTH_SECRET pakai default dev - unsafe untuk production.");
  }

  const googleDriveConfigured = Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  );
  const posTerminalApiConfigured = Boolean(process.env.POS_TERMINAL_API_KEY_PEPPER);

  const seedPasswordIsDefault =
    !process.env.GARAGE_SEED_PASSWORD ||
    process.env.GARAGE_SEED_PASSWORD === "garage12345";
  if (seedPasswordIsDefault && process.env.NODE_ENV === "production") {
    warnings.push("GARAGE_SEED_PASSWORD masih default 'garage12345' - rotate sebelum production.");
  }

  let suspendedStaff = 0;
  let activeAdminWithout2fa = 0;
  let errorEvents24h = 0;
  let unresolvedErrors = 0;
  let unresolvedErrors24h = 0;
  let pendingOrdersOverSla = 0;
  let awaitingPaymentOverSla = 0;
  let kitchenTicketsOverSla = 0;
  let lowStockItems = 0;
  let failedPrintJobs24h = 0;
  let openCashSessions = 0;

  if (connectionOk) {
    const db = getDb();
    try {
      const susp = await db.execute<{ c: string }>(
        sql`SELECT count(*)::text as c FROM staff_profiles WHERE status = 'suspended'`,
      );
      suspendedStaff = Number(susp.rows?.[0]?.c ?? 0);
      if (suspendedStaff > 5) {
        warnings.push(`${suspendedStaff} akun staff di-suspend - review di /control/users`);
      }
    } catch {
      // ignore
    }

    try {
      const admin2fa = await db.execute<{ c: string }>(
        sql`
          SELECT count(*)::text as c
          FROM staff_profiles sp
          JOIN "user" u ON u.id = sp.user_id
          WHERE sp.status = 'active'
            AND sp.role IN ('Owner / CEO', 'Admin')
            AND coalesce(u.two_factor_enabled, false) = false
        `,
      );
      activeAdminWithout2fa = Number(admin2fa.rows?.[0]?.c ?? 0);
    } catch {
      // ignore
    }

    try {
      const errors = await db.execute<{
        last24h: string;
        unresolved: string;
        unresolved24h: string;
      }>(
        sql`
          SELECT
            count(*) filter (where occurred_at > now() - interval '24 hours')::text as last24h,
            count(*) filter (where resolved = false)::text as unresolved,
            count(*) filter (where resolved = false and occurred_at > now() - interval '24 hours')::text as unresolved24h
          FROM error_events
        `,
      );
      errorEvents24h = Number(errors.rows?.[0]?.last24h ?? 0);
      unresolvedErrors = Number(errors.rows?.[0]?.unresolved ?? 0);
      unresolvedErrors24h = Number(errors.rows?.[0]?.unresolved24h ?? 0);
    } catch {
      // Older local databases may not have error_events yet.
    }

    try {
      const ops = await db.execute<{
        pending_over_sla: string;
        awaiting_over_sla: string;
        kitchen_over_sla: string;
        low_stock: string;
        failed_prints: string;
        open_cash: string;
      }>(
        sql`
          SELECT
            (SELECT count(*) FROM orders
              WHERE status = 'pending_cashier'
                AND created_at < now() - interval '10 minutes')::text as pending_over_sla,
            (SELECT count(*) FROM orders
              WHERE status = 'awaiting_payment'
                AND updated_at < now() - interval '30 minutes')::text as awaiting_over_sla,
            (SELECT count(*) FROM kitchen_tickets
              WHERE status IN ('queue', 'accepted', 'ready')
                AND created_at < now() - interval '20 minutes')::text as kitchen_over_sla,
            (SELECT count(*) FROM inventory_items
              WHERE status IN ('low', 'critical') OR on_hand <= min_stock)::text as low_stock,
            (SELECT count(*) FROM print_jobs
              WHERE status = 'failed'
                AND created_at > now() - interval '24 hours')::text as failed_prints,
            (SELECT count(*) FROM cash_sessions WHERE status = 'open')::text as open_cash
        `,
      );
      pendingOrdersOverSla = Number(ops.rows?.[0]?.pending_over_sla ?? 0);
      awaitingPaymentOverSla = Number(ops.rows?.[0]?.awaiting_over_sla ?? 0);
      kitchenTicketsOverSla = Number(ops.rows?.[0]?.kitchen_over_sla ?? 0);
      lowStockItems = Number(ops.rows?.[0]?.low_stock ?? 0);
      failedPrintJobs24h = Number(ops.rows?.[0]?.failed_prints ?? 0);
      openCashSessions = Number(ops.rows?.[0]?.open_cash ?? 0);
    } catch (error) {
      warnings.push(
        `Operational counters failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  const largestTable =
    tables.length > 0
      ? tables.reduce((largest, row) => (row.sizeBytes > largest.sizeBytes ? row : largest), tables[0])
      : null;

  const issueQueue: HealthIssue[] = [];
  const addIssue = (issue: HealthIssue) => issueQueue.push(issue);

  if (!connectionOk) {
    addIssue({
      id: "db-connection",
      severity: "critical",
      area: "Database",
      title: "Database tidak terhubung",
      impact: "Data transaksi, login, POS, dan audit tidak aman untuk production.",
      action: "Cek DATABASE_URL, network DB, credential, dan jalankan /api/health ulang.",
    });
  }
  if (latencyMs !== null && latencyMs > 500) {
    addIssue({
      id: "db-latency",
      severity: latencyMs > 1_000 ? "critical" : "watch",
      area: "Performance",
      title: `Database latency ${latencyMs}ms`,
      impact: "Kasir, QR order, dan dashboard bisa terasa lambat saat jam ramai.",
      action: "Cek region database, koneksi server, dan query berat sebelum deploy.",
    });
  }
  if (!betterAuthConfigured) {
    addIssue({
      id: "auth-secret",
      severity: process.env.NODE_ENV === "production" ? "critical" : "watch",
      area: "Security",
      title: "BETTER_AUTH_SECRET belum custom",
      impact: "Session auth production rentan jika memakai secret default/dev.",
      action: "Set BETTER_AUTH_SECRET panjang dan unik di environment production.",
      href: "/control/security",
    });
  }
  if (seedPasswordIsDefault) {
    addIssue({
      id: "seed-password",
      severity: process.env.NODE_ENV === "production" ? "critical" : "watch",
      area: "Security",
      title: "Seed password masih default",
      impact: "Akun awal bisa ditebak jika data seed pernah aktif di production.",
      action: "Set GARAGE_SEED_PASSWORD custom dan rotate password akun default.",
      href: "/control/users",
    });
  }
  if (activeAdminWithout2fa > 0) {
    addIssue({
      id: "admin-2fa",
      severity: "critical",
      area: "Security",
      title: `${activeAdminWithout2fa} akun Owner/Admin belum 2FA`,
      impact: "Akun high privilege lebih mudah diambil alih.",
      action: "Aktifkan 2FA untuk Owner dan Admin sebelum go-live.",
      href: "/control/2fa",
    });
  }
  if (loginAttemptsLast24h >= 1_000) {
    addIssue({
      id: "login-attempts",
      severity: "critical",
      area: "Security",
      title: "Login attempts 24 jam mencurigakan",
      impact: "Ada indikasi brute force atau integrasi auth bermasalah.",
      action: "Review Security Center, rate limit, dan sumber IP login.",
      href: "/control/security",
    });
  }
  if (backup.status !== "healthy") {
    addIssue({
      id: "backup-status",
      severity: backup.status === "critical" ? "critical" : "watch",
      area: "Backup",
      title: backup.latestFile ? "Backup belum cukup aman" : "Backup terakhir belum ditemukan",
      impact: "Rollback dan disaster recovery belum siap jika DB rusak.",
      action: "Jalankan scripts/backup.mjs, set cron, dan simpan salinan offsite/S3.",
    });
  }
  if (pendingOrdersOverSla > 0) {
    addIssue({
      id: "pending-orders-sla",
      severity: "watch",
      area: "Operations",
      title: `${pendingOrdersOverSla} order pending lewat SLA`,
      impact: "QR/customer order bisa tertahan sebelum diproses kasir.",
      action: "Buka cashier control dan selesaikan order pending.",
      href: "/os?module=pos",
    });
  }
  if (awaitingPaymentOverSla > 0) {
    addIssue({
      id: "awaiting-payment-sla",
      severity: "watch",
      area: "Operations",
      title: `${awaitingPaymentOverSla} order awaiting payment terlalu lama`,
      impact: "Meja bisa terlihat aktif padahal pembayaran belum selesai.",
      action: "Cek kasir dan selesaikan pembayaran atau void sesuai SOP.",
      href: "/os?module=pos",
    });
  }
  if (kitchenTicketsOverSla > 0) {
    addIssue({
      id: "kitchen-sla",
      severity: "watch",
      area: "Operations",
      title: `${kitchenTicketsOverSla} kitchen ticket lewat SLA`,
      impact: "Antrian dapur/bar bisa mengganggu service floor.",
      action: "Cek kitchen board dan ticket yang belum delivered.",
      href: "/os?module=kitchen",
    });
  }
  if (lowStockItems > 0) {
    addIssue({
      id: "low-stock",
      severity: "watch",
      area: "Operations",
      title: `${lowStockItems} item stok low/critical`,
      impact: "Menu bisa kosong saat pilot atau jam ramai.",
      action: "Review inventory dan buat receiving/reorder.",
      href: "/os?module=inventory",
    });
  }
  if (failedPrintJobs24h > 0) {
    addIssue({
      id: "print-failures",
      severity: "watch",
      area: "Operations",
      title: `${failedPrintJobs24h} print job gagal dalam 24 jam`,
      impact: "Struk atau kitchen ticket bisa tidak tercetak.",
      action: "Cek thermal print server dan printer target.",
    });
  }
  if (errorEvents24h > 0 || unresolvedErrors > 0) {
    addIssue({
      id: "runtime-errors",
      severity: unresolvedErrors24h > 0 ? "critical" : "watch",
      area: "Performance",
      title: `${errorEvents24h} error runtime 24 jam`,
      impact: "Ada API/client/job error yang perlu dibereskan sebelum deploy.",
      action: "Cek /api/admin/errors atau Security Center, resolve error aktif, dan ulangi smoke test.",
      href: "/control/security",
    });
  }

  const criticalIssues = issueQueue.filter((issue) => issue.severity === "critical").length;
  const watchIssues = issueQueue.filter((issue) => issue.severity === "watch").length;
  const score = Math.max(
    0,
    Math.min(
      100,
      100 -
        criticalIssues * 14 -
        watchIssues * 5 -
        (!googleDriveConfigured ? 2 : 0) -
        (!posTerminalApiConfigured ? 3 : 0) -
        (process.env.NODE_ENV !== "production" ? 5 : 0),
    ),
  );
  const readinessStatus =
    criticalIssues > 0 || score < 70 ? "NO_GO" : watchIssues > 0 || score < 90 ? "CONDITIONAL_GO" : "GO";

  const securityStatus = severityFromCounts(
    Number(!betterAuthConfigured && process.env.NODE_ENV === "production") +
      Number(seedPasswordIsDefault && process.env.NODE_ENV === "production") +
      activeAdminWithout2fa +
      Number(loginAttemptsLast24h >= 1_000),
    Number(!betterAuthConfigured) + Number(seedPasswordIsDefault) + Number(suspendedStaff > 5),
  );
  const operationsStatus = severityFromCounts(
    0,
    pendingOrdersOverSla +
      awaitingPaymentOverSla +
      kitchenTicketsOverSla +
      lowStockItems +
      failedPrintJobs24h,
  );
  const performanceStatus = severityFromCounts(
    Number((latencyMs ?? 0) > 1_000) + unresolvedErrors24h,
    Number((latencyMs ?? 0) > 500) + errorEvents24h + unresolvedErrors,
  );

  const ok = connectionOk && criticalIssues === 0 && warnings.length === 0;

  return {
    database: {
      configured: dbConfigured,
      connectionOk,
      version,
      sizeBytes,
      sizePretty,
      latencyMs,
      error: dbError,
    },
    tables,
    recentActivity: {
      ordersLast24h,
      auditLogsLast24h,
      loginAttemptsLast24h,
      activeSessions,
    },
    configuration: {
      nodeEnv: process.env.NODE_ENV ?? "development",
      nextBuildId: process.env.NEXT_BUILD_ID ?? null,
      betterAuthConfigured,
      googleDriveConfigured,
      posTerminalApiConfigured,
      seedPasswordIsDefault,
    },
    backup,
    security: {
      status: securityStatus,
      activeAdminWithout2fa,
      suspendedStaff,
      unresolvedErrors24h,
      loginAttemptsLast24h,
    },
    operations: {
      status: operationsStatus,
      pendingOrdersOverSla,
      awaitingPaymentOverSla,
      kitchenTicketsOverSla,
      lowStockItems,
      failedPrintJobs24h,
      openCashSessions,
    },
    performance: {
      status: performanceStatus,
      databaseLatencyMs: latencyMs,
      errorEvents24h,
      unresolvedErrors,
      largestTable: largestTable
        ? {
            name: largestTable.name,
            sizeBytes: largestTable.sizeBytes,
            sizePretty: largestTable.sizePretty,
          }
        : null,
    },
    readiness: {
      score,
      status: readinessStatus,
      label:
        readinessStatus === "GO"
          ? "GO"
          : readinessStatus === "CONDITIONAL_GO"
            ? "CONDITIONAL GO"
            : "NO GO",
      blockers: criticalIssues,
      warnings: watchIssues,
      generatedAt: new Date().toISOString(),
    },
    issueQueue,
    warnings,
    ok,
  };
}

export function generateBackupGuide(): {
  manualCommand: string;
  scheduledCronExample: string;
  restoreCommand: string;
} {
  return {
    manualCommand:
      'node --env-file=.env.local scripts/backup.mjs',
    scheduledCronExample:
      '# Crontab: backup tiap jam 02:00 + optional upload S3\n0 2 * * * cd /path/to/garage && node --env-file=.env.local scripts/backup.mjs >> /var/log/garage-backup.log 2>&1',
    restoreCommand:
      'pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner backups/garage-backup-YYYYMMDD-HHMMSS.dump',
  };
}
