-- Resep usulan Garage (owner, Okt 2026): barista & koki menyusun resep untuk semua produk yang
-- belum punya resep + bahan Dapur/retail yang belum ada. Semua resep masuk DRAFT: tidak memotong
-- stok & tidak mengubah HPP sampai Owner/Manajer menekan Setujui (Gudang → Kelola Master).
-- Aman diulang & insert-only:
--   * bahan: dicocokkan per SKU lalu nama; yang sudah ada TIDAK ditimpa. Satuan bahan "belum
--     tervalidasi" (bks/btl tanpa berat bersih) diubah ke gr/ml hanya bila stoknya masih kosong
--     dan belum pernah ada mutasi gudang.
--   * resep: hanya untuk menu aktif yang belum punya resep aktif/draft/arsip.
--   * stok produk jadi (Mineral, Rokok) = bahan RTL-* (1 botol/bungkus per jual). Harga beli
--     diambil dari harga modal varian bila sudah diisi; 0 = isi di Inventory sebelum disetujui.
DO $proposal$
DECLARE
  cats jsonb := '[["Dapur · Bahan Baku", "dapur"], ["Dapur · Kemasan", "dapur"], ["Dapur · Gas & Kebersihan", "dapur"], ["Retail · Minuman Botol", "bar"], ["Retail · Rokok", "bar"]]'::jsonb;
  mats jsonb := '[
    {"sku": "KIT-001", "name": "Cabe Merah", "alt": "cabe merah", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 90000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-002", "name": "Cabe Hijau", "alt": "cabe hijau", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 50000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-003", "name": "Cabe Rawit", "alt": "cabe rawit", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 68000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-004", "name": "Bawang Putih", "alt": "bawang putih", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 36000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-005", "name": "Bawang Bombay", "alt": "bawang bombay", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 10000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-006", "name": "Bawang Merah", "alt": "bawang merah", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 7500, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-007", "name": "Terasi", "alt": "belacan / terasi (asumsi 100 gr per bungkus)", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 100, "packName": "bks", "packPrice": 7000, "assumed": true, "fixUnit": true, "menu": null},
    {"sku": "KIT-008", "name": "Daun Sop", "alt": "daun seledri", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 500, "packName": "pack", "packPrice": 10000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-009", "name": "Daun Pre", "alt": "daun bawang", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 500, "packName": "pack", "packPrice": 10000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-010", "name": "Kol", "alt": "kubis", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 12000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-011", "name": "Timun", "alt": "mentimun", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 12000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-012", "name": "Tomat", "alt": "tomat", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 17000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-013", "name": "Sawi", "alt": "sawi hijau", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 500, "packName": "pack", "packPrice": 10000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-014", "name": "Selada", "alt": "selada / slada", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 6000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-015", "name": "Tempe", "alt": "tempe papan", "category": "Dapur · Bahan Baku", "unit": "pcs", "packQty": 1, "packName": "pcs", "packPrice": 5000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-016", "name": "Garam", "alt": "garam (asumsi 1 kg per bungkus)", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "bks", "packPrice": 12000, "assumed": true, "fixUnit": true, "menu": null},
    {"sku": "KIT-017", "name": "Gula Pasir", "alt": "gula pasir dapur", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 19000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-018", "name": "Royco", "alt": "kaldu bubuk Royco 220 gr", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 220, "packName": "bks", "packPrice": 10000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-019", "name": "Kecap Manis", "alt": "kecap manis 550 ml", "category": "Dapur · Bahan Baku", "unit": "ml", "packQty": 550, "packName": "btl", "packPrice": 30000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-020", "name": "Nugget", "alt": "nugget ayam beku", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 41000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-021", "name": "Sosis", "alt": "sosis ayam", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 41000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-022", "name": "Kentang Goreng Beku", "alt": "french fries beku", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 26000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-023", "name": "Tepung Roti", "alt": "tepung panir", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 15000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-024", "name": "Tepung Beras", "alt": "tepung beras 500 gr", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 500, "packName": "bks", "packPrice": 10000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-025", "name": "Beras", "alt": "beras (karung 10 kg)", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 10000, "packName": "karung", "packPrice": 155000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-026", "name": "Minyak Goreng", "alt": "minyak goreng (per kg)", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 17000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-027", "name": "Telur", "alt": "telur ayam (asumsi 30 butir per papan)", "category": "Dapur · Bahan Baku", "unit": "pcs", "packQty": 30, "packName": "papan", "packPrice": 48000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-028", "name": "Indomie", "alt": "mie instan (asumsi 1 pack isi 10 = Rp29.000)", "category": "Dapur · Bahan Baku", "unit": "pcs", "packQty": 10, "packName": "pack", "packPrice": 29000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-029", "name": "Bumbu Nasi Goreng", "alt": "bumbu nasi goreng", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 20000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-030", "name": "Bumbu Ayam", "alt": "bumbu ungkep ayam", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 20000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-031", "name": "Ayam", "alt": "ayam potong bertulang", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 35000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-032", "name": "Gas LPG", "alt": "gas tabung (biaya operasional, bukan resep)", "category": "Dapur · Gas & Kebersihan", "unit": "pcs", "packQty": 1, "packName": "pcs", "packPrice": 18000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-033", "name": "Saus Sambal Sasa", "alt": "saos sasa (asumsi 1 kg per bungkus)", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "bks", "packPrice": 18000, "assumed": true, "fixUnit": true, "menu": null},
    {"sku": "KIT-034", "name": "Kerupuk", "alt": "kerupuk mentah (asumsi 500 gr per bungkus)", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 500, "packName": "bks", "packPrice": 15000, "assumed": true, "fixUnit": true, "menu": null},
    {"sku": "KIT-035", "name": "Sunlight", "alt": "sabun cuci piring (bukan resep)", "category": "Dapur · Gas & Kebersihan", "unit": "pcs", "packQty": 1, "packName": "pcs", "packPrice": 17000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-036", "name": "Bumbu Balado", "alt": "bumbu tabur balado (asumsi 100 gr)", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 100, "packName": "bks", "packPrice": 7000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-037", "name": "Saori Saus Tiram", "alt": "saus tiram Saori 133 ml", "category": "Dapur · Bahan Baku", "unit": "ml", "packQty": 133, "packName": "btl", "packPrice": 11000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-038", "name": "Kecap Inggris", "alt": "kecap inggris (asumsi 290 ml)", "category": "Dapur · Bahan Baku", "unit": "ml", "packQty": 290, "packName": "btl", "packPrice": 56000, "assumed": true, "fixUnit": true, "menu": null},
    {"sku": "KIT-039", "name": "Kecap Ikan", "alt": "kecap ikan 200 ml", "category": "Dapur · Bahan Baku", "unit": "ml", "packQty": 200, "packName": "btl", "packPrice": 37000, "assumed": false, "fixUnit": false, "menu": null},
    {"sku": "KIT-040", "name": "Minyak Wijen", "alt": "minyak wijen (asumsi 200 ml)", "category": "Dapur · Bahan Baku", "unit": "ml", "packQty": 200, "packName": "btl", "packPrice": 40000, "assumed": true, "fixUnit": true, "menu": null},
    {"sku": "KIT-041", "name": "Roti Burger", "alt": "roti burger isi 10", "category": "Dapur · Bahan Baku", "unit": "pcs", "packQty": 10, "packName": "pack", "packPrice": 15000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-042", "name": "Kulit Kebab", "alt": "tortilla kebab isi 10", "category": "Dapur · Bahan Baku", "unit": "pcs", "packQty": 10, "packName": "pack", "packPrice": 20000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-043", "name": "Daging Kebab Slice", "alt": "daging kebab iris", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 90000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-044", "name": "Fillet Ayam", "alt": "fillet dada ayam", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 65000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-045", "name": "Keju Slice", "alt": "keju lembaran isi 10", "category": "Dapur · Bahan Baku", "unit": "pcs", "packQty": 10, "packName": "pack", "packPrice": 18000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-046", "name": "Tepung Crispy", "alt": "tepung bumbu crispy", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "kg", "packPrice": 13000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-047", "name": "Mayones", "alt": "mayonaise 1 kg", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "bks", "packPrice": 35000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-048", "name": "Saus Tomat", "alt": "saus tomat 1 kg", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "bks", "packPrice": 18000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-049", "name": "Margarin", "alt": "margarin 1 kg", "category": "Dapur · Bahan Baku", "unit": "gr", "packQty": 1000, "packName": "bks", "packPrice": 38000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-050", "name": "Kertas Burger", "alt": "kertas bungkus burger", "category": "Dapur · Kemasan", "unit": "pcs", "packQty": 100, "packName": "pack", "packPrice": 8000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-051", "name": "Kertas Kebab", "alt": "kertas bungkus kebab", "category": "Dapur · Kemasan", "unit": "pcs", "packQty": 100, "packName": "pack", "packPrice": 8000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "KIT-052", "name": "Kotak Burger", "alt": "kotak burger take away", "category": "Dapur · Kemasan", "unit": "pcs", "packQty": 100, "packName": "pack", "packPrice": 35000, "assumed": true, "fixUnit": false, "menu": null},
    {"sku": "RTL-001", "name": "Air Mineral", "alt": "air mineral botol (stok produk jadi)", "category": "Retail · Minuman Botol", "unit": "btl", "packQty": 24, "packName": "dus", "packPrice": 0, "assumed": false, "fixUnit": false, "menu": "minuman-mineral"},
    {"sku": "RTL-002", "name": "Rokok Apel Djarum", "alt": "rokok per bungkus (stok produk jadi)", "category": "Retail · Rokok", "unit": "bks", "packQty": 10, "packName": "slop", "packPrice": 0, "assumed": false, "fixUnit": false, "menu": "rokok-apel-djarum"},
    {"sku": "RTL-003", "name": "Rokok Black Matcha", "alt": "rokok per bungkus (stok produk jadi)", "category": "Retail · Rokok", "unit": "bks", "packQty": 10, "packName": "slop", "packPrice": 0, "assumed": false, "fixUnit": false, "menu": "rokok-black-matcha"},
    {"sku": "RTL-004", "name": "Rokok LA Purple", "alt": "rokok per bungkus (stok produk jadi)", "category": "Retail · Rokok", "unit": "bks", "packQty": 10, "packName": "slop", "packPrice": 0, "assumed": false, "fixUnit": false, "menu": "rokok-la-purple"},
    {"sku": "RTL-005", "name": "Rokok LA Manggo", "alt": "rokok per bungkus (stok produk jadi)", "category": "Retail · Rokok", "unit": "bks", "packQty": 10, "packName": "slop", "packPrice": 0, "assumed": false, "fixUnit": false, "menu": "rokok-la-manggo"}
  ]'::jsonb;
  lines jsonb := '[
    ["makanan-indomie-kuah", "all", "KIT-028", 1, "pcs"],
    ["makanan-indomie-kuah", "all", "KIT-027", 1, "pcs"],
    ["makanan-indomie-kuah", "all", "KIT-013", 15, "gr"],
    ["makanan-indomie-kuah", "all", "KIT-010", 15, "gr"],
    ["makanan-indomie-kuah", "all", "KIT-012", 10, "gr"],
    ["makanan-indomie-kuah", "all", "KIT-009", 2, "gr"],
    ["makanan-indomie-kuah", "all", "KIT-003", 2, "gr"],
    ["makanan-indomie-goreng", "all", "KIT-028", 1, "pcs"],
    ["makanan-indomie-goreng", "all", "KIT-027", 1, "pcs"],
    ["makanan-indomie-goreng", "all", "KIT-013", 15, "gr"],
    ["makanan-indomie-goreng", "all", "KIT-010", 15, "gr"],
    ["makanan-indomie-goreng", "all", "KIT-012", 10, "gr"],
    ["makanan-indomie-goreng", "all", "KIT-009", 2, "gr"],
    ["makanan-indomie-goreng", "all", "KIT-026", 5, "gr"],
    ["makanan-indomie-goreng", "all", "KIT-019", 5, "ml"],
    ["makanan-nasi-goreng", "all", "KIT-025", 70, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-027", 1, "pcs"],
    ["makanan-nasi-goreng", "all", "KIT-029", 20, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-026", 12, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-019", 8, "ml"],
    ["makanan-nasi-goreng", "all", "KIT-004", 3, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-006", 10, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-001", 5, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-010", 20, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-009", 5, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-012", 15, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-034", 10, "gr"],
    ["makanan-nasi-goreng", "all", "KIT-016", 1, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-031", 180, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-030", 15, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-026", 17, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-003", 6, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-001", 4, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-006", 5, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-004", 3, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-012", 18, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-017", 1, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-018", 1, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-007", 2, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-016", 1, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-011", 20, "gr"],
    ["makanan-ayam-penyet", "all", "KIT-010", 10, "gr"],
    ["makanan-nasi", "all", "KIT-025", 70, "gr"],
    ["cemilan-nugget", "all", "KIT-020", 100, "gr"],
    ["cemilan-nugget", "all", "KIT-026", 10, "gr"],
    ["cemilan-nugget", "all", "KIT-033", 25, "gr"],
    ["cemilan-sosis", "all", "KIT-021", 100, "gr"],
    ["cemilan-sosis", "all", "KIT-026", 10, "gr"],
    ["cemilan-sosis", "all", "KIT-033", 25, "gr"],
    ["cemilan-kentang-ori", "all", "KIT-022", 150, "gr"],
    ["cemilan-kentang-ori", "all", "KIT-026", 15, "gr"],
    ["cemilan-kentang-ori", "all", "KIT-016", 2, "gr"],
    ["cemilan-kentang-ori", "all", "KIT-033", 20, "gr"],
    ["cemilan-kentang-balado", "all", "KIT-022", 150, "gr"],
    ["cemilan-kentang-balado", "all", "KIT-026", 15, "gr"],
    ["cemilan-kentang-balado", "all", "KIT-036", 5, "gr"],
    ["cemilan-mix-plater", "all", "KIT-022", 75, "gr"],
    ["cemilan-mix-plater", "all", "KIT-020", 55, "gr"],
    ["cemilan-mix-plater", "all", "KIT-021", 55, "gr"],
    ["cemilan-mix-plater", "all", "KIT-026", 20, "gr"],
    ["cemilan-mix-plater", "all", "KIT-033", 30, "gr"],
    ["burger-garage", "all", "KIT-041", 1, "pcs"],
    ["burger-garage", "all", "KIT-027", 1, "pcs"],
    ["burger-garage", "all", "KIT-049", 3, "gr"],
    ["burger-garage", "all", "KIT-026", 3, "gr"],
    ["burger-garage", "all", "KIT-014", 8, "gr"],
    ["burger-garage", "all", "KIT-012", 8, "gr"],
    ["burger-garage", "all", "KIT-047", 8, "gr"],
    ["burger-garage", "all", "KIT-033", 8, "gr"],
    ["burger-garage", "all", "KIT-050", 1, "pcs"],
    ["burger-garage", "telur-keju", "KIT-045", 1, "pcs"],
    ["burger-garage", "telur-ayam", "KIT-044", 25, "gr"],
    ["burger-garage", "telur-ayam", "KIT-030", 3, "gr"],
    ["burger-garage", "telur-sosis", "KIT-021", 40, "gr"],
    ["burger-garage", "telur-nugget", "KIT-020", 30, "gr"],
    ["burger-garage", "telur-crispy", "KIT-044", 50, "gr"],
    ["burger-garage", "telur-crispy", "KIT-046", 15, "gr"],
    ["burger-garage", "telur-crispy", "KIT-026", 8, "gr"],
    ["burger-garage", "telur-keju-crispy", "KIT-045", 1, "pcs"],
    ["burger-garage", "telur-keju-crispy", "KIT-044", 50, "gr"],
    ["burger-garage", "telur-keju-crispy", "KIT-046", 15, "gr"],
    ["burger-garage", "telur-keju-crispy", "KIT-026", 8, "gr"],
    ["burger-garage", "spesial-komplit", "KIT-045", 1, "pcs"],
    ["burger-garage", "spesial-komplit", "KIT-044", 50, "gr"],
    ["burger-garage", "spesial-komplit", "KIT-046", 15, "gr"],
    ["burger-garage", "spesial-komplit", "KIT-021", 30, "gr"],
    ["burger-garage", "spesial-komplit", "KIT-020", 30, "gr"],
    ["burger-garage", "spesial-komplit", "KIT-026", 10, "gr"],
    ["burger-garage", "spesial-komplit", "KIT-052", 1, "pcs"],
    ["kebab-garage", "all", "KIT-042", 1, "pcs"],
    ["kebab-garage", "all", "KIT-027", 1, "pcs"],
    ["kebab-garage", "all", "KIT-049", 3, "gr"],
    ["kebab-garage", "all", "KIT-026", 3, "gr"],
    ["kebab-garage", "all", "KIT-010", 10, "gr"],
    ["kebab-garage", "all", "KIT-012", 8, "gr"],
    ["kebab-garage", "all", "KIT-005", 5, "gr"],
    ["kebab-garage", "all", "KIT-047", 8, "gr"],
    ["kebab-garage", "all", "KIT-048", 8, "gr"],
    ["kebab-garage", "all", "KIT-033", 8, "gr"],
    ["kebab-garage", "all", "KIT-051", 1, "pcs"],
    ["kebab-garage", "telur-ayam", "KIT-044", 25, "gr"],
    ["kebab-garage", "telur-ayam", "KIT-030", 3, "gr"],
    ["kebab-garage", "telur-sosis", "KIT-021", 30, "gr"],
    ["kebab-garage", "telur-nugget", "KIT-020", 30, "gr"],
    ["kebab-garage", "telur-ayam-sosis", "KIT-044", 25, "gr"],
    ["kebab-garage", "telur-ayam-sosis", "KIT-030", 3, "gr"],
    ["kebab-garage", "telur-ayam-sosis", "KIT-021", 30, "gr"],
    ["kebab-garage", "telur-ayam-nugget", "KIT-044", 25, "gr"],
    ["kebab-garage", "telur-ayam-nugget", "KIT-030", 3, "gr"],
    ["kebab-garage", "telur-ayam-nugget", "KIT-020", 30, "gr"],
    ["kebab-garage", "spesial-komplit", "KIT-044", 25, "gr"],
    ["kebab-garage", "spesial-komplit", "KIT-030", 3, "gr"],
    ["kebab-garage", "spesial-komplit", "KIT-021", 30, "gr"],
    ["kebab-garage", "spesial-komplit", "KIT-020", 30, "gr"],
    ["kebab-garage", "spesial-komplit", "KIT-045", 1, "pcs"],
    ["kebab-garage", "spesial-komplit", "KIT-043", 20, "gr"],
    ["bar-red-velvet", "cold", "BAR-012", 20, "gr"],
    ["bar-red-velvet", "cold", "BAR-018", 100, "ml"],
    ["bar-red-velvet", "cold", "BAR-032", 1, "cup"],
    ["bar-red-velvet", "cold", "BAR-031", 1, "pcs"],
    ["bar-red-velvet", "cold", "BAR-030", 1, "pcs"],
    ["bar-red-velvet", "hot", "BAR-012", 20, "gr"],
    ["bar-red-velvet", "hot", "BAR-018", 100, "ml"],
    ["bar-red-velvet", "hot", "BAR-031", 1, "pcs"],
    ["bar-red-velvet", "hot", "BAR-030", 1, "pcs"],
    ["bar-taro", "cold", "BAR-015", 20, "gr"],
    ["bar-taro", "cold", "BAR-018", 100, "ml"],
    ["bar-taro", "cold", "BAR-032", 1, "cup"],
    ["bar-taro", "cold", "BAR-031", 1, "pcs"],
    ["bar-taro", "cold", "BAR-030", 1, "pcs"],
    ["bar-taro", "hot", "BAR-015", 20, "gr"],
    ["bar-taro", "hot", "BAR-018", 100, "ml"],
    ["bar-taro", "hot", "BAR-031", 1, "pcs"],
    ["bar-taro", "hot", "BAR-030", 1, "pcs"],
    ["bar-tea-pahit", "cold", "BAR-035", 150, "ml"],
    ["bar-tea-pahit", "cold", "BAR-032", 1, "cup"],
    ["bar-tea-pahit", "cold", "BAR-031", 1, "pcs"],
    ["bar-tea-pahit", "cold", "BAR-030", 1, "pcs"],
    ["bar-tea-pahit", "hot", "BAR-035", 150, "ml"],
    ["bar-tea-pahit", "hot", "BAR-031", 1, "pcs"],
    ["bar-tea-pahit", "hot", "BAR-030", 1, "pcs"],
    ["bar-strawberry-tea", "cold", "BAR-001", 20, "ml"],
    ["bar-strawberry-tea", "cold", "BAR-035", 100, "ml"],
    ["bar-strawberry-tea", "cold", "BAR-017", 15, "ml"],
    ["bar-strawberry-tea", "cold", "BAR-032", 1, "cup"],
    ["bar-strawberry-tea", "cold", "BAR-031", 1, "pcs"],
    ["bar-strawberry-tea", "cold", "BAR-030", 1, "pcs"],
    ["bar-strawberry-tea", "hot", "BAR-001", 20, "ml"],
    ["bar-strawberry-tea", "hot", "BAR-035", 100, "ml"],
    ["bar-strawberry-tea", "hot", "BAR-017", 15, "ml"],
    ["bar-strawberry-tea", "hot", "BAR-031", 1, "pcs"],
    ["bar-strawberry-tea", "hot", "BAR-030", 1, "pcs"],
    ["noncoffee-choco-kiss", "all", "BAR-014", 12, "gr"],
    ["noncoffee-choco-kiss", "all", "BAR-006", 8, "ml"],
    ["noncoffee-choco-kiss", "all", "BAR-018", 100, "ml"],
    ["noncoffee-choco-kiss", "all", "BAR-032", 1, "cup"],
    ["noncoffee-choco-kiss", "all", "BAR-031", 1, "pcs"],
    ["noncoffee-choco-kiss", "all", "BAR-030", 1, "pcs"],
    ["noncoffee-dark-charm", "all", "BAR-014", 15, "gr"],
    ["noncoffee-dark-charm", "all", "BAR-018", 80, "ml"],
    ["noncoffee-dark-charm", "all", "BAR-017", 10, "ml"],
    ["noncoffee-dark-charm", "all", "BAR-032", 1, "cup"],
    ["noncoffee-dark-charm", "all", "BAR-031", 1, "pcs"],
    ["noncoffee-dark-charm", "all", "BAR-030", 1, "pcs"],
    ["minuman-mineral", "all", "RTL-001", 1, "btl"],
    ["rokok-apel-djarum", "all", "RTL-002", 1, "bks"],
    ["rokok-black-matcha", "all", "RTL-003", 1, "bks"],
    ["rokok-la-purple", "all", "RTL-004", 1, "bks"],
    ["rokok-la-manggo", "all", "RTL-005", 1, "bks"]
  ]'::jsonb;
  c jsonb; m jsonb; l jsonb;
  v_sku text; v_unit text; v_area text; v_pid uuid; v_price numeric; v_qty numeric; v_cost numeric;
  v_menu text; v_mat_unit text;
  skumap jsonb := '{}'::jsonb;
  created text[] := '{}'; fixed text[] := '{}'; drafted text[] := '{}';
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(cats) LOOP
    INSERT INTO wms_category (name, area) VALUES (c->>0, c->>1) ON CONFLICT (name) DO NOTHING;
  END LOOP;

  FOR m IN SELECT * FROM jsonb_array_elements(mats) LOOP
    v_qty := (m->>'packQty')::numeric;
    v_price := (m->>'packPrice')::numeric;
    IF m->>'menu' IS NOT NULL THEN
      SELECT base_cost * v_qty INTO v_price FROM menu_variants
       WHERE item_id = m->>'menu' AND base_cost > 0 ORDER BY sort_order LIMIT 1;
      v_price := coalesce(v_price, 0);
    END IF;
    v_cost := round(v_price / v_qty, 4);
    SELECT area INTO v_area FROM wms_category WHERE name = m->>'category';

    SELECT sku INTO v_sku FROM inventory_items WHERE sku = m->>'sku';
    IF v_sku IS NOT NULL THEN
      -- Sudah ada (mis. dari Impor Master Excel). Satuan bks/btl tanpa berat bersih → gr/ml,
      -- hanya bila belum ada stok & mutasi sama sekali.
      IF (m->>'fixUnit')::boolean AND EXISTS (
            SELECT 1 FROM inventory_items i JOIN wms_product w ON w.sku = i.sku
             WHERE i.sku = v_sku AND lower(i.unit) <> lower(m->>'unit') AND i.on_hand = 0
               AND NOT EXISTS (SELECT 1 FROM wms_stock_movement sm WHERE sm.product_id = w.id)
               AND NOT EXISTS (SELECT 1 FROM menu_recipes r WHERE r.inventory_sku = i.sku AND r.status = 'active')) THEN
        UPDATE inventory_items SET unit = m->>'unit', package_qty = v_qty,
               package_size = (m->>'packName') || ' ' || (m->>'packQty') || ' ' || (m->>'unit'),
               purchase_price = v_price, unit_cost = v_cost, updated_at = now()
         WHERE sku = v_sku;
        UPDATE wms_product SET unit = m->>'unit', hpp = v_cost, updated_at = now() WHERE sku = v_sku;
        DELETE FROM wms_product_uom u USING wms_product w WHERE w.id = u.product_id AND w.sku = v_sku;
        fixed := fixed || v_sku;
      END IF;
    ELSE
      SELECT sku INTO v_sku FROM inventory_items
       WHERE lower(name) = lower(m->>'name') AND stage <> 'archived' ORDER BY sku LIMIT 1;
    END IF;

    IF v_sku IS NULL THEN
      v_sku := m->>'sku';
      INSERT INTO inventory_items (sku, name, alternative_name, category, usage_area, unit, package_size,
                                   unit_cost, purchase_price, package_qty, on_hand, min_stock, status, movement)
      VALUES (v_sku, m->>'name', m->>'alt', m->>'category',
              CASE v_area WHEN 'bar' THEN 'bar' WHEN 'dapur' THEN 'dapur' ELSE 'general' END,
              m->>'unit', (m->>'packName') || ' ' || (m->>'packQty') || ' ' || (m->>'unit'),
              v_cost, v_price, v_qty, 0, 0, 'safe', '');
      created := created || v_sku;
    END IF;

    INSERT INTO wms_product (sku, name, category, unit, min_stock, hpp)
    SELECT i.sku, i.name, i.category, i.unit, 0, i.unit_cost FROM inventory_items i WHERE i.sku = v_sku
    ON CONFLICT (sku) DO NOTHING;
    SELECT id INTO v_pid FROM wms_product WHERE sku = v_sku;
    IF v_qty > 1 AND lower(m->>'packName') <> lower(m->>'unit')
       AND NOT EXISTS (SELECT 1 FROM wms_product_uom WHERE product_id = v_pid) THEN
      INSERT INTO wms_product_uom (product_id, uom, factor, is_purchase, is_count)
      VALUES (v_pid, m->>'packName', v_qty, true, true) ON CONFLICT DO NOTHING;
    END IF;
    skumap := skumap || jsonb_build_object(m->>'sku', v_sku);
  END LOOP;

  FOR v_menu IN SELECT DISTINCT x->>0 FROM jsonb_array_elements(lines) x LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM menu_items WHERE id = v_menu AND status = 'active');
    CONTINUE WHEN EXISTS (SELECT 1 FROM menu_recipes WHERE menu_item_id = v_menu AND status IN ('active', 'draft', 'archived'));
    FOR l IN SELECT x FROM jsonb_array_elements(lines) x WHERE x->>0 = v_menu LOOP
      CONTINUE WHEN l->>1 <> 'all' AND NOT EXISTS (
        SELECT 1 FROM menu_variants WHERE item_id = v_menu AND variant_id = l->>1);
      v_sku := coalesce(skumap->>(l->>2), l->>2);
      SELECT unit INTO v_mat_unit FROM inventory_items WHERE sku = v_sku;
      CONTINUE WHEN v_mat_unit IS NULL;
      -- Satuan resep mengikuti satuan bahan bila setara (g = gr = gram); beda dimensi dibiarkan
      -- supaya tombol Setujui menolak & owner memperbaikinya.
      v_unit := CASE
        WHEN lower(v_mat_unit) = lower(l->>4) THEN v_mat_unit
        WHEN lower(v_mat_unit) IN ('g', 'gr', 'gram') AND lower(l->>4) IN ('g', 'gr', 'gram') THEN v_mat_unit
        WHEN lower(v_mat_unit) IN ('pcs', 'pc') AND lower(l->>4) IN ('pcs', 'pc') THEN v_mat_unit
        ELSE l->>4 END;
      INSERT INTO menu_recipes (menu_item_id, variant_id, inventory_sku, qty, unit, waste_pct, status)
      VALUES (v_menu, l->>1, v_sku, (l->>3)::real, v_unit, 0, 'draft')
      ON CONFLICT DO NOTHING;
    END LOOP;
    drafted := drafted || v_menu;
  END LOOP;

  INSERT INTO audit_logs (time, actor, action, object, device, status, metadata)
  VALUES (to_char(now() AT TIME ZONE 'Asia/Jakarta', 'HH24.MI'), 'Sistem (migrasi 0158)', 'Resep usulan dipasang (draft)',
          'Resep & bahan baku', 'WMS', 'recorded',
          jsonb_build_object('materialsCreated', to_jsonb(created), 'unitFixed', to_jsonb(fixed), 'recipesDrafted', to_jsonb(drafted)));
END
$proposal$;
