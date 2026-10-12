-- Owner (Okt 2026): Garage tidak memungut pajak (PB1) & service charge.
-- Nilai lama yang tersimpan (global maupun override outlet) dinolkan; default kode juga 0.
UPDATE "app_settings" SET "value_json" = '0'::jsonb, "updated_at" = now() WHERE "key" IN ('taxPct', 'serviceChargePct');
