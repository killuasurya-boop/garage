"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  Copy,
  Calculator,
  ClipboardCheck,
  Download,
  GitBranch,
  History,
  Layers,
  Lightbulb,
  CheckCircle2,
  Factory,
  Package,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Upload,
  ListOrdered,
  X,
} from "lucide-react";

import { garageApi } from "@/lib/api-client";
import { currency } from "@/lib/garage-data";
import type { WmsProductRow } from "@/lib/wms-types";

type RecipeRow = {
  id: string;
  name: string;
  recipeSku: string;
  recipeCode: string;
  category: string;
  productionArea: string;
  yieldQty: string;
  yieldUnit: string;
  sellPrice: number;
  cogs: number;
  foodCostPct: number;
  margin: number;
  recipeStatus:
    | "draft"
    | "pending_kitchen"
    | "pending_warehouse"
    | "pending_manager"
    | "pending_owner"
    | "published"
    | "archived";
  isFavorite: boolean;
  version: string;
  updatedAt: string;
  source?: "os-sync" | "manual";
};

type RecipeDashboard = {
  totalRecipes: number;
  activeRecipes: number;
  draftRecipes: number;
  archivedRecipes: number;
  totalIngredients: number;
  totalSubRecipes: number;
  averageHpp: number;
  averageMargin: number;
  averageMarginPct: number;
  needReview: number;
  needApproval: number;
  recentlyUpdated: Array<{ id: string; name: string; category: string; updatedAt: string }>;
  highFoodCost: Array<{ id: string; name: string; foodCostPct: number }>;
};

type RecipeCoverage = {
  totalProducts: number;
  syncedToWms: number;
  coveragePct: number;
  missingMenuRecipes: Array<{ id: string; name: string }>;
};

type RecipeDetail = RecipeRow & {
  description: string;
  subCategory: string;
  sopSteps: Array<{ order: number; title: string; durationMin: number; notes: string }>;
  bom: Array<{
    id: string;
    productId: string | null;
    subRecipeId?: string | null;
    productName: string;
    sku: string;
    unit: string;
    qty: number;
    wastePct: number;
    shrinkagePct: number;
    actualQty: number;
    lineType: string;
    onHand: number;
    minStock: number;
    hpp: number;
    lineCost: number;
    contribPct: number;
  }>;
};

type IngredientRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  hpp: number;
  onHand: number;
  minStock: number;
  status: string;
  ingredientType: string;
};

type SubRecipeRow = { id: string; name: string; outputName: string; outputUnit: string; inputs: number };

type AuditRow = { id: string; action: string; step: string; actorName: string; note: string; createdAt: string };

type DependencyMap = {
  recipeId: string;
  recipeName: string;
  upstream: Array<{ lineType: string; refId: string | null; name: string; sku: string; qty: number; unit: string }>;
  sharedRecipes: Array<{
    productId: string;
    productName: string;
    recipes: Array<{ recipeId: string; recipeName: string; qty: number }>;
  }>;
  subRecipeDependents: Array<{
    subRecipeId: string;
    subRecipeName: string;
    usedBy: Array<{ recipeId: string; recipeName: string; qty: number }>;
  }>;
};

type VersionRow = {
  id: string;
  versionNo: number;
  label: string;
  cogs: number;
  sellPrice: number;
  foodCostPct: number;
  actorName: string;
  createdAt: string;
  bomLineCount: number;
  sopStepCount: number;
};

type VersionDetail = VersionRow & {
  recipeId: string;
  compareToCurrent: {
    cogsDelta: number;
    sellPriceDelta: number;
    foodCostPctDelta: number;
    bomLineDelta: number;
    sopStepDelta: number;
    bomAdded: string[];
    bomRemoved: string[];
  } | null;
};

type InsightPayload = {
  score: number;
  insights: Array<{
    severity: "info" | "warning" | "critical";
    code: string;
    title: string;
    message: string;
    action?: string;
  }>;
};

type BatchResult = {
  recipeName: string;
  targetQty: number;
  ingredientCost: number;
  packagingCost: number;
  totalCost: number;
  stockReady: boolean;
  lines: Array<{
    name: string;
    lineType: string;
    neededQty: number;
    unit: string;
    onHand: number;
    lineCost: number;
    stockOk: boolean;
  }>;
  missingStock: Array<{ name: string; needed: number; onHand: number; unit: string }>;
};

function foodCostColor(pct: number) {
  if (pct <= 30) return "#16A34A";
  if (pct <= 38) return "#D97706";
  return "#DC2626";
}

function statusBadge(status: RecipeRow["recipeStatus"]) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    published: { bg: "#DCFCE7", text: "#16A34A", label: "Published" },
    draft: { bg: "#FEF3C7", text: "#D97706", label: "Draft" },
    archived: { bg: "#F3F4F6", text: "#6B7280", label: "Archived" },
    pending_kitchen: { bg: "#EFF6FF", text: "#2563EB", label: "Kitchen" },
    pending_warehouse: { bg: "#F3E8FF", text: "#7C3AED", label: "Gudang" },
    pending_manager: { bg: "#FFF7ED", text: "#EA580C", label: "Manager" },
    pending_owner: { bg: "#FDF1F3", text: "#C8102E", label: "Owner" },
  };
  const s = map[status] ?? map.published;
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: s.bg, color: s.text }}>
      {s.label}
    </span>
  );
}

export function WmsRecipeModule() {
  const [list, setList] = useState<RecipeRow[]>([]);
  const [dashboard, setDashboard] = useState<RecipeDashboard | null>(null);
  const [coverage, setCoverage] = useState<RecipeCoverage | null>(null);
  const [products, setProducts] = useState<WmsProductRow[]>([]);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [detailTab, setDetailTab] = useState<
    "bom" | "cost" | "batch" | "deps" | "sop" | "approval" | "history" | "insights"
  >("bom");
  const [batchQty, setBatchQty] = useState("100");
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | RecipeRow["recipeStatus"]>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sopDraft, setSopDraft] = useState<Array<{ order: number; title: string; durationMin: string; notes: string }>>([]);
  const [moduleTab, setModuleTab] = useState<"recipes" | "ingredients">("recipes");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [ingredientType, setIngredientType] = useState<string>("all");
  const [ingredientQ, setIngredientQ] = useState("");
  const [subRecipes, setSubRecipes] = useState<SubRecipeRow[]>([]);
  const [auditLog, setAuditLog] = useState<AuditRow[]>([]);
  const [depMap, setDepMap] = useState<DependencyMap | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [addSubId, setAddSubId] = useState("");
  const [addSubQty, setAddSubQty] = useState("1");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [versionDetail, setVersionDetail] = useState<VersionDetail | null>(null);
  const [insights, setInsights] = useState<InsightPayload | null>(null);

  const load = useCallback(async () => {
    const [recs, dash, cov, prods, subs] = await Promise.all([
      garageApi.get<RecipeRow[]>("/api/wms/recipes"),
      garageApi.get<RecipeDashboard>("/api/wms/recipes/dashboard"),
      garageApi.get<RecipeCoverage>("/api/wms/recipes/coverage"),
      garageApi.get<WmsProductRow[]>("/api/wms/products"),
      garageApi.get<{ recipes: SubRecipeRow[] }>("/api/wms/production").then((r) => r.recipes),
    ]);
    setList(recs);
    setDashboard(dash);
    setCoverage(cov);
    setProducts(prods);
    setSubRecipes(subs);
  }, []);

  const loadIngredients = useCallback(async () => {
    const type = ingredientType === "all" ? undefined : ingredientType;
    const rows = await garageApi.get<IngredientRow[]>(
      `/api/wms/ingredients${type || ingredientQ ? `?${new URLSearchParams({ ...(type ? { type } : {}), ...(ingredientQ ? { q: ingredientQ } : {}) }).toString()}` : ""}`,
    );
    setIngredients(rows);
  }, [ingredientType, ingredientQ]);

  useEffect(() => {
    if (moduleTab !== "ingredients") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch ingredients when tab opens
    void loadIngredients().catch(() => {});
  }, [moduleTab, loadIngredients]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void load().catch(() => {});
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((r) => {
        if (favoritesOnly && !r.isFavorite) return false;
        if (statusFilter === "all") return true;
        if (statusFilter === "pending") return r.recipeStatus.startsWith("pending_");
        return r.recipeStatus === statusFilter;
      })
      .filter(
        (r) =>
          !q ||
          r.name.toLowerCase().includes(q) ||
          r.recipeSku.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q),
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [list, query, statusFilter, favoritesOnly]);

  const filteredIngredients = useMemo(() => {
    const q = ingredientQ.trim().toLowerCase();
    if (!q) return ingredients;
    return ingredients.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q),
    );
  }, [ingredients, ingredientQ]);

  const isManualRecipe = detail?.source === "manual";
  const canSubmit = detail?.recipeStatus === "draft" || detail?.recipeStatus === "archived";
  const isPending = detail?.recipeStatus.startsWith("pending_") ?? false;

  async function syncFromProducts() {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const res = await garageApi.post<{ recipes: { created: number; updated: number }; coverage: RecipeCoverage }>(
        "/api/wms/recipes/sync",
        {},
      );
      setSyncMsg(`Sinkron: ${res.recipes.created} baru, ${res.recipes.updated} update. Cakupan ${res.coverage.coveragePct}%.`);
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Gagal sinkron.");
    } finally {
      setSyncBusy(false);
    }
  }

  async function openDetail(id: string) {
    const [d, audit, deps, vers, ins] = await Promise.all([
      garageApi.get<RecipeDetail>(`/api/wms/recipes/${id}`),
      garageApi.get<AuditRow[]>(`/api/wms/recipes/${id}/audit`),
      garageApi.get<DependencyMap>(`/api/wms/recipes/${id}/dependents`),
      garageApi.get<VersionRow[]>(`/api/wms/recipes/${id}/versions`).catch(() => []),
      garageApi.get<InsightPayload>(`/api/wms/recipes/${id}/insights`).catch(() => null),
    ]);
    setDetail(d);
    setAuditLog(audit);
    setDepMap(deps);
    setVersions(vers);
    setVersionDetail(null);
    setInsights(ins);
    setSopDraft(
      (d.sopSteps ?? []).map((s) => ({
        order: s.order,
        title: s.title,
        durationMin: String(s.durationMin || ""),
        notes: s.notes ?? "",
      })),
    );
    setDetailTab("bom");
    setBatchResult(null);
  }

  async function toggleFavorite(id: string, e?: MouseEvent) {
    e?.stopPropagation();
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await garageApi.post<{ id: string; isFavorite: boolean }>(`/api/wms/recipes/${id}/favorite`, {});
      setList((prev) => prev.map((r) => (r.id === id ? { ...r, isFavorite: res.isFavorite } : r)));
      if (detail?.id === id) setDetail((d) => (d ? { ...d, isFavorite: res.isFavorite } : d));
    } finally {
      setActionBusy(false);
    }
  }

  async function recipeAction(action: "submit" | "approve" | "reject") {
    if (!detail || actionBusy) return;
    setActionBusy(true);
    try {
      if (action === "submit") await garageApi.post(`/api/wms/recipes/${detail.id}/submit`, {});
      else if (action === "approve") await garageApi.post(`/api/wms/recipes/${detail.id}/approve`, {});
      else await garageApi.post(`/api/wms/recipes/${detail.id}/reject`, {});
      await openDetail(detail.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Aksi gagal.");
    } finally {
      setActionBusy(false);
    }
  }

  async function addSubRecipeToBom() {
    if (!detail || !addSubId || actionBusy) return;
    const qty = Number(addSubQty);
    if (!(qty > 0)) return;
    setActionBusy(true);
    try {
      await garageApi.post(`/api/wms/recipes/${detail.id}/bom`, {
        lineType: "sub_recipe",
        subRecipeId: addSubId,
        qty,
      });
      setAddSubId("");
      await openDetail(detail.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Gagal tambah sub-recipe.");
    } finally {
      setActionBusy(false);
    }
  }

  async function saveSop() {
    if (!detail || actionBusy || !isManualRecipe) return;
    setActionBusy(true);
    try {
      const steps = sopDraft
        .filter((s) => s.title.trim())
        .map((s, i) => ({
          order: i + 1,
          title: s.title.trim(),
          durationMin: Number(s.durationMin) || 0,
          notes: s.notes.trim(),
        }));
      await garageApi.patch(`/api/wms/recipes/${detail.id}/sop`, { steps });
      await openDetail(detail.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Gagal simpan SOP.");
    } finally {
      setActionBusy(false);
    }
  }

  async function duplicateRecipe() {
    if (!detail || actionBusy) return;
    setActionBusy(true);
    try {
      const copy = await garageApi.post<{ id: string }>(`/api/wms/recipes/${detail.id}/duplicate`, {});
      await load();
      await openDetail(copy.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Gagal duplikasi.");
    } finally {
      setActionBusy(false);
    }
  }

  async function archiveRecipe() {
    if (!detail || actionBusy) return;
    if (!window.confirm(`Archive resep "${detail.name}"?`)) return;
    setActionBusy(true);
    try {
      await garageApi.post(`/api/wms/recipes/${detail.id}/archive`, {});
      setDetail(null);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Gagal archive.");
    } finally {
      setActionBusy(false);
    }
  }

  async function loadVersionDetail(versionId: string) {
    if (!detail) return;
    setVersionDetail(await garageApi.get<VersionDetail>(`/api/wms/recipes/${detail.id}/versions/${versionId}`));
  }

  async function restoreVersion(versionId: string) {
    if (!detail || actionBusy || !isManualRecipe) return;
    if (!window.confirm("Restore resep ke versi ini? Status kembali ke draft.")) return;
    setActionBusy(true);
    try {
      await garageApi.post(`/api/wms/recipes/${detail.id}/versions/${versionId}/restore`, {});
      await openDetail(detail.id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Gagal restore versi.");
    } finally {
      setActionBusy(false);
    }
  }

  async function runBatchCalc() {
    if (!detail) return;
    const qty = Number(batchQty);
    if (!(qty > 0)) return;
    setBatchBusy(true);
    try {
      setBatchResult(await garageApi.post<BatchResult>(`/api/wms/recipes/${detail.id}/batch`, { targetQty: qty }));
    } finally {
      setBatchBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* PRD §1 Dashboard */}
      {dashboard && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <DashKpi icon={BookOpen} label="Total Recipe" value={String(dashboard.totalRecipes)} />
          <DashKpi icon={CheckCircle2} label="Active" value={String(dashboard.activeRecipes)} tone="green" />
          <DashKpi icon={Archive} label="Draft" value={String(dashboard.draftRecipes)} tone="amber" />
          <DashKpi icon={Package} label="Ingredients" value={String(dashboard.totalIngredients)} />
          <DashKpi icon={Factory} label="Sub Recipe" value={String(dashboard.totalSubRecipes)} />
          <DashKpi icon={Calculator} label="Avg HPP" value={currency.format(dashboard.averageHpp)} />
        </div>
      )}

      {dashboard && (dashboard.needReview > 0 || dashboard.needApproval > 0) && (
        <div className="flex flex-wrap gap-2">
          {dashboard.needReview > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#F59E0B]/40 bg-[#FFFBEB] px-3 py-1.5 text-[12px] font-semibold text-[#D97706]">
              <AlertTriangle className="size-3.5" /> {dashboard.needReview} perlu review (food cost &gt;38%)
            </span>
          )}
          {dashboard.needApproval > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#6B7280]">
              {dashboard.needApproval} draft menunggu publish
            </span>
          )}
        </div>
      )}

      {/* OS Sync */}
      {coverage && (
        <div className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">
                <Sparkles className="size-3.5 text-[#C8102E]" /> Master Produksi · Single Source of Truth
              </p>
              <p className="mt-1 text-[14px] font-bold text-[#111111]">
                {coverage.syncedToWms}/{coverage.totalProducts} produk tersinkron ({coverage.coveragePct}%)
              </p>
              <p className="text-[12px] text-[#6B7280]">
                Edit resep di Produk Manajemen OS → tarik ke WMS. POS, gudang, dan finance memakai BOM ini.
              </p>
            </div>
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => void syncFromProducts()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C8102E] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${syncBusy ? "animate-spin" : ""}`} />
              {syncBusy ? "Menarik…" : "Tarik dari Produk OS"}
            </button>
          </div>
          {syncMsg && <p className="mt-2 text-[12px] font-semibold text-[#111111]">{syncMsg}</p>}
        </div>
      )}

      {/* Module tabs PRD §5 */}
      <div className="flex gap-1 rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] p-1 w-fit">
        {(
          [
            { id: "recipes" as const, label: "Recipes / BOM", icon: BookOpen },
            { id: "ingredients" as const, label: "Ingredient Library", icon: Layers },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setModuleTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-bold ${
              moduleTab === id ? "bg-white text-[#111111] shadow-sm" : "text-[#6B7280] hover:text-[#111111]"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {moduleTab === "recipes" && (
        <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-[#111111]">Recipe / BOM</h1>
          <p className="text-[13px] text-[#6B7280]">
            Master produksi · HPP otomatis · batch calculator ·{" "}
            <Link href="/warehouse/production" className="font-semibold text-[#C8102E] hover:underline">
              Sub Recipe / Produksi
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3.5 py-2 text-[13px] font-semibold hover:bg-[#F8F9FB]"
        >
          <Plus className="size-4" /> Resep Manual
        </button>
        <button
          type="button"
          onClick={() => {
            window.open("/api/wms/recipes/export", "_blank", "noopener,noreferrer");
          }}
          className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB]"
        >
          <Download className="size-4" /> Export JSON
        </button>
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="flex items-center gap-1.5 rounded-lg border border-[#E8E8E8] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB]"
        >
          <Upload className="size-4" /> Import
        </button>
        </div>
      </div>

      {/* PRD §2 List — search, filter, table */}
      <div className="rounded-xl border border-[#E8E8E8] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E8E8E8] p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, SKU, kategori…"
              className="h-9 w-full rounded-md border border-[#E8E8E8] bg-[#F8F9FB] pl-9 pr-3 text-[13px] outline-none focus:border-[#C8102E]"
            />
          </div>
          {(["all", "published", "draft", "pending", "archived"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
                statusFilter === s ? "bg-[#2F3136] text-white" : "bg-[#F8F9FB] text-[#6B7280] hover:bg-[#EEF0F3]"
              }`}
            >
              {s === "all" ? "Semua" : s === "pending" ? "Pending" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-semibold ${
              favoritesOnly ? "bg-[#F59E0B] text-white" : "bg-[#F8F9FB] text-[#6B7280] hover:bg-[#EEF0F3]"
            }`}
          >
            <Star className={`size-3.5 ${favoritesOnly ? "fill-white" : ""}`} /> Favorit
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                <th className="px-3 py-2.5">Recipe</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5">Area</th>
                <th className="px-3 py-2.5 text-right">Yield</th>
                <th className="px-3 py-2.5 text-right">HPP</th>
                <th className="px-3 py-2.5 text-right">Jual</th>
                <th className="px-3 py-2.5 text-right">Margin</th>
                <th className="px-3 py-2.5 text-right">FC%</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-[#6B7280]">
                    Belum ada resep. Tarik dari Produk OS atau buat manual.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b border-[#F0F1F4] last:border-0 hover:bg-[#FDF1F3]/40"
                    onClick={() => void openDetail(r.id)}
                  >
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5 font-semibold text-[#111111]">
                        <button
                          type="button"
                          onClick={(e) => void toggleFavorite(r.id, e)}
                          className="shrink-0"
                          aria-label={r.isFavorite ? "Hapus favorit" : "Tandai favorit"}
                        >
                          <Star
                            className={`size-3.5 ${r.isFavorite ? "fill-[#F59E0B] text-[#F59E0B]" : "text-[#D1D5DB] hover:text-[#F59E0B]"}`}
                          />
                        </button>
                        {r.name}
                      </span>
                      <span className="text-[11px] text-[#9CA3AF]">{r.category}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#C8102E]">{r.recipeSku || "—"}</td>
                    <td className="px-3 py-2.5 capitalize text-[#6B7280]">{r.productionArea || "—"}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#111111]">
                      {r.yieldQty} {r.yieldUnit}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{currency.format(r.cogs)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{currency.format(r.sellPrice)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-[#16A34A]">{currency.format(r.margin)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold" style={{ color: foodCostColor(r.foodCostPct) }}>
                      {r.foodCostPct}%
                    </td>
                    <td className="px-3 py-2.5">{statusBadge(r.recipeStatus)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recently updated PRD §1 */}
      {dashboard && dashboard.recentlyUpdated.length > 0 && (
        <div className="rounded-xl border border-[#E8E8E8] bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Recently Updated</p>
          <ul className="mt-2 space-y-1">
            {dashboard.recentlyUpdated.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => void openDetail(r.id)}
                  className="text-[13px] font-semibold text-[#111111] hover:text-[#C8102E]"
                >
                  {r.name}
                </button>
                <span className="ml-2 text-[11px] text-[#9CA3AF]">
                  {new Date(r.updatedAt).toLocaleString("id-ID")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
        </>
      )}

      {moduleTab === "ingredients" && (
        <div className="rounded-xl border border-[#E8E8E8] bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#E8E8E8] p-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                value={ingredientQ}
                onChange={(e) => setIngredientQ(e.target.value)}
                placeholder="Cari SKU, nama, kategori…"
                className="h-9 w-full rounded-md border border-[#E8E8E8] bg-[#F8F9FB] pl-9 pr-3 text-[13px] outline-none focus:border-[#C8102E]"
              />
            </div>
            {(["all", "raw", "packaging", "semi_finished", "consumable"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setIngredientType(t)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-semibold ${
                  ingredientType === t ? "bg-[#2F3136] text-white" : "bg-[#F8F9FB] text-[#6B7280] hover:bg-[#EEF0F3]"
                }`}
              >
                {t === "all" ? "Semua" : t === "semi_finished" ? "Semi" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-[13px]">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-[#F8F9FB] text-left text-[10.5px] font-bold uppercase tracking-wide text-[#6B7280]">
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">Nama</th>
                  <th className="px-3 py-2.5">Tipe</th>
                  <th className="px-3 py-2.5">Kategori</th>
                  <th className="px-3 py-2.5 text-right">HPP</th>
                  <th className="px-3 py-2.5 text-right">Stok</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-[#6B7280]">
                      Tidak ada bahan. Sinkron inventori OS atau tambah produk di WMS.
                    </td>
                  </tr>
                ) : (
                  filteredIngredients.map((i) => (
                    <tr key={i.id} className="border-b border-[#F0F1F4] last:border-0 hover:bg-[#F8F9FB]/60">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-[#C8102E]">{i.sku}</td>
                      <td className="px-3 py-2.5 font-semibold text-[#111111]">{i.name}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[10px] font-bold uppercase text-[#6B7280]">
                          {i.ingredientType}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[#6B7280]">{i.category || "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{currency.format(i.hpp)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {i.onHand} {i.unit}
                      </td>
                      <td className="px-3 py-2.5 capitalize text-[#6B7280]">{i.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail drawer PRD §3–§13 */}
      {detail && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDetail(null)} />}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-[-16px_0_50px_rgba(0,0,0,0.28)] transition-transform duration-300"
        style={{ transform: detail ? "translateX(0)" : "translateX(100%)" }}
      >
        {detail && (
          <>
            <div className="border-b border-[#E8E8E8] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[17px] font-extrabold text-[#111111]">{detail.name}</h2>
                  <p className="mt-0.5 font-mono text-[11px] text-[#C8102E]">{detail.recipeSku || detail.recipeCode}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {statusBadge(detail.recipeStatus)}
                    {detail.source === "os-sync" && (
                      <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-bold text-[#2563EB]">OS SYNC</span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => setDetail(null)} className="grid size-8 place-items-center rounded-md hover:bg-[#F8F9FB]">
                  <X className="size-4" />
                </button>
              </div>
              {isManualRecipe && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void duplicateRecipe()}
                    className="inline-flex items-center gap-1 rounded-md border border-[#E8E8E8] px-2.5 py-1 text-[11px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB] disabled:opacity-50"
                  >
                    <Copy className="size-3" /> Duplikat
                  </button>
                  {detail.recipeStatus !== "archived" && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void archiveRecipe()}
                      className="inline-flex items-center gap-1 rounded-md border border-[#E8E8E8] px-2.5 py-1 text-[11px] font-semibold text-[#6B7280] hover:bg-[#F8F9FB] disabled:opacity-50"
                    >
                      <Archive className="size-3" /> Archive
                    </button>
                  )}
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px]">
                <MiniMetric label="HPP" value={currency.format(detail.cogs)} />
                <MiniMetric label="Jual" value={currency.format(detail.sellPrice)} />
                <MiniMetric label="Margin" value={currency.format(detail.margin)} accent />
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(["bom", "cost", "batch", "deps", "sop", "approval", "history", "insights"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDetailTab(t)}
                    className={`rounded-md px-3 py-1.5 text-[12px] font-bold capitalize ${
                      detailTab === t ? "bg-[#C8102E] text-white" : "bg-[#F8F9FB] text-[#6B7280]"
                    }`}
                  >
                    {t === "bom"
                      ? "BOM"
                      : t === "cost"
                        ? "Cost"
                        : t === "batch"
                          ? "Batch"
                          : t === "deps"
                            ? "Deps"
                            : t === "sop"
                              ? "SOP"
                              : t === "approval"
                                ? "Approval"
                                : t === "history"
                                  ? "History"
                                  : "Insights"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {detailTab === "bom" && (
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase text-[#6B7280]">Bill of Materials</p>
                  {detail.bom.length === 0 && (
                    <p className="rounded-lg border border-dashed border-[#E8E8E8] py-6 text-center text-[12px] text-[#6B7280]">
                      BOM kosong. Tambah bahan atau sub-recipe.
                    </p>
                  )}
                  {detail.bom.map((b) => (
                    <div
                      key={b.id}
                      className={`rounded-lg border p-2.5 ${
                        b.lineType !== "sub_recipe" && b.onHand < b.actualQty
                          ? "border-[#F59E0B]/50 bg-[#FFFBEB]"
                          : "border-[#E8E8E8]"
                      }`}
                    >
                      <div className="flex justify-between gap-2">
                        <div>
                          <p className="text-[13px] font-semibold text-[#111111]">{b.productName}</p>
                          <p className="font-mono text-[10px] text-[#9CA3AF]">
                            {b.sku} · {b.lineType}
                            {b.lineType !== "sub_recipe" ? ` · stok ${b.onHand} ${b.unit}` : ""}
                          </p>
                        </div>
                        <p className="font-mono text-[13px] font-bold">{currency.format(b.lineCost)}</p>
                      </div>
                      <p className="mt-1 text-[11px] text-[#6B7280]">
                        {b.qty} {b.unit}
                        {b.lineType !== "sub_recipe" ? ` + waste ${b.wastePct}% → aktual ${b.actualQty}` : ""} · {b.contribPct}% COGS
                      </p>
                    </div>
                  ))}
                  {isManualRecipe && (
                    <div className="mt-3 rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] p-3">
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase text-[#6B7280]">
                        <Factory className="size-3.5" /> Tambah Sub-Recipe
                      </p>
                      <div className="flex gap-2">
                        <select
                          value={addSubId}
                          onChange={(e) => setAddSubId(e.target.value)}
                          className="h-9 min-w-0 flex-1 rounded-md border border-[#E8E8E8] bg-white px-2 text-[12px]"
                        >
                          <option value="">Pilih sub-recipe…</option>
                          {subRecipes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} → {s.outputName} ({s.inputs} bahan)
                            </option>
                          ))}
                        </select>
                        <input
                          value={addSubQty}
                          onChange={(e) => setAddSubQty(e.target.value)}
                          inputMode="decimal"
                          className="h-9 w-16 rounded-md border border-[#E8E8E8] bg-white px-2 text-right font-mono text-[12px]"
                          placeholder="qty"
                        />
                        <button
                          type="button"
                          disabled={!addSubId || actionBusy}
                          onClick={() => void addSubRecipeToBom()}
                          className="rounded-md bg-[#2F3136] px-3 text-[12px] font-bold text-white hover:bg-black disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>
                      <p className="mt-1.5 text-[10.5px] text-[#9CA3AF]">
                        Sub-recipe dikelola di{" "}
                        <Link href="/warehouse/production" className="text-[#C8102E] hover:underline">
                          Produksi
                        </Link>
                        . HPP dihitung dari BOM produksi.
                      </p>
                    </div>
                  )}
                  {detail.source === "os-sync" && (
                    <p className="mt-2 rounded-lg bg-[#EFF6FF] px-3 py-2 text-[11.5px] text-[#2563EB]">
                      Resep OS-sync — edit BOM di Produk Manajemen, lalu tarik ulang dari WMS.
                    </p>
                  )}
                </div>
              )}

              {detailTab === "cost" && (
                <div className="space-y-3">
                  <CostRow label="Raw Material (ingredient)" value={detail.bom.filter((b) => b.lineType !== "packaging").reduce((s, b) => s + b.lineCost, 0)} />
                  <CostRow label="Packaging" value={detail.bom.filter((b) => b.lineType === "packaging").reduce((s, b) => s + b.lineCost, 0)} />
                  <div className="border-t border-[#E8E8E8] pt-2">
                    <CostRow label="Total HPP" value={detail.cogs} bold />
                    <CostRow label="Selling Price" value={detail.sellPrice} />
                    <CostRow label="Margin" value={detail.margin} accent />
                    <p className="mt-2 text-[12px]">
                      Food Cost:{" "}
                      <span className="font-bold" style={{ color: foodCostColor(detail.foodCostPct) }}>
                        {detail.foodCostPct}%
                      </span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#F8F9FB] p-3 text-[12px] text-[#6B7280]">
                    <p className="font-semibold text-[#111111]">General Info</p>
                    <p>Area: {detail.productionArea || "—"}</p>
                    <p>Kategori: {detail.category} / {detail.subCategory || "—"}</p>
                    <p>Yield: {detail.yieldQty} {detail.yieldUnit}</p>
                  </div>
                </div>
              )}

              {detailTab === "batch" && (
                <div className="space-y-3">
                  <p className="text-[12px] text-[#6B7280]">PRD §11 — hitung kebutuhan bahan untuk target produksi.</p>
                  <div className="flex gap-2">
                    <input
                      value={batchQty}
                      onChange={(e) => setBatchQty(e.target.value)}
                      inputMode="numeric"
                      className="h-10 flex-1 rounded-md border border-[#E8E8E8] px-3 font-mono text-[14px]"
                      placeholder="Target qty"
                    />
                    <button
                      type="button"
                      disabled={batchBusy}
                      onClick={() => void runBatchCalc()}
                      className="rounded-lg bg-[#2F3136] px-4 text-[13px] font-bold text-white hover:bg-black disabled:opacity-50"
                    >
                      {batchBusy ? "…" : "Hitung"}
                    </button>
                  </div>
                  {batchResult && (
                    <>
                      <div className={`rounded-lg p-3 ${batchResult.stockReady ? "bg-[#F0FDF4]" : "bg-[#FEF2F2]"}`}>
                        <p className="text-[13px] font-bold text-[#111111]">
                          {batchResult.recipeName} × {batchResult.targetQty}
                        </p>
                        <p className="text-[12px] text-[#6B7280]">
                          Bahan {currency.format(batchResult.ingredientCost)} + kemasan {currency.format(batchResult.packagingCost)} ={" "}
                          <b>{currency.format(batchResult.totalCost)}</b>
                        </p>
                        {!batchResult.stockReady && (
                          <p className="mt-1 text-[12px] font-semibold text-[#DC2626]">
                            {batchResult.missingStock.length} bahan stok kurang
                          </p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {batchResult.lines.map((l, i) => (
                          <div key={i} className="flex justify-between rounded-md border border-[#E8E8E8] px-2.5 py-2 text-[12px]">
                            <span className={l.stockOk ? "text-[#111111]" : "text-[#DC2626]"}>
                              {l.name} · butuh {l.neededQty} {l.unit}
                            </span>
                            <span className="font-mono">{currency.format(l.lineCost)}</span>
                          </div>
                        ))}
                      </div>
                      <Link
                        href="/warehouse/production"
                        className="block rounded-lg border border-[#C8102E]/30 bg-[#FDF1F3] py-2.5 text-center text-[13px] font-bold text-[#C8102E] hover:bg-[#FCE8EC]"
                      >
                        Buat Production Order →
                      </Link>
                    </>
                  )}
                </div>
              )}

              {detailTab === "deps" && depMap && (
                <div className="space-y-4">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-[#6B7280]">
                    <GitBranch className="size-3.5" /> Dependency Map · PRD §15
                  </p>

                  <div>
                    <p className="mb-2 text-[12px] font-semibold text-[#111111]">Upstream (BOM)</p>
                    {depMap.upstream.length === 0 ? (
                      <p className="text-[12px] text-[#9CA3AF]">Tidak ada ketergantungan upstream.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {depMap.upstream.map((u, i) => (
                          <li key={i} className="rounded-md border border-[#E8E8E8] px-2.5 py-2 text-[12px]">
                            <span className="font-semibold text-[#111111]">{u.name}</span>
                            <span className="ml-2 text-[#6B7280]">
                              {u.lineType} · {u.qty} {u.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {depMap.sharedRecipes.length > 0 && (
                    <div>
                      <p className="mb-2 text-[12px] font-semibold text-[#111111]">Bahan dipakai resep lain</p>
                      <ul className="space-y-2">
                        {depMap.sharedRecipes.map((s) => (
                          <li key={s.productId} className="rounded-lg border border-[#F59E0B]/30 bg-[#FFFBEB] p-2.5">
                            <p className="text-[12px] font-bold text-[#D97706]">{s.productName}</p>
                            <ul className="mt-1 space-y-0.5">
                              {s.recipes.map((r) => (
                                <li key={r.recipeId}>
                                  <button
                                    type="button"
                                    onClick={() => void openDetail(r.recipeId)}
                                    className="text-[12px] font-semibold text-[#111111] hover:text-[#C8102E]"
                                  >
                                    {r.recipeName}
                                  </button>
                                  <span className="ml-1 text-[#6B7280]">· {r.qty}</span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {depMap.subRecipeDependents.some((s) => s.usedBy.length > 0) && (
                    <div>
                      <p className="mb-2 text-[12px] font-semibold text-[#111111]">Sub-recipe dipakai bersama</p>
                      <ul className="space-y-2">
                        {depMap.subRecipeDependents
                          .filter((s) => s.usedBy.length > 0)
                          .map((s) => (
                            <li key={s.subRecipeId} className="rounded-lg border border-[#E8E8E8] p-2.5">
                              <p className="text-[12px] font-bold text-[#111111]">{s.subRecipeName}</p>
                              <ul className="mt-1 space-y-0.5">
                                {s.usedBy.map((r) => (
                                  <li key={r.recipeId}>
                                    <button
                                      type="button"
                                      onClick={() => void openDetail(r.recipeId)}
                                      className="text-[12px] text-[#2563EB] hover:underline"
                                    >
                                      {r.recipeName}
                                    </button>
                                    <span className="ml-1 text-[#6B7280]">· qty {r.qty}</span>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}

                  {depMap.sharedRecipes.length === 0 &&
                    depMap.subRecipeDependents.every((s) => s.usedBy.length === 0) &&
                    depMap.upstream.length > 0 && (
                      <p className="rounded-lg bg-[#F8F9FB] px-3 py-2 text-[12px] text-[#6B7280]">
                        Tidak ada overlap bahan dengan resep lain. Resep ini relatif independen.
                      </p>
                    )}
                </div>
              )}

              {detailTab === "sop" && (
                <div className="space-y-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-[#6B7280]">
                    <ListOrdered className="size-3.5" /> Langkah Produksi · PRD §9
                  </p>
                  {!isManualRecipe ? (
                    <p className="rounded-lg bg-[#EFF6FF] px-3 py-2 text-[12px] text-[#2563EB]">
                      Resep OS-sync — SOP dikelola di operasional dapur/bar sesuai menu POS.
                    </p>
                  ) : (
                    <>
                      {sopDraft.length === 0 && (
                        <p className="text-[12px] text-[#9CA3AF]">Belum ada langkah. Tambah urutan produksi.</p>
                      )}
                      {sopDraft.map((s, i) => (
                        <div key={i} className="rounded-lg border border-[#E8E8E8] p-2.5 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#2F3136] text-[10px] font-bold text-white">
                              {i + 1}
                            </span>
                            <input
                              value={s.title}
                              onChange={(e) =>
                                setSopDraft((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                              }
                              placeholder="Judul langkah"
                              className="h-8 min-w-0 flex-1 rounded-md border border-[#E8E8E8] px-2 text-[12px]"
                            />
                            <input
                              value={s.durationMin}
                              onChange={(e) =>
                                setSopDraft((p) => p.map((x, j) => (j === i ? { ...x, durationMin: e.target.value } : x)))
                              }
                              inputMode="numeric"
                              placeholder="mnt"
                              className="h-8 w-14 rounded-md border border-[#E8E8E8] px-1 text-center font-mono text-[12px]"
                            />
                          </div>
                          <input
                            value={s.notes}
                            onChange={(e) =>
                              setSopDraft((p) => p.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))
                            }
                            placeholder="Catatan (opsional)"
                            className="h-8 w-full rounded-md border border-[#E8E8E8] px-2 text-[12px]"
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSopDraft((p) => [...p, { order: p.length + 1, title: "", durationMin: "", notes: "" }])}
                        className="flex items-center gap-1 text-[12px] font-semibold text-[#C8102E]"
                      >
                        <Plus className="size-3.5" /> Tambah langkah
                      </button>
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void saveSop()}
                        className="w-full rounded-lg bg-[#C8102E] py-2.5 text-[13px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50"
                      >
                        Simpan SOP
                      </button>
                      {detail.sopSteps.length > 0 && (
                        <p className="text-[11px] text-[#9CA3AF]">
                          Total waktu: {detail.sopSteps.reduce((s, x) => s + x.durationMin, 0)} menit
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {detailTab === "approval" && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] p-3">
                    <p className="flex items-center gap-1.5 text-[12px] font-bold text-[#111111]">
                      <ClipboardCheck className="size-4 text-[#C8102E]" />
                      Workflow Approval
                    </p>
                    <p className="mt-1 text-[12px] text-[#6B7280]">
                      Draft → Kitchen → Gudang → Manager → Owner → Published
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {statusBadge(detail.recipeStatus)}
                      {detail.source === "os-sync" && (
                        <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-bold text-[#2563EB]">
                          OS SYNC (auto-published)
                        </span>
                      )}
                    </div>
                    {isManualRecipe && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canSubmit && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void recipeAction("submit")}
                            className="rounded-lg bg-[#C8102E] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50"
                          >
                            Ajukan Approval
                          </button>
                        )}
                        {isPending && (
                          <>
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void recipeAction("approve")}
                              className="rounded-lg bg-[#16A34A] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#15803D] disabled:opacity-50"
                            >
                              Approve Tahap Ini
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void recipeAction("reject")}
                              className="rounded-lg border border-[#DC2626]/40 bg-white px-4 py-2 text-[12px] font-bold text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-50"
                            >
                              Tolak → Draft
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Audit Log</p>
                    {auditLog.length === 0 ? (
                      <p className="text-[12px] text-[#9CA3AF]">Belum ada riwayat approval.</p>
                    ) : (
                      <ul className="space-y-2">
                        {auditLog.map((a) => (
                          <li key={a.id} className="rounded-lg border border-[#E8E8E8] px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[12px] font-bold capitalize text-[#111111]">{a.action}</span>
                              <span className="text-[10px] text-[#9CA3AF]">
                                {new Date(a.createdAt).toLocaleString("id-ID")}
                              </span>
                            </div>
                            <p className="text-[11.5px] text-[#6B7280]">
                              {a.actorName}
                              {a.step ? ` · ${a.step}` : ""}
                              {a.note ? ` — ${a.note}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {detailTab === "history" && (
                <div className="space-y-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-[#6B7280]">
                    <History className="size-3.5" /> Version History · PRD §16
                  </p>
                  {!isManualRecipe ? (
                    <p className="rounded-lg bg-[#EFF6FF] px-3 py-2 text-[12px] text-[#2563EB]">
                      Resep OS-sync — versi dikelola via sinkron dari Produk Manajemen.
                    </p>
                  ) : versions.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-[#E8E8E8] py-6 text-center text-[12px] text-[#6B7280]">
                      Belum ada snapshot versi. Versi otomatis dibuat saat edit SOP/BOM atau ajukan approval.
                    </p>
                  ) : (
                    <>
                      <ul className="space-y-2">
                        {versions.map((v) => (
                          <li key={v.id}>
                            <button
                              type="button"
                              onClick={() => void loadVersionDetail(v.id)}
                              className={`w-full rounded-lg border p-3 text-left transition hover:border-[#C8102E]/40 ${
                                versionDetail?.id === v.id ? "border-[#C8102E] bg-[#FDF1F3]" : "border-[#E8E8E8] bg-white"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-[13px] font-bold text-[#111111]">
                                    v{v.versionNo} · {v.label}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-[#6B7280]">
                                    {new Date(v.createdAt).toLocaleString("id-ID")}
                                    {v.actorName ? ` · ${v.actorName}` : ""}
                                  </p>
                                </div>
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                                  style={{ background: `${foodCostColor(v.foodCostPct)}22`, color: foodCostColor(v.foodCostPct) }}
                                >
                                  FC {v.foodCostPct}%
                                </span>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[#6B7280]">
                                <span>HPP {currency.format(v.cogs)}</span>
                                <span>{v.bomLineCount} BOM</span>
                                <span>{v.sopStepCount} SOP</span>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>

                      {versionDetail?.compareToCurrent && (
                        <div className="rounded-lg border border-[#E8E8E8] bg-[#F8F9FB] p-3">
                          <p className="text-[12px] font-bold text-[#111111]">Perbandingan vs versi saat ini</p>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                            <CompareDelta label="HPP" value={versionDetail.compareToCurrent.cogsDelta} money />
                            <CompareDelta label="Harga jual" value={versionDetail.compareToCurrent.sellPriceDelta} money />
                            <CompareDelta label="Food cost" value={versionDetail.compareToCurrent.foodCostPctDelta} pct />
                            <CompareDelta label="Baris BOM" value={versionDetail.compareToCurrent.bomLineDelta} />
                            <CompareDelta label="Langkah SOP" value={versionDetail.compareToCurrent.sopStepDelta} />
                          </div>
                          {versionDetail.compareToCurrent.bomAdded.length > 0 && (
                            <p className="mt-2 text-[11px] text-[#16A34A]">
                              + Ditambah: {versionDetail.compareToCurrent.bomAdded.join(", ")}
                            </p>
                          )}
                          {versionDetail.compareToCurrent.bomRemoved.length > 0 && (
                            <p className="mt-1 text-[11px] text-[#DC2626]">
                              − Dihapus: {versionDetail.compareToCurrent.bomRemoved.join(", ")}
                            </p>
                          )}
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => void restoreVersion(versionDetail.id)}
                            className="mt-3 w-full rounded-lg border border-[#C8102E] bg-white py-2.5 text-[12px] font-bold text-[#C8102E] hover:bg-[#FDF1F3] disabled:opacity-50"
                          >
                            Restore ke versi ini
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {detailTab === "insights" && (
                <div className="space-y-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-[#6B7280]">
                    <Lightbulb className="size-3.5" /> Recipe Insights · PRD §19
                  </p>
                  {!insights ? (
                    <p className="text-[12px] text-[#9CA3AF]">Memuat insight…</p>
                  ) : (
                    <>
                      <div className="rounded-xl border border-[#E8E8E8] bg-[#F8F9FB] p-4 text-center">
                        <p
                          className="text-[28px] font-extrabold"
                          style={{
                            color: insights.score >= 80 ? "#16A34A" : insights.score >= 60 ? "#D97706" : "#DC2626",
                          }}
                        >
                          {insights.score}
                        </p>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-[#6B7280]">Health Score</p>
                        <div className="mx-auto mt-2 h-2 max-w-xs overflow-hidden rounded-full bg-[#EEF0F3]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${insights.score}%`,
                              background: insights.score >= 80 ? "#16A34A" : insights.score >= 60 ? "#D97706" : "#DC2626",
                            }}
                          />
                        </div>
                      </div>
                      <ul className="space-y-2">
                        {insights.insights.map((ins) => (
                          <li
                            key={ins.code}
                            className={`rounded-lg border p-3 ${
                              ins.severity === "critical"
                                ? "border-[#DC2626]/40 bg-[#FEF2F2]"
                                : ins.severity === "warning"
                                  ? "border-[#F59E0B]/40 bg-[#FFFBEB]"
                                  : "border-[#E8E8E8] bg-white"
                            }`}
                          >
                            <p className="text-[13px] font-bold text-[#111111]">{ins.title}</p>
                            <p className="mt-1 text-[12px] text-[#6B7280]">{ins.message}</p>
                            {ins.action && (
                              <p className="mt-1.5 text-[11px] font-semibold text-[#C8102E]">→ {ins.action}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {creating && (
        <CreateRecipeModal
          products={products}
          onDone={() => {
            setCreating(false);
            void load();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {importing && (
        <ImportRecipeModal
          onDone={() => {
            setImporting(false);
            void load();
          }}
          onCancel={() => setImporting(false)}
        />
      )}
    </div>
  );
}

function DashKpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof BookOpen;
  label: string;
  value: string;
  tone?: "green" | "amber";
}) {
  const color = tone === "green" ? "#16A34A" : tone === "amber" ? "#D97706" : "#2F3136";
  return (
    <div className="rounded-xl border border-[#E8E8E8] bg-white p-3">
      <Icon className="size-4" style={{ color }} />
      <p className="mt-2 font-mono text-[18px] font-extrabold text-[#111111]">{value}</p>
      <p className="text-[9.5px] font-bold uppercase tracking-wide text-[#6B7280]">{label}</p>
    </div>
  );
}

function CompareDelta({
  label,
  value,
  money,
  pct,
}: {
  label: string;
  value: number;
  money?: boolean;
  pct?: boolean;
}) {
  const positive = value > 0;
  const negative = value < 0;
  const display = money
    ? `${positive ? "+" : ""}${currency.format(value)}`
    : pct
      ? `${positive ? "+" : ""}${value}%`
      : `${positive ? "+" : ""}${value}`;
  return (
    <div className="rounded-md bg-white px-2 py-1.5">
      <p className="text-[10px] font-bold uppercase text-[#9CA3AF]">{label}</p>
      <p
        className={`font-mono text-[12px] font-bold ${
          negative ? "text-[#16A34A]" : positive ? "text-[#DC2626]" : "text-[#6B7280]"
        }`}
      >
        {display}
      </p>
    </div>
  );
}

function MiniMetric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-[#F8F9FB] py-2">
      <p className={`font-mono text-[13px] font-extrabold ${accent ? "text-[#16A34A]" : "text-[#111111]"}`}>{value}</p>
      <p className="text-[9px] font-bold uppercase text-[#6B7280]">{label}</p>
    </div>
  );
}

function CostRow({ label, value, bold, accent }: { label: string; value: number; bold?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-[#6B7280]">{label}</span>
      <span className={`font-mono ${bold ? "font-extrabold" : "font-semibold"} ${accent ? "text-[#16A34A]" : "text-[#111111]"}`}>
        {currency.format(value)}
      </span>
    </div>
  );
}

function CreateRecipeModal({
  products,
  onDone,
  onCancel,
}: {
  products: WmsProductRow[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [bom, setBom] = useState([{ productId: "", qty: "" }]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await garageApi.post("/api/wms/recipes", {
        name: name.trim(),
        category: category.trim() || undefined,
        sellPrice: Number(sellPrice) || 0,
        bom: bom.filter((b) => b.productId && Number(b.qty) > 0).map((b) => ({ productId: b.productId, qty: Number(b.qty) })),
      });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const input = "h-9 w-full rounded-md border border-[#E8E8E8] px-2.5 text-[13px]";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onCancel} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-bold">Resep Manual</h2>
          <button type="button" onClick={onCancel}><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama resep" className={input} />
          <div className="grid grid-cols-2 gap-2">
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kategori" className={input} />
            <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} placeholder="Harga jual" className={input} />
          </div>
          {bom.map((b, i) => (
            <div key={i} className="flex gap-2">
              <select
                value={b.productId}
                onChange={(e) => setBom((p) => p.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}
                className={`${input} flex-1`}
              >
                <option value="">Bahan…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                value={b.qty}
                onChange={(e) => setBom((p) => p.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                placeholder="qty"
                className={`${input} w-20`}
              />
            </div>
          ))}
          <button type="button" onClick={() => setBom((p) => [...p, { productId: "", qty: "" }])} className="text-[12px] font-semibold text-[#C8102E]">
            + Bahan
          </button>
        </div>
        <div className="border-t p-4">
          <button type="button" disabled={busy} onClick={() => void submit()} className="w-full rounded-lg bg-[#C8102E] py-3 font-bold text-white disabled:opacity-50">
            Simpan
          </button>
        </div>
      </aside>
    </>
  );
}

function ImportRecipeModal({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Array<{ name: string; bomLines: number; sopSteps: number }> | null>(null);

  async function run(target: File, dryRun: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const text = await target.text();
      const json = JSON.parse(text) as { recipes?: unknown[] };
      const recipes = Array.isArray(json.recipes) ? json.recipes : Array.isArray(json) ? json : [];
      if (!recipes.length) throw new Error("File tidak berisi array recipes.");
      const res = await garageApi.post<{
        dryRun: boolean;
        created: number;
        skipped: number;
        errors: string[];
        preview: Array<{ name: string; bomLines: number; sopSteps: number }>;
      }>("/api/wms/recipes/import", { dryRun, recipes });
      setPreview(res.preview);
      if (dryRun) {
        setMsg(`Pratinjau: ${res.preview.length} resep · ${res.errors.length} peringatan`);
      } else {
        setMsg(`Import selesai: ${res.created} dibuat, ${res.skipped} dilewati.`);
        if (res.errors.length) setMsg((m) => `${m} ${res.errors.length} peringatan.`);
        onDone();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Gagal import.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onCancel} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-bold">Import Resep JSON</h2>
          <button type="button" onClick={onCancel}><X className="size-4" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <p className="text-[12px] text-[#6B7280]">
            Unggah file export JSON. BOM dicocokkan via SKU bahan WMS. Resep OS-sync dilewati.
          </p>
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setFile(f);
                void run(f, true);
              }
            }}
            className="text-[13px]"
          />
          {msg && <p className="text-[12px] font-semibold text-[#111111]">{msg}</p>}
          {preview && preview.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[#E8E8E8] p-2 text-[12px]">
              {preview.map((p, i) => (
                <li key={i} className="text-[#111111]">
                  {p.name} · {p.bomLines} BOM · {p.sopSteps} SOP
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t p-4">
          <button
            type="button"
            disabled={busy || !preview?.length || !file}
            onClick={() => {
              if (file) void run(file, false);
            }}
            className="w-full rounded-lg bg-[#C8102E] py-3 font-bold text-white disabled:opacity-50"
          >
            {busy ? "Memproses…" : "Import Sekarang"}
          </button>
        </div>
      </aside>
    </>
  );
}
