import { requirePermission } from "@/lib/server-auth";
import { listCustomersForCrm } from "@/lib/garage-service";

export const runtime = "nodejs";

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const session = await requirePermission("crm:read");
  if (session.response) return session.response;

  const params = new URL(request.url).searchParams;
  const search = params.get("search") ?? undefined;
  const tier = params.get("tier") ?? undefined;

  const result = await listCustomersForCrm({ search, tier, limit: 10000, offset: 0 });
  const rows = result.rows;

  const header = [
    "ID", "Nama", "No HP", "Tier", "Member Code",
    "Points", "Visits", "Total Spend", "Avg Ticket",
    "Last Visit", "Birthday", "Referral Code", "Staff Note",
    "Membership Since", "Flag",
  ].join(",");

  const csvRows = rows.map((c) =>
    [
      escapeCsv(c.id),
      escapeCsv(c.name),
      escapeCsv(c.phone),
      escapeCsv(c.cardTier ?? c.tier),
      escapeCsv(c.memberCode ?? ""),
      escapeCsv(c.points),
      escapeCsv(c.visits),
      escapeCsv(c.totalSpend),
      escapeCsv(c.averageTicket),
      escapeCsv(c.lastOrderAt ?? ""),
      escapeCsv(c.birthday ?? ""),
      escapeCsv(c.referralCode ?? ""),
      escapeCsv(c.staffNote ?? ""),
      escapeCsv(c.membershipSince ?? ""),
      escapeCsv(c.flag),
    ].join(","),
  );

  const csv = [header, ...csvRows].join("\n");
  const timestamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="garage-crm-export-${timestamp}.csv"`,
    },
  });
}