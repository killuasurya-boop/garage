"use client";

import { useState } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";
import { currency } from "@/lib/garage-data";
import { garageApi } from "@/lib/api-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FinanceQuickAction =
  | "supplier"
  | "settlement"
  | "recipe"
  | "close-cash";

function todayDateKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

const labelClass = "garage-mono mb-1 text-[10px] text-[#b8b8bf]";
const inputClass = "h-11 border-[#34343c] bg-white/[0.06]";

const config: Record<
  FinanceQuickAction,
  { title: string; description: string; cta: string }
> = {
  supplier: {
    title: "Catat invoice supplier",
    description: "Hutang bahan baku / operasional yang harus dibayar.",
    cta: "Simpan invoice",
  },
  settlement: {
    title: "Catat settlement",
    description: "Rekonsiliasi dana cair dari payment provider vs POS.",
    cta: "Simpan settlement",
  },
  recipe: {
    title: "Catat BOM / recipe",
    description: "Bahan per menu untuk hitung HPP dan margin.",
    cta: "Simpan BOM",
  },
  "close-cash": {
    title: "Tutup cash session",
    description: "Hitung selisih actual vs expected dan minta sign-off.",
    cta: "Tutup cash",
  },
};

/**
 * Dialog form terpusat untuk 4 aksi finance yang dulu memakai window.prompt():
 * Invoice supplier, Settlement, BOM/Recipe, dan Tutup cash. Form-nya dipisah ke
 * `ActionForm` dan di-`key` per action supaya remount dengan state fresh tanpa
 * perlu useEffect reset.
 */
export function FinanceQuickActionDialog({
  action,
  sessionId,
  expectedCash,
  onOpenChange,
  onDone,
}: {
  action: FinanceQuickAction | null;
  sessionId?: string | null;
  expectedCash: number;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={action !== null} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        {action ? (
          <ActionForm
            key={action}
            action={action}
            sessionId={sessionId}
            expectedCash={expectedCash}
            onClose={() => onOpenChange(false)}
            onDone={onDone}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ActionForm({
  action,
  sessionId,
  expectedCash,
  onClose,
  onDone,
}: {
  action: FinanceQuickAction;
  sessionId?: string | null;
  expectedCash: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supplier invoice
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("INV-MANUAL");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState(todayDateKey);

  // Settlement
  const [settlementMethod, setSettlementMethod] = useState("QRIS");
  const [settlementProvider, setSettlementProvider] = useState("BCA");
  const [settlementExpected, setSettlementExpected] = useState("");
  const [settlementSettled, setSettlementSettled] = useState("");
  const [settlementNo, setSettlementNo] = useState("SET-MANUAL");

  // Recipe / BOM
  const [recipeMenuId, setRecipeMenuId] = useState("coffee-americano");
  const [recipeSku, setRecipeSku] = useState("");
  const [recipeQty, setRecipeQty] = useState("");
  const [recipeUnit, setRecipeUnit] = useState("kg");
  const [recipeWaste, setRecipeWaste] = useState("3");

  // Close cash
  const [actualCash, setActualCash] = useState(() => String(expectedCash));
  const [closingNote, setClosingNote] = useState("");
  const [managerSignOff, setManagerSignOff] = useState(false);

  async function submitSupplier() {
    const name = supplierName.trim();
    if (name.length < 2) {
      throw new Error("Nama supplier wajib diisi.");
    }
    const amount = Number(invoiceAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Nominal invoice tidak valid.");
    }
    const code = `SUP-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24)}`;
    const dueDate = `${invoiceDueDate || todayDateKey()}T10:00:00+07:00`;
    const supplier = await garageApi.post<{ id: string }>(
      "/api/finance/suppliers",
      { code, name, category: "COGS" },
    );
    await garageApi.post("/api/finance/supplier-invoices", {
      supplierId: supplier.id,
      invoiceNo: invoiceNo.trim() || "INV-MANUAL",
      category: "COGS",
      description: `Invoice ${name}`,
      amount: Math.round(amount),
      dueDate,
    });
  }

  async function submitSettlement() {
    const method = settlementMethod.trim();
    const provider = settlementProvider.trim();
    if (method.length < 2 || provider.length < 2) {
      throw new Error("Metode dan provider wajib diisi.");
    }
    const expected = Number(settlementExpected);
    if (!Number.isFinite(expected) || expected < 0) {
      throw new Error("Nominal POS expected tidak valid.");
    }
    const settledRaw = settlementSettled.trim();
    const settled = settledRaw === "" ? expected : Number(settledRaw);
    if (!Number.isFinite(settled) || settled < 0) {
      throw new Error("Nominal settled tidak valid.");
    }
    const status =
      Math.round(settled) === Math.round(expected) ? "settled" : "mismatch";
    await garageApi.post("/api/finance/settlements", {
      settlementNo: settlementNo.trim() || "SET-MANUAL",
      method,
      provider,
      expectedAmount: Math.round(expected),
      settledAmount: Math.round(settled),
      status,
      settlementDate: `${todayDateKey()}T16:00:00+07:00`,
    });
  }

  async function submitRecipe() {
    const menuItemId = recipeMenuId.trim();
    const sku = recipeSku.trim();
    if (menuItemId.length < 2 || sku.length < 2) {
      throw new Error("Menu item ID dan SKU inventory wajib diisi.");
    }
    const qty = Number(recipeQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("Qty bahan tidak valid.");
    }
    const waste = Number(recipeWaste);
    await garageApi.post("/api/finance/recipes", {
      menuItemId,
      variantId: "all",
      inventorySku: sku,
      qty,
      unit: recipeUnit.trim() || "kg",
      wastePct: Number.isFinite(waste) ? Math.min(Math.max(waste, 0), 100) : 0,
    });
  }

  async function submitCloseCash() {
    if (!sessionId) {
      throw new Error("Cash session belum tersedia.");
    }
    const actual = Number(actualCash);
    if (!Number.isFinite(actual) || actual < 0) {
      throw new Error("Actual cash tidak valid.");
    }
    await garageApi.patch(`/api/finance/cash-sessions/${sessionId}/close`, {
      actualCash: Math.round(actual),
      denominations: { "1": Math.round(actual) },
      closingNote: closingNote.trim() || undefined,
      managerSignOff,
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (action === "supplier") await submitSupplier();
      else if (action === "settlement") await submitSettlement();
      else if (action === "recipe") await submitRecipe();
      else if (action === "close-cash") await submitCloseCash();
      // submit* helpers throw kalau validasi gagal / API error → ditangkap catch.
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi finance gagal.");
    } finally {
      setSaving(false);
    }
  }

  const current = config[action];

  return (
    <>
      <DialogHeader>
        <DialogTitle>{current.title}</DialogTitle>
        <DialogDescription>{current.description}</DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={handleSubmit}>
        {action === "supplier" ? (
          <>
            <div>
              <p className={labelClass}>Nama supplier (wajib)</p>
              <Input
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="mis. CV Sumber Kopi"
                className={inputClass}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={labelClass}>Nomor invoice</p>
                <Input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <p className={labelClass}>Jatuh tempo</p>
                <Input
                  type="date"
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <p className={labelClass}>Nominal (Rp)</p>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                placeholder="500000"
                className={inputClass}
              />
            </div>
          </>
        ) : null}

        {action === "settlement" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={labelClass}>Metode</p>
                <Select value={settlementMethod} onValueChange={setSettlementMethod}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QRIS">QRIS</SelectItem>
                    <SelectItem value="E-Wallet">E-Wallet</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className={labelClass}>Provider / bank</p>
                <Input
                  value={settlementProvider}
                  onChange={(e) => setSettlementProvider(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={labelClass}>POS expected (Rp)</p>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={settlementExpected}
                  onChange={(e) => setSettlementExpected(e.target.value)}
                  placeholder="1000000"
                  className={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <p className={labelClass}>Settled (Rp)</p>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={settlementSettled}
                  onChange={(e) => setSettlementSettled(e.target.value)}
                  placeholder="samakan = expected"
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <p className={labelClass}>Settlement ID</p>
              <Input
                value={settlementNo}
                onChange={(e) => setSettlementNo(e.target.value)}
                className={inputClass}
              />
            </div>
          </>
        ) : null}

        {action === "recipe" ? (
          <>
            <div>
              <p className={labelClass}>Menu item ID</p>
              <Input
                value={recipeMenuId}
                onChange={(e) => setRecipeMenuId(e.target.value)}
                placeholder="coffee-americano"
                className={inputClass}
                autoFocus
              />
            </div>
            <div>
              <p className={labelClass}>Inventory SKU</p>
              <Input
                value={recipeSku}
                onChange={(e) => setRecipeSku(e.target.value)}
                placeholder="INV-073"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className={labelClass}>Qty/menu</p>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={recipeQty}
                  onChange={(e) => setRecipeQty(e.target.value)}
                  placeholder="0.018"
                  className={inputClass}
                />
              </div>
              <div>
                <p className={labelClass}>Unit</p>
                <Input
                  value={recipeUnit}
                  onChange={(e) => setRecipeUnit(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <p className={labelClass}>Waste %</p>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  value={recipeWaste}
                  onChange={(e) => setRecipeWaste(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </>
        ) : null}

        {action === "close-cash" ? (
          <>
            <div className="rounded-md border border-[#34343c] bg-black/15 p-3 text-xs text-[#b8b8bf]">
              Expected cash sistem:{" "}
              <span className="garage-mono font-semibold text-[#ffd08a]">
                {currency.format(expectedCash)}
              </span>
            </div>
            <div>
              <p className={labelClass}>Actual cash dihitung (Rp)</p>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                className={inputClass}
                autoFocus
              />
            </div>
            {Number.isFinite(Number(actualCash)) && actualCash !== "" ? (
              <p className="text-xs text-[#b8b8bf]">
                Selisih:{" "}
                <span
                  className={`garage-mono font-semibold ${
                    Number(actualCash) - expectedCash !== 0
                      ? "text-[#ffc2c8]"
                      : "text-[#86efac]"
                  }`}
                >
                  {currency.format(Number(actualCash) - expectedCash)}
                </span>
              </p>
            ) : null}
            <div>
              <p className={labelClass}>Catatan closing (opsional)</p>
              <Input
                value={closingNote}
                onChange={(e) => setClosingNote(e.target.value)}
                placeholder="mis. selisih receh kembalian"
                className={inputClass}
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-[#34343c] bg-white/[0.04] p-3 text-sm text-white">
              <input
                type="checkbox"
                checked={managerSignOff}
                onChange={(e) => setManagerSignOff(e.target.checked)}
                className="size-4 accent-[#f5a742]"
              />
              Manager sign-off sekarang
            </label>
          </>
        ) : null}

        {error ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertTitle>Gagal</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter className="gap-2 pt-1 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
            onClick={onClose}
            disabled={saving}
          >
            Batal
          </Button>
          <Button type="submit" className="garage-press h-10" disabled={saving}>
            {saving ? (
              <>
                <RefreshCw className="mr-2 size-4 animate-spin" />
                Menyimpan...
              </>
            ) : (
              <>
                <Check className="mr-2 size-4" />
                {current.cta}
              </>
            )}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
