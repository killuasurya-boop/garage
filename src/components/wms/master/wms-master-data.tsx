"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileSpreadsheet, Package, Ruler, Tags, Truck } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { garageApi } from "@/lib/api-client";
import { CategoryTab } from "./category-tab";
import { ImportExportTab } from "./import-export-tab";
import { MaterialTab } from "./material-tab";
import { SupplierTab } from "./supplier-tab";
import { UomTab } from "./uom-tab";
import { errorText, type MasterCategory, type MasterSupplier } from "./master-shared";

const TABS = [
  { id: "bahan", label: "Bahan Baku", icon: Package },
  { id: "kategori", label: "Kategori", icon: Tags },
  { id: "supplier", label: "Supplier", icon: Truck },
  { id: "satuan", label: "Satuan & Kemasan", icon: Ruler },
  { id: "impor", label: "Impor / Ekspor", icon: FileSpreadsheet },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Master Data WMS: satu halaman bertab untuk bahan baku Bar & Dapur, kategori, supplier, satuan, impor/ekspor. */
export function WmsMasterData({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : "bahan";

  const [categories, setCategories] = useState<MasterCategory[]>([]);
  const [suppliers, setSuppliers] = useState<MasterSupplier[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importTick, setImportTick] = useState(0);

  const loadCategories = useCallback(async () => {
    setCategories(await garageApi.get<MasterCategory[]>("/api/wms/categories?archived=1"));
  }, []);
  const loadSuppliers = useCallback(async () => {
    setSuppliers(await garageApi.get<MasterSupplier[]>("/api/wms/suppliers?archived=1"));
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      garageApi.get<MasterCategory[]>("/api/wms/categories?archived=1"),
      garageApi.get<MasterSupplier[]>("/api/wms/suppliers?archived=1"),
    ])
      .then(([c, s]) => {
        if (!alive) return;
        setCategories(c);
        setSuppliers(s);
      })
      .catch((e) => { if (alive) setError(errorText(e, "Gagal memuat master data.")); });
    return () => { alive = false; };
  }, []);

  const activeCategories = categories.filter((c) => !c.archived);
  const activeSuppliers = suppliers.filter((s) => !s.archived);

  function selectTab(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next === "bahan") sp.delete("tab");
    else sp.set("tab", next);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Master Data</h1>
        <p className="text-[13.5px] text-[#4B5563]">
          Pusat data bahan baku Bar & Dapur: bahan, kategori, supplier, satuan & kemasan. Perubahan di sini tidak mengubah stok maupun harga jual POS.
        </p>
        {!canEdit && <p className="mt-1 text-[12.5px] font-semibold text-[#92400E]">Mode lihat saja — hanya Owner/Manajer yang bisa mengubah master data.</p>}
      </div>
      {error && <p role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-[13px] text-[#991B1B]">{error}</p>}

      <Tabs value={tab} onValueChange={selectTab} className="gap-4">
        <TabsList
          aria-label="Bagian master data"
          className="w-full justify-start gap-1 overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white p-1 text-[#4B5563] [scrollbar-width:none] group-data-horizontal/tabs:h-auto"
        >
          {TABS.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-10 flex-none gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-[#4B5563] hover:text-[#111111] data-active:bg-[#C8102E] data-active:text-white dark:text-[#4B5563] dark:hover:text-[#111111] dark:data-active:border-transparent dark:data-active:bg-[#C8102E] dark:data-active:text-white"
            >
              <t.icon className="size-4" aria-hidden="true" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="bahan">
          <MaterialTab key={importTick} categories={activeCategories} suppliers={activeSuppliers} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="kategori">
          <CategoryTab categories={categories} canEdit={canEdit} reload={loadCategories} />
        </TabsContent>
        <TabsContent value="supplier">
          <SupplierTab suppliers={suppliers} canEdit={canEdit} reload={loadSuppliers} />
        </TabsContent>
        <TabsContent value="satuan">
          <UomTab key={importTick} categories={activeCategories} suppliers={activeSuppliers} canEdit={canEdit} />
        </TabsContent>
        <TabsContent value="impor">
          <ImportExportTab
            canEdit={canEdit}
            onImported={() => {
              setImportTick((n) => n + 1);
              void loadCategories();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
