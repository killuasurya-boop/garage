CREATE TABLE "staff_leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_user_id" text NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_staff_user_id_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_leaves" ADD CONSTRAINT "staff_leaves_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_leaves_staff_date_uidx" ON "staff_leaves" USING btree ("staff_user_id","date");--> statement-breakpoint
CREATE INDEX "staff_leaves_date_idx" ON "staff_leaves" USING btree ("date");