import { fail, ok, readJson } from "@/lib/api-response";
import {
  createCustomSegment,
  deleteCustomSegment,
  listCustomSegments,
  previewSegmentRules,
} from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";
import { z } from "zod";

export const runtime = "nodejs";

// Allowed fields and operators
const RULE_FIELDS = [
  "tier",
  "totalSpend",
  "visits",
  "points",
  "daysSinceVisit",
  "hasTag",
  "hasVoucher",
  "birthdayThisWeek",
  "createdAfter",
  "createdBefore",
] as const;

const RULE_OPS = ["equals", "notEquals", "gt", "lt", "gte", "lte"] as const;

const ruleSchema = z.object({
  field: z.enum(RULE_FIELDS),
  op: z.enum(RULE_OPS),
  value: z.union([z.string(), z.number(), z.boolean()]),
  logic: z.enum(["AND", "OR"]).optional().default("AND"),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Nama segment wajib diisi.").max(128),
  rules: z.array(ruleSchema).min(1, "Minimal 1 rule wajib ada."),
});

const deleteSchema = z.object({
  id: z.string().uuid("Invalid segment ID format."),
});

// Preview via GET query params (rules passed as JSON)
export async function GET(request: Request) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "preview") {
    const rulesRaw = url.searchParams.get("rules");
    if (!rulesRaw) return fail(400, "MISSING_RULES", "Parameter rules wajib diisi untuk preview.");
    let rules: z.infer<typeof ruleSchema>[];
    try {
      rules = JSON.parse(rulesRaw);
    } catch {
      return fail(400, "INVALID_RULES_JSON", "Parameter rules harus JSON yang valid.");
    }
    const parsed = z.array(ruleSchema).safeParse(rules);
    if (!parsed.success) {
      return fail(400, "INVALID_RULES", "Rule tidak valid: " + parsed.error.message);
    }
    const count = await previewSegmentRules(parsed.data as Parameters<typeof previewSegmentRules>[0]);
    return ok({ count });
  }

  // Default: list all custom segments
  return ok({ segments: await listCustomSegments() });
}

export async function POST(request: Request) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const body = await readJson(request, createSchema);
  if (body.error) return body.error;

  const { name, rules } = body.data;

  const segment = await createCustomSegment({
    name,
    rules,
    createdBy: session.data.user.id,
  });

  if (!segment) {
    return fail(500, "SEGMENT_CREATE_FAILED", "Gagal membuat segment.");
  }

  return ok({ id: segment.id, name: segment.name }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const body = await readJson(request, deleteSchema);
  if (body.error) return body.error;

  const deleted = await deleteCustomSegment(body.data.id);
  if (!deleted) {
    return fail(404, "SEGMENT_NOT_FOUND", "Segment tidak ditemukan.");
  }

  return ok({ ok: true });
}