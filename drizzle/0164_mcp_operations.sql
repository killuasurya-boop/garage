CREATE TABLE "mcp_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text DEFAULT 'chatgpt' NOT NULL,
	"oauth_client_id" text,
	"tool" text NOT NULL,
	"risk" text NOT NULL,
	"args_digest" text NOT NULL,
	"args_preview" jsonb NOT NULL,
	"nonce_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"result_summary" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mcp_operations" ADD CONSTRAINT "mcp_operations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_operations_user_id_idx" ON "mcp_operations" USING btree ("user_id","created_at");