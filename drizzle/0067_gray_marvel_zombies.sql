CREATE TABLE "customer_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"staff_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid,
	"table_label" text NOT NULL,
	"chat_token" text NOT NULL,
	"order_id" uuid,
	"member_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to_user_id" text,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_customer_at" timestamp with time zone,
	"staff_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_chat_messages" ADD CONSTRAINT "customer_chat_messages_thread_id_customer_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."customer_chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_chat_messages" ADD CONSTRAINT "customer_chat_messages_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_chat_threads" ADD CONSTRAINT "customer_chat_threads_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_chat_threads" ADD CONSTRAINT "customer_chat_threads_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_chat_threads" ADD CONSTRAINT "customer_chat_threads_assigned_to_user_id_user_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_chat_messages_thread_id_created_at_idx" ON "customer_chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_chat_threads_chat_token_idx" ON "customer_chat_threads" USING btree ("chat_token");--> statement-breakpoint
CREATE INDEX "customer_chat_threads_status_idx" ON "customer_chat_threads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_chat_threads_last_message_at_idx" ON "customer_chat_threads" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "customer_chat_threads_order_id_idx" ON "customer_chat_threads" USING btree ("order_id");