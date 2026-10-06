-- Owner (Okt 2026): upah karyawan adalah biaya pasti harian → ikut dibebankan
-- ke laba rugi setiap hari (treatment "accrue"). Bila absensi Payroll mencatat
-- upah aktual untuk hari itu, engine memakai angka aktual (tidak dobel).
UPDATE "finance_cost_items" SET "treatment" = 'accrue', "updated_at" = now() WHERE "code" = 'GAJI' AND "treatment" = 'budget_only';
