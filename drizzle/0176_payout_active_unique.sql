-- Audit #9 (29 Okt 2026): satu pencairan AKTIF per staf, bukan unik per (staf, awal siklus).
-- Produksi saat audit: 0 baris staff_earning_payouts → tidak ada konflik.
DROP INDEX "staff_earning_payouts_staff_cycle_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "staff_earning_payouts_active_idx" ON "staff_earning_payouts" USING btree ("staff_user_id") WHERE "staff_earning_payouts"."status" in ('pending', 'approved');