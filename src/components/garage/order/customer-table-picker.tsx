"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, Check, Loader2, Lock, RefreshCw, ShoppingBag, Sparkles, Users, UtensilsCrossed, X } from "lucide-react";

import {
  CUSTOMER_TABLE_STATUS_COPY,
  TABLE_STATUS_COLORS,
  type CustomerTableStatus,
} from "@/lib/garage-table-status";

// =============================================================================
// Pilih meja di menu digital (PDF owner, Okt 2026). Grid meja dengan warna +
// label teks: hanya hijau (Kosong) bisa dipilih; merah (Terisi) bisa digabung
// dengan kode 4 digit dari teman semeja. Konfirmasi "Kamu di Meja 07, benar?"
// lalu meja dikunci sementara di server (kuning untuk pelanggan lain).
// =============================================================================

export type TableHoldState = {
  tableNumber: string;
  tableLabel: string;
  mode: "new" | "join";
  /** Token kunci (mode "new"). */
  token: string | null;
  /** Kode gabung (mode "join", atau setelah pesanan pertama). */
  joinCode: string | null;
  expiresAt: string | null;
};

type PublicTable = {
  tableNumber: string;
  tableLabel: string;
  area: string;
  capacity: number;
  customerStatus: CustomerTableStatus;
  mine: boolean;
};

type HoldResponse = {
  tableNumber: string;
  tableLabel: string;
  mode: "new" | "join";
  holdToken: string | null;
  expiresAt: string | null;
};

async function readEnvelope<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? "Meja gagal dipilih. Coba lagi.");
  return json.data;
}

/** Kunci meja di server (baru, perpanjang, atau gabung dengan kode). */
export async function requestTableHold(input: {
  table: string;
  outletId?: string;
  holdToken?: string | null;
  joinCode?: string | null;
}): Promise<TableHoldState> {
  const response = await fetch("/api/customer/tables/hold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      table: input.table,
      outletId: input.outletId,
      holdToken: input.holdToken ?? undefined,
      joinCode: input.joinCode ?? undefined,
    }),
  });
  const data = await readEnvelope<HoldResponse>(response);
  return {
    tableNumber: data.tableNumber,
    tableLabel: data.tableLabel,
    mode: data.mode,
    token: data.holdToken ?? (data.mode === "new" ? input.holdToken ?? null : null),
    joinCode: data.mode === "join" ? input.joinCode ?? null : null,
    expiresAt: data.expiresAt,
  };
}

export async function releaseTableHold(token: string, outletId?: string) {
  await fetch("/api/customer/tables/hold", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ holdToken: token, outletId }),
    keepalive: true,
  }).catch(() => null);
}

function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs font-semibold text-[#d4d4d8]" aria-label="Arti warna meja">
      {(Object.keys(CUSTOMER_TABLE_STATUS_COPY) as CustomerTableStatus[]).map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: TABLE_STATUS_COLORS[key].dot }} aria-hidden />
          {CUSTOMER_TABLE_STATUS_COPY[key].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="grid size-3.5 place-items-center rounded-full border-2 border-white" aria-hidden>
          <Check className="size-2 text-white" strokeWidth={4} />
        </span>
        Meja kamu
      </li>
    </ul>
  );
}

export function CustomerTablePicker({
  outletId,
  current,
  presetTable,
  onPicked,
  onClose,
}: {
  outletId?: string;
  current: TableHoldState | null;
  /** Nomor meja dari QR meja → langsung konfirmasi meja ini. */
  presetTable?: string | null;
  onPicked: (hold: TableHoldState) => void;
  onClose?: () => void;
}) {
  const [tables, setTables] = useState<PublicTable[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [area, setArea] = useState<string>("all");
  const [confirmTable, setConfirmTable] = useState<PublicTable | null>(null);
  const [joinTable, setJoinTable] = useState<PublicTable | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [presetHandled, setPresetHandled] = useState(false);

  const currentToken = current?.token ?? null;
  const load = useCallback(async () => {
    try {
      const query = outletId ? `?outletId=${encodeURIComponent(outletId)}` : "";
      const response = await fetch(`/api/customer/tables/live${query}`, {
        cache: "no-store",
        headers: currentToken ? { "x-table-hold-token": currentToken } : undefined,
      });
      const data = await readEnvelope<PublicTable[]>(response);
      setTables(data);
      setLoadError("");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Daftar meja gagal dimuat.");
    }
  }, [outletId, currentToken]);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive && document.visibilityState !== "hidden") void load();
    };
    tick();
    // Warna meja berubah tanpa refresh (pelanggan lain memilih / meja terisi).
    const id = window.setInterval(tick, 5_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [load]);

  // QR meja: buka konfirmasi meja itu sekali setelah status dimuat.
  useEffect(() => {
    if (presetHandled || !presetTable || !tables) return;
    const table = tables.find((row) => row.tableNumber === presetTable);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPresetHandled(true);
    if (!table) {
      setActionError(`Meja ${presetTable} tidak tersedia. Pilih meja lain di bawah.`);
      return;
    }
    if (table.customerStatus === "available" || table.mine) setConfirmTable(table);
    else if (table.customerStatus === "occupied") setJoinTable(table);
    else setActionError(`${table.tableLabel} ${CUSTOMER_TABLE_STATUS_COPY[table.customerStatus].label.toLowerCase()}. Pilih meja lain.`);
  }, [presetHandled, presetTable, tables]);

  const areas = useMemo(() => {
    const set = new Set((tables ?? []).map((row) => row.area.trim()).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tables]);
  const visible = (tables ?? []).filter((row) => area === "all" || row.area.trim() === area);
  const availableCount = (tables ?? []).filter((row) => row.customerStatus === "available").length;

  async function confirm(table: PublicTable) {
    setBusy(true);
    setActionError("");
    try {
      const hold = await requestTableHold({ table: table.tableNumber, outletId, holdToken: current?.token });
      onPicked(hold);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Meja gagal dipilih.");
      setConfirmTable(null);
      void load();
    } finally {
      setBusy(false);
    }
  }

  async function join(table: PublicTable) {
    if (!/^\d{4}$/.test(joinCode)) {
      setActionError("Kode gabung 4 angka (lihat layar/struk teman semeja).");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      if (current?.token) await releaseTableHold(current.token, outletId);
      const hold = await requestTableHold({ table: table.tableNumber, outletId, joinCode });
      onPicked(hold);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Kode gabung salah.");
    } finally {
      setBusy(false);
    }
  }

  function tap(table: PublicTable) {
    setActionError("");
    if (table.customerStatus === "available" || table.mine) {
      setConfirmTable(table);
    } else if (table.customerStatus === "occupied") {
      setJoinCode("");
      setJoinTable(table);
    } else {
      setActionError(
        `${table.tableLabel}: ${CUSTOMER_TABLE_STATUS_COPY[table.customerStatus].label} — ${CUSTOMER_TABLE_STATUS_COPY[table.customerStatus].hint.toLowerCase()}.`,
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-[#0b0b0d]/96 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-picker-title"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 pb-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-garage-amber">Dine-in</p>
            <h2 id="table-picker-title" className="mt-1 text-2xl font-black text-white">
              Pilih meja kamu
            </h2>
            <p className="mt-1 text-sm text-[#c4c4cc]">
              Hanya meja <strong className="text-[#bbf7d0]">hijau (Kosong)</strong> yang bisa dipilih. Teman semeja yang
              sudah pesan? Ketuk meja <strong className="text-[#fecaca]">merah</strong> lalu masukkan kode gabung.
            </p>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="garage-press grid size-10 shrink-0 place-items-center rounded-md border border-white/15 bg-white/5 text-white"
              aria-label="Tutup pilih meja"
            >
              <X className="size-5" />
            </button>
          ) : null}
        </div>

        <div className="mt-3 rounded-lg border border-white/10 bg-[#151518] p-3">
          <StatusLegend />
        </div>

        {areas.length ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter area">
            {["all", ...areas].map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={area === value}
                onClick={() => setArea(value)}
                className={`garage-press shrink-0 rounded-full border px-3 py-1.5 text-sm font-bold ${
                  area === value
                    ? "border-garage-red bg-garage-red/20 text-white"
                    : "border-white/15 bg-white/5 text-[#d4d4d8]"
                }`}
              >
                {value === "all" ? "Semua area" : value}
              </button>
            ))}
          </div>
        ) : null}

        {actionError ? (
          <p role="alert" className="mt-3 rounded-md border border-garage-amber/45 bg-garage-amber/12 px-3 py-2 text-sm font-semibold text-[#ffe2b0]">
            {actionError}
          </p>
        ) : null}

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {!tables ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[#c4c4cc]">
              {loadError ? (
                <>
                  <span>{loadError}</span>
                  <button type="button" onClick={() => void load()} className="garage-press inline-flex items-center gap-1 font-bold text-white">
                    <RefreshCw className="size-4" /> Coba lagi
                  </button>
                </>
              ) : (
                <>
                  <Loader2 className="size-5 animate-spin" /> Memuat meja…
                </>
              )}
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm font-semibold text-[#c4c4cc]">
                {availableCount} meja kosong{area !== "all" ? ` · area ${area}` : ""}
              </p>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {visible.map((table) => {
                  const colors = TABLE_STATUS_COLORS[table.customerStatus];
                  const copy = CUSTOMER_TABLE_STATUS_COPY[table.customerStatus];
                  const isMine = table.mine || current?.tableNumber === table.tableNumber;
                  const clickable = table.customerStatus === "available" || table.customerStatus === "occupied" || isMine;
                  return (
                    <li key={table.tableNumber}>
                      <button
                        type="button"
                        onClick={() => tap(table)}
                        aria-disabled={!clickable}
                        aria-label={`${table.tableLabel}, ${isMine ? "meja kamu" : copy.label}, ${table.capacity} kursi${table.area ? `, ${table.area}` : ""}`}
                        className={`garage-press relative flex min-h-[92px] w-full flex-col items-center justify-center rounded-lg px-1 py-2 text-center transition ${
                          clickable ? "" : "cursor-not-allowed opacity-80"
                        }`}
                        style={{
                          background: colors.bg,
                          border: `${isMine ? 3 : 1.5}px solid ${isMine ? "#ffffff" : colors.border}`,
                        }}
                      >
                        {isMine ? (
                          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-white text-black">
                            <Check className="size-3.5" strokeWidth={3.5} aria-hidden />
                          </span>
                        ) : table.customerStatus !== "available" && table.customerStatus !== "occupied" ? (
                          <Lock className="absolute right-1.5 top-1.5 size-3.5 text-white/70" aria-hidden />
                        ) : null}
                        <span className="text-2xl font-black leading-none text-white">{table.tableNumber}</span>
                        <span className="mt-1 text-xs font-bold" style={{ color: colors.text }}>
                          {isMine ? "Meja kamu" : copy.label}
                        </span>
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#d4d4d8]">
                          <Users className="size-3" aria-hidden /> {table.capacity}
                          {table.area ? <span className="max-w-[64px] truncate">· {table.area}</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>

      {confirmTable ? (
        <div className="fixed inset-0 z-[80] grid place-items-end bg-black/60 p-3 sm:place-items-center" role="alertdialog" aria-modal="true" aria-labelledby="confirm-table-title">
          <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#18181b] p-5 shadow-2xl">
            <Sparkles className="size-6 text-garage-amber" aria-hidden />
            <h3 id="confirm-table-title" className="mt-2 text-xl font-black text-white">
              Kamu di {confirmTable.tableLabel}, benar?
            </h3>
            <p className="mt-1 text-sm text-[#c4c4cc]">
              Meja ini dikunci sementara untukmu selama memilih menu. Nomor meja bisa diganti sebelum checkout.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmTable(null)}
                className="garage-press rounded-md border border-white/15 bg-white/5 px-3 py-3 text-sm font-bold text-white"
              >
                Bukan, pilih lain
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm(confirmTable)}
                className="garage-press inline-flex items-center justify-center gap-2 rounded-md bg-garage-red px-3 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Ya, benar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {joinTable ? (
        <div className="fixed inset-0 z-[80] grid place-items-end bg-black/60 p-3 sm:place-items-center" role="alertdialog" aria-modal="true" aria-labelledby="join-table-title">
          <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#18181b] p-5 shadow-2xl">
            <h3 id="join-table-title" className="text-xl font-black text-white">
              Gabung ke {joinTable.tableLabel}?
            </h3>
            <p className="mt-1 text-sm text-[#c4c4cc]">
              Meja ini sudah terisi. Masukkan <strong className="text-white">kode gabung 4 angka</strong> dari layar pesanan atau
              struk teman semeja.
            </p>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Kode gabung meja"
              placeholder="••••"
              className="mt-3 w-full rounded-md border border-white/20 bg-black/40 px-3 py-3 text-center text-2xl font-black tracking-[0.5em] text-white placeholder:text-white/30 focus:border-garage-red focus:outline-none"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setJoinTable(null)}
                className="garage-press rounded-md border border-white/15 bg-white/5 px-3 py-3 text-sm font-bold text-white"
              >
                Pilih meja lain
              </button>
              <button
                type="button"
                disabled={busy || joinCode.length !== 4}
                onClick={() => void join(joinTable)}
                className="garage-press inline-flex items-center justify-center gap-2 rounded-md bg-garage-red px-3 py-3 text-sm font-black text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Gabung
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Kartu kode gabung setelah pesanan dine-in: bagikan ke teman semeja. */
export function TableJoinCodeCard({ tableLabel, joinCode }: { tableLabel: string; joinCode: string }) {
  return (
    <div className="rounded-lg border border-[#ef4444]/45 bg-[#ef4444]/10 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#fecaca]">Kode gabung {tableLabel}</p>
      <p className="mt-1 text-3xl font-black tracking-[0.35em] text-white">{joinCode}</p>
      <p className="mt-1 text-sm text-[#e4e4e7]">
        Teman semeja mau pesan sendiri? Minta mereka pilih {tableLabel} di menu digital lalu masukkan kode ini.
      </p>
    </div>
  );
}

/** Langkah awal link umum: Dine-in (pilih meja) / Take away / Delivery. */
export function OrderTypeChooser({
  deliveryEnabled,
  deliveryNote,
  onChoose,
}: {
  deliveryEnabled: boolean;
  deliveryNote?: string | null;
  onChoose: (value: "dine-in" | "takeaway" | "delivery") => void;
}) {
  const options = [
    {
      value: "dine-in" as const,
      icon: UtensilsCrossed,
      title: "Makan di tempat",
      hint: "Pilih meja kosong dulu, lalu pesan dari meja.",
      disabled: false,
    },
    {
      value: "takeaway" as const,
      icon: ShoppingBag,
      title: "Take away",
      hint: "Ambil sendiri di kasir. Bayar dulu.",
      disabled: false,
    },
    {
      value: "delivery" as const,
      icon: Bike,
      title: "Delivery",
      hint: deliveryEnabled ? "Diantar kurir Garage. Bayar QRIS dulu." : deliveryNote || "Sedang tidak tersedia.",
      disabled: !deliveryEnabled,
    },
  ];
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-end bg-[#0b0b0d]/95 p-3 backdrop-blur-sm sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-type-title"
    >
      <div className="w-full max-w-md rounded-xl border border-white/12 bg-[#151518] p-5 shadow-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-garage-amber">Menu digital Garage</p>
        <h2 id="order-type-title" className="mt-1 text-2xl font-black text-white">
          Mau pesan untuk apa?
        </h2>
        <ul className="mt-4 space-y-2">
          {options.map((option) => {
            const Icon = option.icon;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  disabled={option.disabled}
                  onClick={() => onChoose(option.value)}
                  className="garage-press flex w-full items-center gap-3 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-3.5 text-left transition hover:border-garage-red hover:bg-garage-red/10 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-md bg-garage-red/15 text-[#ffb3b3]">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-black text-white">{option.title}</span>
                    <span className="block text-sm text-[#c4c4cc]">{option.hint}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
