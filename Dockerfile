# syntax=docker/dockerfile:1

# =============================================================================
# Garage Coffee & Motor OS — production image (Next.js 16 standalone + Postgres)
# Build di linux supaya native binary (sharp) cocok dengan runtime VPS.
# =============================================================================

# ---- Stage 1: dependencies (semua deps, untuk build & migrate) --------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Stage 2: build Next.js (output: standalone) ----------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# DB tidak dihubungi saat build (init Drizzle lazy/build-safe).
RUN npm run build

# ---- Stage 3: migrator (punya tsx + drizzle/*.sql, untuk one-shot migrate) --
# Dipakai oleh service `migrate` di docker-compose, bukan untuk serve traffic.
FROM node:22-bookworm-slim AS migrator
WORKDIR /app
ENV NODE_ENV=production
ENV GARAGE_DB_DRIVER=postgres
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json drizzle.config.ts ./
COPY drizzle ./drizzle
COPY src ./src
# migrate.ts driver-aware: baca DATABASE_URL + GARAGE_DB_DRIVER=postgres,
# apply tiap drizzle/*.sql secara idempotent.
CMD ["node_modules/.bin/tsx", "src/db/migrate.ts"]

# ---- Stage 4: runner (image production ramping) -----------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV GARAGE_DB_DRIVER=postgres
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# User non-root untuk keamanan.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

# Output standalone: server.js + node_modules minimal.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
