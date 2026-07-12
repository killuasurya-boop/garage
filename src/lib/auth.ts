import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins";
import { networkInterfaces } from "node:os";

import { getDb, schema } from "@/db";

const fallbackUrl = "http://localhost:3001";

function betterAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) return secret;

  // Saat `next build`, Next.js mengevaluasi modul ini untuk mengumpulkan data
  // halaman tapi TIDAK melayani request, sehingga secret asli tidak diperlukan.
  // Izinkan placeholder agar build production tetap sukses meskipun
  // BETTER_AUTH_SECRET hanya disediakan saat runtime (umum di host seperti
  // Hostinger yang memisahkan env build dan runtime).
  const isBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_BUILD === "true";
  if (isBuild) {
    return "build-placeholder-secret-jangan-dipakai-di-runtime";
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET wajib diisi untuk production.");
  }
  return "garage-dev-only-auth-secret";
}

function normalizeOrigin(origin: string | undefined) {
  if (!origin) return null;

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

function localDevOrigins(baseUrl: string) {
  if (process.env.NODE_ENV === "production") {
    return [];
  }

  let port = "3001";
  try {
    const parsed = new URL(baseUrl);
    port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  } catch {
    // Keep the Garage dev default when BETTER_AUTH_URL is malformed.
  }

  const schemes = new Set(["http", "https"]);

  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === "IPv4" && !entry.internal)
    .flatMap((entry) => Array.from(schemes, (scheme) => `${scheme}://${entry.address}:${port}`));
}

function trustedOrigins() {
  const baseUrl = process.env.BETTER_AUTH_URL ?? fallbackUrl;

  return Array.from(new Set([
    baseUrl,
    process.env.GARAGE_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_GARAGE_PUBLIC_BASE_URL,
    ...(process.env.GARAGE_TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    ...localDevOrigins(baseUrl),
  ].map(normalizeOrigin).filter((origin): origin is string => Boolean(origin))));
}

function createLazyDb() {
  return new Proxy({} as ReturnType<typeof getDb>, {
    get(_target, property) {
      const database = getDb();
      const value = Reflect.get(database, property);
      return typeof value === "function" ? value.bind(database) : value;
    },
    has(_target, property) {
      return property in getDb();
    },
    ownKeys() {
      return Reflect.ownKeys(getDb());
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.getOwnPropertyDescriptor(getDb(), property);
    },
  });
}

// Session expiresIn dibaca dari env GARAGE_SESSION_EXPIRES_HOURS (matches
// setting `securitySessionMaxHours` di /control/settings). Karena Better Auth
// init sinkronus tapi setting DB asinkron, env adalah bridge — set env
// supaya match DB default, atau atur env saat deploy. Default 24 jam.
const sessionMaxHours = Number(process.env.GARAGE_SESSION_EXPIRES_HOURS ?? 24);
const sessionExpiresInSeconds = Math.max(1, sessionMaxHours) * 60 * 60;

export const auth = betterAuth({
  appName: "Garage Coffee & Motor OS",
  baseURL: process.env.BETTER_AUTH_URL ?? fallbackUrl,
  secret: betterAuthSecret(),
  database: drizzleAdapter(createLazyDb(), {
    provider: "pg",
    schema,
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: sessionExpiresInSeconds,
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  plugins: [
    twoFactor({
      issuer: "Garage Coffee & Motor",
    }),
  ],
  hooks: {
    // Pre-signin: cek apakah email lagi di-lockout karena terlalu banyak gagal.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const body = (ctx.body ?? {}) as { email?: string };
      if (!body.email) return;
      try {
        const { getLockoutState } = await import("@/lib/garage-login-attempts-service");
        const state = await getLockoutState(body.email);
        if (state.locked) {
          throw new APIError("TOO_MANY_REQUESTS", {
            message: `Akun dikunci sementara karena ${state.failedCount} login gagal. Coba lagi setelah ${state.windowMinutes} menit.`,
          });
        }
      } catch (error) {
        if (error instanceof APIError) throw error;
        // fail-open kalau service error — jangan blokir login yang sah
      }
    }),
    // Post-signin: record attempt (sukses/gagal) untuk audit + future lockout.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const body = (ctx.body ?? {}) as { email?: string };
      if (!body.email) return;
      try {
        const { recordLoginAttempt, clearFailedAttempts } = await import(
          "@/lib/garage-login-attempts-service"
        );
        const returned = ctx.context.returned as
          | { user?: unknown; token?: unknown; twoFactorRedirect?: boolean; error?: { message?: string } }
          | null
          | undefined;
        const success = Boolean(returned?.user || returned?.token || returned?.twoFactorRedirect);
        const headers = ctx.headers as Headers | undefined;
        const ip =
          headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          headers?.get("x-real-ip") ??
          null;
        const ua = headers?.get("user-agent") ?? null;

        await recordLoginAttempt({
          email: body.email,
          ipAddress: ip,
          userAgent: ua,
          success,
          failureReason: success ? undefined : returned?.error?.message,
        });
        if (success) {
          await clearFailedAttempts(body.email);
        }
      } catch {
        // fail-open
      }
    }),
  },
  trustedOrigins: trustedOrigins(),
});
