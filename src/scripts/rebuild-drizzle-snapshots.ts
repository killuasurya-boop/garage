import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const META_DIR = resolve(process.cwd(), "drizzle", "meta");

type Snapshot = Record<string, unknown> & {
  id?: string;
  prevId?: string;
  tables: Record<string, TableSnapshot>;
};

type TableSnapshot = {
  name: string;
  schema: string;
  columns: Record<string, ColumnSnapshot>;
  indexes: Record<string, IndexSnapshot>;
  foreignKeys: Record<string, ForeignKeySnapshot>;
  compositePrimaryKeys: Record<string, unknown>;
  uniqueConstraints: Record<string, unknown>;
  policies: Record<string, unknown>;
  checkConstraints: Record<string, unknown>;
  isRLSEnabled: boolean;
};

type ColumnSnapshot = {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  default?: unknown;
};

type IndexSnapshot = {
  name: string;
  columns: Array<{
    expression: string;
    isExpression: boolean;
    asc: boolean;
    nulls: "first" | "last";
  }>;
  isUnique: boolean;
  concurrently: boolean;
  method: string;
  with: Record<string, unknown>;
};

type ForeignKeySnapshot = {
  name: string;
  tableFrom: string;
  columnsFrom: string[];
  tableTo: string;
  schemaTo: string;
  columnsTo: string[];
  onDelete: string;
  onUpdate: string;
};

function readSnapshot(idx: number): Snapshot {
  const path = resolve(META_DIR, `${String(idx).padStart(4, "0")}_snapshot.json`);
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as Snapshot;
}

function writeSnapshot(idx: number, snapshot: Snapshot) {
  const path = resolve(META_DIR, `${String(idx).padStart(4, "0")}_snapshot.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2), "utf8");
}

function patchCustomersFor0031(table: TableSnapshot): TableSnapshot {
  const columns: Record<string, ColumnSnapshot> = {
    ...table.columns,
    member_code: {
      name: "member_code",
      type: "text",
      primaryKey: false,
      notNull: false,
    },
    card_tier: {
      name: "card_tier",
      type: "text",
      primaryKey: false,
      notNull: true,
      default: "'Silver'",
    },
    membership_since: {
      name: "membership_since",
      type: "timestamp with time zone",
      primaryKey: false,
      notNull: true,
      default: "now()",
    },
    ultra_candidate: {
      name: "ultra_candidate",
      type: "boolean",
      primaryKey: false,
      notNull: true,
      default: false,
    },
    ultra_approved_at: {
      name: "ultra_approved_at",
      type: "timestamp with time zone",
      primaryKey: false,
      notNull: false,
    },
    ultra_approved_by: {
      name: "ultra_approved_by",
      type: "text",
      primaryKey: false,
      notNull: false,
    },
  };

  const indexes: Record<string, IndexSnapshot> = {
    ...table.indexes,
    customers_member_code_idx: {
      name: "customers_member_code_idx",
      columns: [
        { expression: "member_code", isExpression: false, asc: true, nulls: "last" },
      ],
      isUnique: true,
      concurrently: false,
      method: "btree",
      with: {},
    },
    customers_card_tier_idx: {
      name: "customers_card_tier_idx",
      columns: [
        { expression: "card_tier", isExpression: false, asc: true, nulls: "last" },
      ],
      isUnique: false,
      concurrently: false,
      method: "btree",
      with: {},
    },
    customers_ultra_candidate_idx: {
      name: "customers_ultra_candidate_idx",
      columns: [
        { expression: "ultra_candidate", isExpression: false, asc: true, nulls: "last" },
      ],
      isUnique: false,
      concurrently: false,
      method: "btree",
      with: {},
    },
  };

  const foreignKeys: Record<string, ForeignKeySnapshot> = {
    ...table.foreignKeys,
    customers_ultra_approved_by_user_id_fk: {
      name: "customers_ultra_approved_by_user_id_fk",
      tableFrom: "customers",
      columnsFrom: ["ultra_approved_by"],
      tableTo: "user",
      schemaTo: "public",
      columnsTo: ["id"],
      onDelete: "set null",
      onUpdate: "no action",
    },
  };

  return { ...table, columns, indexes, foreignKeys };
}

function patchCustomersFor0032(table: TableSnapshot): TableSnapshot {
  const columns: Record<string, ColumnSnapshot> = {
    ...table.columns,
    address: {
      name: "address",
      type: "text",
      primaryKey: false,
      notNull: false,
    },
    photo_url: {
      name: "photo_url",
      type: "text",
      primaryKey: false,
      notNull: false,
    },
  };

  return { ...table, columns };
}

function patchCustomersFor0033(table: TableSnapshot): TableSnapshot {
  const columns: Record<string, ColumnSnapshot> = {
    ...table.columns,
    expires_at: {
      name: "expires_at",
      type: "timestamp with time zone",
      primaryKey: false,
      notNull: false,
    },
  };

  const indexes: Record<string, IndexSnapshot> = {
    ...table.indexes,
    customers_expires_at_idx: {
      name: "customers_expires_at_idx",
      columns: [
        { expression: "expires_at", isExpression: false, asc: true, nulls: "last" },
      ],
      isUnique: false,
      concurrently: false,
      method: "btree",
      with: {},
    },
  };

  return { ...table, columns, indexes };
}

function rebuild() {
  const base = readSnapshot(30);
  const baseCustomers =
    base.tables["public.customers"] ??
    (base.tables as Record<string, TableSnapshot>).customers;
  if (!baseCustomers) throw new Error("customers table not found in 0030 snapshot");

  const customers0031 = patchCustomersFor0031(baseCustomers);
  const customers0032 = patchCustomersFor0032(customers0031);
  const customers0033 = patchCustomersFor0033(customers0032);

  const snapshot0031: Snapshot = {
    ...base,
    id: randomUUID(),
    prevId: typeof base.id === "string" ? base.id : undefined,
    tables: {
      ...base.tables,
      ...(base.tables["public.customers"] ? { "public.customers": customers0031 } : {}),
      ...(base.tables["customers"] ? { customers: customers0031 } : {}),
    },
  };

  writeSnapshot(31, snapshot0031);

  const snapshot0032: Snapshot = {
    ...snapshot0031,
    id: randomUUID(),
    prevId: snapshot0031.id,
    tables: {
      ...snapshot0031.tables,
      ...(snapshot0031.tables["public.customers"]
        ? { "public.customers": customers0032 }
        : {}),
      ...(snapshot0031.tables["customers"] ? { customers: customers0032 } : {}),
    },
  };

  writeSnapshot(32, snapshot0032);

  const snapshot0033: Snapshot = {
    ...snapshot0032,
    id: randomUUID(),
    prevId: snapshot0032.id,
    tables: {
      ...snapshot0032.tables,
      ...(snapshot0032.tables["public.customers"]
        ? { "public.customers": customers0033 }
        : {}),
      ...(snapshot0032.tables["customers"] ? { customers: customers0033 } : {}),
    },
  };

  writeSnapshot(33, snapshot0033);

  const journalPath = resolve(META_DIR, "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    version: string;
    dialect: string;
    entries: Array<{
      idx: number;
      version: string;
      when: number;
      tag: string;
      breakpoints: boolean;
    }>;
  };

  let journalChanged = false;
  if (!journal.entries.some((entry) => entry.idx === 32)) {
    journal.entries.push({
      idx: 32,
      version: "7",
      when: Date.now(),
      tag: "0032_premium_card_profile",
      breakpoints: true,
    });
    journalChanged = true;
  }
  if (!journal.entries.some((entry) => entry.idx === 33)) {
    journal.entries.push({
      idx: 33,
      version: "7",
      when: Date.now(),
      tag: "0033_member_expiration",
      breakpoints: true,
    });
    journalChanged = true;
  }
  if (journalChanged) {
    writeFileSync(journalPath, JSON.stringify(journal, null, 2), "utf8");
  }

  const hash = createHash("sha256");
  hash.update(JSON.stringify(snapshot0033.tables));
  console.log("Rebuilt 0031 + 0032 + 0033 snapshots.");
  console.log("0033 table digest:", hash.digest("hex").slice(0, 12));
  console.log("Journal entries:", journal.entries.length);
}

rebuild();
