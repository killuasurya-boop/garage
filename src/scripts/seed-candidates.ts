import { getDb, ensureDatabaseReady } from "@/db";
import { candidates } from "@/db/schema";
import { sql } from "drizzle-orm";

async function main() {
  await ensureDatabaseReady();
  const db = getDb();

  console.log("Menghapus data pelamar lama (opsional, untuk clean testing)...");
  await db.execute(sql`DELETE FROM "candidates"`);

  console.log("Menyisipkan 3 data dummy pelamar...");
  await db.insert(candidates).values([
    {
      fullName: "Budi Santoso",
      whatsapp: "081234567890",
      email: "budi.santoso@example.com",
      domicile: "Medan",
      gender: "Laki-laki",
      birthDate: "1998-05-12",
      appliedPosition: "Barista",
      preferredLocation: "Tebing Tinggi",
      availableStartDate: "2026-07-01",
      willingShift: true,
      willingRelocate: false,
      education: "S1 Manajemen",
      lastExperience: "Barista Kopi Kenangan",
      experienceDuration: "2 Tahun",
      mainSkill: "Latte Art, Espresso",
      finalDecision: "New Applicant", // Status default
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      fullName: "Siti Aminah",
      whatsapp: "081987654321",
      email: "siti.aminah@example.com",
      domicile: "Binjai",
      gender: "Perempuan",
      birthDate: "1999-11-20",
      appliedPosition: "Cashier",
      preferredLocation: "Tebing Tinggi",
      availableStartDate: "2026-06-25",
      willingShift: true,
      willingRelocate: true,
      education: "SMA",
      lastExperience: "Kasir Indomaret",
      experienceDuration: "1 Tahun",
      mainSkill: "Komunikasi, Teliti",
      finalDecision: "Interview Scheduled", // Sedang tahap interview
      interviewDate: new Date(Date.now() + 86400000 * 2), // 2 hari ke depan
      interviewLink: "https://zoom.us/j/123456789",
      createdAt: new Date(Date.now() - 86400000), // 1 hari lalu
      updatedAt: new Date(),
    },
    {
      fullName: "Rizky Firmansyah",
      whatsapp: "082233445566",
      email: "rizky.f@example.com",
      domicile: "Tebing Tinggi",
      gender: "Laki-laki",
      birthDate: "2000-01-05",
      appliedPosition: "Kitchen Crew",
      preferredLocation: "Tebing Tinggi",
      availableStartDate: "2026-06-22",
      willingShift: true,
      willingRelocate: false,
      education: "SMK Tata Boga",
      lastExperience: "Cook Helper di RM Padang",
      experienceDuration: "6 Bulan",
      mainSkill: "Memotong cepat, bersih",
      finalDecision: "Rejected", // Ditolak
      createdAt: new Date(Date.now() - 86400000 * 5),
      updatedAt: new Date(),
    }
  ]);

  console.log("Selesai! Dummy pelamar berhasil ditambahkan.");
  process.exit(0);
}

main().catch(console.error);
