CREATE TABLE "member_otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"purpose" text DEFAULT 'register' NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"token_hash" text,
	"token_expires_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"delivery_status" text DEFAULT 'sent' NOT NULL,
	"provider_message_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "member_otp_challenges_phone_created_idx" ON "member_otp_challenges" USING btree ("phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "member_otp_challenges_token_idx" ON "member_otp_challenges" USING btree ("token_hash");