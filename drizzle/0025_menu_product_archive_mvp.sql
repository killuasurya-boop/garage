-- Final MVP: menu product archive/restore instead of hard delete.

ALTER TABLE "menu_items"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS "menu_items_status_idx" ON "menu_items" ("status");
