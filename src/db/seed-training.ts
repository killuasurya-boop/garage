import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { getDb, ensureDatabaseReady } from "@/db";
import {
  trainingCourses,
  trainingLessons,
  sopChecklists,
  outlets
} from "@/db/schema";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

async function seedTrainingAndSop() {
  await ensureDatabaseReady();
  const db = getDb();
  
  const [outlet] = await db.select().from(outlets).limit(1);
  if (!outlet) {
    console.error("No outlet found. Please run db:seed first.");
    return;
  }

  console.log("Seeding Training Courses...");
  const [course1] = await db.insert(trainingCourses).values({
    slug: "onboarding-umum",
    title: "Onboarding Umum & Budaya GARAGE",
    category: "General",
    targetRoles: ["All"],
    summary: "Pelatihan dasar untuk semua karyawan baru mengenai visi, misi, dan penggunaan dasar Garage OS.",
    sortOrder: 1,
    status: "active"
  }).onConflictDoUpdate({
    target: trainingCourses.slug,
    set: { title: "Onboarding Umum & Budaya GARAGE", summary: "Pelatihan dasar untuk semua karyawan baru mengenai visi, misi, dan penggunaan dasar Garage OS.", updatedAt: new Date() }
  }).returning();

  // Clear existing lessons to prevent duplicates if we re-seed
  await db.delete(trainingLessons).where(sql`course_id = ${course1.id}`);

  await db.insert(trainingLessons).values([
    {
      courseId: course1.id,
      title: "Budaya & Visi Misi Garage",
      summary: "Memahami budaya pelayanan yang cepat, tepat, dan ramah.",
      checklist: ["Tonton video sambutan CEO", "Baca manifesto Garage"],
      sortOrder: 1
    },
    {
      courseId: course1.id,
      title: "Pengenalan Garage OS Dasar",
      summary: "Cara login, absen, dan melihat profil.",
      checklist: ["Praktek login dengan PIN", "Praktek absen masuk dan keluar"],
      sortOrder: 2
    },
    {
      courseId: course1.id,
      title: "Lonceng Pengawasan AI",
      summary: "Memahami cara kerja pengawasan dan alert dari Garage AI.",
      checklist: ["Baca panduan Lonceng AI", "Simulasi menandai tugas selesai"],
      sortOrder: 3
    }
  ]);

  const [course2] = await db.insert(trainingCourses).values({
    slug: "tutorial-kasir",
    title: "Modul Kasir & Front of House",
    category: "Operations",
    targetRoles: ["Kasir", "Waiter", "Supervisor Shift"],
    summary: "Panduan lengkap penggunaan POS, penerimaan pesanan, dan penyelesaian kas.",
    sortOrder: 2,
    status: "active"
  }).onConflictDoUpdate({
    target: trainingCourses.slug,
    set: { title: "Modul Kasir & Front of House", updatedAt: new Date() }
  }).returning();

  await db.delete(trainingLessons).where(sql`course_id = ${course2.id}`);

  await db.insert(trainingLessons).values([
    {
      courseId: course2.id,
      title: "Tutorial POS 101",
      summary: "Cara menerima pesanan, split tagihan, dan pembayaran.",
      checklist: ["Praktek input order Dine-In", "Praktek bayar QRIS dan Tunai"],
      sortOrder: 1
    },
    {
      courseId: course2.id,
      title: "SOP Shift Handovers",
      summary: "Cara buka kas, tutup kas, dan serah terima.",
      checklist: ["Praktek buka Cash Session", "Praktek tutup Cash Session"],
      sortOrder: 2
    }
  ]);

  const [course3] = await db.insert(trainingCourses).values({
    slug: "tutorial-kitchen",
    title: "Modul Dapur & Bar (BOH)",
    category: "Operations",
    targetRoles: ["Koki", "Barista", "Asisten Koki", "Kitchen / Barista"],
    summary: "Panduan lengkap KDS, manajemen resep, dan order prep.",
    sortOrder: 3,
    status: "active"
  }).onConflictDoUpdate({
    target: trainingCourses.slug,
    set: { title: "Modul Dapur & Bar (BOH)", updatedAt: new Date() }
  }).returning();

  await db.delete(trainingLessons).where(sql`course_id = ${course3.id}`);

  await db.insert(trainingLessons).values([
    {
      courseId: course3.id,
      title: "SOP KDS & Prioritas",
      summary: "Mengelola tiket pesanan di dapur.",
      checklist: ["Bump order selesai", "Identifikasi order overdue"],
      sortOrder: 1
    }
  ]);

  const [course4] = await db.insert(trainingCourses).values({
    slug: "buku-pintar-panduan-sop-karyawan",
    title: "Buku Pintar: Panduan & SOP Karyawan",
    category: "SOP & Onboarding",
    targetRoles: ["All"],
    summary:
      "Dokumen training komprehensif untuk onboarding karyawan GARAGE: budaya kerja, checklist harian, SOP utama, tutorial sistem, dan troubleshooting.",
    sortOrder: 0,
    status: "active"
  }).onConflictDoUpdate({
    target: trainingCourses.slug,
    set: {
      title: "Buku Pintar: Panduan & SOP Karyawan",
      category: "SOP & Onboarding",
      targetRoles: ["All"],
      summary:
        "Dokumen training komprehensif untuk onboarding karyawan GARAGE: budaya kerja, checklist harian, SOP utama, tutorial sistem, dan troubleshooting.",
      sortOrder: 0,
      status: "active",
      updatedAt: new Date()
    }
  }).returning();

  await db.delete(trainingLessons).where(sql`course_id = ${course4.id}`);

  await db.insert(trainingLessons).values([
    {
      courseId: course4.id,
      title: "BAB 1: Budaya Kerja & Aturan Utama",
      summary:
        "Onboarding wajib untuk semua karyawan: sikap kerja, absensi, tanggung jawab operasional, dan koordinasi antar tim.",
      checklist: [
        "**Jujur:** laporkan selisih kas, stok hilang, void, refund, komplain, dan salah input tanpa ditunda.",
        "**Rapi:** gunakan seragam, jaga kebersihan area, rapikan alat, dan jangan tinggalkan station berantakan.",
        "**Teliti:** cek nomor meja, item, qty, varian, harga, diskon, payment, dan struk sebelum final.",
        "**Komunikatif:** sampaikan masalah dengan format masalah, lokasi/meja, dampak, tindakan sementara, dan bantuan yang dibutuhkan.",
        "**Disiplin:** clock-in sebelum kerja, jalankan opening checklist, ikuti SOP shift, dan clock-out setelah handover selesai.",
        "Absensi wajib memakai akun/PIN sendiri; dilarang menitipkan absensi atau memakai akun staff lain.",
        "Kasir, waiter, bar/kitchen, gudang, dan supervisor wajib memberi update status kerja agar order, stok, dan komplain tidak putus koordinasi."
      ],
      documentSlug: "buku-pintar-panduan-sop-karyawan",
      sortOrder: 1
    },
    {
      courseId: course4.id,
      title: "BAB 2: Alur Kerja Harian (Daily Workflow Checklist)",
      summary:
        "Checklist runut waktu untuk shift pagi/opening, jam operasional utama, dan shift malam/closing.",
      checklist: [
        "H-15: hadir di outlet, gunakan seragam lengkap, dan simpan barang pribadi di tempat aman.",
        "H-10: clock-in, cek jadwal, baca briefing shift, dan cek pembagian area kerja.",
        "H-8: nyalakan POS, printer struk, tablet waiter, KDS, router, payment device, dan alat produksi.",
        "H-6: login GARAGE OS, cek koneksi, printer, cash drawer, QRIS/payment, dan status sistem.",
        "H-5: kasir buka cash session dan hitung modal awal; bar/kitchen cek bahan, alat, dan menu kosong.",
        "Jam operasional: sambut pelanggan, input order, konfirmasi ulang, pantau KDS, update status order, proses payment, dan laporkan stok/komplain.",
        "Closing: pastikan order aktif selesai, cocokkan kas/payment, catat stok kritis/waste/incident, bersihkan area, buat handover, minta acknowledge, lalu clock-out."
      ],
      documentSlug: "buku-pintar-panduan-sop-karyawan",
      sortOrder: 2
    },
    {
      courseId: course4.id,
      title: "BAB 3: SOP Utama Posisi Operasional",
      summary:
        "SOP krusial untuk penerimaan order, pembayaran, closing handover, dan komplain pelanggan.",
      checklist: [
        "**SOP Penerimaan Order:** tentukan tipe order, pastikan nomor meja, input item/varian/qty/catatan, bacakan ulang, kirim ke KDS, lalu pantau sampai served.",
        "**Output Penerimaan Order:** tiket produksi benar, order tidak salah meja, dan pelanggan menerima item sesuai pesanan.",
        "**SOP Pembayaran:** buka bill, cek item/total, pilih metode payment, validasi QRIS/transfer, cetak/kirim struk, dan pastikan status lunas.",
        "**Output Pembayaran:** bill lunas, payment method benar, struk tersedia, dan kas shift cocok.",
        "**SOP Closing & Handover:** selesaikan order aktif, hitung kas, catat payment breakdown, catat stok/incident, bersihkan area, buat handover, dan minta acknowledge.",
        "**SOP Komplain:** dengarkan, minta maaf, cek fakta order, tawarkan solusi dalam wewenang, dan eskalasi refund/kompensasi besar ke Supervisor."
      ],
      documentSlug: "buku-pintar-panduan-sop-karyawan",
      sortOrder: 3
    },
    {
      courseId: course4.id,
      title: "BAB 4: Tutorial Teknis GARAGE OS & Alat Kerja",
      summary:
        "Panduan praktis menggunakan POS, KDS, inventory, absensi, dan handover.",
      checklist: [
        "**POS Kasir:** login akun sendiri, buka cash session, pilih tipe order, input item, kirim ke kitchen/bar, proses payment, lalu cetak/kirim struk.",
        "**POS Do:** cek total sebelum payment, simpan bukti, catat refund/void/diskon manual.",
        "**POS Don't:** jangan melunaskan bill sebelum payment valid, jangan ubah harga tanpa approval, dan jangan hapus transaksi untuk menutup selisih.",
        "**KDS:** baca tiket, ikuti catatan khusus, update in progress/ready tepat waktu, dan laporkan delay sebelum pelanggan komplain.",
        "**Inventory:** cek stok kritis, input receiving, catat waste/rusak/hilang, lakukan opname, dan laporkan stok minus.",
        "**Absensi & Handover:** clock-in sebelum shift, jalankan checklist, buat handover nyata, minta acknowledge, dan clock-out setelah tugas selesai."
      ],
      documentSlug: "buku-pintar-panduan-sop-karyawan",
      sortOrder: 4
    },
    {
      courseId: course4.id,
      title: "BAB 5: Troubleshooting & Escalation Plan",
      summary:
        "Panduan mengatasi masalah lapangan dan batas kapan wajib lapor Supervisor, Manager, atau HRD.",
      checklist: [
        "**Selisih kas:** hitung ulang cash drawer, cocokkan payment breakdown, cek refund/void/diskon, catat nominal; eskalasi ke Supervisor/Finance jika lebih dari 10 menit belum selesai.",
        "**Sistem error:** refresh sekali, cek koneksi, cek perangkat lain, cek health/indikator sistem, catat order manual hanya atas izin Supervisor; eskalasi jika lebih dari 5 menit menghambat transaksi.",
        "**Komplain pelanggan:** dengarkan, minta maaf, cek order/meja/item/waktu, beri solusi dalam wewenang; eskalasi refund besar, pelanggan marah, atau isu keamanan makanan.",
        "**Stok tidak sesuai:** hitung fisik, cek receiving/waste/transfer, tandai item kosong, catat penyebab; eskalasi selisih besar atau dugaan kehilangan ke Gudang/Supervisor.",
        "**Aturan eskalasi:** selesaikan sendiri hanya masalah kecil 5-10 menit; lapor Supervisor untuk uang, stok, pelanggan, alat, dan order terlambat; lapor Manager/HRD untuk disiplin, konflik, keselamatan, atau dugaan kecurangan."
      ],
      documentSlug: "buku-pintar-panduan-sop-karyawan",
      sortOrder: 5
    }
  ]);

  console.log("Seeding SOP Checklists...");
  const sopSeed = [
    {
      title: "Opening Outlet Umum",
      description:
        "Hadir H-15, clock-in, cek briefing, rapikan area, nyalakan perangkat utama, dan laporkan kendala sebelum outlet buka.",
      roleTarget: "All",
      shiftTarget: "morning"
    },
    {
      title: "Cek Sistem & Device",
      description:
        "Pastikan GARAGE OS, POS, printer struk, tablet waiter, KDS, router, dan payment device aktif sebelum transaksi pertama.",
      roleTarget: "All",
      shiftTarget: "morning"
    },
    {
      title: "Briefing Shift & Pembagian Area",
      description:
        "Baca target shift, menu kosong, stok kritis, event, promo, dan pembagian station; ulangi instruksi yang berisiko salah.",
      roleTarget: "All",
      shiftTarget: "morning"
    },
    {
      title: "Core Service Loop",
      description:
        "Sambut pelanggan, input order akurat, pantau status produksi, update handoff, jaga kebersihan station, dan eskalasi delay.",
      roleTarget: "All",
      shiftTarget: "all"
    },
    {
      title: "Log Incident & Komplain",
      description:
        "Catat komplain, salah order, refund, void, stok kosong, alat rusak, atau delay lebih dari standar; kirim ke Supervisor sebelum shift selesai.",
      roleTarget: "All",
      shiftTarget: "all"
    },
    {
      title: "Closing & Handover Umum",
      description:
        "Tutup pekerjaan aktif, bersihkan area, catat stok kritis/waste/incident, buat handover, minta acknowledge, lalu clock-out.",
      roleTarget: "All",
      shiftTarget: "evening"
    },
    {
      title: "Admin Ops Control",
      description:
        "Cek dashboard operasional, user aktif, order bermasalah, approval tertunda, stok kritis, dan follow-up lintas divisi.",
      roleTarget: "Admin",
      shiftTarget: "all"
    },
    {
      title: "Owner Command Review",
      description:
        "Review omzet, margin, kas, approval besar, risiko operasional, dan laporan shift sebelum memberi keputusan strategis.",
      roleTarget: "Owner / CEO",
      shiftTarget: "all"
    },
    {
      title: "Kasir Opening Cash Session",
      description:
        "Hitung modal awal, buka cash session, cek QRIS/payment, test printer, siapkan uang kecil, dan pastikan struk bisa keluar.",
      roleTarget: "Kasir",
      shiftTarget: "morning"
    },
    {
      title: "Kasir Payment & Bill Control",
      description:
        "Cek item dan total bill, validasi metode bayar, pastikan status lunas, cetak/kirim struk, dan jangan close bill sebelum payment valid.",
      roleTarget: "Kasir",
      shiftTarget: "all"
    },
    {
      title: "Kasir Closing Cash Session",
      description:
        "Cocokkan cash, QRIS, transfer, refund, void, dan diskon; catat selisih; serahkan laporan ke Supervisor/Owner.",
      roleTarget: "Kasir",
      shiftTarget: "evening"
    },
    {
      title: "Waiter Floor Readiness",
      description:
        "Cek meja, nomor table, QR meja, tissue, menu, kebersihan floor, dan status table sebelum pelanggan masuk.",
      roleTarget: "Waiter",
      shiftTarget: "morning"
    },
    {
      title: "Waiter Order Handoff",
      description:
        "Konfirmasi pesanan, nomor meja, catatan khusus, kirim order, pantau ready, antar item, dan update bill request ke kasir.",
      roleTarget: "Waiter",
      shiftTarget: "all"
    },
    {
      title: "Barista Machine & Bar Setup",
      description:
        "Cek grinder, espresso machine, ice bin, milk, syrup, garnish, cup/lid, dan daftar menu kosong sebelum order pertama.",
      roleTarget: "Barista",
      shiftTarget: "morning"
    },
    {
      title: "Barista KDS Production",
      description:
        "Baca tiket KDS, kerjakan FIFO dengan prioritas dine-in/takeaway, update ready, dan laporkan delay atau bahan kosong.",
      roleTarget: "Barista",
      shiftTarget: "all"
    },
    {
      title: "Kitchen Prep & Safety",
      description:
        "Cek mise en place, suhu penyimpanan, alat masak, bahan prep, label tanggal, dan kebersihan area sebelum produksi.",
      roleTarget: "Koki",
      shiftTarget: "morning"
    },
    {
      title: "Kitchen KDS Production",
      description:
        "Baca tiket, ikuti resep dan catatan khusus, update status tepat waktu, jaga plating, dan eskalasi item terlambat.",
      roleTarget: "Koki",
      shiftTarget: "all"
    },
    {
      title: "Asisten Koki Prep Support",
      description:
        "Siapkan bahan, bantu produksi, refill station, cuci alat, catat waste, dan laporkan stok menipis ke Koki/Supervisor.",
      roleTarget: "Asisten Koki",
      shiftTarget: "all"
    }
  ];

  for (const sop of sopSeed) {
    const existing = await db.select().from(sopChecklists).where(sql`title = ${sop.title} AND outlet_id = ${outlet.id}`).limit(1);
    if (existing.length === 0) {
      await db.insert(sopChecklists).values({
        outletId: outlet.id,
        title: sop.title,
        description: sop.description,
        roleTarget: sop.roleTarget,
        shiftTarget: sop.shiftTarget,
        status: "active"
      });
    } else {
      await db.update(sopChecklists).set({
        description: sop.description,
        roleTarget: sop.roleTarget,
        shiftTarget: sop.shiftTarget,
        updatedAt: new Date()
      }).where(sql`id = ${existing[0].id}`);
    }
  }

  console.log("Seeding Complete!");
  process.exit(0);
}

seedTrainingAndSop().catch((err) => {
  console.error("Error seeding training:", err);
  process.exit(1);
});
