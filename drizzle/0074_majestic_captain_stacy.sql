CREATE TABLE "wms_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid,
	"batch_no" text NOT NULL,
	"expired_at" timestamp with time zone,
	"qty" real DEFAULT 0 NOT NULL,
	"hpp" real DEFAULT 0 NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_bom_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"product_id" uuid,
	"qty" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_cold_chain_reading" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_code" text NOT NULL,
	"temp_c" real NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_internal_order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"outlet_warehouse_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"total_hpp" real DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_internal_order_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
CREATE TABLE "wms_internal_order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid,
	"batch_id" uuid,
	"qty" real DEFAULT 0 NOT NULL,
	"line_hpp" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_opname_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opname_id" uuid NOT NULL,
	"product_id" uuid,
	"system_qty" real DEFAULT 0 NOT NULL,
	"physical_qty" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"unit" text NOT NULL,
	"min_stock" real DEFAULT 0 NOT NULL,
	"hpp" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_product_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "wms_receiving" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"supplier" text DEFAULT '' NOT NULL,
	"warehouse_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_receiving_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
CREATE TABLE "wms_receiving_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receiving_id" uuid NOT NULL,
	"product_id" uuid,
	"ordered_qty" real DEFAULT 0 NOT NULL,
	"received_qty" real DEFAULT 0 NOT NULL,
	"hpp" real DEFAULT 0 NOT NULL,
	"qc" text DEFAULT 'pass' NOT NULL,
	"batch_no" text,
	"expired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "wms_recipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"yield_qty" text DEFAULT '1' NOT NULL,
	"sell_price" integer DEFAULT 0 NOT NULL,
	"version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_stock_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"product_id" uuid,
	"warehouse_id" uuid,
	"qty" real NOT NULL,
	"value_hpp" real DEFAULT 0 NOT NULL,
	"ref_doc" text DEFAULT '' NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_stock_opname" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"warehouse_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_warehouse" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_warehouse_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "wms_warehouse_stock" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"qty" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wms_batch" ADD CONSTRAINT "wms_batch_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_batch" ADD CONSTRAINT "wms_batch_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_bom_item" ADD CONSTRAINT "wms_bom_item_recipe_id_wms_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."wms_recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_bom_item" ADD CONSTRAINT "wms_bom_item_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_internal_order" ADD CONSTRAINT "wms_internal_order_outlet_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("outlet_warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_internal_order" ADD CONSTRAINT "wms_internal_order_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_internal_order_item" ADD CONSTRAINT "wms_internal_order_item_order_id_wms_internal_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."wms_internal_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_internal_order_item" ADD CONSTRAINT "wms_internal_order_item_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_internal_order_item" ADD CONSTRAINT "wms_internal_order_item_batch_id_wms_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."wms_batch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD CONSTRAINT "wms_opname_line_opname_id_wms_stock_opname_id_fk" FOREIGN KEY ("opname_id") REFERENCES "public"."wms_stock_opname"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_opname_line" ADD CONSTRAINT "wms_opname_line_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD CONSTRAINT "wms_receiving_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_receiving" ADD CONSTRAINT "wms_receiving_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ADD CONSTRAINT "wms_receiving_item_receiving_id_wms_receiving_id_fk" FOREIGN KEY ("receiving_id") REFERENCES "public"."wms_receiving"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_receiving_item" ADD CONSTRAINT "wms_receiving_item_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_movement" ADD CONSTRAINT "wms_stock_movement_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_movement" ADD CONSTRAINT "wms_stock_movement_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_movement" ADD CONSTRAINT "wms_stock_movement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD CONSTRAINT "wms_stock_opname_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_stock_opname" ADD CONSTRAINT "wms_stock_opname_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_warehouse_stock" ADD CONSTRAINT "wms_warehouse_stock_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_warehouse_stock" ADD CONSTRAINT "wms_warehouse_stock_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wms_batch_product_idx" ON "wms_batch" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "wms_batch_fefo_idx" ON "wms_batch" USING btree ("product_id","expired_at");--> statement-breakpoint
CREATE INDEX "wms_bom_item_recipe_idx" ON "wms_bom_item" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "wms_cold_chain_unit_idx" ON "wms_cold_chain_reading" USING btree ("unit_code","recorded_at");--> statement-breakpoint
CREATE INDEX "wms_internal_order_item_order_idx" ON "wms_internal_order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "wms_opname_line_opname_idx" ON "wms_opname_line" USING btree ("opname_id");--> statement-breakpoint
CREATE INDEX "wms_product_category_idx" ON "wms_product" USING btree ("category");--> statement-breakpoint
CREATE INDEX "wms_receiving_item_rec_idx" ON "wms_receiving_item" USING btree ("receiving_id");--> statement-breakpoint
CREATE INDEX "wms_stock_movement_product_idx" ON "wms_stock_movement" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "wms_stock_movement_type_idx" ON "wms_stock_movement" USING btree ("type");--> statement-breakpoint
CREATE INDEX "wms_stock_movement_created_at_idx" ON "wms_stock_movement" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wms_warehouse_stock_product_wh_idx" ON "wms_warehouse_stock" USING btree ("product_id","warehouse_id");