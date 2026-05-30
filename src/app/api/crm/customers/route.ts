import { fail, ok, readJson } from "@/lib/api-response";
import { createCrmMember, listCustomersForCrm } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";
import { z } from "zod";

export const runtime = "nodejs";

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(request: Request) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;

  const params = new URL(request.url).searchParams;
  const sort = params.get("sort");
  const allowedSorts = ["recent", "spend", "visits", "points", "name"] as const;
  type SortKey = (typeof allowedSorts)[number];
  const safeSort: SortKey | undefined = allowedSorts.includes(sort as SortKey)
    ? (sort as SortKey)
    : undefined;

  const result = await listCustomersForCrm({
    search: params.get("search") ?? undefined,
    tier: params.get("tier") ?? undefined,
    sort: safeSort,
    limit: parseIntParam(params.get("limit"), 50),
    offset: parseIntParam(params.get("offset"), 0),
  });

  return ok(result);
}

const createMemberSchema = z.object({
  name: z.string().trim().min(2, "Nama member wajib diisi."),
  phone: z.string().trim().min(8, "Nomor HP wajib valid."),
  email: z.string().trim().email("Email tidak valid.").optional().or(z.literal("")),
  password: z.string().min(6, "PIN sementara minimal 6 karakter."),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  memberCode: z.string().trim().max(32).optional().or(z.literal("")),
  cardTier: z.enum(["Silver", "Gold", "Platinum", "Ultra"]).default("Silver"),
  staffNote: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const session = await requirePermission("crm:write");
  if (session.response) return session.response;

  const body = await readJson(request, createMemberSchema);
  if (body.error) return body.error;

  if (body.data.cardTier === "Ultra" && session.data.profile.role !== "Owner / CEO") {
    return fail(403, "ULTRA_OWNER_ONLY", "Ultra hanya bisa diset oleh Owner / CEO.");
  }

  const result = await createCrmMember({
    ...body.data,
    email: body.data.email || null,
    birthday: body.data.birthday || null,
    memberCode: body.data.memberCode || null,
    staffNote: body.data.staffNote || null,
    createdByUserId: session.data.user.id,
  });

  if (!result.data) {
    return fail(409, "MEMBER_CREATE_FAILED", result.error ?? "Member gagal dibuat.");
  }

  return ok({ customerId: result.data.customer.id, accountStatus: result.data.account.status }, { status: 201 });
}
