"use client";

import { useMemo, useState } from "react";
import { BookOpen, X, ChevronDown, ChevronRight, ExternalLink, Search } from "lucide-react";

import type { ModuleId, Role } from "@/lib/garage-data";

type TutorialItem = {
  id: string;
  title: string;
  content: string[];
};

type TutorialCategory = {
  id: string;
  category: string;
  items: TutorialItem[];
};

type SopTutorialWidgetProps = {
  role?: Role;
  activeModule?: ModuleId;
  compact?: boolean;
  onOpenTraining?: () => void;
};

const roleCategoryMap: Record<Role, string[]> = {
  "Owner / CEO": ["dashboard", "finance", "audit", "hrd", "pos", "kitchen", "waitress", "inventory", "crm"],
  Admin: ["dashboard", "pos", "kitchen", "waitress", "inventory", "finance", "hrd", "audit", "crm"],
  "Manager Operasional": ["dashboard", "pos", "kitchen", "waitress", "inventory", "hrd", "audit"],
  "Finance / CFO": ["finance", "audit", "pos"],
  Kasir: ["pos", "finance", "crm"],
  Barista: ["kitchen", "inventory"],
  Koki: ["kitchen", "inventory"],
  "Asisten Koki": ["kitchen", "inventory"],
  "Waiter 1": ["waitress", "pos"],
  "Waiter 2": ["waitress", "pos"],
  "Kitchen / Barista": ["kitchen", "inventory"],
  Gudang: ["inventory"],
  "Supervisor Shift": ["dashboard", "pos", "kitchen", "waitress", "inventory", "finance", "hrd", "audit"],
  "Delivery Admin": ["pos", "crm"],
};

const moduleCategoryMap: Partial<Record<ModuleId, string[]>> = {
  dashboard: ["dashboard", "audit"],
  pos: ["pos", "finance", "crm"],
  kitchen: ["kitchen", "inventory"],
  waiter: ["waitress", "pos"],
  inventory: ["inventory", "kitchen"],
  finance: ["finance", "audit"],
  crm: ["crm", "pos"],
  membership: ["crm"],
  marketing: ["crm"],
  approvals: ["audit", "finance"],
  audit: ["audit", "finance"],
  "team-management": ["hrd"],
  training: ["pos", "kitchen", "waitress", "inventory", "finance", "hrd", "audit", "crm", "dashboard"],
  "company-control": ["dashboard", "audit", "hrd"],
};

const SOP_DATA: TutorialCategory[] = [
  {
    id: "pos",
    category: "POS & Kasir",
    items: [
      {
        id: "pos-1",
        title: "Membuat Pesanan Baru",
        content: [
          "Buka modul POS dari navigasi utama.",
          "Tekan item menu yang ingin ditambahkan (contoh: Kebab Garage).",
          "Pilih varian pada layar popup (contoh: Telur Sosis) jika menu memiliki varian.",
          "Cek total harga yang langsung terakumulasi beserta harga variannya.",
          "Klik 'Proses Pesanan' untuk mengirim tiket pesanan ke Kitchen (Dapur)."
        ]
      },
      {
        id: "pos-2",
        title: "Proses Pembayaran (Checkout)",
        content: [
          "Pada panel keranjang di sebelah kanan, tekan tombol 'Bayar'.",
          "Pilih metode pembayaran (Tunai, Debit/Kredit, QRIS, atau Split Bill).",
          "Jika Tunai, masukkan jumlah uang yang dibayarkan untuk menghitung kembalian otomatis.",
          "Tekan tombol konfirmasi pembayaran.",
          "Tawarkan pencetakan struk fisik atau pengiriman struk digital."
        ]
      },
      {
        id: "pos-3",
        title: "Void, Refund, dan Diskon Manual",
        content: [
          "Gunakan void hanya untuk transaksi salah input atau batal sebelum selesai.",
          "Refund dan diskon manual wajib punya alasan yang jelas di catatan transaksi.",
          "Jika nominal besar atau pola berulang, minta approval Manager/Owner sebelum diproses.",
          "Jangan menghapus transaksi untuk menutup selisih kas; catat selisih saat closing.",
          "Simpan bukti komunikasi pelanggan jika refund terkait komplain."
        ]
      },
      {
        id: "pos-4",
        title: "Tutup Shift Kasir",
        content: [
          "Selesaikan semua bill aktif sebelum tutup shift.",
          "Hitung uang tunai fisik, QRIS, debit, dan transfer sesuai metode pembayaran.",
          "Masukkan catatan jika ada selisih antara sistem dan uang fisik.",
          "Kirim closing untuk approval Supervisor/Finance.",
          "Jangan serahkan shift tanpa status kas dan bill pending yang jelas."
        ]
      }
    ]
  },
  {
    id: "kitchen",
    category: "Dapur & Waiter",
    items: [
      {
        id: "kds-1",
        title: "Membaca KDS (Layar Dapur)",
        content: [
          "Setiap tiket pesanan baru akan muncul di antarmuka KDS.",
          "Warna tiket akan berubah ke Amber jika mendekati batas SLA waktu penyiapan (Prep Time).",
          "Mulai kerjakan pesanan dari tiket yang paling atas (paling lama antre).",
          "Perhatikan catatan modifikasi menu (contoh: Tidak pedas, extra saos) dengan teliti."
        ]
      },
      {
        id: "kds-2",
        title: "Konfirmasi Pesanan Selesai",
        content: [
          "Saat makanan sudah siap dan di-plating, ketuk tiket pesanan di layar KDS.",
          "Pilih opsi 'Tandai Selesai' (Mark as Done).",
          "Status pesanan akan berpindah ke antrean Waiter untuk diantar ke meja.",
          "Pastikan selalu mengecek sisa bahan baku di stasiun (station) Anda agar tidak kehabisan saat ramai."
        ]
      },
      {
        id: "kds-3",
        title: "Jika Order Terlambat dari SLA",
        content: [
          "Prioritaskan tiket paling lama dan item yang sudah masuk zona amber/merah.",
          "Koordinasikan dengan waiter jika meja perlu diberi update estimasi.",
          "Jika bahan kosong, tandai sold out atau lapor Supervisor sebelum menerima order baru.",
          "Jangan mark done sebelum item benar-benar siap di-pickup.",
          "Catat penyebab delay pada handover shift jika berulang."
        ]
      }
    ]
  },
  {
    id: "inventory",
    category: "Gudang & Stok",
    items: [
      {
        id: "inv-1",
        title: "Memantau Stok Menipis",
        content: [
          "Buka modul Produk Manajemen dari panel navigasi.",
          "Perhatikan item dengan indikator Amber (Stok Terbatas) atau Merah (Habis/Sold Out).",
          "Bot internal (GarageBot) otomatis mengirim notifikasi peringatan stok ke chat grup jika batas minimal tersentuh.",
          "Segera lakukan re-order bahan baku ke supplier atau lapor ke Manajer."
        ]
      },
      {
        id: "inv-2",
        title: "Melakukan Stock Opname",
        content: [
          "Pilih menu 'Penyesuaian Stok' (Stock Opname) di dalam modul Inventory.",
          "Hitung jumlah fisik persediaan di rak/kulkas secara teliti.",
          "Masukkan angka hasil perhitungan aktual ke dalam sistem.",
          "Tuliskan alasan selisih jika ada (Contoh: Bahan tumpah, kadaluarsa, dsb).",
          "Simpan laporan untuk dikirimkan sebagai permintaan Approval (Persetujuan) ke Manajer/Owner."
        ]
      }
    ]
  },
  {
    id: "dashboard",
    category: "Owner & CEO",
    items: [
      {
        id: "dash-1",
        title: "Membaca Grafik Operasional",
        content: [
          "Buka layar Dashboard untuk melihat status real-time.",
          "Perhatikan 4 metrik utama: Revenue Hari Ini, Selisih Kas, Order Aktif, dan Approval Pending.",
          "Analisa grafik Sales Trend untuk melihat performa penjualan di setiap jam operasi.",
          "Pantau sinyal operasional peringatan, seperti 'Kitchen SLA' dan 'Akurasi Stok' (Stock Accuracy)."
        ]
      },
      {
        id: "dash-2",
        title: "Fitur CEO AI Broadcast",
        content: [
          "Buka panel 'Chat Internal Tim' di sebelah kanan atau lewat navigasi.",
          "Klik tombol merah berlogo toa (CEO AI Broadcast).",
          "Kecerdasan Buatan (AI) akan mengumpulkan data pesanan terlambat, stok habis, dan aktivitas outlet secara real-time.",
          "AI kemudian menyusun pesan evaluasi per divisi dan menugaskannya (Action Drafts) ke grup Chat yang relevan.",
          "Fitur ini eksklusif hanya untuk level akses Owner, CEO, atau Admin."
        ]
      }
    ]
  },
  {
    id: "finance",
    category: "Finance & CFO",
    items: [
      {
        id: "fin-1",
        title: "Tutup Kasir (Closing Cash Session)",
        content: [
          "Setiap akhir shift, kasir wajib melakukan 'Tutup Sesi Kasir' dari modul POS.",
          "Masukkan jumlah hitungan uang tunai aktual di laci kasir (Cash Drawer).",
          "Sistem akan membandingkan saldo sistem dengan hitungan fisik.",
          "Jika ada selisih (discrepancy), kasir harus menulis catatan penjelasan selisih.",
          "Sesi akan masuk ke status 'Pending Approval' untuk disetujui Manajer/Finance."
        ]
      },
      {
        id: "fin-2",
        title: "Mencatat Pengeluaran Operasional",
        content: [
          "Buka modul Finance > Pengeluaran.",
          "Klik 'Tambah Pengeluaran', lalu pilih Kategori (Misal: Listrik, Gas, Bahan Baku Darurat).",
          "Masukkan nominal pengeluaran dan unggah bukti nota (jika ada).",
          "Pengeluaran yang melebihi batas (limit) tertentu akan memicu notifikasi Approval ke level Manager/Owner.",
          "Pengeluaran akan langsung memotong saldo kas aktif di shift tersebut."
        ]
      }
    ]
  },
  {
    id: "hrd",
    category: "HRD & Kehadiran",
    items: [
      {
        id: "hrd-1",
        title: "Absensi Masuk & Pulang",
        content: [
          "Setiap staf wajib melakukan Absensi (Clock In) sebelum memulai shift.",
          "Gunakan kode PIN pribadi di halaman Absensi atau layar POS utama.",
          "Jangan lupa untuk Clock Out saat shift selesai.",
          "Jika lupa Clock Out, sistem otomatis menandai Anda selesai pada jam operasional berakhir dengan catatan peringatan."
        ]
      },
      {
        id: "hrd-2",
        title: "Mengelola Tugas Staf",
        content: [
          "Buka modul HR & Tim, lalu pilih 'Daftar Tugas' (Task List).",
          "Staf dapat melihat tugas-tugas yang ditugaskan oleh Manajer atau oleh CEO AI.",
          "Tandai tugas dengan status 'Selesai' (Done) setelah Anda mengerjakannya.",
          "Manajer dapat membuat tugas baru dan menugaskannya (Assign) ke peran (role) tertentu (misal: 'Semua Koki')."
        ]
      }
    ]
  },
  {
    id: "crm",
    category: "CRM & Membership",
    items: [
      {
        id: "crm-1",
        title: "Mendaftarkan Pelanggan Baru",
        content: [
          "Di layar POS, ketuk tombol 'Member' atau 'Pindai Member'.",
          "Jika pelanggan belum terdaftar, pilih 'Daftar Baru'.",
          "Masukkan Nomor HP pelanggan.",
          "Pelanggan yang terdaftar otomatis akan mendapatkan poin (Points) dari setiap pembelanjaan.",
          "Poin tersebut dapat ditukar (redeem) menjadi diskon atau produk gratis."
        ]
      },
      {
        id: "crm-2",
        title: "Kirim Promo lewat Broadcast",
        content: [
          "Masuk ke modul CRM (Marketing).",
          "Pilih menu 'Broadcast Pesan'.",
          "Pilih Segmen Pelanggan (Contoh: 'Pelanggan Pasif', 'Pecinta Kopi').",
          "Tulis isi pesan promo beserta kode Voucher.",
          "Klik Kirim untuk menembakkan blast WhatsApp ke segmen tersebut."
        ]
      }
    ]
  },
  {
    id: "waitress",
    category: "Pramusaji & Meja",
    items: [
      {
        id: "wait-1",
        title: "Memindahkan Meja (Move Table)",
        content: [
          "Buka modul Waiter atau Peta Meja.",
          "Klik pada meja pelanggan yang ingin pindah, lalu pilih 'Pindah Meja'.",
          "Pilih meja kosong (warna hijau) yang menjadi tujuan.",
          "Sistem akan otomatis memindahkan seluruh tagihan pesanan ke meja baru."
        ]
      },
      {
        id: "wait-2",
        title: "Mencetak Tagihan & QR Meja",
        content: [
          "Untuk mencetak Bill, tekan tombol 'Print Bill' pada rincian meja.",
          "Untuk meja Dine-In, Anda juga dapat mencetak QR Code unik (Order QR) yang diletakkan di meja.",
          "Pelanggan dapat melakukan scan QR tersebut untuk memesan dan membayar mandiri lewat HP."
        ]
      },
      {
        id: "wait-3",
        title: "Request Bill ke Kasir",
        content: [
          "Saat pelanggan meminta tagihan, buka meja aktif di Waiter Floor Board.",
          "Tekan request bill agar kasir mendapat handoff pembayaran.",
          "Pantau status meja: belum bayar, menunggu pembayaran, lunas, atau perlu dibersihkan.",
          "Jangan tandai meja bersih jika masih ada order aktif atau pembayaran belum selesai.",
          "Setelah lunas dan pelanggan pergi, bersihkan meja lalu siapkan untuk tamu berikutnya."
        ]
      },
      {
        id: "wait-4",
        title: "Warna Status Meja",
        content: [
          "Hijau/lunas berarti pembayaran selesai dan meja aman untuk proses berikutnya.",
          "Amber/menunggu berarti pelanggan sudah minta bill atau pembayaran belum final.",
          "Merah/aktif berarti masih ada order atau tagihan yang belum selesai.",
          "Abu/kosong berarti meja siap dipakai.",
          "Jika ragu, cek detail order sebelum menekan aksi bersih atau pindah meja."
        ]
      }
    ]
  },
  {
    id: "audit",
    category: "Audit & Keamanan",
    items: [
      {
        id: "aud-1",
        title: "Melacak Aktivitas Mencurigakan",
        content: [
          "Buka modul Audit & Keamanan di navigasi bawah (Ikon Tameng).",
          "Lihat tabel 'Log Aktivitas'. Transaksi void (batal), diskon besar, atau pengeluaran anomali akan diberi tanda (flag) merah.",
          "Klik detail kasus (case) untuk melihat waktu, staf, dan nominal.",
          "Tambahkan catatan hasil investigasi dan ubah status menjadi Resolved jika sudah tuntas."
        ]
      }
    ]
  }
];

function AccordionItem({ title, content }: { title: string; content: string[] }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-[#34343c] last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-3 text-left text-sm font-semibold text-[#e4e4e7] hover:text-white transition"
      >
        <span>{title}</span>
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {isOpen && (
        <div className="pb-3 text-sm text-[#8f8f99]">
          <ol className="list-decimal pl-5 space-y-1">
            {content.map((step, idx) => (
              <li key={idx}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function categoriesForContext(role?: Role, activeModule?: ModuleId) {
  const roleIds = role ? roleCategoryMap[role] ?? [] : [];
  const moduleIds = activeModule ? moduleCategoryMap[activeModule] ?? [] : [];
  const ids = [...moduleIds, ...roleIds];

  if (ids.length === 0) {
    return SOP_DATA;
  }

  const uniqueIds = [...new Set(ids)];
  const matched = uniqueIds
    .map((id) => SOP_DATA.find((category) => category.id === id))
    .filter((category): category is TutorialCategory => Boolean(category));

  return matched.length > 0 ? matched : SOP_DATA;
}

export function SopTutorialWidget({
  role,
  activeModule,
  compact = false,
  onOpenTraining,
}: SopTutorialWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const visibleCategories = useMemo(
    () => categoriesForContext(role, activeModule),
    [role, activeModule],
  );
  const [activeCategory, setActiveCategory] = useState<string>(visibleCategories[0]?.id ?? SOP_DATA[0].id);
  const safeActiveCategory = visibleCategories.some((category) => category.id === activeCategory)
    ? activeCategory
    : visibleCategories[0]?.id ?? SOP_DATA[0].id;

  const filteredItems = visibleCategories.flatMap((c) => c.items).filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.some((text) => text.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const currentCategoryData = visibleCategories.find((c) => c.id === safeActiveCategory);
  const contextLabel = role ? `${role}${activeModule ? ` - ${activeModule}` : ""}` : "Role aktif";

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-30 flex flex-col items-start sm:bottom-4 sm:left-4">
      {/* Tutorial Window */}
      {isOpen && (
        <div 
          className="pointer-events-auto mb-3 flex max-h-[70svh] w-[calc(100vw-1.5rem)] max-w-[360px] flex-col overflow-hidden rounded-lg border border-[#34343c] bg-[#111116] shadow-2xl shadow-black/40 transition-all duration-200 sm:max-h-[430px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#34343c] bg-[#0f0f14] px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#f5a742]/16 text-[#f5a742]">
                <BookOpen size={17} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">Panduan & SOP</h3>
                <p className="truncate text-[10px] text-[#8f8f99]">{contextLabel}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {onOpenTraining && (
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onOpenTraining();
                  }}
                  className="rounded-md p-1.5 text-[#8f8f99] transition hover:bg-white/[0.06] hover:text-white"
                  title="Buka Buku Pintar lengkap"
                  aria-label="Buka Buku Pintar lengkap"
                >
                  <ExternalLink size={15} />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1.5 text-[#8f8f99] transition hover:bg-white/[0.06] hover:text-[#d11a2a]"
                aria-label="Tutup panduan"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          
          {/* Search Bar */}
          <div className="border-b border-[#34343c] bg-[#1a1a21] p-2.5">
             <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8f8f99]" />
                <input 
                  type="text"
                  placeholder="Cari SOP..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-[#3f3f46] bg-[#111116] py-1.5 pl-9 pr-3 text-xs text-white placeholder:text-[#71717a] focus:border-[#f5a742] focus:outline-none"
                />
             </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar Categories */}
            {!searchQuery && (
              <div className="w-[42%] border-r border-[#34343c] bg-[#1a1a21] p-2 flex flex-col gap-1 overflow-y-auto garage-scroll">
                {visibleCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full rounded-md px-2 py-2 text-left text-xs font-semibold transition ${
                      safeActiveCategory === cat.id
                        ? "bg-[#34343c] text-white"
                        : "text-[#8f8f99] hover:bg-[#27272a] hover:text-[#e4e4e7]"
                    }`}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>
            )}

            {/* Content Area */}
            <div className={`flex-1 overflow-y-auto p-3 garage-scroll bg-[#111116] ${searchQuery ? "w-full" : ""}`}>
              {searchQuery ? (
                filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <AccordionItem key={item.id} title={item.title} content={item.content} />
                  ))
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-[#8f8f99]">
                    <Search size={32} className="mb-2 opacity-20" />
                    <p className="text-sm">Tidak ada panduan yang cocok dengan pencarian.</p>
                  </div>
                )
              ) : (
                currentCategoryData?.items.map((item) => (
                  <AccordionItem key={item.id} title={item.title} content={item.content} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* FAB Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`pointer-events-auto flex items-center justify-center rounded-full border shadow-lg transition-transform hover:scale-105 active:scale-95 ${
          isOpen ? "bg-[#34343c] text-white" : "bg-[#f5a742] text-[#111116]"
        } ${compact ? "h-10 w-10" : "h-11 w-11"} border-[#f5a742]/35`}
        style={{ boxShadow: "0 10px 25px -5px rgba(245, 167, 66, 0.4)" }}
        title="Panduan SOP kontekstual"
        aria-label="Buka Panduan SOP kontekstual"
      >
        {isOpen ? <X size={compact ? 18 : 20} /> : <BookOpen size={compact ? 18 : 20} />}
      </button>
    </div>
  );
}
