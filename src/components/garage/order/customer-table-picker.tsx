"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Armchair, Bike, Check, Layers, Loader2, Lock, RefreshCw, Search, ShoppingBag, Users, UtensilsCrossed, WifiOff, X } from "lucide-react";

import { CrystalButton, CrystalCard, CrystalChip, CrystalSheet, LaserBorder, StatusDot } from "@/components/crystal/crystal";

import {
  CUSTOMER_TABLE_STATUS_COPY,
  TABLE_STATUS_COLORS,
  type CustomerTableStatus,
} from "@/lib/garage-table-status";
import { filterTables, floorsOf, noTableAvailable, occupancySummary, tableFloor, type TableStatusFilter } from "@/lib/table-floor-view";

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
  floor?: number | null;
  customerStatus: CustomerTableStatus;
  mine: boolean;
  /** Meja terisi: false = boleh menambah pesanan tanpa kode gabung (setting outlet). */
  joinCodeRequired?: boolean;
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

const STATUS_FILTERS: Array<{ key: TableStatusFilter; label: string; color?: string }> = [
  { key: "all", label: "Semua" },
  { key: "available", label: "Kosong", color: TABLE_STATUS_COLORS.available.dot },
  { key: "occupied", label: "Terisi", color: TABLE_STATUS_COLORS.occupied.dot },
  { key: "reserved", label: "Reserved", color: TABLE_STATUS_COLORS.reserved.dot },
];

function StatusLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs font-semibold text-[var(--gc-text-2)]" aria-label="Arti warna meja">
      {(Object.keys(CUSTOMER_TABLE_STATUS_COPY) as CustomerTableStatus[]).map((key) => (
        <li key={key}>
          <StatusDot color={TABLE_STATUS_COLORS[key].dot} label={CUSTOMER_TABLE_STATUS_COPY[key].label} />
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
  const [floor, setFloor] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<TableStatusFilter>("all");
  const [query, setQuery] = useState("");
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
    setFloor(tableFloor(table));
    if (table.customerStatus === "available" || table.mine) setConfirmTable(table);
    else if (table.customerStatus === "occupied") setJoinTable(table);
    else setActionError(`${table.tableLabel} ${CUSTOMER_TABLE_STATUS_COPY[table.customerStatus].label.toLowerCase()}. Pilih meja lain.`);
  }, [presetHandled, presetTable, tables]);

  const floors = useMemo(() => floorsOf(tables ?? []), [tables]);
  // Lantai aktif: pilihan pelanggan → lantai meja milik sendiri → lantai pertama yang masih ada meja kosong.
  const activeFloor =
    floor ??
    (current ? tableFloor({ tableNumber: current.tableNumber, floor: tables?.find((row) => row.tableNumber === current.tableNumber)?.floor }) : null) ??
    floors.find((row) => row.available > 0)?.floor ??
    floors[0]?.floor ??
    1;
  const floorTables = (tables ?? []).filter((row) => tableFloor(row) === activeFloor);
  const summary = occupancySummary(floorTables);
  const visible = filterTables(tables ?? [], { floor: activeFloor, status: statusFilter, query });
  const allUnavailable = noTableAvailable(tables ?? []);
  const otherFloorWithSpace = floors.find((row) => row.floor !== activeFloor && row.available > 0);

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
    const needsCode = table.joinCodeRequired !== false;
    if (needsCode && !/^\d{4}$/.test(joinCode)) {
      setActionError("Kode gabung 4 angka (lihat layar/struk teman semeja, atau tanya waiter/kasir).");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      if (current?.token) await releaseTableHold(current.token, outletId);
      const hold = await requestTableHold({ table: table.tableNumber, outletId, joinCode: needsCode ? joinCode : undefined });
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

  const summaryItems: Array<{ key: CustomerTableStatus | "total"; label: string; value: number; color?: string }> = [
    { key: "available", label: "Kosong", value: summary.available, color: "var(--gc-emerald)" },
    { key: "occupied", label: "Terisi", value: summary.occupied, color: "var(--gc-laser-bright)" },
    { key: "reserved", label: "Reserved", value: summary.reserved, color: "var(--gc-blue-text)" },
    { key: "cleaning", label: "Disiapkan", value: summary.cleaning, color: "var(--gc-text-2)" },
    { key: "total", label: "Total", value: summary.total },
  ];

  return (
    <div
      className="gc-root fixed inset-0 z-[70] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="table-picker-title"
      data-testid="table-picker"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 pb-3 pt-[calc(14px+env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="gc-eyebrow text-[var(--gc-amber)]">Dine-in</p>
            <h2 id="table-picker-title" className="mt-1 text-[28px] font-extrabold leading-tight text-white">
              Pilih meja kamu
            </h2>
            <p className="mt-1 text-sm leading-5 text-[var(--gc-text-2)]">
              Pilih meja <strong className="text-[var(--gc-emerald)]">hijau (Kosong)</strong>. Teman semeja sudah pesan? Ketuk meja{" "}
              <strong className="text-[var(--gc-laser-bright)]">Terisi</strong>
              {tables?.some((row) => row.customerStatus === "occupied" && row.joinCodeRequired === false) ? " untuk menambah pesanan." : " lalu masukkan kode gabung."}
            </p>
          </div>
          {onClose ? (
            <CrystalButton tone="icon" onClick={onClose} aria-label="Tutup pilih meja">
              <X className="size-5" />
            </CrystalButton>
          ) : null}
        </div>

        {floors.length > 1 ? (
          <div className="mt-3 grid grid-cols-2 gap-2" role="tablist" aria-label="Pilih lantai">
            {floors.map((row) => (
              <button
                key={row.floor}
                type="button"
                role="tab"
                aria-selected={row.floor === activeFloor}
                data-testid={`table-floor-${row.floor}`}
                onClick={() => setFloor(row.floor)}
                className="gc-glass flex min-h-12 items-center justify-center gap-2 px-3 text-sm font-bold"
                data-interactive="true"
                data-variant={row.floor === activeFloor ? "active" : "elevated"}
              >
                <Layers className="size-4" aria-hidden />
                <span>{row.label}</span>
                <span className="font-semibold text-[var(--gc-text-2)]">({row.range})</span>
              </button>
            ))}
          </div>
        ) : null}

        {/* Selama data meja dimuat: kerangka setinggi tab lantai + ringkasan agar daftar meja
            tidak terdorong ke bawah saat data tiba (CLS). Kasus umum = 2 lantai (fallbackFloor). */}
        {!tables && !loadError ? (
          <div aria-hidden className="mt-3 grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="gc-skeleton h-12 rounded-xl" />
              <div className="gc-skeleton h-12 rounded-xl" />
            </div>
            <div className="gc-skeleton h-[58px] rounded-xl" />
          </div>
        ) : null}

        {tables ? (
          <dl className="gc-glass mt-3 grid grid-cols-5 divide-x divide-white/10 py-2 text-center" aria-label="Ringkasan meja lantai ini">
            {summaryItems.map((item) => (
              <div key={item.key} className="px-1">
                <dd className="text-xl font-extrabold tabular-nums leading-none" style={{ color: item.color ?? "var(--gc-text)" }}>
                  {item.value}
                </dd>
                <dt className="mt-1 truncate text-[11px] font-semibold text-[var(--gc-text-2)]">{item.label}</dt>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="gc-glass flex min-h-11 flex-1 items-center gap-2 px-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--gc-amber)]" data-variant="elevated">
            <Search className="size-4 shrink-0 text-[var(--gc-text-2)]" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 12))}
              inputMode="numeric"
              placeholder="Cari nomor meja (contoh: 08)"
              aria-label="Cari nomor meja"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-[var(--gc-text-2)] focus:outline-none"
            />
          </label>
          <div className="gc-scroll flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter status meja">
            {STATUS_FILTERS.map((item) => (
              <CrystalChip key={item.key} active={statusFilter === item.key} onClick={() => setStatusFilter(item.key)}>
                {item.color ? <span className="gc-dot" style={{ color: item.color }} aria-hidden /> : null}
                {item.label}
              </CrystalChip>
            ))}
          </div>
        </div>

        {actionError ? (
          <p role="alert" className="mt-3 rounded-xl border border-[var(--gc-amber)]/45 bg-[var(--gc-amber)]/12 px-3 py-2 text-sm font-semibold text-[#ffe2b0]">
            {actionError}
          </p>
        ) : null}
        {loadError && tables ? (
          <p role="status" className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-[var(--gc-text-2)]">
            <span className="inline-flex items-center gap-2">
              <WifiOff className="size-4 text-[var(--gc-amber)]" aria-hidden /> Sinkronisasi terganggu — status meja mungkin belum terbaru.
            </span>
            <button type="button" onClick={() => void load()} className="shrink-0 font-bold text-white">
              Muat ulang
            </button>
          </p>
        ) : null}

        <div className="gc-scroll mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          {!tables ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[var(--gc-text-2)]">
              {loadError ? (
                <>
                  <span>{loadError}</span>
                  <button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 font-bold text-white">
                    <RefreshCw className="size-4" /> Coba lagi
                  </button>
                </>
              ) : (
                <>
                  <Loader2 className="size-5 animate-spin" /> Memuat meja…
                </>
              )}
            </div>
          ) : allUnavailable ? (
            <CrystalCard className="mx-auto mt-6 max-w-md p-5 text-center" data-testid="table-all-unavailable">
              <p className="text-lg font-extrabold text-white">Semua meja sedang tidak tersedia.</p>
              <p className="mt-1 text-sm text-[var(--gc-text-2)]">
                Teman semeja sudah pesan? Ketuk meja Terisi untuk gabung. Atau tanya waiter/kasir untuk bantuan.
              </p>
              <CrystalButton className="mt-4" icon={<RefreshCw className="size-4" />} onClick={() => void load()}>
                Muat ulang status
              </CrystalButton>
            </CrystalCard>
          ) : null}
          {tables ? (
            <>
              {!allUnavailable && summary.available === 0 && otherFloorWithSpace ? (
                <button
                  type="button"
                  onClick={() => setFloor(otherFloorWithSpace.floor)}
                  className="mb-3 w-full rounded-xl border border-[var(--gc-emerald)]/50 bg-[var(--gc-emerald)]/10 px-3 py-2.5 text-left text-sm font-semibold text-white"
                >
                  Lantai ini penuh — {otherFloorWithSpace.label} masih ada {otherFloorWithSpace.available} meja kosong. Lihat →
                </button>
              ) : null}
              {visible.length ? (
                <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                  {visible.map((table) => {
                    const colors = TABLE_STATUS_COLORS[table.customerStatus];
                    const copy = CUSTOMER_TABLE_STATUS_COPY[table.customerStatus];
                    const isMine = table.mine || current?.tableNumber === table.tableNumber;
                    const isPicking = confirmTable?.tableNumber === table.tableNumber;
                    const clickable = table.customerStatus === "available" || table.customerStatus === "occupied" || isMine;
                    return (
                      <li key={table.tableNumber}>
                        <button
                          type="button"
                          onClick={() => tap(table)}
                          aria-disabled={!clickable}
                          data-testid={`table-card-${table.tableNumber}`}
                          aria-label={`${table.tableLabel}, ${isMine ? "meja kamu" : copy.label}, ${table.capacity} kursi${table.area ? `, ${table.area}` : ""}`}
                          className={`gc-glass relative flex min-h-[96px] w-full flex-col items-center justify-center px-1 py-2 text-center ${clickable ? "" : "cursor-not-allowed"}`}
                          data-interactive={clickable ? "true" : undefined}
                          data-selected={isPicking || isMine ? "true" : undefined}
                          style={{
                            background: `linear-gradient(165deg, ${colors.bg}, rgb(255 255 255 / 0.02) 55%, rgb(0 0 0 / 0.25)), var(--gc-surface)`,
                            borderColor: isMine ? "#ffffff" : colors.border,
                            borderWidth: isMine ? 3 : 1,
                            opacity: clickable ? 1 : 0.82,
                          }}
                        >
                          {isPicking ? <LaserBorder radius={16} /> : null}
                          {isMine ? (
                            <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-white text-black">
                              <Check className="size-3.5" strokeWidth={3.5} aria-hidden />
                            </span>
                          ) : table.customerStatus !== "available" && table.customerStatus !== "occupied" ? (
                            <Lock className="absolute right-1.5 top-1.5 size-3.5 text-white/70" aria-hidden />
                          ) : null}
                          <span className="text-[28px] font-extrabold leading-none tabular-nums text-white">{table.tableNumber}</span>
                          <span className="mt-1 text-xs font-bold" style={{ color: colors.text }}>
                            {isMine ? "Meja kamu" : copy.label}
                          </span>
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--gc-text-2)]">
                            <Users className="size-3" aria-hidden /> {table.capacity}
                            {table.area ? <span className="max-w-[64px] truncate">· {table.area}</span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : !allUnavailable ? (
                <p className="py-10 text-center text-sm text-[var(--gc-text-2)]">Tidak ada meja yang cocok dengan filter ini.</p>
              ) : null}
              <div className="mt-4 pb-2">
                <StatusLegend />
              </div>
            </>
          ) : null}
        </div>
      </div>

      <CrystalSheet open={Boolean(confirmTable)} onClose={() => setConfirmTable(null)} title="Konfirmasi meja">
        {confirmTable ? (
          <div data-testid="table-confirm-sheet">
            <div className="flex items-center gap-3">
              <span className="grid size-14 place-items-center rounded-2xl border border-white/15 bg-white/5">
                <Armchair className="size-7 text-white" aria-hidden />
              </span>
              <div>
                <h3 id="confirm-table-title" className="text-[22px] font-extrabold leading-tight text-white">
                  Kamu di {confirmTable.tableLabel}, benar?
                </h3>
                <p className="text-sm text-[var(--gc-text-2)]">
                  Lantai {tableFloor(confirmTable)} · {confirmTable.capacity} kursi{confirmTable.area ? ` · ${confirmTable.area}` : ""}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-5 text-[var(--gc-text-2)]">
              Meja ini dikunci sementara untukmu selama memilih menu. Nomor meja bisa diganti sebelum checkout.
            </p>
            <div className="mt-4 grid gap-2">
              <CrystalButton tone="primary" loading={busy} onClick={() => void confirm(confirmTable)} icon={<Check className="size-5" />}>
                Ya, pilih meja ini
              </CrystalButton>
              <CrystalButton onClick={() => setConfirmTable(null)}>Bukan, pilih lain</CrystalButton>
            </div>
          </div>
        ) : null}
      </CrystalSheet>

      <CrystalSheet open={Boolean(joinTable)} onClose={() => setJoinTable(null)} title="Gabung meja">
        {joinTable && joinTable.joinCodeRequired === false ? (
          <div>
            <h3 id="join-table-title" className="text-[22px] font-extrabold text-white">
              Pesan untuk {joinTable.tableLabel}?
            </h3>
            <p className="mt-1 text-sm text-[var(--gc-text-2)]">
              Meja ini sudah ada pesanan. Pesananmu akan <strong className="text-white">ikut tagihan {joinTable.tableLabel}</strong> dan
              dikonfirmasi kasir dulu sebelum dibuat.
            </p>
            <div className="mt-4 grid gap-2">
              <CrystalButton tone="primary" loading={busy} onClick={() => void join(joinTable)}>
                Ya, pesan untuk {joinTable.tableLabel}
              </CrystalButton>
              <CrystalButton onClick={() => setJoinTable(null)}>Pilih meja lain</CrystalButton>
            </div>
          </div>
        ) : joinTable ? (
          <div>
            <h3 id="join-table-title" className="text-[22px] font-extrabold text-white">
              Gabung ke {joinTable.tableLabel}?
            </h3>
            <p className="mt-1 text-sm text-[var(--gc-text-2)]">
              Meja ini sudah terisi. Masukkan <strong className="text-white">kode gabung 4 angka</strong>.
            </p>
            <ul className="mt-2 space-y-1 text-sm text-[var(--gc-text-2)]">
              <li>• Lihat di layar pesanan atau struk teman semeja, atau</li>
              <li>• tanya waiter / kasir — mereka bisa melihat kodenya.</li>
            </ul>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Kode gabung meja"
              placeholder="••••"
              className="mt-3 w-full rounded-2xl border border-white/20 bg-black/40 px-3 py-3 text-center text-2xl font-black tracking-[0.5em] text-white placeholder:text-white/30 focus:border-[var(--gc-laser)] focus:outline-none"
            />
            <div className="mt-4 grid gap-2">
              <CrystalButton tone="primary" loading={busy} disabled={joinCode.length !== 4} onClick={() => void join(joinTable)}>
                Gabung
              </CrystalButton>
              <CrystalButton onClick={() => setJoinTable(null)}>Pilih meja lain</CrystalButton>
            </div>
          </div>
        ) : null}
      </CrystalSheet>
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
