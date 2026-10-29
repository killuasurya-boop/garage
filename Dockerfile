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
# next.config.ts hanya menghasilkan .next/standalone bila flag ini true —
# tanpa ini stage runner gagal di `COPY .next/standalone`.
ENV GARAGE_STANDALONE=true
# Placeholder build-time only: `next build` (page-data collection) menyentuh
# modul auth yang mewajibkan secret saat NODE_ENV=production. Nilai ASLI
# di-inject saat runtime via env_file; placeholder ini tidak pernah dipakai
# untuk signing produksi.
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-runtime
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# DB tidak dihubungi saat build (init Drizzle lazy/build-safe).
# Build Next.js butuh heap > batas bawaan Node (~2 GB) sejak modul laporan
# bertambah (deploy PR #56 gagal: JavaScript heap out of memory).
ARG GARAGE_BUILD_NODE_OPTIONS=--max-old-space-size=4096
ENV NODE_OPTIONS=$GARAGE_BUILD_NODE_OPTIONS
# Opt-in only after an external typecheck of the exact source; never set in runner.
ARG GARAGE_BUILD_TYPECHECK_VERIFIED=false
ENV GARAGE_BUILD_TYPECHECK_VERIFIED=$GARAGE_BUILD_TYPECHECK_VERIFIED
RUN npm run build

# ---- Stage 3: migrator (punya tsx + drizzle/*.sql, untuk one-shot migrate) --
# Dipakai oleh service `migrate` di docker-compose, bukan untuk serve traffic.
FROM node:22-bookworm-slim AS migrator
WORKDIR /app
ENV NODE_ENV=production
# Zona waktu operasional outlet (WIB). Semua laporan harian, struk & PDF
# dihitung dalam Asia/Jakarta — sama seperti PC kasir lokal.
ENV TZ=Asia/Jakarta
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
# Zona waktu operasional outlet (WIB). Semua laporan harian, struk & PDF
# dihitung dalam Asia/Jakarta — sama seperti PC kasir lokal.
ENV TZ=Asia/Jakarta
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

# Direktori volume tulis (selfie absensi, berkas recruitment) — dibuat & di-chown
# ke nextjs supaya named volume yang mount di sini writable oleh user non-root.
RUN mkdir -p /app/storage/attendance /app/storage/recruitment /app/storage/delivery-proof /app/storage/profiles /app/storage/supplier-docs /app/public/garage-uploads \
  && chown -R nextjs:nodejs /app/storage /app/public/garage-uploads

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
