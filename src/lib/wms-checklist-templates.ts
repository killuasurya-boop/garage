// Template item checklist gudang per jenis (MVP: hardcoded; editor template = lanjutan).

export type ChecklistType = "daily" | "receiving" | "opname";

export const WMS_CHECKLIST_TEMPLATES: Record<ChecklistType, { title: string; items: string[] }> = {
  daily: {
    title: "Checklist Harian Gudang",
    items: [
      "Area gudang bersih & rapi",
      "Suhu chiller sesuai (0–8°C)",
      "Suhu freezer sesuai (≤ -12°C)",
      "Tidak ada bahan tumpah / rusak",
      "Bahan kadaluarsa dekat sudah dipisah/ditandai",
      "Stok bahan kritis dicek (kopi, susu, gula, dll)",
      "Rak & wadah tertutup rapat (bebas hama)",
      "Pintu/kunci gudang aman",
    ],
  },
  receiving: {
    title: "Checklist Penerimaan (QC)",
    items: [
      "Barang sesuai surat jalan / PO",
      "Jumlah fisik sesuai yang tertera",
      "Kondisi kemasan baik (tidak rusak/bocor)",
      "Tanggal kadaluarsa masih aman",
      "Suhu barang dingin/beku sesuai (bila ada)",
      "Tidak ada tanda kontaminasi / bau",
      "Batch/lot dicatat",
    ],
  },
  opname: {
    title: "Checklist Stock Opname",
    items: [
      "Area opname disiapkan (bahan tertata)",
      "Hitung fisik semua bahan di ruang ini",
      "Selisih signifikan dicatat & dicek ulang",
      "Bahan rusak/expired dipisah untuk waste",
      "Hasil hitung diinput ke sistem",
      "Diperiksa & disetujui penanggung jawab",
    ],
  },
};
