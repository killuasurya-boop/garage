import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";

import { McpChatgptConsent } from "@/components/garage/admin/mcp-chatgpt-consent";
import { getDb } from "@/db";
import { oauthClient, staffProfiles } from "@/db/schema";
import { auth, mcpChatgpt } from "@/lib/auth";
import { mcpChatgptAccess } from "@/lib/mcp-chatgpt-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hubungkan ChatGPT · Garage OS",
  description: "Izinkan aplikasi AI mengakses Garage OS atas nama Owner.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function toQuery(params: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  return query;
}

// Halaman consent plugin OAuth (mcp()). Query wajib bertanda tangan plugin;
// hanya Owner aktif dengan 2FA yang bisa menyetujui (lihat mcp-chatgpt-access).
export default async function McpChatgptConsentPage({ searchParams }: Props) {
  if (!mcpChatgpt.enabled) notFound();

  const query = toQuery(await searchParams);
  const { secret } = await auth.$context;
  if (!(await verifyOAuthQueryParams(query.toString(), secret))) {
    return <McpChatgptConsent state={{ kind: "invalid" }} />;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect(`/login?${query.toString()}`);

  const db = getDb();
  const [profile] = await db
    .select({ role: staffProfiles.role, status: staffProfiles.status })
    .from(staffProfiles)
    .where(eq(staffProfiles.userId, session.user.id))
    .limit(1);
  const access = mcpChatgptAccess({
    role: profile?.role,
    status: profile?.status,
    twoFactorEnabled: Boolean((session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled),
  });

  const clientId = query.get("client_id") ?? "";
  const [client] = clientId
    ? await db.select({ name: oauthClient.name, uri: oauthClient.uri }).from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1)
    : [];

  return (
    <McpChatgptConsent
      state={{
        kind: "request",
        clientName: client?.name || "Aplikasi AI",
        clientUri: client?.uri ?? null,
        scopes: (query.get("scope") ?? "").split(" ").filter(Boolean),
        userName: session.user.name,
        userEmail: session.user.email,
        access: access.allowed ? { allowed: true } : { allowed: false, message: access.message, code: access.code },
      }}
    />
  );
}
