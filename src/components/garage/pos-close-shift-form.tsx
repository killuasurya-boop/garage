"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  KeyRound,
  Landmark,
  Loader2,
  QrCode,
  RotateCcw,
  Vault,
} from "lucide-react";

import { PaymentMethodCorrectionDialog } from "@/components/garage/pos-payment-method-correction";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CashDenominationGrid, denominationTotals } from "@/components/garage/cash-denomination-grid";
import { denominationLabel, denominationMismatches, denominationValue } from "@/lib/cash-denominations";
import { freshClosingChecklist } from "@/lib/cash-closing";

export type CloseShiftPayload = {
  actualCash: number;
  denominations: Record<string, number>;
  checklist: Array<{ label: string; done: boolean }>;
  closingNote: string;
  resetTableMode: "none" | "completed" | "all";
  managerPin?: string;
  managerSignOff?: boolean;
  qrisCounted?: number;
  floatLeft: number;
  /** B4: hitung ulang #2 (form kosong, blind). */
  recountDenominations?: Record<string, number>;
  /** B4: hitungan #3 bila #1 ≠ #2 per pecahan — menjadi hitungan sah. */
  thirdCountDenominations?: Record<string, number>;
};

type Stage = "form" | "recount" | "third" | "confirm";

const rupiah = (value: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);

const FLOAT_PRESETS = [0, 50_000, 100_000, 150_000, 200_000, 300_000];

function SectionTitle({ step, title, hint }: { step: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#d11a2a] text-[11px] font-black text-white">
        {step}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-white">{title}</p>
        {hint ? <p className="text-xs leading-5 text-[#b8b8bf]">{hint}</p> : null}
      </div>
    </div>
  );
}

/**
 * Form tutup shift kasir: hitung laci per pecahan (subtotal per baris), non-tunai
 * (koreksi metode bayar + QRIS BNI), serah terima (ditinggal vs disetor),
 * checklist, lalu layar konfirmasi sebelum ditutup. Kas seharusnya tetap tidak
 * ditampilkan sebelum tutup (blind count).
 */
export function CloseShiftForm({
  sessionCode,
  cashSessionId,
  openingCash,
  isKasir,
  isSupervisor = false,
  activeTableCount,
  pendingQrCount,
  canResetAllTables,
  signOffRequired,
  requireDoubleCount = true,
  pending,
  error,
  onSubmit,
  onCorrected,
}: {
  sessionCode: string;
  cashSessionId: string | null;
  openingCash: number;
  isKasir: boolean;
  /** Owner/Manajer menyetujui selisih atas nama sendiri (tanpa PIN). */
  isSupervisor?: boolean;
  activeTableCount: number;
  pendingQrCount: number;
  canResetAllTables: boolean;
  signOffRequired: boolean;
  /** Pengaturan shiftRequireDoubleCount (default aktif). */
  requireDoubleCount?: boolean;
  pending: boolean;
  error: string | null;
  onSubmit: (payload: CloseShiftPayload) => Promise<void> | void;
  onCorrected?: () => void;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [checklist, setChecklist] = useState(freshClosingChecklist);
  const [note, setNote] = useState("");
  const [resetMode, setResetMode] = useState<CloseShiftPayload["resetTableMode"]>("completed");
  const [qrisCounted, setQrisCounted] = useState("");
  const [floatChoice, setFloatChoice] = useState<number | "custom" | null>(null);
  const [floatCustom, setFloatCustom] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [selfSignOff, setSelfSignOff] = useState(false);
  const pinNeeded = signOffRequired && !isSupervisor;
  const signOffReady = !signOffRequired || (isSupervisor ? selfSignOff : /^\d{4,8}$/.test(managerPin));
  const [localError, setLocalError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [correctionOpen, setCorrectionOpen] = useState(false);
  // B4: hitungan #2/#3 selalu mulai dari form kosong (blind — tidak disalin dari #1).
  const [recountCounts, setRecountCounts] = useState<Record<string, string>>({});
  const [thirdCounts, setThirdCounts] = useState<Record<string, string>>({});
  const [mismatchLabels, setMismatchLabels] = useState<string[]>([]);
  // Hitungan #1 yang menjadi dasar #2/#3. Kembali ke form hanya untuk ubah serah terima
  // tidak menghapus #2/#3; #1 berubah → #2/#3 wajib diulang.
  const [recountFor, setRecountFor] = useState<string | null>(null);

  const { parsed: parsedCounts, total, pieces, anyCounted } = useMemo(() => denominationTotals(counts), [counts]);
  const recount = useMemo(() => denominationTotals(recountCounts), [recountCounts]);
  const third = useMemo(() => denominationTotals(thirdCounts), [thirdCounts]);
  // Hitungan sah kasir: #1 bila #1 = #2 (atau hitung ulang dimatikan), #3 bila berbeda.
  const usesThird = mismatchLabels.length > 0;
  const accepted = usesThird ? third : { parsed: parsedCounts, total, pieces };

  // Default: tinggalkan modal yang sama dengan modal awal (bila hitungan sah cukup).
  const effectiveFloat =
    floatChoice === "custom"
      ? Math.max(0, Math.floor(Number(floatCustom) || 0))
      : floatChoice ?? (accepted.total >= openingCash ? openingCash : 0);
  const deposit = Math.max(0, accepted.total - effectiveFloat);
  const checklistDone = checklist.every((item) => item.done);

  function validate() {
    if (!anyCounted) return "Isi jumlah lembar/keping uang di laci (isi 0 bila laci kosong).";
    if (effectiveFloat > accepted.total) return "Uang yang ditinggal di laci lebih besar dari uang yang dihitung.";
    if (!checklistDone) return "Centang semua checklist tutup shift.";
    if (pinNeeded && !/^\d{4,8}$/.test(managerPin)) return "PIN Manajer/Owner wajib 4–8 digit angka.";
    return null;
  }

  function goConfirm(event: FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setLocalError(problem);
      return;
    }
    setLocalError(null);
    if (!requireDoubleCount) {
      setStage("confirm");
      return;
    }
    const countKey = JSON.stringify(parsedCounts);
    if (recountFor === countKey && recount.anyCounted) {
      // #1 tidak berubah: pakai #2/#3 yang sudah ada (mis. kembali hanya untuk ubah serah terima).
      setStage(usesThird && !third.anyCounted ? "third" : "confirm");
      return;
    }
    setRecountFor(countKey);
    setRecountCounts({});
    setThirdCounts({});
    setMismatchLabels([]);
    setStage("recount");
  }

  function afterRecount() {
    if (!recount.anyCounted) {
      setLocalError("Isi hitungan ulang (#2) — isi 0 bila laci kosong.");
      return;
    }
    setLocalError(null);
    const mismatches = denominationMismatches(parsedCounts, recount.parsed);
    setMismatchLabels(mismatches.map((item) => item.label));
    setThirdCounts({});
    setStage(mismatches.length ? "third" : "confirm");
  }

  function afterThird() {
    if (!third.anyCounted) {
      setLocalError("Isi hitungan #3 — isi 0 bila laci kosong.");
      return;
    }
    if (effectiveFloat > third.total) {
      setLocalError("Uang yang ditinggal di laci lebih besar dari hitungan #3. Kembali dan ubah serah terima — hitungan #2 & #3 tetap tersimpan.");
      return;
    }
    setLocalError(null);
    setStage("confirm");
  }

  async function submit() {
    await onSubmit({
      actualCash: accepted.total,
      denominations: parsedCounts,
      ...(requireDoubleCount ? { recountDenominations: recount.parsed } : {}),
      ...(usesThird ? { thirdCountDenominations: third.parsed } : {}),
      checklist,
      closingNote: note,
      resetTableMode: resetMode,
      floatLeft: effectiveFloat,
      ...(pinNeeded && managerPin ? { managerPin } : {}),
      ...(signOffRequired && isSupervisor && selfSignOff ? { managerSignOff: true } : {}),
      ...(qrisCounted.trim() !== "" ? { qrisCounted: Math.round(Number(qrisCounted)) } : {}),
    });
  }

  const shownError = localError ?? error;

  if (stage === "recount" || stage === "third") {
    const isThird = stage === "third";
    const current = isThird ? third : recount;
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#4a4a54] bg-white/[0.05] p-4">
          <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
            {isThird ? "Hitungan #3" : "Hitung ulang #2"} · {sessionCode}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#e4e4e7]">
            {isThird
              ? "Hitungan #1 dan #2 berbeda. Keluarkan semua uang lalu hitung sekali lagi dengan teliti — hasil ini yang dipakai."
              : "Keluarkan semua uang di laci dan hitung lagi dari awal. Jangan melihat hasil hitungan pertama."}
          </p>
        </div>
        {isThird ? (
          <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffe0ad]">
            <AlertTriangle className="size-4" />
            <AlertTitle>Pecahan yang tidak cocok</AlertTitle>
            <AlertDescription>{mismatchLabels.join(", ")}</AlertDescription>
          </Alert>
        ) : null}
        <CashDenominationGrid
          counts={isThird ? thirdCounts : recountCounts}
          onChange={(next) => {
            (isThird ? setThirdCounts : setRecountCounts)(next);
            setLocalError(null);
          }}
          testIdPrefix={isThird ? "close-denom-3" : "close-denom-2"}
        />
        <div className="flex items-center justify-between rounded-lg border border-[#f5a742]/55 bg-[#f5a742]/10 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-[#ffd08a]">Total {isThird ? "hitungan #3" : "hitung ulang #2"}</p>
            <p className="text-[11px] text-[#d6d6dc]">{current.pieces} lembar/keping</p>
          </div>
          <p className="text-2xl font-black tracking-tight text-white">{rupiah(current.total)}</p>
        </div>
        {shownError ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertTitle>Belum bisa lanjut</AlertTitle>
            <AlertDescription>{shownError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 gap-2"
            onClick={() => {
              setLocalError(null);
              setStage("form");
            }}
            disabled={pending}
          >
            <ArrowLeft className="size-4" /> Kembali
          </Button>
          <Button
            type="button"
            className="garage-press h-12 flex-[1.4] gap-2"
            disabled={pending}
            onClick={isThird ? afterThird : afterRecount}
          >
            <CheckCircle2 className="size-4" /> Lanjut
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "confirm") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-[#4a4a54] bg-white/[0.05] p-4">
          <p className="garage-mono text-[10px] uppercase tracking-[0.14em] text-[#b8b8bf]">
            Konfirmasi tutup shift · {sessionCode}
          </p>
          <p className="mt-2 text-3xl font-black tracking-tight text-white">{rupiah(accepted.total)}</p>
          <p className="text-xs text-[#b8b8bf]">Uang tunai dihitung di laci · {accepted.pieces} lembar/keping{usesThird ? " · hitungan #3" : ""}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-[#34343c] bg-black/25 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-[#b8b8bf]">
                <Vault className="size-3.5" /> Ditinggal di laci
              </dt>
              <dd className="mt-1 font-bold text-white">{rupiah(effectiveFloat)}</dd>
            </div>
            <div className="rounded-md border border-[#f5a742]/50 bg-[#f5a742]/10 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-[#ffd08a]">
                <Landmark className="size-3.5" /> Untuk disetor ke rekening
              </dt>
              <dd className="mt-1 font-bold text-white">{rupiah(deposit)}</dd>
            </div>
            <div className="col-span-2 rounded-md border border-[#34343c] bg-black/25 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-[#b8b8bf]">
                <QrCode className="size-3.5" /> QRIS di aplikasi BNI
              </dt>
              <dd className="mt-1 font-bold text-white">
                {qrisCounted.trim() === "" ? "Tidak diisi — dicocokkan Owner nanti" : rupiah(Number(qrisCounted) || 0)}
              </dd>
            </div>
          </dl>
          <ul className="mt-3 space-y-1 text-xs text-[#d6d6dc]">
            {Object.entries(accepted.parsed)
              .filter(([, qty]) => qty > 0)
              .sort((a, b) => denominationValue(b[0]) - denominationValue(a[0]))
              .map(([key, qty]) => (
                <li key={key} className="flex justify-between gap-3 border-b border-white/5 py-1 last:border-0">
                  <span>
                    {denominationLabel(key)} × {qty}
                  </span>
                  <span className="font-semibold text-white">{rupiah(denominationValue(key) * qty)}</span>
                </li>
              ))}
          </ul>
        </div>
        <p className="text-xs leading-5 text-[#d6d6dc]">
          Setelah ditutup, hitungan tidak bisa diubah. Kas seharusnya &amp; selisih tampil setelah ini.
        </p>
        {shownError ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertTitle>Tutup shift gagal</AlertTitle>
            <AlertDescription>{shownError}</AlertDescription>
          </Alert>
        ) : null}
        {pinNeeded ? <ManagerPinField value={managerPin} onChange={setManagerPin} /> : null}
        {signOffRequired && isSupervisor ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-[#f5a742]/55 bg-[#f5a742]/10 px-3 py-2 text-sm text-white">
            <input
              type="checkbox"
              checked={selfSignOff}
              onChange={(event) => setSelfSignOff(event.target.checked)}
              className="size-5 accent-[#d11a2a]"
            />
            Saya (Manajer/Owner) menyetujui selisih kas ini — tercatat atas nama saya.
          </label>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-12 flex-1 gap-2" onClick={() => setStage("form")} disabled={pending}>
            <ArrowLeft className="size-4" /> Kembali
          </Button>
          <Button
            type="button"
            className="garage-press h-12 flex-[1.4] gap-2"
            disabled={pending || !signOffReady}
            onClick={() => void submit()}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {signOffRequired ? "Sign-off & Tutup Shift" : "Ya, tutup shift"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={goConfirm} className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#34343c] bg-white/[0.04] p-3 text-xs">
        <div>
          <p className="text-[#b8b8bf]">Shift</p>
          <p className="garage-mono font-semibold text-white">{sessionCode}</p>
        </div>
        <div className="text-right">
          <p className="text-[#b8b8bf]">Modal awal</p>
          <p className="font-semibold text-white">{rupiah(openingCash)}</p>
        </div>
        <p className="col-span-2 border-t border-white/5 pt-2 leading-5 text-[#d6d6dc]">
          Hitung <strong className="text-white">semua uang tunai di laci, termasuk modal awal</strong>. Kas seharusnya
          &amp; selisih ditampilkan setelah shift ditutup.
        </p>
      </div>

      {activeTableCount > 0 || pendingQrCount > 0 ? (
        <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#ffe0ad]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Cek serah terima</AlertTitle>
          <AlertDescription>
            {activeTableCount} meja masih aktif, {pendingQrCount} pesanan QR menunggu kasir.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* 1. Hitung laci */}
      <section className="space-y-3">
        <SectionTitle step={1} title="Hitung uang di laci" hint="Isi jumlah lembar/keping per pecahan. Kosong = 0." />
        <CashDenominationGrid counts={counts} onChange={(next) => { setCounts(next); setLocalError(null); }} testIdPrefix="close-denom" />
        <div className="flex items-center justify-between rounded-lg border border-[#f5a742]/55 bg-[#f5a742]/10 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-[#ffd08a]">Total uang di laci</p>
            <p className="text-[11px] text-[#d6d6dc]">{pieces} lembar/keping</p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-black tracking-tight text-white">{rupiah(total)}</p>
            {anyCounted ? (
              <button
                type="button"
                onClick={() => setCounts({})}
                className="grid size-9 place-items-center rounded-md text-[#d6d6dc] hover:bg-white/10"
                aria-label="Kosongkan hitungan"
              >
                <RotateCcw className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* 2. Non-tunai */}
      <section className="space-y-3">
        <SectionTitle
          step={2}
          title="Non-tunai (QRIS & transfer)"
          hint="Tidak dihitung di laci. Salah pilih Tunai/QRIS saat bayar? Koreksi dulu."
        />
        <Button
          type="button"
          variant="outline"
          className="garage-press h-11 w-full gap-2 border-[#f5a742]/55 bg-[#f5a742]/10 text-[#ffd08a] hover:bg-[#f5a742]/18"
          onClick={() => setCorrectionOpen(true)}
        >
          <ArrowRightLeft className="size-4" /> Koreksi metode bayar
        </Button>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-[#d6d6dc]">Total QRIS di aplikasi / notifikasi BNI (opsional)</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={qrisCounted}
            onChange={(event) => setQrisCounted(event.target.value)}
            placeholder="Kosongkan bila tidak pegang aplikasi BNI"
            className="h-11 border-[#34343c] bg-white/[0.06]"
          />
          <span className="block text-[11px] text-[#9b9ba6]">Selisih QRIS dicatat terpisah dari laci.</span>
        </label>
      </section>

      {/* 3. Serah terima */}
      <section className="space-y-3">
        <SectionTitle
          step={3}
          title="Serah terima uang"
          hint="Berapa yang ditinggal di laci untuk modal shift berikutnya? Sisanya disetor ke Rekening Jago/BNI (catat lewat Kas Keluar → Setoran)."
        />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {FLOAT_PRESETS.map((amount) => {
            const active = floatChoice === amount || (floatChoice === null && amount === effectiveFloat);
            return (
              <button
                key={amount}
                type="button"
                onClick={() => setFloatChoice(amount)}
                disabled={amount > total}
                className={`garage-press min-h-11 rounded-md border px-1 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                  active
                    ? "border-[#f5a742] bg-[#f5a742] text-[#111116]"
                    : "border-[#4a4a54] bg-white/[0.055] text-[#f4f4f5] hover:border-[#f5a742]/70"
                }`}
              >
                {amount === 0 ? "Setor semua" : rupiah(amount)}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFloatChoice("custom")}
            className={`shrink-0 rounded-md border px-3 py-2.5 text-xs font-bold ${
              floatChoice === "custom" ? "border-[#f5a742] bg-[#f5a742]/18 text-white" : "border-[#4a4a54] text-[#d6d6dc]"
            }`}
          >
            Nominal lain
          </button>
          {floatChoice === "custom" ? (
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={floatCustom}
              onChange={(event) => setFloatCustom(event.target.value)}
              placeholder="mis. 125000"
              className="h-11 flex-1 border-[#34343c] bg-white/[0.06]"
              aria-label="Nominal ditinggal di laci"
              autoFocus
            />
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[#34343c] bg-white/[0.04] p-3">
            <p className="flex items-center gap-1.5 text-xs text-[#b8b8bf]">
              <Vault className="size-3.5" /> Ditinggal di laci
            </p>
            <p className="mt-1 text-lg font-black text-white">{rupiah(effectiveFloat)}</p>
          </div>
          <div className="rounded-lg border border-[#f5a742]/50 bg-[#f5a742]/10 p-3">
            <p className="flex items-center gap-1.5 text-xs text-[#ffd08a]">
              <Landmark className="size-3.5" /> Untuk disetor ke rekening
            </p>
            <p className="mt-1 text-lg font-black text-white">{rupiah(deposit)}</p>
          </div>
        </div>
      </section>

      {/* 4. Checklist & catatan */}
      <section className="space-y-3">
        <SectionTitle step={4} title="Checklist tutup shift" hint="Wajib dicentang semua." />
        <div className="space-y-2">
          {checklist.map((item, index) => (
            <label
              key={item.label}
              className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                item.done ? "border-[#f5a742]/55 bg-[#f5a742]/10 text-white" : "border-[#34343c] bg-white/[0.04] text-[#e4e4e7]"
              }`}
            >
              <input
                type="checkbox"
                checked={item.done}
                onChange={(event) =>
                  setChecklist((current) =>
                    current.map((entry, i) => (i === index ? { ...entry, done: event.target.checked } : entry)),
                  )
                }
                className="size-5 accent-[#d11a2a]"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          placeholder="Catatan (opsional), mis. kembalian kurang Rp 5.000 karena pembulatan."
          className="min-h-20 border-[#34343c] bg-white/[0.06]"
        />
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#d6d6dc]">Reset status meja</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { mode: "none", label: "Tidak" },
                { mode: "completed", label: "Yang selesai" },
                { mode: "all", label: "Semua" },
              ] as const
            ).map((option) => {
              const disabled = option.mode === "all" && !canResetAllTables;
              const active = resetMode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  disabled={disabled}
                  onClick={() => setResetMode(option.mode)}
                  className={`garage-press min-h-10 rounded-md border px-2 text-xs font-semibold transition ${
                    active ? "border-[#f5a742] bg-[#f5a742]/18 text-[#fff0cf]" : "border-[#34343c] bg-black/15 text-[#d6d6dc]"
                  } ${disabled ? "cursor-not-allowed opacity-45" : "hover:border-[#f5a742]/70"}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {pinNeeded ? <ManagerPinField value={managerPin} onChange={setManagerPin} /> : null}

      {shownError ? (
        <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
          <AlertTriangle className="size-4" />
          <AlertTitle>Belum bisa tutup shift</AlertTitle>
          <AlertDescription>{shownError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="sticky bottom-0 -mx-1 border-t border-[#34343c] bg-[#111116]/95 px-1 pb-1 pt-3 backdrop-blur">
        <Button type="submit" className="garage-press h-12 w-full justify-between px-4" disabled={pending}>
          <span>Periksa & tutup shift</span>
          <span className="font-black">{rupiah(total)}</span>
        </Button>
      </div>

      <PaymentMethodCorrectionDialog
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        cashSessionId={cashSessionId}
        requiresPin={isKasir}
        onCorrected={onCorrected}
      />
    </form>
  );
}

function ManagerPinField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-[#f5a742]/45 bg-[#f5a742]/8 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-white">
        <KeyRound className="size-4 text-[#f5a742]" /> PIN Manajer / Owner
      </p>
      <p className="text-xs text-[#d6d6dc]">
        Selisih kas melewati batas. Serahkan tablet ke Manajer/Owner — sign-off tercatat atas nama pemilik PIN.
      </p>
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
        placeholder="4–8 digit"
        className="h-11 border-[#34343c] bg-white/[0.06] font-mono tracking-[0.3em]"
      />
    </div>
  );
}
