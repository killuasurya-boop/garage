ALTER TABLE "expenses" ADD COLUMN "source_doc" text;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_source_doc_uidx" ON "expenses" USING btree ("source_doc");--> statement-breakpoint
-- Belanja bahan dibayar cash langsung dari penerimaan gudang (owner, Okt 2026).
INSERT INTO "finance_expense_categories" ("name", "group_key", "cost_class", "cost_item_code") VALUES ('Belanja Umum', 'cogs_purchase', 'variable', NULL) ON CONFLICT ("name") DO NOTHING;
