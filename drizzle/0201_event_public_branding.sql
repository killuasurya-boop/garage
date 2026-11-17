ALTER TABLE "event_performers" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "event_performers" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "event_performers" ADD COLUMN "platform_name" text;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD COLUMN "instagram" text;--> statement-breakpoint
ALTER TABLE "event_sponsors" ADD COLUMN "show_on_website" boolean DEFAULT false NOT NULL;