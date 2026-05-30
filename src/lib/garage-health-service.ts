import { sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "@/db";

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

export async function getSystemHealth(): Promise<SystemHealth> {
  const warnings: string[] = [];
  const dbConfigured = isDatabaseConfigured();

  // Database probe
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
        // ignore — size is informational
      }
    }
  } else {
    warnings.push("DATABASE_URL belum di-set — sistem berjalan tanpa persistence.");
  }

  // Per-table stats
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
        tables.push({ name: tableName, rowCount: 0, sizeBytes: 0, sizePretty: "—" });
      }
    }
  }

  // Recent activity
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

  // Configuration check
  const betterAuthConfigured = Boolean(
    process.env.BETTER_AUTH_SECRET &&
      process.env.BETTER_AUTH_SECRET.trim().length > 0 &&
      process.env.BETTER_AUTH_SECRET.trim() !== "garage-dev-only-auth-secret",
  );
  if (!betterAuthConfigured && process.env.NODE_ENV === "production") {
    warnings.push("BETTER_AUTH_SECRET pakai default dev — UNSAFE untuk production.");
  }

  const googleDriveConfigured = Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  );
  const posTerminalApiConfigured = Boolean(process.env.POS_TERMINAL_API_KEY_PEPPER);

  const seedPasswordIsDefault =
    !process.env.GARAGE_SEED_PASSWORD ||
    process.env.GARAGE_SEED_PASSWORD === "garage12345";
  if (seedPasswordIsDefault && process.env.NODE_ENV === "production") {
    warnings.push("GARAGE_SEED_PASSWORD masih default 'garage12345' — rotate sebelum production.");
  }

  // Suspended user warning (high count = security concern)
  if (connectionOk) {
    const db = getDb();
    try {
      const susp = await db.execute<{ c: string }>(
        sql`SELECT count(*)::text as c FROM staff_profiles WHERE status = 'suspended'`,
      );
      const suspCount = Number(susp.rows?.[0]?.c ?? 0);
      if (suspCount > 5) {
        warnings.push(`${suspCount} akun staff di-suspend — review di /control/users`);
      }
    } catch {
      // ignore
    }
  }

  const ok = connectionOk && warnings.length === 0;

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
    warnings,
    ok,
  };
}

// Generate pg_dump command guide untuk admin yang mau backup manual.
export function generateBackupGuide(): {
  manualCommand: string;
  scheduledCronExample: string;
  restoreCommand: string;
} {
  return {
    manualCommand:
      'pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file=garage-backup-$(date +%Y%m%d-%H%M%S).dump',
    scheduledCronExample:
      '# Crontab: backup tiap jam 02:00 + push ke S3\n0 2 * * * pg_dump "$DATABASE_URL" --format=custom --no-owner --file=/tmp/garage-$(date +\\%Y\\%m\\%d).dump && aws s3 cp /tmp/garage-$(date +\\%Y\\%m\\%d).dump s3://garage-backups/',
    restoreCommand:
      'pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner garage-backup-YYYYMMDD-HHMMSS.dump',
  };
}
