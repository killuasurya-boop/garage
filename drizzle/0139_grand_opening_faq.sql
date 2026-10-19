-- Grand Opening (owner, Okt 2026): acara terbuka untuk semua orang (21+), dress code smart casual.
-- Hanya mengisi FAQ yang masih kosong — isian owner di Konten Event tidak ditimpa.
UPDATE "events"
SET "faq" = '[{"q":"Apakah acara terbuka untuk umum?","a":"Ya, Grand Opening terbuka untuk semua orang berusia 21 tahun ke atas. Undangan pribadi hanya untuk konfirmasi kehadiran tamu undangan."},{"q":"Dress code?","a":"Smart casual."},{"q":"Apakah ada batas usia?","a":"Ya, acara ini untuk pengunjung berusia 21 tahun ke atas."}]'::jsonb,
    "updated_at" = now()
WHERE "slug" = 'grand-opening' AND jsonb_array_length("faq") = 0;
