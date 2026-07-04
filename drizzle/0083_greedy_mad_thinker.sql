CREATE TABLE "wms_checklist_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"warehouse_id" uuid,
	"ref_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_checklist_run_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"label" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "po_number" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD COLUMN "additional_cost" numeric(14, 4) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ADD COLUMN "buy_qty" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ADD COLUMN "pack_size" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ADD COLUMN "buy_unit" text;--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ADD COLUMN "discrepancy_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "wms_checklist_run" ADD CONSTRAINT "wms_checklist_run_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_checklist_run" ADD CONSTRAINT "wms_checklist_run_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_checklist_run_item" ADD CONSTRAINT "wms_checklist_run_item_run_id_wms_checklist_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."wms_checklist_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_checklist_run_item_run_idx" ON "wms_checklist_run_item" USING btree ("run_id");