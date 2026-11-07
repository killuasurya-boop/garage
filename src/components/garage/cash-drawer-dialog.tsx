"use client";

import {
  AlertTriangle,
  ArrowDownToLine,
  Camera,
  Download,
  ArrowLeft,
  ArrowUpFromLine,
  Ban,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { GarageApiError, garageApi } from "@/lib/api-client";
import {
  CASH_DRAWER_CATEGORIES,
  CASH_DRAWER_GROUP_LABELS,
  CASH_DRAWER_STATUS_LABELS,
  cashDrawerCategoriesFor,
  DEPOSIT_ACCOUNT_LABEL,
  DEPOSIT_ACCOUNTS,
  type DepositAccount,
  cashDrawerCategory,
  cashDrawerNeedsApproval,
  formatRupiahInput,
  parseRupiahInput,
  type CashDrawerCategory,
  type CashDrawerDirection,
} from "@/lib/cash-drawer";
import type { CashMovementView } from "@/lib/garage-service";

// =============================================================================
// Kas Keluar / Masuk Laci (owner, Okt 2026). Alur: pilih JENIS (arah uang) →
// kategori → nominal → deskripsi → field sesuai kategori → ringkasan (untuk
// transaksi berisiko) → simpan → nomor referensi. Tab Riwayat: filter, detail,
// riwayat perubahan; Owner/Manajer menyetujui/menolak, membatalkan, mengoreksi.
// Semua aturan uang divalidasi ulang di server.
// =============================================================================

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const QUICK_AMOUNTS = [5_000, 10_000, 20_000, 50_000, 100_000];

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      })
    : "—";

const todayKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const labelClass = "garage-mono mb-1.5 block text-[11px] uppercase tracking-wide text-[#c4c4cc]";
const inputClass = "h-11 border-[#3c3c46] bg-white/[0.07] text-[15px]";
const chipIdle = "border-[#4a4a54] bg-white/[0.055] text-[#ececf0] hover:border-[#6a6a76]";

export type CashMovementRecorded = {
  id: string;
  refNo: string | null;
  status: string;
  type: CashDrawerDirection;
  categoryKey: string;
  category: string;
  description: string;
  counterparty: string | null;
  amount: number;
  movementAt: string;
  cashSessionCode: string;
  approvedByName: string | null;
};

type Options = {
  employees: Array<{ userId: string; name: string; role: string; outstandingAdvance: number }>;
  recentCashOut: Array<{ refNo: string | null; category: string; description: string; amount: number }>;
};

type FormValues = {
  direction: CashDrawerDirection | null;
  categoryKey: string;
  amount: string;
  description: string;
  note: string;
  counterparty: string;
  vendorName: string;
  receiptNo: string;
  orderRef: string;
  employeeUserId: string;
  relatedRef: string;
  depositAccount: string;
};

const EMPTY_FORM: FormValues = {
  direction: null,
  categoryKey: "",
  amount: "",
  description: "",
  note: "",
  counterparty: "",
  vendorName: "",
  receiptNo: "",
  orderRef: "",
  employeeUserId: "",
  relatedRef: "",
  depositAccount: "",
};

type FieldErrors = Partial<Record<keyof FormValues | "managerPin" | "reason", string>>;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof GarageApiError || error instanceof Error ? error.message : fallback;
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "recorded"
      ? "border-[#9fa0aa]/50 bg-white/[0.08] text-[#ececf0]"
      : status === "pending_approval"
        ? "border-[#f5a742]/60 bg-[#f5a742]/15 text-[#ffd08a]"
        : "border-[#d11a2a]/55 bg-[#d11a2a]/15 text-[#ffb4b4]";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {CASH_DRAWER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function DirectionLabel({ type }: { type: CashDrawerDirection }) {
  return type === "out" ? (
    <span className="inline-flex items-center gap-1 font-semibold text-[#ff8f8f]">
      <ArrowUpFromLine className="size-3.5" /> Kas Keluar
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 font-semibold text-[#ffd08a]">
      <ArrowDownToLine className="size-3.5" /> Kas Masuk
    </span>
  );
}

// ─── Form catat / koreksi ───────────────────────────────────────────────────

function CashMovementForm({
  mode,
  initial,
  role,
  threshold,
  shiftOpen,
  options,
  onCancel,
  onRecorded,
  onCorrected,
  correctTargetId,
}: {
  mode: "record" | "correct";
  initial?: FormValues;
  role: string;
  threshold: number;
  shiftOpen: boolean;
  options: Options | null;
  onCancel: () => void;
  onRecorded?: (result: CashMovementRecorded) => void;
  onCorrected?: () => void;
  correctTargetId?: string;
}) {
  const [values, setValues] = useState<FormValues>(initial ?? EMPTY_FORM);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"pin" | "request">("pin");
  const [managerPin, setManagerPin] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<CashMovementRecorded | null>(null);
  const [receiptAttached, setReceiptAttached] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const isKasir = role === "Kasir";
  const def = cashDrawerCategory(values.categoryKey);
  const amount = parseRupiahInput(values.amount);
  // Owner 6 Nov 2026: langsung tercatat; ACC hanya kasbon/refund, atau bila server menolak karena batas kas keluar
  // per shift terlewati (server = penentu; total shift tidak diketahui di layar).
  const [overShiftLimit, setOverShiftLimit] = useState(false);
  const needsApproval =
    mode === "record" && isKasir && def != null && Number.isFinite(amount) && (overShiftLimit || cashDrawerNeedsApproval(def, amount));
  const requiresConfirm =
    mode === "correct" || needsApproval || Boolean(def?.alwaysConfirm) || (Number.isFinite(amount) && amount >= threshold);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setServerError(null);
  }

  function chooseDirection(direction: CashDrawerDirection) {
    if (mode === "correct") return;
    setValues((current) =>
      current.direction === direction ? current : { ...EMPTY_FORM, direction, amount: current.amount },
    );
    setErrors({});
  }

  function chooseCategory(category: CashDrawerCategory) {
    update("categoryKey", category.key);
    window.requestAnimationFrame(() => amountRef.current?.focus());
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!values.direction) next.direction = "Pilih Kas Keluar atau Kas Masuk dulu.";
    if (!def) next.categoryKey = "Pilih kategori.";
    if (!values.amount.trim()) next.amount = "Nominal wajib diisi.";
    else if (!Number.isFinite(amount) || amount <= 0) next.amount = "Nominal harus lebih dari Rp0.";
    else if (amount > 100_000_000) next.amount = "Nominal maksimal Rp100.000.000.";
    if (values.description.trim().length < 3) next.description = "Deskripsi wajib diisi (min. 3 huruf).";
    if (def) {
      for (const field of def.required) {
        if (field === "counterparty" && !values.counterparty.trim()) next.counterparty = `${def.counterpartyLabel ?? "Pihak terkait"} wajib diisi.`;
        if (field === "orderRef" && !values.orderRef.trim()) next.orderRef = "Nomor order wajib diisi.";
        if (field === "employee" && !values.employeeUserId) next.employeeUserId = "Pilih karyawan.";
        if (field === "depositAccount" && !values.depositAccount) next.depositAccount = "Pilih rekening tujuan setoran.";
      }
      if (def.key === "bayar_kasbon" && values.employeeUserId && Number.isFinite(amount)) {
        const employee = options?.employees.find((row) => row.userId === values.employeeUserId);
        if (employee && amount > employee.outstandingAdvance) {
          next.amount = employee.outstandingAdvance
            ? `Melebihi sisa kasbon ${currency.format(employee.outstandingAdvance)}.`
            : `${employee.name} tidak punya kasbon yang belum lunas.`;
        }
      }
    }
    if (needsApproval && approvalMode === "pin" && !/^\d{4,8}$/.test(managerPin)) {
      next.managerPin = "Masukkan PIN Manajer/Owner (4–8 digit) atau pilih kirim pengajuan.";
    }
    if (mode === "correct" && reason.trim().length < 3) next.reason = "Alasan koreksi wajib diisi.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function proceed() {
    if (!shiftOpen && mode === "record") {
      setServerError("Buka shift terlebih dahulu sebelum mencatat kas laci.");
      return;
    }
    if (!validate()) return;
    if (requiresConfirm && step === "form") {
      setStep("confirm");
      return;
    }
    void submit();
  }

  function payload() {
    return {
      type: values.direction!,
      categoryKey: values.categoryKey,
      amount,
      description: values.description.trim(),
      note: values.note.trim() || null,
      counterparty: values.counterparty.trim() || null,
      vendorName: values.vendorName.trim() || null,
      receiptNo: values.receiptNo.trim() || null,
      orderRef: values.orderRef.trim() || null,
      employeeUserId: values.employeeUserId || null,
      relatedRef: values.relatedRef || null,
      depositAccount: values.depositAccount || null,
    };
  }

  async function submit() {
    setPending(true);
    setServerError(null);
    try {
      if (mode === "correct" && correctTargetId) {
        await garageApi.post(`/api/finance/cash-movements/${encodeURIComponent(correctTargetId)}/correct`, {
          ...payload(),
          reason: reason.trim(),
        });
        onCorrected?.();
        return;
      }
      const recorded = await garageApi.post<CashMovementRecorded>("/api/finance/cash-sessions/movements", {
        ...payload(),
        managerPin: needsApproval && approvalMode === "pin" ? managerPin : undefined,
        submitForApproval: needsApproval && approvalMode === "request" ? true : undefined,
      });
      setResult(recorded);
      setStep("done");
      onRecorded?.(recorded);
    } catch (error) {
      setServerError(errorMessage(error, "Gagal menyimpan transaksi kas."));
      if (error instanceof GarageApiError && error.code === "MANAGER_PIN_INVALID") {
        setManagerPin("");
        setStep("form");
      }
      if (error instanceof GarageApiError && error.code === "MANAGER_PIN_REQUIRED") {
        // Batas kas keluar per shift terlewati → minta PIN Manajer/Owner atau kirim pengajuan.
        setOverShiftLimit(true);
        setStep("form");
      }
    } finally {
      setPending(false);
    }
  }

  function resetForAnother() {
    setValues({ ...EMPTY_FORM, direction: values.direction });
    setResult(null);
    setReceiptAttached(false);
    setManagerPin("");
    setApprovalMode("pin");
    setOverShiftLimit(false);
    setErrors({});
    setServerError(null);
    setStep("form");
  }

  if (step === "done" && result) {
    const isPending = result.status === "pending_approval";
    return (
      <div className="space-y-4 py-2" role="status" aria-live="polite">
        <div
          className={`rounded-md border p-4 ${
            isPending ? "border-[#f5a742]/55 bg-[#f5a742]/10" : "border-[#9fa0aa]/40 bg-white/[0.06]"
          }`}
        >
          <div className="flex items-start gap-3">
            {isPending ? (
              <Clock3 className="mt-0.5 size-6 shrink-0 text-[#ffd08a]" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-[#ececf0]" />
            )}
            <div className="min-w-0 space-y-1">
              <p className="text-base font-semibold text-[#f4f4f5]">
                {isPending
                  ? "Pengajuan terkirim — uang BELUM boleh keluar/masuk laci"
                  : `${result.type === "out" ? "Kas keluar" : "Kas masuk"} tercatat`}
              </p>
              <p className="garage-mono text-sm text-[#d0d0d6]">Ref {result.refNo ?? "-"}</p>
              <p className="garage-mono text-2xl font-bold tabular-nums text-[#f4f4f5]">
                {result.type === "out" ? "−" : "+"}
                {currency.format(result.amount)}
              </p>
              <p className="text-sm text-[#d0d0d6]">
                {result.category} · {result.description}
              </p>
              {result.approvedByName ? (
                <p className="text-sm text-[#d0d0d6]">Disetujui {result.approvedByName}</p>
              ) : null}
              {isPending ? (
                <p className="text-sm text-[#ffd08a]">
                  Tunggu Manajer/Owner menyetujui di tab Riwayat sebelum menyerahkan/menerima uang.
                </p>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <div className="mr-auto">
            {receiptAttached ? (
              <p className="flex h-11 items-center gap-1.5 text-sm font-semibold text-[#ececf0]">
                <CheckCircle2 className="size-4" /> Foto nota terlampir
              </p>
            ) : (
              <ReceiptUploader movementId={result.id} hasPhoto={false} onUploaded={() => setReceiptAttached(true)} />
            )}
          </div>
          <Button type="button" variant="outline" className={`garage-press h-11 ${chipIdle}`} onClick={resetForAnother}>
            Catat lagi
          </Button>
          <Button type="button" className="garage-press h-11 min-w-28" onClick={onCancel}>
            Selesai
          </Button>
        </div>
      </div>
    );
  }

  if (step === "confirm" && def && values.direction) {
    const employee = options?.employees.find((row) => row.userId === values.employeeUserId);
    const rows: Array<[string, string | null]> = [
      ["Kategori", def.label],
      ["Klasifikasi", CASH_DRAWER_GROUP_LABELS[def.group]],
      ["Deskripsi", values.description.trim()],
      [def.counterpartyLabel ?? "Pihak terkait", values.counterparty.trim() || null],
      ["Karyawan", employee?.name ?? null],
      ["Toko / pemasok", values.vendorName.trim() || null],
      ["No. nota", values.receiptNo.trim() || null],
      ["No. order", values.orderRef.trim() || null],
      ["Ref kas keluar asal", values.relatedRef || null],
      ["Rekening tujuan", values.depositAccount ? DEPOSIT_ACCOUNT_LABEL[values.depositAccount as DepositAccount] : null],
      ["Catatan", values.note.trim() || null],
      ["Alasan koreksi", mode === "correct" ? reason.trim() : null],
    ];
    return (
      <div className="space-y-3">
        <div
          className={`rounded-md border p-4 ${
            values.direction === "out" ? "border-[#d11a2a]/55 bg-[#d11a2a]/10" : "border-[#f5a742]/55 bg-[#f5a742]/10"
          }`}
        >
          <p className="garage-mono text-[11px] uppercase tracking-wide text-[#d0d0d6]">Periksa sebelum simpan</p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-lg">
              <DirectionLabel type={values.direction} />
            </span>
            <span className="garage-mono text-2xl font-bold tabular-nums text-[#f4f4f5]">
              {values.direction === "out" ? "−" : "+"}
              {currency.format(amount)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#e4e4e8]">
            {values.direction === "out" ? "Uang fisik KELUAR dari laci." : "Uang fisik MASUK ke laci."}{" "}
            {def.hint}
          </p>
        </div>
        <dl className="grid gap-x-4 gap-y-2 rounded-md border border-[#3c3c46] bg-white/[0.04] p-3 text-sm sm:grid-cols-2">
          {rows
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[12px] text-[#b8b8c2]">{label}</dt>
                <dd className="break-words font-medium text-[#f4f4f5]">{value}</dd>
              </div>
            ))}
        </dl>
        {needsApproval ? (
          <p className="flex items-start gap-2 rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 p-2.5 text-sm text-[#ffd08a]">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            {approvalMode === "pin"
              ? "Disetujui langsung dengan PIN Manajer/Owner."
              : "Dikirim sebagai pengajuan — saldo laci belum berubah sampai disetujui."}
          </p>
        ) : null}
        {serverError ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertTitle>Gagal menyimpan</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className={`garage-press h-11 ${chipIdle}`}
            onClick={() => setStep("form")}
            disabled={pending}
          >
            <ArrowLeft className="mr-1.5 size-4" /> Ubah
          </Button>
          <Button type="button" className="garage-press h-11 min-w-36" onClick={() => void submit()} disabled={pending} autoFocus>
            {pending ? (
              <>
                <RefreshCw className="mr-2 size-4 animate-spin" /> Menyimpan…
              </>
            ) : (
              <>
                <Check className="mr-2 size-4" />
                {needsApproval && approvalMode === "request" ? "Kirim pengajuan" : "Ya, simpan"}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  const categories = values.direction ? cashDrawerCategoriesFor(values.direction) : [];
  const showField = (field: CashDrawerCategory["fields"][number]) => Boolean(def?.fields.includes(field));
  const employeeForRepay = options?.employees.find((row) => row.userId === values.employeeUserId);

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        proceed();
      }}
    >
      {/* 1. Jenis transaksi — paling menonjol supaya arah uang tidak salah. */}
      <fieldset>
        <legend className={labelClass}>1 · Jenis transaksi</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Jenis transaksi">
          {(
            [
              ["out", "Kas Keluar", "Uang keluar dari laci", ArrowUpFromLine],
              ["in", "Kas Masuk", "Uang masuk ke laci", ArrowDownToLine],
            ] as const
          ).map(([value, label, sub, Icon]) => {
            const active = values.direction === value;
            const activeTone =
              value === "out"
                ? "border-[#e83030] bg-[#d11a2a]/20 text-[#ffd6d6] shadow-[0_0_0_1px_rgba(232,48,48,0.45)]"
                : "border-[#f5a742] bg-[#f5a742]/16 text-[#ffe2b8] shadow-[0_0_0_1px_rgba(245,167,66,0.45)]";
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={mode === "correct" && !active}
                onClick={() => chooseDirection(value)}
                className={`garage-press flex min-h-16 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active ? activeTone : chipIdle
                }`}
              >
                <Icon className="size-6 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-base font-bold leading-tight">{label}</span>
                  <span className="block text-[12px] leading-tight text-[#d0d0d6]">{sub}</span>
                </span>
              </button>
            );
          })}
        </div>
        {errors.direction ? <p className="mt-1 text-sm text-[#ff9b9b]">{errors.direction}</p> : null}
      </fieldset>

      {values.direction ? (
        <>
          {/* 2. Kategori sesuai arah uang. */}
          <fieldset>
            <legend className={labelClass}>2 · Kategori</legend>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {categories.map((category) => {
                const active = values.categoryKey === category.key;
                return (
                  <button
                    key={category.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseCategory(category)}
                    className={`garage-press flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-2 py-1.5 text-center text-[13px] font-semibold leading-tight transition-colors ${
                      active ? "border-[#f5a742]/70 bg-[#f5a742]/16 text-[#ffd08a]" : chipIdle
                    }`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
            {def ? (
              <p className="mt-1.5 text-[13px] text-[#c8c8d0]">
                <span className="font-semibold text-[#ececf0]">{CASH_DRAWER_GROUP_LABELS[def.group]}.</span> {def.hint}
              </p>
            ) : null}
            {errors.categoryKey ? <p className="mt-1 text-sm text-[#ff9b9b]">{errors.categoryKey}</p> : null}
          </fieldset>

          {def ? (
            <>
              {/* 3. Nominal Rupiah dengan pemisah ribuan. */}
              <div>
                <label htmlFor="cash-amount" className={labelClass}>
                  3 · Nominal
                </label>
                <div className="relative">
                  <span className="garage-mono pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-[#c4c4cc]">
                    Rp
                  </span>
                  <Input
                    id="cash-amount"
                    ref={amountRef}
                    inputMode="numeric"
                    autoComplete="off"
                    value={values.amount}
                    onChange={(event) => update("amount", formatRupiahInput(event.target.value))}
                    placeholder="0"
                    aria-invalid={Boolean(errors.amount)}
                    aria-describedby={errors.amount ? "cash-amount-error" : undefined}
                    className={`${inputClass} garage-mono pl-10 text-lg font-bold tabular-nums`}
                  />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {QUICK_AMOUNTS.map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => update("amount", formatRupiahInput(String(quick)))}
                      className={`garage-press garage-mono h-9 cursor-pointer rounded-md border px-2.5 text-[13px] tabular-nums ${
                        amount === quick ? "border-[#f5a742]/70 bg-[#f5a742]/16 text-[#ffd08a]" : chipIdle
                      }`}
                    >
                      {currency.format(quick)}
                    </button>
                  ))}
                </div>
                {errors.amount ? (
                  <p id="cash-amount-error" className="mt-1 text-sm text-[#ff9b9b]">
                    {errors.amount}
                  </p>
                ) : null}
              </div>

              {/* 4. Deskripsi wajib — contoh sesuai kategori. */}
              <div>
                <label htmlFor="cash-description" className={labelClass}>
                  4 · Deskripsi (wajib)
                </label>
                <Input
                  id="cash-description"
                  value={values.description}
                  onChange={(event) => update("description", event.target.value.slice(0, 180))}
                  placeholder={`mis. ${def.placeholder}`}
                  maxLength={180}
                  aria-invalid={Boolean(errors.description)}
                  className={inputClass}
                />
                {errors.description ? <p className="mt-1 text-sm text-[#ff9b9b]">{errors.description}</p> : null}
              </div>

              {/* 5. Field tambahan sesuai kategori. */}
              {def.fields.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {showField("employee") ? (
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Karyawan (wajib)</label>
                      <Select value={values.employeeUserId} onValueChange={(value) => update("employeeUserId", value)}>
                        <SelectTrigger className={`${inputClass} w-full`} aria-invalid={Boolean(errors.employeeUserId)}>
                          <SelectValue placeholder={options ? "Pilih karyawan" : "Memuat karyawan…"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(options?.employees ?? [])
                            .filter((row) => def.key !== "bayar_kasbon" || row.outstandingAdvance > 0)
                            .map((row) => (
                              <SelectItem key={row.userId} value={row.userId}>
                                {row.name} · {row.role}
                                {row.outstandingAdvance ? ` · sisa kasbon ${currency.format(row.outstandingAdvance)}` : ""}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {def.key === "bayar_kasbon" && options && !options.employees.some((row) => row.outstandingAdvance > 0) ? (
                        <p className="mt-1 text-sm text-[#c8c8d0]">Tidak ada karyawan dengan kasbon belum lunas.</p>
                      ) : null}
                      {employeeForRepay && def.key === "kasbon" && employeeForRepay.outstandingAdvance > 0 ? (
                        <p className="mt-1 text-sm text-[#ffd08a]">
                          {employeeForRepay.name} masih punya kasbon {currency.format(employeeForRepay.outstandingAdvance)}.
                        </p>
                      ) : null}
                      {errors.employeeUserId ? <p className="mt-1 text-sm text-[#ff9b9b]">{errors.employeeUserId}</p> : null}
                    </div>
                  ) : null}
                  {showField("orderRef") ? (
                    <div>
                      <label htmlFor="cash-order" className={labelClass}>
                        No. order {def.required.includes("orderRef") ? "(wajib)" : ""}
                      </label>
                      <Input
                        id="cash-order"
                        value={values.orderRef}
                        onChange={(event) => update("orderRef", event.target.value.toUpperCase().slice(0, 60))}
                        placeholder="mis. ORD-1023"
                        className={`${inputClass} garage-mono`}
                        aria-invalid={Boolean(errors.orderRef)}
                      />
                      {errors.orderRef ? <p className="mt-1 text-sm text-[#ff9b9b]">{errors.orderRef}</p> : null}
                    </div>
                  ) : null}
                  {showField("depositAccount") ? (
                    <div>
                      <label className={labelClass}>Rekening tujuan (wajib)</label>
                      <Select value={values.depositAccount || undefined} onValueChange={(value) => update("depositAccount", value)}>
                        <SelectTrigger className={`${inputClass} w-full`} aria-invalid={Boolean(errors.depositAccount)} data-testid="cash-deposit-account">
                          <SelectValue placeholder="Pilih rekening" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEPOSIT_ACCOUNTS.map((account) => (
                            <SelectItem key={account} value={account}>
                              {DEPOSIT_ACCOUNT_LABEL[account]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {errors.depositAccount ? <p className="mt-1 text-sm text-[#ff9b9b]">{errors.depositAccount}</p> : null}
                    </div>
                  ) : null}
                  {showField("counterparty") ? (
                    <div>
                      <label htmlFor="cash-counterparty" className={labelClass}>
                        {def.counterpartyLabel ?? "Pihak terkait"} {def.required.includes("counterparty") ? "(wajib)" : ""}
                      </label>
                      <Input
                        id="cash-counterparty"
                        value={values.counterparty}
                        onChange={(event) => update("counterparty", event.target.value.slice(0, 80))}
                        placeholder="Nama orang"
                        className={inputClass}
                        aria-invalid={Boolean(errors.counterparty)}
                      />
                      {errors.counterparty ? <p className="mt-1 text-sm text-[#ff9b9b]">{errors.counterparty}</p> : null}
                    </div>
                  ) : null}
                  {showField("vendorName") ? (
                    <div>
                      <label htmlFor="cash-vendor" className={labelClass}>
                        Toko / pemasok
                      </label>
                      <Input
                        id="cash-vendor"
                        value={values.vendorName}
                        onChange={(event) => update("vendorName", event.target.value.slice(0, 80))}
                        placeholder="mis. Toko Sumber Rejeki"
                        className={inputClass}
                      />
                    </div>
                  ) : null}
                  {showField("receiptNo") ? (
                    <div>
                      <label htmlFor="cash-receipt" className={labelClass}>
                        No. nota / bukti
                      </label>
                      <Input
                        id="cash-receipt"
                        value={values.receiptNo}
                        onChange={(event) => update("receiptNo", event.target.value.slice(0, 60))}
                        placeholder="Nomor di nota toko"
                        className={`${inputClass} garage-mono`}
                      />
                    </div>
                  ) : null}
                  {showField("relatedRef") ? (
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Ref kas keluar asal (opsional)</label>
                      <Select
                        value={values.relatedRef || "none"}
                        onValueChange={(value) => update("relatedRef", value === "none" ? "" : value)}
                      >
                        <SelectTrigger className={`${inputClass} w-full`}>
                          <SelectValue placeholder="Tanpa ref" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Tanpa ref</SelectItem>
                          {(options?.recentCashOut ?? [])
                            .filter((row) => row.refNo)
                            .map((row) => (
                              <SelectItem key={row.refNo!} value={row.refNo!}>
                                {row.refNo} · {row.category} · {currency.format(row.amount)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label htmlFor="cash-note" className={labelClass}>
                  Catatan (opsional)
                </label>
                <Textarea
                  id="cash-note"
                  value={values.note}
                  onChange={(event) => update("note", event.target.value.slice(0, 300))}
                  placeholder="Detail tambahan untuk audit, mis. barang yang dibeli"
                  rows={2}
                  className="min-h-16 border-[#3c3c46] bg-white/[0.07] text-[15px]"
                />
              </div>

              {mode === "correct" ? (
                <div>
                  <label htmlFor="cash-reason" className={labelClass}>
                    Alasan koreksi (wajib)
                  </label>
                  <Input
                    id="cash-reason"
                    value={reason}
                    onChange={(event) => {
                      setReason(event.target.value.slice(0, 300));
                      setErrors((current) => ({ ...current, reason: undefined }));
                    }}
                    placeholder="mis. Nominal di nota ternyata berbeda"
                    className={inputClass}
                  />
                  {errors.reason ? <p className="mt-1 text-sm text-[#ff9b9b]">{errors.reason}</p> : null}
                </div>
              ) : null}

              {needsApproval ? (
                <div className="space-y-2 rounded-md border border-[#f5a742]/50 bg-[#f5a742]/10 p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[#ffd08a]">
                    <ShieldCheck className="size-4" />
                    Perlu persetujuan Manajer/Owner
                    {def.requiresApproval ? "" : " (batas kas keluar shift ini terlewati)"}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Cara persetujuan">
                    {(
                      [
                        ["pin", "PIN sekarang"],
                        ["request", "Kirim pengajuan"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={approvalMode === value}
                        onClick={() => {
                          setApprovalMode(value);
                          setErrors((current) => ({ ...current, managerPin: undefined }));
                        }}
                        className={`garage-press h-11 cursor-pointer rounded-md border px-2 text-sm font-semibold ${
                          approvalMode === value ? "border-[#f5a742]/70 bg-[#f5a742]/18 text-[#ffd08a]" : chipIdle
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {approvalMode === "pin" ? (
                    <div>
                      <label htmlFor="cash-pin" className="sr-only">
                        PIN Manajer/Owner
                      </label>
                      <Input
                        id="cash-pin"
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        value={managerPin}
                        onChange={(event) => {
                          setManagerPin(event.target.value.replace(/\D/g, "").slice(0, 8));
                          setErrors((current) => ({ ...current, managerPin: undefined }));
                        }}
                        placeholder="PIN Manajer/Owner yang hadir"
                        className={`${inputClass} border-[#f5a742]/45`}
                      />
                      {errors.managerPin ? <p className="mt-1 text-sm text-[#ff9b9b]">{errors.managerPin}</p> : null}
                    </div>
                  ) : (
                    <p className="text-sm text-[#ffe2b8]">
                      Uang belum boleh keluar/masuk laci. Saldo laci berubah saat Manajer/Owner menyetujui di Riwayat.
                    </p>
                  )}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <p className="rounded-md border border-dashed border-[#4a4a54] p-3 text-sm text-[#c8c8d0]">
          Pilih dulu apakah uang <strong className="text-[#ff8f8f]">keluar</strong> dari laci atau{" "}
          <strong className="text-[#ffd08a]">masuk</strong> ke laci. Penjualan tunai tidak dicatat di sini — otomatis dari
          pembayaran POS.
        </p>
      )}

      {serverError ? (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Kas laci</AlertTitle>
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-[#2c2c34] pt-3">
        <Button type="button" variant="outline" className={`garage-press h-11 ${chipIdle}`} onClick={onCancel} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" className="garage-press h-11 min-w-32" disabled={pending || !def}>
          {pending ? (
            <>
              <RefreshCw className="mr-2 size-4 animate-spin" /> Menyimpan…
            </>
          ) : requiresConfirm ? (
            "Lanjut — periksa"
          ) : (
            <>
              <Check className="mr-2 size-4" /> Simpan
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

// ─── Foto nota ──────────────────────────────────────────────────────────────

/** Ambil/ganti foto nota (kamera belakang di tablet/HP). Server mengompres ke WebP. */
function ReceiptUploader({
  movementId,
  hasPhoto,
  onUploaded,
}: {
  movementId: string;
  hasPhoto: boolean;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch(`/api/finance/cash-movements/${encodeURIComponent(movementId)}/receipt`, {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Gagal mengunggah foto nota.");
      onUploaded();
    } catch (err) {
      setError(errorMessage(err, "Gagal mengunggah foto nota."));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Pilih foto nota"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        className={`garage-press h-11 ${chipIdle}`}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <RefreshCw className="mr-1.5 size-4 animate-spin" /> : <Camera className="mr-1.5 size-4" />}
        {busy ? "Mengunggah…" : hasPhoto ? "Ganti foto nota" : "Lampirkan foto nota"}
      </Button>
      {error ? <p className="mt-1 text-sm text-[#ff9b9b]">{error}</p> : null}
    </div>
  );
}

// ─── Riwayat ────────────────────────────────────────────────────────────────

type ListResponse = {
  items: CashMovementView[];
  totals: { cashIn: number; cashOut: number; pending: number };
  cashiers: Array<{ id: string; name: string }>;
  canManage: boolean;
};

type DetailResponse = {
  movement: CashMovementView;
  history: Array<{
    id: string;
    action: string;
    actor: string;
    status: string;
    reason: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    createdAt: string;
  }>;
  linked: CashMovementView[];
  canManage: boolean;
  canAttachReceipt: boolean;
};

function describeChange(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return null;
  const parts: string[] = [];
  if (before.amount !== after.amount) {
    parts.push(`Nominal ${currency.format(Number(before.amount ?? 0))} → ${currency.format(Number(after.amount ?? 0))}`);
  }
  if (before.category !== after.category) parts.push(`Kategori ${String(before.category)} → ${String(after.category)}`);
  if (before.description !== after.description) parts.push("Deskripsi diubah");
  if (before.status !== after.status) {
    parts.push(
      `Status ${CASH_DRAWER_STATUS_LABELS[String(before.status)] ?? before.status} → ${
        CASH_DRAWER_STATUS_LABELS[String(after.status)] ?? after.status
      }`,
    );
  }
  return parts.join(" · ") || null;
}

function CashMovementDetail({
  id,
  role,
  threshold,
  shiftOpen,
  options,
  onBack,
  onChanged,
}: {
  id: string;
  role: string;
  threshold: number;
  shiftOpen: boolean;
  options: Options | null;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<null | "reject" | "void" | "correct">(null);
  const [actionNote, setActionNote] = useState("");
  const [bankRef, setBankRef] = useState("");
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    garageApi
      .get<DetailResponse>(`/api/finance/cash-movements/${encodeURIComponent(id)}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Gagal memuat detail."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  function reload() {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  async function run(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await garageApi.post(`/api/finance/cash-movements/${encodeURIComponent(id)}/${path}`, body);
      setAction(null);
      setActionNote("");
      onChanged();
      reload();
    } catch (err) {
      setError(errorMessage(err, "Aksi gagal."));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !detail) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-[#d0d0d6]">
        <RefreshCw className="size-4 animate-spin" /> Memuat detail…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="space-y-3 p-2">
        <Button type="button" variant="outline" className={`h-10 ${chipIdle}`} onClick={onBack}>
          <ArrowLeft className="mr-1.5 size-4" /> Kembali
        </Button>
        {error ? <p className="text-sm text-[#ff9b9b]">{error}</p> : null}
      </div>
    );
  }

  const m = detail.movement;
  const canManage = detail.canManage;
  const sessionOpen = m.sessionStatus === "open";

  if (action === "correct") {
    const initial: FormValues = {
      direction: m.type,
      categoryKey: m.categoryKey ?? "",
      amount: formatRupiahInput(String(m.amount)),
      description: m.description,
      note: m.note ?? "",
      counterparty: m.employeeName && m.counterparty === m.employeeName ? "" : m.counterparty ?? "",
      vendorName: m.vendorName ?? "",
      receiptNo: m.receiptNo ?? "",
      orderRef: m.orderNo ?? "",
      employeeUserId: "",
      relatedRef: "",
      depositAccount: m.depositAccount ?? "",
    };
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#f4f4f5]">Koreksi {m.refNo ?? ""}</p>
          <Button type="button" variant="outline" className={`h-10 ${chipIdle}`} onClick={() => setAction(null)}>
            <ArrowLeft className="mr-1.5 size-4" /> Batal koreksi
          </Button>
        </div>
        <p className="text-sm text-[#c8c8d0]">
          Transaksi lama dibatalkan (tetap tersimpan) dan diganti transaksi baru di shift yang sama.
        </p>
        <CashMovementForm
          mode="correct"
          initial={initial}
          role={role}
          threshold={threshold}
          shiftOpen={shiftOpen}
          options={options}
          correctTargetId={m.id}
          onCancel={() => setAction(null)}
          onCorrected={() => {
            setAction(null);
            onChanged();
            reload();
          }}
        />
      </div>
    );
  }

  const fields: Array<[string, string | null]> = [
    ["Waktu", fmtDateTime(m.movementAt)],
    ["Shift", m.sessionCode],
    ["Kategori", m.category],
    ["Klasifikasi", CASH_DRAWER_GROUP_LABELS[m.group]],
    ["Pihak terkait", m.counterparty],
    ["Karyawan", m.employeeName],
    ["Toko / pemasok", m.vendorName],
    ["No. nota", m.receiptNo],
    ["No. order", m.orderNo],
    ["Catatan", m.note],
    ["Dicatat oleh", m.createdByName],
    ["Disetujui", m.approvedByName ? `${m.approvedByName} · ${fmtDateTime(m.approvedAt)}` : null],
    ["Ditolak", m.rejectedByName ? `${m.rejectedByName} · ${fmtDateTime(m.rejectedAt)}` : null],
    ["Catatan keputusan", m.decisionNote],
    ["Dibatalkan", m.voidedByName ? `${m.voidedByName} · ${fmtDateTime(m.voidedAt)}` : null],
    ["Alasan batal", m.voidReason],
    ["Rekening tujuan", m.depositAccount ? DEPOSIT_ACCOUNT_LABEL[m.depositAccount as DepositAccount] ?? m.depositAccount : null],
    [
      "Status setoran",
      m.depositAccount && m.status === "recorded"
        ? m.depositConfirmedAt
          ? `Diterima di rekening · ${m.depositConfirmedByName ?? "-"} · ${fmtDateTime(m.depositConfirmedAt)} · bukti ${m.depositBankRef ?? "-"}`
          : "Dalam perjalanan — menunggu konfirmasi penerima"
        : null,
    ],
    ["Pengeluaran Finance", m.hasExpense ? "Ya (tunai)" : "Tidak — bukan biaya"],
  ];

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" className={`h-10 ${chipIdle}`} onClick={onBack}>
        <ArrowLeft className="mr-1.5 size-4" /> Kembali ke riwayat
      </Button>
      <div className="rounded-md border border-[#3c3c46] bg-white/[0.05] p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="garage-mono text-sm text-[#d0d0d6]">{m.refNo ?? "Tanpa ref (data lama)"}</p>
            <p className="text-base font-semibold text-[#f4f4f5]">{m.description}</p>
            <p className="mt-0.5 text-sm">
              <DirectionLabel type={m.type} />
            </p>
          </div>
          <div className="text-right">
            <p className="garage-mono text-xl font-bold tabular-nums text-[#f4f4f5]">
              {m.type === "out" ? "−" : "+"}
              {currency.format(m.amount)}
            </p>
            <StatusChip status={m.status} />
          </div>
        </div>
        <div className="mt-3 rounded-md border border-[#34343c] bg-black/20 p-2.5 text-sm">
          <p className="text-[12px] text-[#b8b8c2]">Saldo laci</p>
          {m.balanceBefore != null && m.balanceAfter != null ? (
            <p className="garage-mono tabular-nums text-[#f4f4f5]">
              {currency.format(m.balanceBefore)} → {currency.format(m.balanceAfter)}
            </p>
          ) : (
            <p className="text-[#d0d0d6]">
              {m.balanceHidden
                ? "Disembunyikan sampai shift ditutup (hitung buta)."
                : m.status === "pending_approval"
                  ? "Belum berubah — menunggu persetujuan."
                  : "—"}
            </p>
          )}
        </div>
        <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          {fields
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[12px] text-[#b8b8c2]">{label}</dt>
                <dd className="break-words text-[#f4f4f5]">{value}</dd>
              </div>
            ))}
        </dl>
      </div>

      {canManage && m.depositAccount && m.status === "recorded" && !m.depositConfirmedAt ? (
        <div className="space-y-2 rounded-md border border-[#f5a742]/50 bg-[#f5a742]/[0.06] p-3" data-testid="cash-deposit-confirm">
          <p className="text-sm font-semibold text-[#ffd08a]">Konfirmasi setoran diterima</p>
          <p className="text-sm text-[#e4e4e8]">
            Dikonfirmasi oleh penerima (Owner/Manajer lain), bukan penyetornya. Isi nomor bukti setor / mutasi bank.
          </p>
          <Input
            value={bankRef}
            onChange={(event) => setBankRef(event.target.value.slice(0, 80))}
            placeholder="No. bukti setor / ref mutasi"
            className={inputClass}
            aria-label="Nomor bukti setor"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              className="h-11 bg-[#f5a742] text-black hover:bg-[#ffc167]"
              disabled={busy || bankRef.trim().length < 3}
              onClick={() => void run("deposit-confirm", { bankRef: bankRef.trim() })}
            >
              Setoran diterima
            </Button>
          </div>
        </div>
      ) : null}

      {canManage && (m.status === "pending_approval" || (m.status === "recorded" && sessionOpen)) ? (
        <div className="space-y-2 rounded-md border border-[#4a4a54] bg-white/[0.04] p-3">
          <p className="garage-mono text-[11px] uppercase tracking-wide text-[#c4c4cc]">Aksi Manajer/Owner</p>
          {action === "reject" || action === "void" ? (
            <div className="space-y-2">
              <label htmlFor="cash-action-note" className="text-sm text-[#e4e4e8]">
                {action === "reject" ? "Alasan penolakan (wajib)" : "Alasan pembatalan (wajib)"}
              </label>
              <Input
                id="cash-action-note"
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value.slice(0, 300))}
                className={inputClass}
                autoFocus
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" className={`h-11 ${chipIdle}`} onClick={() => setAction(null)} disabled={busy}>
                  Batal
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11"
                  disabled={busy || actionNote.trim().length < 3}
                  onClick={() =>
                    void (action === "reject"
                      ? run("decision", { action: "reject", note: actionNote.trim() })
                      : run("void", { reason: actionNote.trim() }))
                  }
                >
                  {busy ? <RefreshCw className="mr-2 size-4 animate-spin" /> : null}
                  {action === "reject" ? "Tolak pengajuan" : "Batalkan transaksi"}
                </Button>
              </div>
            </div>
          ) : m.status === "pending_approval" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-11"
                disabled={busy || !sessionOpen}
                onClick={() => void run("decision", { action: "approve" })}
              >
                {busy ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
                Setujui — uang bergerak sekarang
              </Button>
              <Button type="button" variant="outline" className={`h-11 ${chipIdle}`} onClick={() => setAction("reject")}>
                <X className="mr-1.5 size-4" /> Tolak
              </Button>
              {!sessionOpen ? (
                <p className="w-full text-sm text-[#ffd08a]">Shift sudah ditutup — pengajuan hanya bisa ditolak.</p>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className={`h-11 ${chipIdle}`}
                disabled={!m.categoryKey}
                onClick={() => setAction("correct")}
              >
                <Pencil className="mr-1.5 size-4" /> Koreksi
              </Button>
              <Button type="button" variant="outline" className={`h-11 ${chipIdle}`} onClick={() => setAction("void")}>
                <Ban className="mr-1.5 size-4" /> Batalkan
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Kas laci</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {m.hasReceiptPhoto || detail.canAttachReceipt ? (
        <div className="space-y-2 rounded-md border border-[#3c3c46] bg-white/[0.04] p-3">
          <p className="garage-mono text-[11px] uppercase tracking-wide text-[#c4c4cc]">Foto nota / bukti</p>
          {m.hasReceiptPhoto ? (
            <a
              href={`/api/finance/cash-movements/${encodeURIComponent(m.id)}/receipt?v=${reloadKey}`}
              target="_blank"
              rel="noreferrer"
              className="block w-fit cursor-pointer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- foto privat lewat API berautentikasi */}
              <img
                src={`/api/finance/cash-movements/${encodeURIComponent(m.id)}/receipt?v=${reloadKey}`}
                alt={`Foto nota ${m.refNo ?? ""}`}
                className="max-h-56 w-auto rounded-md border border-[#3c3c46] object-contain"
              />
            </a>
          ) : (
            <p className="text-sm text-[#d0d0d6]">Belum ada foto nota.</p>
          )}
          {detail.canAttachReceipt ? (
            <ReceiptUploader movementId={m.id} hasPhoto={m.hasReceiptPhoto} onUploaded={reload} />
          ) : null}
        </div>
      ) : null}

      <div>
        <p className="garage-mono mb-1.5 text-[11px] uppercase tracking-wide text-[#c4c4cc]">Riwayat perubahan</p>
        <ol className="space-y-1.5">
          {detail.history.map((entry) => {
            const change = describeChange(entry.before, entry.after);
            return (
              <li key={entry.id} className="rounded-md border border-[#34343c] bg-white/[0.03] px-2.5 py-2 text-sm">
                <div className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-semibold text-[#f4f4f5]">{entry.action}</span>
                  <span className="garage-mono text-[12px] text-[#c4c4cc]">{fmtDateTime(entry.createdAt)}</span>
                </div>
                <p className="text-[13px] text-[#d0d0d6]">{entry.actor}</p>
                {entry.reason ? <p className="text-[13px] text-[#e4e4e8]">Alasan: {entry.reason}</p> : null}
                {change ? <p className="text-[13px] text-[#ffd08a]">{change}</p> : null}
              </li>
            );
          })}
          {detail.linked.map((row) => (
            <li key={row.id} className="rounded-md border border-dashed border-[#4a4a54] px-2.5 py-2 text-sm text-[#d0d0d6]">
              Terkait: <span className="garage-mono">{row.refNo}</span> · {row.category} · {currency.format(row.amount)} ·{" "}
              {CASH_DRAWER_STATUS_LABELS[row.status] ?? row.status}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

type HistoryFilters = {
  q: string;
  from: string;
  to: string;
  type: string;
  category: string;
  cashier: string;
  status: string;
};

function historyParams(filters: HistoryFilters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  for (const key of ["type", "category", "cashier", "status"] as const) {
    if (filters[key] !== "all") params.set(key, filters[key]);
  }
  return params;
}

function CashMovementHistory({
  role,
  threshold,
  shiftOpen,
  options,
  onPendingCount,
}: {
  role: string;
  threshold: number;
  shiftOpen: boolean;
  options: Options | null;
  onPendingCount: (count: number) => void;
}) {
  const [filters, setFilters] = useState({
    q: "",
    from: todayKey(),
    to: todayKey(),
    type: "all",
    category: "all",
    cashier: "all",
    status: "all",
  });
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = historyParams(filters);
    garageApi
      .get<ListResponse>(`/api/finance/cash-movements?${params.toString()}`)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setError(null);
        onPendingCount(response.totals.pending);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, "Gagal memuat riwayat kas."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, reloadKey, onPendingCount]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  const categoryOptions = useMemo(
    () => CASH_DRAWER_CATEGORIES.filter((row) => filters.type === "all" || row.direction === filters.type),
    [filters.type],
  );

  if (selectedId) {
    return (
      <CashMovementDetail
        id={selectedId}
        role={role}
        threshold={threshold}
        shiftOpen={shiftOpen}
        options={options}
        onBack={() => setSelectedId(null)}
        onChanged={reload}
      />
    );
  }

  const setFilter = (key: keyof typeof filters, value: string) => {
    setLoading(true);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const selectTrigger = "h-10 w-full border-[#3c3c46] bg-white/[0.07] text-sm";

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter("q", query);
        }}
      >
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#b8b8c2]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 80))}
            placeholder="Cari deskripsi, nomor ref, pihak terkait"
            aria-label="Cari riwayat kas"
            className="h-10 border-[#3c3c46] bg-white/[0.07] pl-9 text-sm"
          />
        </div>
        <Button type="submit" variant="outline" className={`h-10 ${chipIdle}`}>
          Cari
        </Button>
      </form>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Input
          type="date"
          value={filters.from}
          max={filters.to || undefined}
          onChange={(event) => setFilter("from", event.target.value)}
          aria-label="Dari tanggal"
          className="h-10 border-[#3c3c46] bg-white/[0.07] text-sm"
        />
        <Input
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          onChange={(event) => setFilter("to", event.target.value)}
          aria-label="Sampai tanggal"
          className="h-10 border-[#3c3c46] bg-white/[0.07] text-sm"
        />
        <Select value={filters.type} onValueChange={(value) => {
            setLoading(true);
            setFilters((c) => ({ ...c, type: value, category: "all" }));
          }}>
          <SelectTrigger className={selectTrigger} aria-label="Jenis">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua jenis</SelectItem>
            <SelectItem value="out">Kas keluar</SelectItem>
            <SelectItem value="in">Kas masuk</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.category} onValueChange={(value) => setFilter("category", value)}>
          <SelectTrigger className={selectTrigger} aria-label="Kategori">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua kategori</SelectItem>
            {categoryOptions.map((row) => (
              <SelectItem key={row.key} value={row.key}>
                {row.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(value) => setFilter("status", value)}>
          <SelectTrigger className={selectTrigger} aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            {Object.entries(CASH_DRAWER_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {data?.canManage ? (
          <Select value={filters.cashier} onValueChange={(value) => setFilter("cashier", value)}>
            <SelectTrigger className={selectTrigger} aria-label="Kasir">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua kasir</SelectItem>
              {data.cashiers.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-[#3c3c46] bg-white/[0.05] p-2">
          <p className="text-[12px] text-[#c4c4cc]">Kas masuk</p>
          <p className="garage-mono text-sm font-bold tabular-nums text-[#ffd08a]">{currency.format(data?.totals.cashIn ?? 0)}</p>
        </div>
        <div className="rounded-md border border-[#3c3c46] bg-white/[0.05] p-2">
          <p className="text-[12px] text-[#c4c4cc]">Kas keluar</p>
          <p className="garage-mono text-sm font-bold tabular-nums text-[#ff8f8f]">{currency.format(data?.totals.cashOut ?? 0)}</p>
        </div>
        <button
          type="button"
          onClick={() => setFilter("status", filters.status === "pending_approval" ? "all" : "pending_approval")}
          className={`cursor-pointer rounded-md border p-2 ${
            (data?.totals.pending ?? 0) > 0 ? "border-[#f5a742]/55 bg-[#f5a742]/10" : "border-[#3c3c46] bg-white/[0.05]"
          }`}
        >
          <p className="text-[12px] text-[#c4c4cc]">Pending</p>
          <p className="garage-mono text-sm font-bold tabular-nums text-[#f4f4f5]">{data?.totals.pending ?? 0}</p>
        </button>
      </div>
      <p className="text-[12px] text-[#b8b8c2]">Total hanya transaksi tercatat. Pending, ditolak & dibatalkan tidak menggerakkan uang.</p>

      {error ? <p className="text-sm text-[#ff9b9b]">{error}</p> : null}

      <div className="min-h-40 overflow-y-auto overscroll-contain rounded-md border border-[#2c2c34] sm:max-h-[42svh]" aria-busy={loading}>
        {loading && !data ? (
          <div className="flex items-center gap-2 p-4 text-sm text-[#d0d0d6]">
            <RefreshCw className="size-4 animate-spin" /> Memuat riwayat…
          </div>
        ) : data && data.items.length === 0 ? (
          <p className="p-4 text-sm text-[#d0d0d6]">Belum ada transaksi kas pada filter ini.</p>
        ) : (
          <ul className="divide-y divide-[#2c2c34]">
            {data?.items.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className="flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="garage-mono text-[12px] text-[#c4c4cc]">{row.refNo ?? "—"}</span>
                      <span className="garage-mono text-[12px] text-[#c4c4cc]">{fmtDateTime(row.movementAt)}</span>
                      <StatusChip status={row.status} />
                    </span>
                    <span className="mt-0.5 block break-words text-sm font-semibold text-[#f4f4f5]">{row.description}</span>
                    <span className="block text-[13px] text-[#d0d0d6]">
                      {row.category}
                      {row.counterparty ? ` · ${row.counterparty}` : ""}
                      {data.canManage && row.createdByName ? ` · ${row.createdByName}` : ""}
                    </span>
                    {row.balanceBefore != null && row.balanceAfter != null ? (
                      <span className="garage-mono block text-[12px] tabular-nums text-[#b8b8c2]">
                        Saldo {currency.format(row.balanceBefore)} → {currency.format(row.balanceAfter)}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`garage-mono shrink-0 text-right text-sm font-bold tabular-nums ${
                      row.status === "recorded"
                        ? row.type === "out"
                          ? "text-[#ff8f8f]"
                          : "text-[#ffd08a]"
                        : row.status === "pending_approval"
                          ? "text-[#d0d0d6]"
                          : "text-[#a8a8b2] line-through"
                    }`}
                  >
                    {row.type === "out" ? "−" : "+"}
                    {currency.format(row.amount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline" className={`h-10 ${chipIdle}`}>
          <a href={`/api/finance/cash-movements/export?${historyParams(filters).toString()}`} download>
            <Download className="mr-1.5 size-4" /> Ekspor CSV
          </a>
        </Button>
        <Button type="button" variant="outline" className={`h-10 ${chipIdle}`} onClick={reload} disabled={loading}>
          <RefreshCw className={`mr-1.5 size-4 ${loading ? "animate-spin" : ""}`} /> Muat ulang
        </Button>
      </div>
    </div>
  );
}

// ─── Dialog utama ───────────────────────────────────────────────────────────

export function CashDrawerDialog({
  open,
  onOpenChange,
  role,
  threshold,
  shiftOpen,
  themeScope,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string;
  threshold: number;
  shiftOpen: boolean;
  themeScope?: string;
  onRecorded: (result: CashMovementRecorded) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-cashier-theme-scope={themeScope}
        className="flex max-h-[94svh] flex-col overflow-hidden border-[#34343c] bg-[#14141a] sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Kas Keluar / Masuk Laci</DialogTitle>
          <DialogDescription className="text-[#d0d0d6]">
            Uang fisik laci di luar penjualan. Dihitung saat tutup shift & masuk laporan PDF shift.
          </DialogDescription>
        </DialogHeader>
        {/* Konten di-unmount saat dialog tutup → state form selalu segar saat dibuka. */}
        <CashDrawerBody
          role={role}
          threshold={threshold}
          shiftOpen={shiftOpen}
          onClose={() => onOpenChange(false)}
          onRecorded={onRecorded}
        />
      </DialogContent>
    </Dialog>
  );
}

function CashDrawerBody({
  role,
  threshold,
  shiftOpen,
  onClose,
  onRecorded,
}: {
  role: string;
  threshold: number;
  shiftOpen: boolean;
  onClose: () => void;
  onRecorded: (result: CashMovementRecorded) => void;
}) {
  const [tab, setTab] = useState<"record" | "history">("record");
  const [options, setOptions] = useState<Options | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const handlePendingCount = useCallback((count: number) => setPendingCount(count), []);

  useEffect(() => {
    let cancelled = false;
    garageApi
      .get<Options>("/api/finance/cash-movements/options")
      .then((data) => {
        if (!cancelled) setOptions(data);
      })
      .catch(() => {
        if (!cancelled) setOptions({ employees: [], recentCashOut: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as "record" | "history")} className="flex min-h-0 flex-1 flex-col">
      <TabsList className="grid h-11 w-full grid-cols-2">
        <TabsTrigger value="record" className="h-9 text-sm">
          <Pencil className="mr-1.5 size-4" /> Catat
        </TabsTrigger>
        <TabsTrigger value="history" className="h-9 text-sm">
          <ClipboardList className="mr-1.5 size-4" /> Riwayat
          {pendingCount > 0 ? (
            <span className="ml-1.5 rounded-sm bg-[#f5a742] px-1.5 text-[11px] font-bold text-black">{pendingCount}</span>
          ) : null}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="record" className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {!shiftOpen ? (
          <Alert className="mb-3 border-[#f5a742]/45 bg-[#f5a742]/10 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertTitle>Shift belum dibuka</AlertTitle>
            <AlertDescription>Buka shift dulu — kas laci selalu tercatat di shift kasir yang aktif.</AlertDescription>
          </Alert>
        ) : null}
        <CashMovementForm
          mode="record"
          role={role}
          threshold={threshold}
          shiftOpen={shiftOpen}
          options={options}
          onCancel={onClose}
          onRecorded={onRecorded}
        />
      </TabsContent>
      <TabsContent value="history" className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {tab === "history" ? (
          <CashMovementHistory
            role={role}
            threshold={threshold}
            shiftOpen={shiftOpen}
            options={options}
            onPendingCount={handlePendingCount}
          />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
