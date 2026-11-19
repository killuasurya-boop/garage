ALTER TABLE "candidates" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
-- Data lama: waktu keputusan terbaik yang diketahui = updated_at terakhir.
UPDATE "candidates" SET "status_changed_at" = "updated_at" WHERE "status_changed_at" IS NULL;
