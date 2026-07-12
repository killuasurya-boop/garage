CREATE TABLE "whatsapp_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"customer_id" uuid,
	"assigned_to" text,
	"status" text DEFAULT 'open' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_message_preview" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"body" text,
	"template_name" text,
	"template_params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"provider_message_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversations_phone_idx" ON "whatsapp_conversations" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_status_idx" ON "whatsapp_conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_customer_idx" ON "whatsapp_conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_conversation_idx" ON "whatsapp_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_provider_idx" ON "whatsapp_messages" USING btree ("provider_message_id");