CREATE TABLE "ai_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"provider" text DEFAULT 'chatgpt' NOT NULL,
	"oauth_client_id" text NOT NULL,
	"client_name" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_ok_at" timestamp with time zone,
	"last_write_ok_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"verified_challenge_id" uuid,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_verification_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_connection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_connections" ADD CONSTRAINT "ai_connections_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_connections" ADD CONSTRAINT "ai_connections_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_verification_challenges" ADD CONSTRAINT "ai_verification_challenges_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_connections_owner_client_idx" ON "ai_connections" USING btree ("owner_user_id","provider","oauth_client_id");--> statement-breakpoint
CREATE INDEX "ai_verification_challenges_owner_idx" ON "ai_verification_challenges" USING btree ("owner_user_id","created_at");