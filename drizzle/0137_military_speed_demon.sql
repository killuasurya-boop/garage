ALTER TABLE "events" ADD COLUMN "agenda" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "promo_text" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sponsor_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "age_gate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Data owner (Okt 2026): rundown, promo poster, sponsor (teks + gerbang usia 21+).
UPDATE "events" SET "agenda" = '[{"start":"15:00","end":"18:00","title":"Live Music"},{"start":"20:00","end":"23:00","title":"Diskoyoks"}]'::jsonb, "promo_text" = 'Diskon 20% Menu Bundling', "sponsor_name" = 'BLACK', "age_gate" = true, "content_version" = "content_version" + 1, "updated_at" = now() WHERE "slug" = 'grand-opening';