// Menu CSV import — bulk upsert menu items + variants dari CSV.
// Format CSV (header wajib):
//   name,category,section,variant_label,price,base_cost,prep,status,tags
// Multi-variant per item: rows dengan name yang sama akan di-group.
// Example:
//   Es Kopi Susu,Coffee,Coffee,Cold,22000,8000,2 min,active,signature
//   Es Kopi Susu,Coffee,Coffee,Hot,22000,8000,2 min,active,signature
//   Nasi Goreng,Makanan,Food,Sedang,32000,15000,8 min,active,
//   Nasi Goreng,Makanan,Food,Pedas,32000,15000,8 min,active,

import { sql } from "drizzle-orm";
import { z } from "zod";

import { isDatabaseConfigured, getDb } from "@/db";
import { menuItems, menuVariants } from "@/db/schema";
import { fail, ok } from "@/lib/api-response";
import { createAuditLog } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

const CSV_REQUIRED_HEADERS = [
  "name",
  "category",
  "section",
  "variant_label",
  "price",
] as const;

type ParsedRow = {
  name: string;
  category: string;
  section: string;
  variantLabel: string;
  price: number;
  baseCost: number;
  prep: string;
  status: string;
  tags: string[];
};

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    throw new Error("CSV harus punya header + minimal 1 row data.");
  }
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  for (const required of CSV_REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`Header CSV missing: '${required}'. Required: ${CSV_REQUIRED_HEADERS.join(", ")}`);
    }
  }

  const idx = (key: string) => headers.indexOf(key);
  const parsed: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim());
    const name = cells[idx("name")]?.trim();
    const variantLabel = cells[idx("variant_label")]?.trim() || "Regular";
    if (!name) continue;
    const price = Number(cells[idx("price")]) || 0;
    if (price <= 0) {
      throw new Error(`Row ${i + 1}: price harus > 0 untuk "${name}".`);
    }
    parsed.push({
      name,
      category: cells[idx("category")]?.trim() || "Makanan",
      section: cells[idx("section")]?.trim() || "Food",
      variantLabel,
      price,
      baseCost: Number(cells[idx("base_cost")] ?? 0) || 0,
      prep: cells[idx("prep")]?.trim() || "5 min",
      status: cells[idx("status")]?.trim() || "active",
      tags: (cells[idx("tags")] ?? "")
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  return parsed;
}

const importSchema = z.object({
  csv: z.string().min(20, "CSV body minimal 20 karakter."),
  dryRun: z.boolean().default(false),
});

export async function POST(request: Request) {
  const session = await requirePermission("staff:manage");
  if (session.response) return session.response;

  if (!isDatabaseConfigured()) {
    return fail(503, "DATABASE_NOT_CONFIGURED", "DATABASE_URL belum di-set.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "INVALID_JSON", "Body harus JSON.");
  }
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join("; "));
  }

  let rows: ParsedRow[];
  try {
    rows = parseCsv(parsed.data.csv);
  } catch (err) {
    return fail(400, "CSV_PARSE_ERROR", err instanceof Error ? err.message : "Parse gagal.");
  }

  if (rows.length === 0) {
    return fail(400, "EMPTY_CSV", "Tidak ada row valid di CSV.");
  }

  // Group rows by name → 1 menu_item + N variants
  const itemsByName = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const list = itemsByName.get(row.name) ?? [];
    list.push(row);
    itemsByName.set(row.name, list);
  }

  const summary = {
    itemsCreated: 0,
    itemsUpdated: 0,
    variantsCreated: 0,
    variantsUpdated: 0,
    skipped: 0,
    items: [] as Array<{ name: string; variants: number }>,
  };

  if (parsed.data.dryRun) {
    for (const [name, variants] of itemsByName.entries()) {
      summary.items.push({ name, variants: variants.length });
    }
    return ok({ dryRun: true, summary, totalItems: itemsByName.size, totalRows: rows.length });
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    for (const [name, variants] of itemsByName.entries()) {
      const first = variants[0];
      const itemId = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

      const upsertResult = await tx
        .insert(menuItems)
        .values({
          id: itemId,
          name,
          category: first.category,
          section: first.section,
          status: first.status,
          prep: first.prep,
          tags: first.tags,
          stock: "ready",
        })
        .onConflictDoUpdate({
          target: menuItems.id,
          set: {
            name,
            category: first.category,
            section: first.section,
            status: first.status,
            prep: first.prep,
            tags: first.tags,
            updatedAt: new Date(),
          },
        })
        .returning({ id: menuItems.id });

      const isNew = upsertResult.length > 0;
      if (isNew) summary.itemsCreated += 1;
      else summary.itemsUpdated += 1;

      for (const v of variants) {
        const variantId = v.variantLabel.toLowerCase().replace(/\s+/g, "-");
        const variantUpsert = await tx
          .insert(menuVariants)
          .values({
            itemId,
            variantId,
            label: v.variantLabel,
            price: v.price,
            baseCost: v.baseCost,
            sortOrder: 0,
          })
          .onConflictDoUpdate({
            target: [menuVariants.itemId, menuVariants.variantId],
            set: {
              label: v.variantLabel,
              price: v.price,
              baseCost: v.baseCost,
              updatedAt: new Date(),
            },
          })
          .returning({ id: menuVariants.id });
        if (variantUpsert.length > 0) summary.variantsCreated += 1;
        else summary.variantsUpdated += 1;
      }

      summary.items.push({ name, variants: variants.length });
    }
  });

  await createAuditLog({
    actor: session.data.user.name,
    action: "menu.bulk_import",
    object: `${itemsByName.size} items / ${rows.length} variants`,
    device: session.data.profile.deviceLabel,
    metadata: { source: "csv", summary },
  });

  // Prevent unused sql import warning
  void sql;

  return ok({ dryRun: false, summary, totalItems: itemsByName.size, totalRows: rows.length });
}
