"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet, FileText, Upload } from "lucide-react";

import { BulkImportDialog } from "@/components/garage/bulk-import-dialog";
import { WmsMasterImport } from "@/components/wms/wms-master-import";
import type { WmsImportResult } from "@/lib/wms-service";
import { cn } from "@/lib/utils";
import { ui } from "./master-shared";

const EXPORTS = [
  { label: "Excel (bisa diedit & diimpor balik)", href: "/api/wms/products/export?format=xlsx", icon: FileSpreadsheet },
  { label: "CSV", href: "/api/wms/products/export?format=csv", icon: FileText },
  { label: "PDF laporan", href: "/api/wms/products/export?format=pdf", icon: FileDown },
];

export function ImportExportTab({ canEdit, onImported }: { canEdit: boolean; onImported: () => void }) {
  const [importing, setImporting] = useState(false);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cn(ui.card, `p-4`)}>
          <h3 className="text-[15px] font-bold text-[#111111]">Ekspor bahan baku</h3>
          <p className="mb-3 mt-0.5 text-[13px] text-[#4B5563]">SKU, kategori, subkategori, brand, supplier, satuan, kemasan, harga beli, HPP, dan stok saat ini.</p>
          <div className="flex flex-wrap gap-2">
            {EXPORTS.map((x) => (
              <a key={x.href} href={x.href} className={ui.secondary} download>
                <x.icon className="size-4 text-[#C8102E]" aria-hidden="true" /> {x.label}
              </a>
            ))}
          </div>
        </section>
        <section className={cn(ui.card, `p-4`)}>
          <h3 className="text-[15px] font-bold text-[#111111]">Impor bahan baku (Excel / CSV)</h3>
          <ul className="mb-3 mt-1 list-disc space-y-0.5 pl-5 text-[13px] text-[#4B5563]">
            <li>Selalu tampil <b>pratinjau</b> per baris dulu — belum ada yang tersimpan sebelum Anda konfirmasi.</li>
            <li>SKU baru dibuat, SKU lama diperbarui. Sel kosong tidak mengubah data.</li>
            <li>Stok tidak pernah berubah lewat impor. Satuan dasar bahan yang sudah punya stok/resep tidak bisa diganti.</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <button type="button" onClick={() => setImporting(true)} className={ui.primary}><Upload className="size-4" aria-hidden="true" /> Impor file</button>
            )}
            <a href="/api/wms/products/export?template=1" className={ui.secondary} download><FileSpreadsheet className="size-4" aria-hidden="true" /> Template Excel</a>
            <a href="/api/wms/products/export?template=1&format=csv" className={ui.secondary} download><FileText className="size-4" aria-hidden="true" /> Template CSV</a>
          </div>
        </section>
      </div>

      {canEdit && <WmsMasterImport />}

      {importing && (
        <BulkImportDialog<WmsImportResult>
          config={{
            title: "Impor Bahan Baku (Excel / CSV)",
            description: "Cocok berdasarkan SKU: SKU baru dibuat, SKU lama diperbarui. Sel kosong tidak mengubah data. Stok tidak berubah lewat impor.",
            endpoint: "/api/wms/products/import",
            templates: [
              { label: "Template Excel", href: "/api/wms/products/export?template=1" },
              { label: "Template CSV", href: "/api/wms/products/export?template=1&format=csv" },
            ],
            summarize: (r) => [
              { label: "Baru", value: r.created, tone: "good" },
              { label: "Diperbarui", value: r.updated, tone: "warn" },
              { label: "Tidak berubah", value: r.unchanged, tone: "muted" },
              { label: "Error (dilewati)", value: r.skipped, tone: r.skipped ? "bad" : "muted" },
            ],
            pendingChanges: (r) => r.created + r.updated,
            variant: "light",
          }}
          onClose={() => setImporting(false)}
          onImported={onImported}
        />
      )}
    </div>
  );
}
