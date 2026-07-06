import { exportWmsRecipesBundle } from "@/lib/wms-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await requirePermission("inventory:read");
  if (session.response) return session.response;
  const bundle = await exportWmsRecipesBundle();
  const body = JSON.stringify(bundle, null, 2);
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="garage-wms-recipes-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
