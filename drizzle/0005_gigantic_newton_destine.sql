CREATE TABLE "google_drive_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"google_email" text,
	"google_name" text,
	"access_token_encrypted" text,
	"refresh_token_encrypted" text,
	"scope" text,
	"token_type" text DEFAULT 'Bearer' NOT NULL,
	"expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status" text DEFAULT 'connected' NOT NULL,
	"last_error" text,
	"last_upload_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_drive_connections" ADD CONSTRAINT "google_drive_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "google_drive_connections_user_id_idx" ON "google_drive_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "google_drive_connections_status_idx" ON "google_drive_connections" USING btree ("last_status");