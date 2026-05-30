-- Final MVP: expense approval helpers and audited batch stock opname.

CREATE TABLE IF NOT EXISTS "stock_opname_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL UNIQUE,
  "outlet_id" uuid REFERENCES "outlets"("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "note" text,
  "total_items" integer NOT NULL DEFAULT 0,
  "total_delta" real NOT NULL DEFAULT 0,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "approved_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "applied_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "rejected_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "approved_at" timestamp with time zone,
  "applied_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "stock_opname_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "stock_opname_sessions"("id") ON DELETE CASCADE,
  "item_sku" text REFERENCES "inventory_items"("sku") ON DELETE SET NULL,
  "item_name" text NOT NULL,
  "unit" text NOT NULL,
  "system_qty" real NOT NULL,
  "physical_qty" real NOT NULL,
  "delta" real NOT NULL,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "stock_opname_sessions_outlet_idx" ON "stock_opname_sessions" ("outlet_id");
CREATE INDEX IF NOT EXISTS "stock_opname_sessions_status_idx" ON "stock_opname_sessions" ("status");
CREATE INDEX IF NOT EXISTS "stock_opname_sessions_created_at_idx" ON "stock_opname_sessions" ("created_at");
CREATE INDEX IF NOT EXISTS "stock_opname_items_session_idx" ON "stock_opname_items" ("session_id");
CREATE INDEX IF NOT EXISTS "stock_opname_items_sku_idx" ON "stock_opname_items" ("item_sku");
