import { listAgentTools } from "@/lib/agent-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agent/v1/openapi.json — spesifikasi OpenAPI 3.1 tool agent (tanpa data rahasia). */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const paths: Record<string, unknown> = {
    "/api/agent/v1/me": { get: { summary: "Identitas API key", security: [{ bearer: [] }], responses: { "200": { description: "OK" } } } },
    "/api/agent/v1/tools": { get: { summary: "Daftar tool", security: [{ bearer: [] }], responses: { "200": { description: "OK" } } } },
  };
  for (const tool of listAgentTools()) {
    paths[`/api/agent/v1/tools/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: tool.title,
        description: tool.description,
        security: [{ bearer: [] }],
        requestBody: { required: false, content: { "application/json": { schema: tool.inputSchema } } },
        responses: {
          "200": { description: "{ data }" },
          "400": { description: "{ error: { code, message } }" },
          "401": { description: "API key tidak valid / dicabut / kedaluwarsa" },
          "403": { description: "Scope key tidak cukup" },
        },
      },
    };
  }
  return Response.json({
    openapi: "3.1.0",
    info: { title: "Garage OS Agent API", version: "1.0.0", description: "Kontrol Garage Coffee OS untuk agent AI (OpenClaw / Hermes). Autentikasi: Authorization: Bearer gk_agent_…" },
    servers: [{ url: origin }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
    paths,
  });
}
