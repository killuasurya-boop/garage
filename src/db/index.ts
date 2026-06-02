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

function preferPglite() {
  const requested = requestedDriver();
  if (requested === "pglite") return true;
  if (requested === "postgres") return false;
  if (!databaseUrl()) return true;
  // Development default: local PGlite avoids broken/slow cloud connections during daily ops.
  // Set GARAGE_DB_DRIVER=postgres when cloud Postgres is ready.
  return process.env.NODE_ENV !== "production";
}

function postgresSsl(connectionString: string) {
  const sslEnv = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (sslEnv === "false") return false;
  if (sslEnv === "true") return { rejectUnauthorized: false } as const;
  if (
    connectionString.includes("sslmode=require") ||
    connectionString.includes("neon.tech")
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
    throw new Error("DATABASE_URL is required for the postgres database driver.");
  }

  if (!globalForDb.garagePool) {
    globalForDb.garagePool = new pg.Pool({
      connectionString: url,
      ssl: postgresSsl(url),
    });
  }

  return globalForDb.garagePool;
}

function bootPglite() {
  if (!globalForDb.garagePgliteBoot) {
    globalForDb.garagePgliteBoot = (async () => {
      if (!globalForDb.garagePglite) {
        const client = new PGlite(process.env.PGLITE_DATA_DIR ?? "D:/GARAGEFIX/pglite-data");
        await client.waitReady;
        globalForDb.garagePglite = client;
      }
      return globalForDb.garagePglite;
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
    return ensurePostgresDb();
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    console.warn(
      "[garage-db] PostgreSQL tidak bisa dihubungi di development â€” memakai PGlite lokal:",
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

