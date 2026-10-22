CREATE TABLE "wms_closing_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"outlet_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"capability" text NOT NULL,
	CONSTRAINT "wms_closing_access_capability_check" CHECK ("wms_closing_access"."capability" in ('bar','dapur','warehouse'))
);
--> statement-breakpoint
CREATE TABLE "wms_closing_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"source_batch_id" uuid NOT NULL,
	"transit_batch_id" uuid NOT NULL,
	"batch_no" text NOT NULL,
	"expired_at" timestamp with time zone,
	"hpp" numeric(14, 4) NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"received_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"damaged_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	CONSTRAINT "wms_closing_allocation_amount_check" CHECK ("wms_closing_allocation"."qty" > 0 and "wms_closing_allocation"."hpp" >= 0 and "wms_closing_allocation"."received_qty" >= 0 and "wms_closing_allocation"."damaged_qty" >= 0 and "wms_closing_allocation"."received_qty" + "wms_closing_allocation"."damaged_qty" <= "wms_closing_allocation"."qty")
);
--> statement-breakpoint
CREATE TABLE "wms_closing_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"request_id" uuid,
	"action" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_closing_location" (
	"warehouse_id" uuid PRIMARY KEY NOT NULL,
	"outlet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"area" text NOT NULL,
	CONSTRAINT "wms_closing_location_kind_check" CHECK ("wms_closing_location"."kind" in ('main','bar','dapur','transit','damaged')),
	CONSTRAINT "wms_closing_location_area_check" CHECK ("wms_closing_location"."area" in ('bar','dapur','umum'))
);
--> statement-breakpoint
CREATE TABLE "wms_closing_mutation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_closing_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"outlet_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"division" text NOT NULL,
	"business_date" date NOT NULL,
	"needed_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"no_request" boolean DEFAULT false NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_closing_request_doc_unique" UNIQUE("doc"),
	CONSTRAINT "wms_closing_request_division_check" CHECK ("wms_closing_request"."division" in ('bar','dapur')),
	CONSTRAINT "wms_closing_request_status_check" CHECK ("wms_closing_request"."status" in ('draft','submitted','under_review','approved','partially_available','preparing','ready','dispatched','partially_received','completed','rejected','cancelled')),
	CONSTRAINT "wms_closing_request_dates_check" CHECK ("wms_closing_request"."needed_date" >= "wms_closing_request"."business_date")
);
--> statement-breakpoint
CREATE TABLE "wms_closing_request_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"system_qty" numeric(14, 4) NOT NULL,
	"physical_qty" numeric(14, 4),
	"target_qty" numeric(14, 4) NOT NULL,
	"incoming_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"recommendation_qty" numeric(14, 4) NOT NULL,
	"requested_qty" numeric(14, 4) NOT NULL,
	"approved_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"prepared_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"dispatched_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"received_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"damaged_qty" numeric(14, 4) DEFAULT 0 NOT NULL,
	"override_reason" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "wms_closing_item_amount_check" CHECK (("wms_closing_request_item"."physical_qty" is null or "wms_closing_request_item"."physical_qty" >= 0) and "wms_closing_request_item"."target_qty" >= 0 and "wms_closing_request_item"."incoming_qty" >= 0 and "wms_closing_request_item"."recommendation_qty" >= 0 and "wms_closing_request_item"."requested_qty" >= 0 and "wms_closing_request_item"."approved_qty" >= 0 and "wms_closing_request_item"."approved_qty" <= "wms_closing_request_item"."requested_qty" and "wms_closing_request_item"."prepared_qty" >= 0 and "wms_closing_request_item"."prepared_qty" <= "wms_closing_request_item"."approved_qty" and "wms_closing_request_item"."dispatched_qty" >= 0 and "wms_closing_request_item"."dispatched_qty" <= "wms_closing_request_item"."prepared_qty" and "wms_closing_request_item"."received_qty" >= 0 and "wms_closing_request_item"."damaged_qty" >= 0 and "wms_closing_request_item"."received_qty" + "wms_closing_request_item"."damaged_qty" <= "wms_closing_request_item"."dispatched_qty")
);
--> statement-breakpoint
CREATE TABLE "wms_closing_reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_closing_reservation_qty_check" CHECK ("wms_closing_reservation"."qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "wms_closing_settings" (
	"outlet_id" uuid PRIMARY KEY NOT NULL,
	"open_time" text DEFAULT '15:00' NOT NULL,
	"close_time" text DEFAULT '23:00' NOT NULL,
	"cutoff_time" text DEFAULT '23:59' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wms_closing_shipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc" text NOT NULL,
	"request_id" uuid NOT NULL,
	"source_warehouse_id" uuid NOT NULL,
	"transit_warehouse_id" uuid NOT NULL,
	"destination_warehouse_id" uuid NOT NULL,
	"status" text DEFAULT 'dispatched' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_closing_shipment_doc_unique" UNIQUE("doc")
);
--> statement-breakpoint
CREATE TABLE "wms_closing_shortage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(14, 4) NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"supplier_id" uuid,
	"last_unit_price" numeric(14, 4) DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wms_closing_shortage_item_id_unique" UNIQUE("item_id")
);
--> statement-breakpoint
ALTER TABLE "wms_closing_access" ADD CONSTRAINT "wms_closing_access_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_access" ADD CONSTRAINT "wms_closing_access_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_access" ADD CONSTRAINT "wms_closing_access_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_allocation" ADD CONSTRAINT "wms_closing_allocation_shipment_id_wms_closing_shipment_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."wms_closing_shipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_allocation" ADD CONSTRAINT "wms_closing_allocation_item_id_wms_closing_request_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."wms_closing_request_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_allocation" ADD CONSTRAINT "wms_closing_allocation_source_batch_id_wms_batch_id_fk" FOREIGN KEY ("source_batch_id") REFERENCES "public"."wms_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_allocation" ADD CONSTRAINT "wms_closing_allocation_transit_batch_id_wms_batch_id_fk" FOREIGN KEY ("transit_batch_id") REFERENCES "public"."wms_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_event" ADD CONSTRAINT "wms_closing_event_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_event" ADD CONSTRAINT "wms_closing_event_request_id_wms_closing_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."wms_closing_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_event" ADD CONSTRAINT "wms_closing_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_location" ADD CONSTRAINT "wms_closing_location_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_location" ADD CONSTRAINT "wms_closing_location_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_mutation" ADD CONSTRAINT "wms_closing_mutation_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_mutation" ADD CONSTRAINT "wms_closing_mutation_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_request" ADD CONSTRAINT "wms_closing_request_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_request" ADD CONSTRAINT "wms_closing_request_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_request" ADD CONSTRAINT "wms_closing_request_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_request_item" ADD CONSTRAINT "wms_closing_request_item_request_id_wms_closing_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."wms_closing_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_request_item" ADD CONSTRAINT "wms_closing_request_item_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_reservation" ADD CONSTRAINT "wms_closing_reservation_item_id_wms_closing_request_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."wms_closing_request_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_reservation" ADD CONSTRAINT "wms_closing_reservation_product_id_wms_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."wms_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_reservation" ADD CONSTRAINT "wms_closing_reservation_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_settings" ADD CONSTRAINT "wms_closing_settings_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_shipment" ADD CONSTRAINT "wms_closing_shipment_request_id_wms_closing_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."wms_closing_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_shipment" ADD CONSTRAINT "wms_closing_shipment_source_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_shipment" ADD CONSTRAINT "wms_closing_shipment_transit_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("transit_warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_shipment" ADD CONSTRAINT "wms_closing_shipment_destination_warehouse_id_wms_warehouse_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."wms_warehouse"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_shipment" ADD CONSTRAINT "wms_closing_shipment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_shortage" ADD CONSTRAINT "wms_closing_shortage_item_id_wms_closing_request_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."wms_closing_request_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wms_closing_shortage" ADD CONSTRAINT "wms_closing_shortage_supplier_id_wms_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."wms_supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wms_closing_access_scope" ON "wms_closing_access" USING btree ("user_id","warehouse_id","capability");--> statement-breakpoint
CREATE UNIQUE INDEX "wms_closing_mutation_replay" ON "wms_closing_mutation" USING btree ("outlet_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "wms_closing_request_daily" ON "wms_closing_request" USING btree ("outlet_id","warehouse_id","business_date");--> statement-breakpoint
CREATE INDEX "wms_closing_request_needed" ON "wms_closing_request" USING btree ("outlet_id","needed_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "wms_closing_request_item_material" ON "wms_closing_request_item" USING btree ("request_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wms_closing_reservation_item_source" ON "wms_closing_reservation" USING btree ("item_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "wms_closing_reservation_source" ON "wms_closing_reservation" USING btree ("product_id","warehouse_id");