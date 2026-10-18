CREATE TABLE "staff_personal" (
	"staff_profile_id" uuid PRIMARY KEY NOT NULL,
	"whatsapp" text,
	"address" text,
	"birth_date" date,
	"gender" text,
	"nik" text,
	"bank_name" text,
	"bank_account_number" text,
	"bank_account_name" text,
	"emergency_name" text,
	"emergency_relation" text,
	"emergency_phone" text,
	"contract_type" text,
	"contract_end" date,
	"photo_url" text,
	"ktp_url" text,
	"cv_url" text,
	"contract_url" text,
	"other_docs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_personal" ADD CONSTRAINT "staff_personal_staff_profile_id_staff_profiles_id_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "public"."staff_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_personal" ADD CONSTRAINT "staff_personal_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Backfill: karyawan yang sudah direkrut lewat "Jadikan Karyawan" mendapat data diri dari lamarannya.
INSERT INTO "staff_personal" ("staff_profile_id", "whatsapp", "address", "birth_date", "gender", "photo_url", "ktp_url", "cv_url")
SELECT DISTINCT ON (sp."id") sp."id", c."whatsapp", c."domicile", c."birth_date",
  CASE WHEN c."gender" IN ('Laki-laki', 'Perempuan') THEN c."gender" END,
  c."photo_url", c."ktp_url", c."cv_url"
FROM "candidates" c
JOIN "staff_wage_config" swc ON swc."absen_code" = c."hired_employee_code"
JOIN "staff_profiles" sp ON sp."user_id" = swc."staff_user_id"
WHERE c."hired_employee_code" IS NOT NULL
ORDER BY sp."id", c."hired_at" DESC NULLS LAST
ON CONFLICT ("staff_profile_id") DO NOTHING;
