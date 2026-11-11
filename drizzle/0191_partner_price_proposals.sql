CREATE TABLE "partner_price_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_no" text NOT NULL,
	"partner_id" uuid NOT NULL,
	"link_id" uuid NOT NULL,
	"variant_id" text NOT NULL,
	"current_unit_cost" integer NOT NULL,
	"current_sell_price" integer NOT NULL,
	"proposed_unit_cost" integer NOT NULL,
	"suggested_sell_price" integer,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_unit_cost" integer,
	"decided_sell_price" integer,
	"decision_note" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"price_history_id" uuid,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_price_proposals" ADD CONSTRAINT "partner_price_proposals_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_price_proposals" ADD CONSTRAINT "partner_price_proposals_link_id_partner_product_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."partner_product_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_price_proposals" ADD CONSTRAINT "partner_price_proposals_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_price_proposals" ADD CONSTRAINT "partner_price_proposals_price_history_id_partner_price_history_id_fk" FOREIGN KEY ("price_history_id") REFERENCES "public"."partner_price_history"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_price_proposals_no_idx" ON "partner_price_proposals" USING btree ("proposal_no");--> statement-breakpoint
CREATE INDEX "partner_price_proposals_partner_idx" ON "partner_price_proposals" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_price_proposals_pending_idx" ON "partner_price_proposals" USING btree ("link_id","variant_id") WHERE status = 'pending';