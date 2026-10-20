import { z } from "zod";

import {
  CATALOG_SORT_KEYS,
  PRODUCT_ISSUES,
  PRODUCT_TYPES,
  type CatalogQuery,
} from "@/lib/product-catalog-types";

const blankToUndefined = (value: unknown) => (value === "" || value === "all-types" ? undefined : value);

const querySchema = z.object({
  q: z.string().trim().max(80).optional(),
  categoryId: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  productType: z.preprocess(blankToUndefined, z.enum(PRODUCT_TYPES).optional()),
  status: z.preprocess(blankToUndefined, z.enum(["active", "archived", "all"]).optional()),
  stock: z.preprocess(blankToUndefined, z.enum(["ready", "limited", "sold_out"]).optional()),
  hpp: z.preprocess(blankToUndefined, z.enum(["has", "missing", "complete", "incomplete"]).optional()),
  issue: z.preprocess(blankToUndefined, z.enum([...PRODUCT_ISSUES, "any"]).optional()),
  digital: z.preprocess(blankToUndefined, z.enum(["shown", "hidden"]).optional()),
  from: z.preprocess(blankToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  to: z.preprocess(blankToUndefined, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  sort: z.preprocess(blankToUndefined, z.enum(CATALOG_SORT_KEYS).optional()),
  dir: z.preprocess(blankToUndefined, z.enum(["asc", "desc"]).optional()),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(5).max(200).optional(),
});

/** Query string katalog → CatalogQuery tervalidasi (dipakai katalog & ekspor). */
export function parseCatalogQuery(params: URLSearchParams): { ok: true; query: CatalogQuery } | { ok: false; message: string } {
  const raw: Record<string, string> = {};
  for (const key of Object.keys(querySchema.shape)) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ") };
  }
  if ((parsed.data.from && !parsed.data.to) || (!parsed.data.from && parsed.data.to)) {
    return { ok: false, message: "Isi tanggal mulai dan tanggal akhir sekaligus." };
  }
  return { ok: true, query: parsed.data as CatalogQuery };
}

/** CatalogQuery → query string (klien: muat katalog & tautan ekspor dengan filter yang sama). */
export function catalogQueryToSearch(query: CatalogQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}
