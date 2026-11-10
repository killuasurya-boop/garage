"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Minus, Plus, Printer, RefreshCw, Save, Undo2 } from "lucide-react";

import { garageApi } from "@/lib/api-client";
import type { OutletTableConfig, OutletTablesData } from "@/lib/garage-api-types";

const AREA_SUGGESTIONS = ["Indoor", "Outdoor", "Teras", "Lantai 2", "VIP", "Smoking", "Bar"];

type Row = OutletTableConfig;

function sameRows(a: Row[], b: Row[]) {
  return (
    a.length === b.length &&
    a.every(
      (row, index) =>
        row.tableNumber === b[index].tableNumber &&
        row.active === b[index].active &&
        row.area === b[index].area &&
        row.capacity === b[index].capacity &&
        row.floor === b[index].floor,
    )
  );
}

// Menu "Meja & QR" (Pengaturan → Operasional): atur meja yang dipakai outlet,
// area, kapasitas kursi, lalu cetak QR untuk meja aktif. Meja nonaktif hilang
// dari peta waiter/POS & ditolak saat order. Simpan: Owner/Manajer.
export function TableManager({ canWrite }: { canWrite: boolean }) {
  const [saved, setSaved] = useState<Row[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [countInput, setCountInput] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    garageApi
      .get<OutletTablesData>("/api/tables/config", { cache: "no-store" })
      .then((data) => {
        if (cancelled) return;
        setSaved(data.tables);
        setRows(data.tables);
        setConfigured(data.configured);
        setCountInput(String(data.tables.filter((row) => row.active).length));
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Data meja gagal dimuat.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const dirty = saved ? !sameRows(rows, saved) : false;
  const activeRows = useMemo(() => rows.filter((row) => row.active), [rows]);
  const activeNumbers = activeRows.map((row) => row.tableNumber);
  const areaSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of activeRows) {
      const key = row.area.trim() || "Tanpa area";
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [activeRows]);
  const seatTotal = activeRows.reduce((sum, row) => sum + row.capacity, 0);

  const update = useCallback((tableNumber: string, patch: Partial<Row>) => {
    setRows((current) => current.map((row) => (row.tableNumber === tableNumber ? { ...row, ...patch } : row)));
    setMessage(null);
  }, []);

  function applyCount() {
    const count = Math.round(Number(countInput));
    if (!Number.isFinite(count) || count < 1 || count > rows.length) {
      setMessage({ tone: "error", text: `Jumlah meja harus 1 sampai ${rows.length}.` });
      return;
    }
    setRows((current) => current.map((row, index) => ({ ...row, active: index < count })));
    setMessage({ tone: "ok", text: `Meja 01–${String(count).padStart(2, "0")} diaktifkan. Tekan Simpan untuk menerapkan.` });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const data = await garageApi.put<OutletTablesData>("/api/tables/config", {
        tables: rows.map((row) => ({
          tableNumber: row.tableNumber,
          area: row.area,
          capacity: row.capacity,
          floor: row.floor,
          active: row.active,
        })),
      });
      setSaved(data.tables);
      setRows(data.tables);
      setConfigured(true);
      setMessage({ tone: "ok", text: `Tersimpan: ${data.tables.filter((row) => row.active).length} meja aktif.` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Gagal menyimpan meja." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-[#b8b8bf]" role="status">
        <Loader2 className="size-4 animate-spin" /> Memuat data meja…
      </p>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-md border border-[#ff2a3a]/45 bg-[#d11a2a]/12 p-4" role="alert">
        <p className="text-sm font-semibold text-white">Data meja gagal dimuat</p>
        <p className="mt-1 text-[13px] text-[#ffc2c8]">{loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setAttempt((value) => value + 1);
          }}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-white/10 px-4 text-[13px] font-semibold text-white ring-1 ring-white/25"
        >
          <RefreshCw className="size-4" /> Coba lagi
        </button>
      </div>
    );
  }

  const qrQuery = activeNumbers.length === rows.length ? "" : `?tables=${activeNumbers.join(",")}`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#34343c] bg-white/[0.03] p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[15px] font-bold text-white">
              {activeRows.length} meja aktif · {seatTotal} kursi
            </p>
            <p className="mt-0.5 text-[12px] text-[#b8b8bf]">
              {configured ? "Mengikuti pengaturan outlet." : "Belum diatur — semua meja 01–50 dianggap aktif."}{" "}
              Maksimal {rows.length} meja (batas audio panggilan meja).
            </p>
            {areaSummary.length ? (
              <p className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-[#e4e4e7]">
                {areaSummary.map(([area, count]) => (
                  <span key={area}>
                    {area}: <strong>{count}</strong>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          {canWrite ? (
            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                applyCount();
              }}
            >
              <label className="text-[12px] text-[#b8b8bf]">
                Jumlah meja dipakai
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={rows.length}
                  value={countInput}
                  onChange={(event) => setCountInput(event.target.value)}
                  className="mt-1 block h-11 w-24 rounded-md border border-[#4a4a54] bg-[#0a0a0c] px-3 font-mono text-[15px] text-white focus:border-white focus:outline-none"
                />
              </label>
              <button
                type="submit"
                className="h-11 rounded-md bg-white/10 px-3 text-[13px] font-semibold text-white ring-1 ring-white/25 hover:bg-white/15"
              >
                Terapkan 01–{String(Math.max(1, Math.min(rows.length, Number(countInput) || 1))).padStart(2, "0")}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {message ? (
        <p
          className={`rounded-md border px-3 py-2 text-[13px] ${
            message.tone === "ok"
              ? "border-white/20 bg-white/[0.06] text-white"
              : "border-[#ff2a3a]/45 bg-[#d11a2a]/12 text-[#ffc2c8]"
          }`}
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}

      <datalist id="garage-table-areas">
        {AREA_SUGGESTIONS.map((area) => (
          <option key={area} value={area} />
        ))}
      </datalist>

      <div className="garage-scroll max-h-[60svh] overflow-y-auto rounded-lg border border-[#34343c]">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead className="sticky top-0 z-10 bg-[#16161b] text-[11px] uppercase tracking-wider text-[#b8b8bf]">
            <tr>
              <th className="px-3 py-2 font-semibold">Meja</th>
              <th className="px-3 py-2 font-semibold">Dipakai</th>
              <th className="px-3 py-2 font-semibold">Lantai</th>
              <th className="px-3 py-2 font-semibold">Area</th>
              <th className="px-3 py-2 font-semibold">Kursi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tableNumber} className={`border-t border-[#26262d] ${row.active ? "" : "opacity-60"}`}>
                <td className="px-3 py-1.5 font-mono text-[15px] font-black text-white">{row.tableNumber}</td>
                <td className="px-3 py-1.5">
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.active}
                      disabled={!canWrite}
                      onChange={(event) => update(row.tableNumber, { active: event.target.checked })}
                      className="size-5 accent-[#d11a2a]"
                    />
                    <span className={row.active ? "text-white" : "text-[#8f8f98]"}>{row.active ? "Aktif" : "Tidak"}</span>
                  </label>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={row.floor}
                    disabled={!canWrite}
                    onChange={(event) => update(row.tableNumber, { floor: Number(event.target.value) })}
                    className="h-11 rounded-md border border-[#34343c] bg-[#0a0a0c] px-2 text-[13px] text-white focus:border-white focus:outline-none disabled:opacity-60"
                    aria-label={`Lantai meja ${row.tableNumber}`}
                  >
                    {[1, 2, 3, 4].map((floor) => (
                      <option key={floor} value={floor}>
                        Lantai {floor}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    list="garage-table-areas"
                    value={row.area}
                    disabled={!canWrite}
                    maxLength={40}
                    placeholder="mis. Indoor"
                    onChange={(event) => update(row.tableNumber, { area: event.target.value })}
                    className="h-11 w-full min-w-[120px] rounded-md border border-[#34343c] bg-[#0a0a0c] px-2.5 text-[13px] text-white placeholder:text-[#6e6e76] focus:border-white focus:outline-none disabled:opacity-60"
                    aria-label={`Area meja ${row.tableNumber}`}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!canWrite || row.capacity <= 1}
                      onClick={() => update(row.tableNumber, { capacity: row.capacity - 1 })}
                      className="grid size-11 place-items-center rounded-md bg-white/[0.05] text-white ring-1 ring-white/12 disabled:opacity-40"
                      aria-label={`Kurangi kursi meja ${row.tableNumber}`}
                    >
                      <Minus className="size-4" />
                    </button>
                    <span className="w-8 text-center font-mono text-[15px] font-bold text-white">{row.capacity}</span>
                    <button
                      type="button"
                      disabled={!canWrite || row.capacity >= 30}
                      onClick={() => update(row.tableNumber, { capacity: row.capacity + 1 })}
                      className="grid size-11 place-items-center rounded-md bg-white/[0.05] text-white ring-1 ring-white/12 disabled:opacity-40"
                      aria-label={`Tambah kursi meja ${row.tableNumber}`}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canWrite ? (
          <>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#d11a2a] px-4 text-[13px] font-bold text-white hover:bg-[#ff2a3a] disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Simpan meja
            </button>
            <button
              type="button"
              onClick={() => {
                if (saved) setRows(saved);
                setMessage(null);
              }}
              disabled={!dirty || saving}
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white/[0.06] px-4 text-[13px] font-semibold text-white ring-1 ring-white/15 disabled:opacity-50"
            >
              <Undo2 className="size-4" /> Batalkan perubahan
            </button>
          </>
        ) : (
          <p className="text-[12px] text-[#b8b8bf]">Hanya Owner/Manajer yang bisa mengubah meja.</p>
        )}
        <span className="mx-1 hidden h-6 w-px bg-[#34343c] sm:block" aria-hidden />
        <a
          href={`/order/qr-print${qrQuery}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white/[0.06] px-4 text-[13px] font-semibold text-white ring-1 ring-white/15 hover:bg-white/10"
        >
          <Printer className="size-4" /> Cetak QR meja aktif
        </a>
        <a
          href={`/api/customer/qr-cards/pdf${qrQuery}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md bg-white/[0.06] px-4 text-[13px] font-semibold text-white ring-1 ring-white/15 hover:bg-white/10"
        >
          <FileDown className="size-4" /> PDF QR
        </a>
      </div>
      {dirty ? (
        <p className="text-[12px] text-[#ffd08a]">Ada perubahan yang belum disimpan.</p>
      ) : null}
    </div>
  );
}
