ALTER TABLE "member_accounts" ADD COLUMN "pin_set_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
-- Konservatif: semua akun yang sudah ada dianggap sudah memilih PIN (wajib PIN lama untuk mengganti).
-- Hanya akun baru dari Google (password acak) yang diisi null oleh aplikasi.
COMMENT ON COLUMN "member_accounts"."pin_set_at" IS 'null = akun Google berpassword acak, boleh buat PIN pertama tanpa PIN lama';
