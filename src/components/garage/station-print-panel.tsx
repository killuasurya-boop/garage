"use client";

import { Printer } from "lucide-react";
import { useMemo, useState } from "react";

import { garageApi } from "@/lib/api-client";
import type { ProductionTicketView } from "@/lib/garage-api-types";
import {
  chitStationLabel,
  combineChits,
  rawbtUrl,
  testChitContent,
  ticketChitContent,
  toEscPosBytes,
  type RawbtMode,
} from "@/lib/station-print";

const STORAGE_KEY = "garage:station-print";

type Stored = { on: boolean; since: number; mode: RawbtMode };

function loadStored(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Stored> | null;
    if (raw && typeof raw.since === "number") {
      return { on: Boolean(raw.on), since: raw.since, mode: raw.mode === "intent" ? "intent" : "base64" };
    }
  } catch {
    /* localStorage tidak tersedia */
  }
  return { on: false, since: Date.now(), mode: "base64" };
}

function saveStored(value: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* abaikan */
  }
}

/**
 * Panel cetak chit untuk perangkat stasiun (Bar / Dapur). Tiket baru untuk
 * stasiun ini menumpuk sebagai "menunggu cetak"; satu ketukan CETAK mengirim
 * semuanya ke printer Bluetooth lewat aplikasi RawBT, lalu menandainya tercetak
 * di server agar tidak tercetak dobel (juga di perangkat lain).
 */
export function StationPrintPanel({
  tickets,
  station,
  onPrinted,
}: {
  tickets: ProductionTicketView[];
  station: "Bar" | "Food" | "all";
  onPrinted: () => void;
}) {
  const [stored, setStored] = useState<Stored>(loadStored);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mine = useMemo(
    () => tickets.filter((t) => station === "all" || t.station === station),
    [tickets, station],
  );
  const pending = useMemo(
    () =>
      mine.filter(
        (t) =>
          !t.chitPrintedAt &&
          (t.status === "queue" || t.status === "cooking") &&
          new Date(t.createdAt).getTime() >= stored.since,
      ),
    [mine, stored.since],
  );
  const recent = useMemo(
    () => [...mine].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    [mine],
  );
  const label = station === "all" ? "Bar + Dapur" : chitStationLabel(station);

  function update(next: Partial<Stored>) {
    const value = { ...stored, ...next };
    setStored(value);
    saveStored(value);
  }

  function send(content: string) {
    // Mengubah location memicu Chrome membuka aplikasi RawBT (butuh ketukan pengguna).
    window.location.href = rawbtUrl(toEscPosBytes(content), stored.mode);
  }

  async function printPending() {
    if (pending.length === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      send(combineChits(pending.map(ticketChitContent)));
      await garageApi.post("/api/production/print-ack", { ticketNos: pending.map((t) => t.ticketNo) });
      setNotice(`${pending.length} tiket dikirim ke printer.`);
      onPrinted();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menandai tiket tercetak.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[#34343c] bg-[#111116] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => update({ on: !stored.on, since: stored.on ? stored.since : Date.now() })}
          className={`flex h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-black transition-colors ${
            stored.on
              ? "border-[#fbbf24]/60 bg-[#fbbf24]/12 text-[#fde68a]"
              : "border-[#4a4a54] bg-white/[0.04] text-[#b8b8c2]"
          }`}
        >
          <Printer className="size-4" />
          Printer {label}: {stored.on ? "ON" : "OFF"}
        </button>
        {stored.on ? (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void printPending()}
              disabled={pending.length === 0 || busy}
              className="h-11 rounded-md bg-[#d11a2a] px-4 text-sm font-black uppercase text-white shadow-[0_0_18px_rgba(209,26,42,0.35)] transition disabled:bg-[#3a3a44] disabled:text-[#8f8f99] disabled:shadow-none"
            >
              Cetak {pending.length > 0 ? `${pending.length} tiket baru` : "(tidak ada tiket baru)"}
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="h-11 rounded-md border border-[#4a4a54] bg-white/[0.04] px-3 text-xs font-black text-[#e4e4e7]"
            >
              {open ? "Tutup" : "Pengaturan"}
            </button>
          </div>
        ) : null}
      </div>

      {notice ? <p className="mt-2 text-xs text-[#fbbf24]">{notice}</p> : null}

      {stored.on && open ? (
        <div className="mt-3 space-y-3 border-t border-[#34343c] pt-3 text-xs text-[#d4d4d8]">
          <p>
            Butuh aplikasi <strong className="text-white">RawBT</strong> (gratis, Play Store) di tablet ini, dengan printer
            Bluetooth sudah dipairing dan dipilih di RawBT. Ketuk <strong className="text-white">Tes cetak</strong> untuk
            mengecek.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => send(testChitContent(chitStationLabel(station === "all" ? "Bar" : station)))}
              className="h-10 rounded-md border border-[#fbbf24]/50 bg-[#fbbf24]/10 px-3 font-black text-[#fde68a]"
            >
              Tes cetak
            </button>
            <label className="flex items-center gap-2">
              Mode kirim
              <select
                value={stored.mode}
                onChange={(e) => update({ mode: e.target.value === "intent" ? "intent" : "base64" })}
                className="h-10 rounded-md border border-[#4a4a54] bg-[#1a1a20] px-2 text-white"
              >
                <option value="base64">A · rawbt:base64 (utama)</option>
                <option value="intent">B · intent (cadangan)</option>
              </select>
            </label>
          </div>
          <p className="text-[#8f8f99]">
            Kalau Tes cetak A tidak membuka RawBT / tidak mencetak, coba mode B. Tiket yang dibuat sebelum tombol ON
            tidak ikut dicetak otomatis.
          </p>
          {recent.length > 0 ? (
            <div>
              <p className="mb-1 font-black uppercase tracking-wide text-[#b8b8c2]">Cetak ulang</p>
              <ul className="space-y-1">
                {recent.map((t) => (
                  <li key={t.ticketNo} className="flex items-center justify-between gap-2 rounded border border-[#34343c] px-2 py-1">
                    <span className="min-w-0 truncate">
                      {t.ticketNo} · {t.table} · {t.items.length} item {t.chitPrintedAt ? "· sudah tercetak" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => send(ticketChitContent(t))}
                      className="h-8 shrink-0 rounded border border-[#4a4a54] px-2 font-black text-white"
                    >
                      Cetak ulang
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
