import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "@/db/schema";

type GarageSchema = typeof schema;
export type GarageDb = ReturnType<typeof drizzlePostgres<GarageSchema>>;

type GarageDbGlobal = {
  garageDb?: GarageDb;
  garagePool?: pg.Pool;
  garagePglite?: PGlite;
  garagePgliteBoot?: Promise<PGlite>;
  garageDriver?: "postgres" | "pglite";
};

const globalForDb = globalThis as typeof globalThis & GarageDbGlobal;

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  return value && value.length > 0 ? value : null;
}

function requestedDriver(): "postgres" | "pglite" | null {
  const driver = process.env.GARAGE_DB_DRIVER?.trim().toLowerCase();
  if (driver === "pglite" || driver === "local") return "pglite";
  if (driver === "postgres" || driver === "postgresql") return "postgres";
  return null;
}

/**
 * Determine primary database driver.
 * 
 * Priority:
 * 1. Explicit GARAGE_DB_DRIVER env (pglite | postgres)
 * 2. Production + DATABASE_URL: Always use Postgres (Supabase)
 * 3. Development: Prefer PGlite if DATABASE_URL missing/broken
 */
function preferPglite() {
  const requested = requestedDriver();
  if (requested === "pglite") return true;
  if (requested === "postgres") return false;
  
  // Production: always use Postgres (Supabase) if DATABASE_URL exists
  if (process.env.NODE_ENV === "production") {
    return !databaseUrl();
  }
  
  // Development: use local PGlite unless Postgres is explicitly requested or DATABASE_URL is set
  return !databaseUrl();
}

function postgresSsl(connectionString: string) {
  const sslEnv = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (sslEnv === "false") return false;
  if (sslEnv === "true") return { rejectUnauthorized: false } as const;
  
  // Supabase always requires SSL
  if (
    connectionString.includes("sslmode=require") ||
    connectionString.includes("neon.tech") ||
    connectionString.includes("supabase.co")
  ) {
    return { rejectUnauthorized: false } as const;
  }
  return undefined;
}

function activeDriver(): "postgres" | "pglite" {
  if (globalForDb.garageDriver) {
    return globalForDb.garageDriver;
  }
  return preferPglite() ? "pglite" : "postgres";
}

export function isDatabaseConfigured() {
  return preferPglite() || Boolean(databaseUrl());
}

export function getDatabaseDriver() {
  return activeDriver();
}

function getPostgresPool() {
  const url = databaseUrl();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required for the postgres database driver. " +
      "Set DATABASE_URL to Supabase connection string: postgresql://postgres.[project-id]:[password]@db.[project-id].supabase.co:5432/postgres"
    );
  }

  if (!globalForDb.garagePool) {
    globalForDb.garagePool = new pg.Pool({
      connectionString: url,
      ssl: postgresSsl(url),
      // Supabase connection pooling optimization
      max: process.env.NODE_ENV === "production" ? 20 : 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    
    // Log connection status
    globalForDb.garagePool.on("error", (err) => {
      console.error("[garage-db] Unexpected error on idle client:", err);
    });
  }

  return globalForDb.garagePool;
}

function pgliteDataDir() {
  const fromEnv = process.env.PGLITE_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  // Fallback cross-platform: simpan di dalam cwd biar tidak bergantung path
  // hardcoded Windows. Production tetap pakai PGLITE_DATA_DIR atau DATABASE_URL.
  return path.resolve(process.cwd(), ".pglite-data");
}

function pgliteDataDirFallbacks() {
  const primary = path.resolve(pgliteDataDir());
  const localFallback = path.resolve(process.cwd(), ".pglite-data");
  return Array.from(new Set([primary, localFallback]));
}

function bootPglite() {
  if (!globalForDb.garagePgliteBoot) {
    globalForDb.garagePgliteBoot = (async () => {
      let lastError: unknown;

      for (const dataDir of pgliteDataDirFallbacks()) {
        try {
          if (!globalForDb.garagePglite) {
            const client = new PGlite(dataDir);
            await client.waitReady;
            globalForDb.garagePglite = client;
          }
          return globalForDb.garagePglite;
        } catch (error) {
          lastError = error;
          globalForDb.garagePglite = undefined;
          console.warn(
            `[garage-db] PGlite gagal boot di ${dataDir}:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      globalForDb.garagePgliteBoot = undefined;
      globalForDb.garageDb = undefined;
      globalForDb.garageDriver = undefined;
      throw lastError;
    })();
  }

  return globalForDb.garagePgliteBoot;
}

function getPgliteClient() {
  if (!globalForDb.garagePglite) {
    throw new Error("PGlite belum siap. Tunggu ensureDatabaseReady() selesai.");
  }
  return globalForDb.garagePglite;
}

function ensurePgliteDb() {
  globalForDb.garageDriver = "pglite";
  const client = getPgliteClient();
  if (!globalForDb.garageDb) {
    // PGlite & node-postgres punya QueryResult shape berbeda; di runtime
    // Drizzle ORM API kompatibel (kita pakai query builder, bukan raw result),
    // jadi cast via unknown supaya type checker tidak menolak. Aman selama
    // kita tidak mengakses .session._.client driver-specific.
    globalForDb.garageDb = drizzlePglite(client, { schema }) as unknown as GarageDb;
  }
  return globalForDb.garageDb;
}

function ensurePostgresDb() {
  globalForDb.garageDriver = "postgres";
  if (!globalForDb.garageDb) {
    globalForDb.garageDb = drizzlePostgres(getPostgresPool(), { schema });
  }
  return globalForDb.garageDb;
}

export async function ensureDatabaseReady() {
  if (globalForDb.garageDb && globalForDb.garageDriver) {
    return globalForDb.garageDb;
  }

  if (preferPglite()) {
    await bootPglite();
    return ensurePgliteDb();
  }

  try {
    await getPostgresPool().query("select 1");
    console.log("[garage-db] Connected to", activeDriver() === "postgres" ? "Supabase PostgreSQL" : "local database");
    return ensurePostgresDb();
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    console.warn(
      "[garage-db] PostgreSQL tidak bisa dihubungi di development — memakai PGlite lokal:",
      error instanceof Error ? error.message : error,
    );
    await bootPglite();
    return ensurePgliteDb();
  }
}

export function getDb() {
  if (globalForDb.garageDb && globalForDb.garageDriver) {
    return globalForDb.garageDb;
  }

  if (preferPglite()) {
    return ensurePgliteDb();
  }

  return ensurePostgresDb();
}

export function getPgPool(): PGlite | pg.Pool {
  if (activeDriver() === "pglite") {
    const client = getPgliteClient();
    return Object.assign(client, {
      end: async () => {
        await client.close();
        globalForDb.garagePglite = undefined;
        globalForDb.garagePgliteBoot = undefined;
        globalForDb.garageDb = undefined;
        globalForDb.garageDriver = undefined;
      },
    });
  }

  return getPostgresPool();
}

export { schema };
