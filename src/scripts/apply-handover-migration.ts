import { ensureDatabaseReady, getPgPool } from "@/db";

async function main() {
  await ensureDatabaseReady();
  const pool = getPgPool() as {
    query: (q: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
    end?: () => Promise<void>;
  };

  const exec = (q: string) => pool.query(q);
  const tableExists = async (name: string) => {
    const r = await pool.query(
      `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='${name}') AS x`,
    );
    return Boolean(r.rows[0]?.x);
  };
  const constraintExists = async (name: string) => {
    const r = await pool.query(
      `SELECT EXISTS (SELECT FROM pg_constraint WHERE conname='${name}') AS x`,
    );
    return Boolean(r.rows[0]?.x);
  };
  const indexExists = async (name: string) => {
    const r = await pool.query(
      `SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname='${name}') AS x`,
    );
    return Boolean(r.rows[0]?.x);
  };

  if (!(await tableExists("staff_shift_handovers"))) {
    await exec(`CREATE TABLE "staff_shift_handovers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "outlet_id" uuid NOT NULL,
      "from_staff_id" uuid NOT NULL,
      "to_staff_id" uuid,
      "from_shift" text NOT NULL,
      "to_shift" text NOT NULL,
      "cash_in_drawer" integer NOT NULL,
      "notes" text,
      "status" text DEFAULT 'pending_validation' NOT NULL,
      "dispute_reason" text,
      "validated_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`);
    console.log("created table staff_shift_handovers");
  } else {
    console.log("table staff_shift_handovers exists");
  }

  const fkChecks: Array<{ name: string; sql: string }> = [
    {
      name: "staff_shift_handovers_outlet_id_outlets_id_fk",
      sql: `ALTER TABLE "staff_shift_handovers" ADD CONSTRAINT "staff_shift_handovers_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE cascade ON UPDATE no action;`,
    },
    {
      name: "staff_shift_handovers_from_staff_id_staff_profiles_id_fk",
      sql: `ALTER TABLE "staff_shift_handovers" ADD CONSTRAINT "staff_shift_handovers_from_staff_id_staff_profiles_id_fk" FOREIGN KEY ("from_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;`,
    },
    {
      name: "staff_shift_handovers_to_staff_id_staff_profiles_id_fk",
      sql: `ALTER TABLE "staff_shift_handovers" ADD CONSTRAINT "staff_shift_handovers_to_staff_id_staff_profiles_id_fk" FOREIGN KEY ("to_staff_id") REFERENCES "public"."staff_profiles"("id") ON DELETE set null ON UPDATE no action;`,
    },
  ];

  for (const fk of fkChecks) {
    if (await constraintExists(fk.name)) {
      console.log(`constraint ${fk.name} exists`);
    } else {
      await exec(fk.sql);
      console.log(`added constraint ${fk.name}`);
    }
  }

  const idxChecks: Array<{ name: string; sql: string }> = [
    {
      name: "staff_shift_handovers_outlet_idx",
      sql: `CREATE INDEX "staff_shift_handovers_outlet_idx" ON "staff_shift_handovers" USING btree ("outlet_id");`,
    },
    {
      name: "staff_shift_handovers_status_idx",
      sql: `CREATE INDEX "staff_shift_handovers_status_idx" ON "staff_shift_handovers" USING btree ("status");`,
    },
    {
      name: "staff_shift_handovers_created_at_idx",
      sql: `CREATE INDEX "staff_shift_handovers_created_at_idx" ON "staff_shift_handovers" USING btree ("created_at");`,
    },
  ];

  for (const idx of idxChecks) {
    if (await indexExists(idx.name)) {
      console.log(`index ${idx.name} exists`);
    } else {
      await exec(idx.sql);
      console.log(`added index ${idx.name}`);
    }
  }

  // Mark migration as applied so drizzle-kit won't try to re-run it.
  await exec(`CREATE SCHEMA IF NOT EXISTS drizzle;`);
  await exec(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
       id serial PRIMARY KEY,
       hash text NOT NULL,
       created_at bigint
     );`);
  await exec(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
     SELECT '0052_foamy_namorita', ${Date.now()}
     WHERE NOT EXISTS (
       SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '0052_foamy_namorita'
     );`,
  );

  if (pool.end) await pool.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
