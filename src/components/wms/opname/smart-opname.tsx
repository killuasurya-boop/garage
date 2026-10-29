"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, ClipboardCheck, FileDown, LayoutDashboard, Lightbulb, RotateCcw, ShieldCheck, Target } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorText } from "@/components/wms/master/master-shared";
import { garageApi } from "@/lib/api-client";
import { ActionsTab, CycleTab, LossTab, OverviewKpis, ReportsTab } from "./opname-insight-tabs";
import { OpnameSession } from "./opname-session";
import { SessionList, StartSession } from "./opname-session-tabs";
import { DISCLAIMER, Kpi, Notice, type OpnameRow, type WarehouseOption } from "./opname-shared";

const ALL_TABS = [
  { id: "ringkasan", label: "Ringkasan", icon: LayoutDashboard, elevated: true },
  { id: "hitung", label: "Hitung", icon: ClipboardCheck, elevated: false },
  { id: "ulang", label: "Hitung Ulang", icon: RotateCcw, elevated: false },
  { id: "review", label: "Review", icon: ShieldCheck, elevated: true },
  { id: "cycle", label: "Cycle Count", icon: Target, elevated: true },
  { id: "loss", label: "Loss Control", icon: BarChart3, elevated: true },
  { id: "rekomendasi", label: "Rekomendasi", icon: Lightbulb, elevated: true },
  { id: "laporan", label: "Laporan", icon: FileDown, elevated: true },
] as const;
type TabId = (typeof ALL_TABS)[number]["id"];

/**
 * Smart Stock Opname. Penghitung (Kasir/Waiter, ruang Bar/Dapur): Hitung & Hitung Ulang saja,
 * dengan hitung buta. Owner/Manajer: semua tab termasuk review, loss control, dan laporan.
 * Tab yang disembunyikan juga ditolak di API (bukan sekadar menu).
 */
export function SmartOpname({ elevated, warehouses }: { elevated: boolean; warehouses: WarehouseOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabs = ALL_TABS.filter((t) => elevated || !t.elevated);
  const fromUrl = params.get("tab");
  const tab: TabId = tabs.some((t) => t.id === fromUrl) ? (fromUrl as TabId) : elevated ? "ringkasan" : "hitung";
  const openId = params.get("sesi");

  const [list, setList] = useState<OpnameRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      setList(await garageApi.get<OpnameRow[]>("/api/wms/opname"));
      setError(null);
    } catch (e) {
      setError(errorText(e, "Gagal memuat sesi opname."));
    }
  }, []);
  useEffect(() => {
    let alive = true;
    garageApi.get<OpnameRow[]>("/api/wms/opname").then((r) => { if (alive) setList(r); }).catch((e) => { if (alive) setError(errorText(e, "Gagal memuat sesi opname.")); });
    return () => { alive = false; };
  }, [openId]);

  function navigate(next: { tab?: TabId; sesi?: string | null }) {
    const sp = new URLSearchParams(params.toString());
    if (next.tab) sp.set("tab", next.tab);
    if (next.sesi === null) sp.delete("sesi");
    else if (next.sesi) sp.set("sesi", next.sesi);
    router.replace(`${pathname}?${sp}`, { scroll: false });
  }
  const open = (id: string) => navigate({ sesi: id });

  const drafts = list.filter((r) => r.status === "draft");
  const recount = list.filter((r) => r.status === "draft" && (r.recount > 0 || r.rejected));
  const submitted = list.filter((r) => r.status === "submitted");
  const done = list.filter((r) => r.status === "completed").slice(0, 10);

  if (openId) {
    return (
      <OpnameSession
        key={openId}
        id={openId}
        elevated={elevated}
        initialFilter={tab === "ulang" ? "recount" : tab === "review" ? "variance" : "all"}
        onBack={() => { navigate({ sesi: null }); void loadList(); }}
      />
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Smart Stock Opname</h1>
        <p className="text-[13.5px] text-[#4B5563]">Hitung fisik → hitung ulang bila perlu → review Owner/Manajer → stok diposting. Stok baru berubah setelah disetujui.</p>
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      <Tabs value={tab} onValueChange={(v) => navigate({ tab: v as TabId })} className="gap-4">
        <TabsList
          aria-label="Bagian stock opname"
          className="w-full justify-start gap-1 overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white p-1 text-[#4B5563] [scrollbar-width:none] group-data-horizontal/tabs:h-auto"
        >
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="h-10 flex-none gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-[#4B5563] transition-colors duration-200 hover:text-[#111111] motion-reduce:transition-none data-active:bg-[#C8102E] data-active:text-white dark:text-[#4B5563] dark:hover:text-[#111111] dark:data-active:border-transparent dark:data-active:bg-[#C8102E] dark:data-active:text-white"
            >
              <t.icon className="size-4" aria-hidden="true" /> {t.label}
              {t.id === "ulang" && recount.length > 0 && <span className="rounded-full bg-[#F59E0B] px-1.5 font-mono text-[10.5px] text-white">{recount.length}</span>}
              {t.id === "review" && submitted.length > 0 && <span className="rounded-full bg-[#2563EB] px-1.5 font-mono text-[10.5px] text-white">{submitted.length}</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        {elevated && (
          <TabsContent value="ringkasan" className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Sedang dihitung" value={drafts.length} />
              <Kpi label="Perlu hitung ulang" value={recount.length} tone={recount.length ? "warn" : "default"} />
              <Kpi label="Menunggu review" value={submitted.length} tone={submitted.length ? "warn" : "default"} />
              <Kpi label="Disetujui (terbaru)" value={done.length} />
            </div>
            <OverviewKpis />
            {submitted.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-[14px] font-bold text-[#111111]">Menunggu review</h2>
                <SessionList rows={submitted} empty="" onOpen={(id) => navigate({ tab: "review", sesi: id })} />
              </section>
            )}
            <p className="text-[11.5px] text-[#6B7280]">{DISCLAIMER}</p>
          </TabsContent>
        )}

        <TabsContent value="hitung" className="space-y-3">
          {warehouses.length > 0 ? <StartSession warehouses={warehouses} onStarted={(id) => navigate({ tab: "hitung", sesi: id })} /> : <Notice tone="warn">Tidak ada ruang gudang yang bisa kamu opname.</Notice>}
          <h2 className="text-[14px] font-bold text-[#111111]">Sesi berjalan</h2>
          <SessionList rows={drafts} empty="Belum ada sesi berjalan." onOpen={open} />
          {done.length > 0 && (
            <>
              <h2 className="text-[14px] font-bold text-[#111111]">Selesai terbaru</h2>
              <SessionList rows={done} empty="" onOpen={open} />
            </>
          )}
        </TabsContent>

        <TabsContent value="ulang" className="space-y-3">
          <p className="text-[12.5px] text-[#4B5563]">Bahan yang diminta dihitung ulang oleh reviewer, atau sesi yang dikembalikan. Hitungan pertama tetap tersimpan sebagai jejak.</p>
          <SessionList rows={recount} empty="Tidak ada yang perlu dihitung ulang." onOpen={open} />
        </TabsContent>

        {elevated && (
          <>
            <TabsContent value="review" className="space-y-3">
              <p className="text-[12.5px] text-[#4B5563]">Selisih kecil boleh disetujui Manajer; selisih kritis atau berulang wajib Owner. Penghitung tidak boleh menyetujui hitungannya sendiri (kecuali Owner).</p>
              <SessionList rows={submitted} empty="Tidak ada opname yang menunggu review." onOpen={open} />
            </TabsContent>
            <TabsContent value="cycle"><CycleTab warehouses={warehouses} onStarted={(id) => navigate({ tab: "hitung", sesi: id })} /></TabsContent>
            <TabsContent value="loss"><LossTab warehouses={warehouses} /></TabsContent>
            <TabsContent value="rekomendasi"><ActionsTab /></TabsContent>
            <TabsContent value="laporan"><ReportsTab warehouses={warehouses} /></TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
