ALTER TABLE events ADD COLUMN IF NOT EXISTS outlet_id uuid REFERENCES outlets(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN IF NOT EXISTS banner_url text;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES events(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS orders_event_id_idx ON orders(event_id);
--> statement-breakpoint
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS event_snapshot jsonb;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_request_fingerprint text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS event_menu_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'item' CHECK (kind IN ('item', 'bundle')),
  name text NOT NULL,
  description text,
  menu_item_id text REFERENCES menu_items(id) ON DELETE RESTRICT,
  variant_id text,
  price integer NOT NULL CHECK (price > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  quota integer CHECK (quota IS NULL OR quota > 0),
  used_quantity integer NOT NULL DEFAULT 0 CHECK (used_quantity >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  "groups" jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_menu_entries_time_check CHECK (ends_at > starts_at),
  CONSTRAINT event_menu_entries_product_check CHECK (
    (kind = 'item' AND menu_item_id IS NOT NULL AND variant_id IS NOT NULL AND jsonb_array_length("groups") = 0)
    OR (kind = 'bundle' AND menu_item_id IS NULL AND variant_id IS NULL AND jsonb_array_length("groups") > 0)
  ),
  CONSTRAINT event_menu_entries_quota_usage_check CHECK (quota IS NULL OR used_quantity <= quota)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS event_menu_entries_event_idx ON event_menu_entries(event_id,status);
