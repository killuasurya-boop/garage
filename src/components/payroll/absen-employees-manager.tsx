"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, X } from "lucide-react";

import type { AbsenEmployeeView } from "@/lib/garage-absen-employees";

// Kelola karyawan absen (kode + PIN) — terpisah dari akun login sistem.

const DAYS_PER_MONTH = 30;

const rupiah = (n: number) => `Rp ${new Intl.NumberFormat("id-ID").format(n)}`;
const digits = (s: string) => s.replace(/\D/g, "");

type FormState = {
  code: string;
  name: string;
  position: string;
  monthlySalary: string; // hanya digit
  useStoreHours: boolean;
  shiftStart: string; // HH:MM
  getsFee: boolean;
  active: boolean;
  joinDate: string; // YYYY-MM-DD atau "" (belum diisi)
  monthlyDeduction: string; // hanya digit
};

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  position: "",
  monthlySalary: "",
  useStoreHours: true,
  shiftStart: "09:00",
  getsFee: true,
  active: true,
  joinDate: "",
  monthlyDeduction: "",
};

function toForm(e: AbsenEmployeeView): FormState {
  return {
    code: e.code,
    name: e.name,
    position: e.position ?? "",
    monthlySalary: String(e.monthlySalary),
    useStoreHours: e.shiftStart === null,
    shiftStart: e.shiftStart ?? "09:00",
    getsFee: !e.excludeFromFee,
    active: e.active,
    joinDate: e.joinDate ?? "",
    monthlyDeduction: e.monthlyDeduction ? String(e.monthlyDeduction) : "",
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Permintaan gagal.");
  return json.data as T;
}

const card = "rounded-2xl border border-[var(--garage-line)] bg-[var(--garage-bg-2)] p-4";
const label = "text-sm font-semibold uppercase tracking-wider text-[var(--garage-dim)]";
const input =
  "w-full min-h-11 rounded-xl border border-[var(--garage-line-2)] bg-[var(--garage-bg-0)] px-3 text-base text-[var(--garage-fg)] placeholder:text-[var(--garage-mute)] [color-scheme:dark] disabled:opacity-60";
const btnGhost =
  "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--garage-line-2)] px-4 text-base text-[var(--garage-fg)] transition-colors hover:border-[var(--garage-amber)] disabled:cursor-not-allowed disabled:opacity-60";
const btnPrimary =
  "flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[var(--garage-red)] px-4 text-base font-semibold text-white transition-colors hover:bg-[var(--garage-red-bright)] disabled:cursor-not-allowed disabled:opacity-60";

function EmployeeForm({
  mode,
  initial,
  saving,
  error,
  canManagePay,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initial: FormState;
  saving: boolean;
  error: string | null;
  canManagePay: boolean; // false = manajer: gaji/fee/aktif dikunci (wewenang Owner)
  onSubmit: (f: FormState) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const monthly = Number(f.monthlySalary || 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(f);
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "create" && (
          <label className="block space-y-1">
            <span className={label}>Kode login</span>
            <input
              value={f.code}
              onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              maxLength={12}
              placeholder="mis. BAR3"
              className={`${input} uppercase tracking-widest`}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </label>
        )}
        <label className="block space-y-1">
          <span className={label}>Nama</span>
          <input
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            maxLength={60}
            placeholder="Nama asli karyawan"
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className={label}>Jabatan</span>
          <input
            value={f.position}
            onChange={(e) => set("position", e.target.value)}
            maxLength={40}
            placeholder="mis. Barista"
            className={input}
          />
        </label>
        <label className="block space-y-1">
          <span className={label}>Gaji bulanan</span>
          <input
            value={f.monthlySalary ? new Intl.NumberFormat("id-ID").format(monthly) : ""}
            onChange={(e) => set("monthlySalary", digits(e.target.value).slice(0, 9))}
            inputMode="numeric"
            placeholder="mis. 2.000.000"
            className={`${input} tabular-nums`}
            disabled={!canManagePay}
          />
          <span className="text-sm tabular-nums text-[var(--garage-dim)]">
            = {rupiah(Math.round(monthly / DAYS_PER_MONTH))} per hari hadir (÷ {DAYS_PER_MONTH})
            {!canManagePay && " · diatur Owner"}
          </span>
        </label>
        <div className="space-y-1">
          <span className={label}>Jam masuk</span>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-[var(--garage-fg)]">
            <input
              type="checkbox"
              checked={f.useStoreHours}
              onChange={(e) => set("useStoreHours", e.target.checked)}
              className="size-5 cursor-pointer accent-[var(--garage-red)]"
            />
            Ikut jam buka toko
          </label>
          {!f.useStoreHours && (
            <input
              type="time"
              value={f.shiftStart}
              onChange={(e) => set("shiftStart", e.target.value)}
              className={`${input} tabular-nums`}
              aria-label="Jam masuk karyawan"
            />
          )}
        </div>
        <label className="block space-y-1">
          <span className={label}>Tanggal mulai kerja</span>
          <input
            type="date"
            value={f.joinDate}
            onChange={(e) => set("joinDate", e.target.value)}
            className={`${input} tabular-nums`}
            disabled={!canManagePay}
          />
          <span className="text-sm text-[var(--garage-dim)]">
            Dasar masa kerja THR{!canManagePay && " · diatur Owner"}
          </span>
        </label>
        <label className="block space-y-1">
          <span className={label}>Potongan tetap / bulan</span>
          <input
            value={f.monthlyDeduction ? new Intl.NumberFormat("id-ID").format(Number(f.monthlyDeduction)) : ""}
            onChange={(e) => set("monthlyDeduction", digits(e.target.value).slice(0, 8))}
            inputMode="numeric"
            placeholder="0 = tidak ada"
            className={`${input} tabular-nums`}
            disabled={!canManagePay}
          />
          <span className="text-sm text-[var(--garage-dim)]">
            Mis. iuran BPJS bagian karyawan; dipotong akhir bulan{!canManagePay && " · diatur Owner"}
          </span>
        </label>
        <div className="space-y-1">
          <span className={label}>Status{!canManagePay && " (diatur Owner)"}</span>
          <label className={`flex min-h-11 items-center gap-3 text-base text-[var(--garage-fg)] ${canManagePay ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
            <input
              type="checkbox"
              checked={f.getsFee}
              onChange={(e) => set("getsFee", e.target.checked)}
              disabled={!canManagePay}
              className="size-5 cursor-pointer accent-[var(--garage-red)] disabled:cursor-not-allowed"
            />
            Dapat fee produk
          </label>
          {mode === "edit" && (
            <label className={`flex min-h-11 items-center gap-3 text-base text-[var(--garage-fg)] ${canManagePay ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}>
              <input
                type="checkbox"
                checked={f.active}
                onChange={(e) => set("active", e.target.checked)}
                disabled={!canManagePay}
                className="size-5 cursor-pointer accent-[var(--garage-red)] disabled:cursor-not-allowed"
              />
              Aktif (bisa absen)
            </label>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnGhost} disabled={saving}>
          Batal
        </button>
        <button type="submit" className={btnPrimary} disabled={saving}>
          {saving ? "Menyimpan…" : mode === "create" ? "Tambah & buat PIN" : "Simpan"}
        </button>
      </div>
    </form>
  );
}

export function AbsenEmployeesManager() {
  const [employees, setEmployees] = useState<AbsenEmployeeView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // kode | "__new__"
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);
  const [pinReveal, setPinReveal] = useState<{ code: string; name: string; pin: string } | null>(null);
  const [canManagePay, setCanManagePay] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api<{ employees: AbsenEmployeeView[]; canManagePay: boolean }>(
        "/api/payroll/employees",
      );
      setEmployees(data.employees);
      setCanManagePay(Boolean(data.canManagePay));
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const openEditor = (key: string) => {
    setEditing(key);
    setFormError(null);
    setConfirmReset(null);
  };

  const validate = (f: FormState, mode: "create" | "edit"): string | null => {
    if (mode === "create" && !/^[A-Z0-9-]{2,12}$/.test(f.code)) return "Kode login 2–12 huruf/angka.";
    if (f.name.trim().length < 2) return "Nama minimal 2 huruf.";
    if (canManagePay && Number(f.monthlySalary || 0) < 1_000) return "Isi gaji bulanan.";
    if (!f.useStoreHours && !/^([01]\d|2[0-3]):[0-5]\d$/.test(f.shiftStart)) return "Jam masuk tidak valid.";
    return null;
  };

  const payloadOf = (f: FormState) => ({
    name: f.name.trim(),
    position: f.position.trim() || null,
    monthlySalary: Number(f.monthlySalary),
    shiftStart: f.useStoreHours ? null : f.shiftStart,
    excludeFromFee: !f.getsFee,
    joinDate: f.joinDate || null,
    monthlyDeduction: Number(f.monthlyDeduction || 0),
  });

  const create = async (f: FormState) => {
    const invalid = validate(f, "create");
    if (invalid) return setFormError(invalid);
    setSaving(true);
    setFormError(null);
    try {
      const res = await api<{ code: string; pin: string }>("/api/payroll/employees", {
        method: "POST",
        body: JSON.stringify({ code: f.code, ...payloadOf(f) }),
      });
      setPinReveal({ code: res.code, name: f.name.trim(), pin: res.pin });
      setEditing(null);
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const update = async (code: string, f: FormState) => {
    const invalid = validate(f, "edit");
    if (invalid) return setFormError(invalid);
    setSaving(true);
    setFormError(null);
    try {
      // Manajer hanya mengirim data non-gaji (server juga menolak bila dicoba).
      const body = canManagePay
        ? { ...payloadOf(f), active: f.active }
        : {
            name: f.name.trim(),
            position: f.position.trim() || null,
            shiftStart: f.useStoreHours ? null : f.shiftStart,
          };
      await api(`/api/payroll/employees/${encodeURIComponent(code)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const resetPin = async (e: AbsenEmployeeView) => {
    setSaving(true);
    try {
      const res = await api<{ code: string; pin: string }>(
        `/api/payroll/employees/${encodeURIComponent(e.code)}/reset-pin`,
        { method: "POST" },
      );
      setPinReveal({ code: res.code, name: e.name, pin: res.pin });
      setConfirmReset(null);
      await load();
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--garage-fg)]">Karyawan Absen</h1>
          <p className="text-base text-[var(--garage-dim)]">
            Akun absen HP karyawan (kode + PIN) — terpisah dari akun login sistem kasir.
          </p>
        </div>
        {canManagePay && editing !== "__new__" && (
          <button type="button" onClick={() => openEditor("__new__")} className={btnPrimary}>
            <Plus className="size-4" aria-hidden />
            Tambah karyawan
          </button>
        )}
      </div>

      {pinReveal && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--garage-amber)] bg-[var(--garage-bg-3)] p-4"
        >
          <div className="space-y-1">
            <div className="text-base text-[var(--garage-fg)]">
              PIN baru <strong>{pinReveal.name}</strong> ({pinReveal.code})
            </div>
            <div className="text-3xl font-bold tracking-[0.3em] tabular-nums text-[var(--garage-amber)]">
              {pinReveal.pin}
            </div>
            <div className="text-sm text-[var(--garage-dim)]">
              Catat dan berikan langsung ke karyawan. PIN ini tidak akan ditampilkan lagi.
            </div>
          </div>
          <button type="button" onClick={() => setPinReveal(null)} className={btnGhost}>
            <X className="size-4" aria-hidden />
            Sudah dicatat
          </button>
        </div>
      )}

      {loadError && (
        <p
          role="alert"
          className="rounded-xl border border-[var(--garage-red-bright)] bg-[var(--garage-red-deep)] px-4 py-3 text-base text-white"
        >
          {loadError}
        </p>
      )}

      {editing === "__new__" && (
        <div className={`${card} space-y-3 border-[var(--garage-amber)]`}>
          <h2 className="text-lg font-semibold text-[var(--garage-fg)]">Karyawan baru</h2>
          <EmployeeForm
            mode="create"
            initial={EMPTY_FORM}
            saving={saving}
            error={formError}
            canManagePay={canManagePay}
            onSubmit={(f) => void create(f)}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-base text-[var(--garage-dim)]">Memuat karyawan…</p>
      ) : employees.length === 0 && !loadError ? (
        <p className={`${card} text-base text-[var(--garage-dim)]`}>
          Belum ada karyawan absen. Tekan <strong>Tambah karyawan</strong>.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {employees.map((e) => (
            <article key={e.code} className={`${card} space-y-3 ${e.active ? "" : "opacity-80"}`}>
              {editing === e.code ? (
                <>
                  <h2 className="text-lg font-semibold text-[var(--garage-fg)]">
                    Ubah {e.name} <span className="text-[var(--garage-dim)]">({e.code})</span>
                  </h2>
                  <EmployeeForm
                    mode="edit"
                    initial={toForm(e)}
                    saving={saving}
                    error={formError}
                    canManagePay={canManagePay}
                    onSubmit={(f) => void update(e.code, f)}
                    onCancel={() => setEditing(null)}
                  />
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-words text-lg font-semibold text-[var(--garage-fg)]">{e.name}</div>
                      <div className="text-base text-[var(--garage-dim)]">
                        <span className="font-semibold tracking-wider text-[var(--garage-fg)]">{e.code}</span>
                        {" · "}
                        {e.position ?? "Karyawan"}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {!e.active && (
                        <span className="rounded-md border border-[var(--garage-red-bright)] px-2 py-0.5 text-sm text-[var(--garage-red-bright)]">
                          Nonaktif
                        </span>
                      )}
                      {e.excludeFromFee && (
                        <span className="rounded-md border border-[var(--garage-line-2)] px-2 py-0.5 text-sm text-[var(--garage-dim)]">
                          Tanpa fee
                        </span>
                      )}
                      {!e.hasPin && (
                        <span className="rounded-md border border-[var(--garage-amber)] px-2 py-0.5 text-sm text-[var(--garage-amber)]">
                          Belum ada PIN
                        </span>
                      )}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-2 text-base">
                    <div>
                      <dt className="text-sm text-[var(--garage-dim)]">Gaji bulanan</dt>
                      <dd className="font-semibold tabular-nums text-[var(--garage-fg)]">{rupiah(e.monthlySalary)}</dd>
                      <dd className="text-sm tabular-nums text-[var(--garage-dim)]">{rupiah(e.dailyWage)} / hari</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-[var(--garage-dim)]">Jam masuk</dt>
                      <dd className="font-semibold tabular-nums text-[var(--garage-fg)]">
                        {e.shiftStart ?? "Jam buka toko"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-[var(--garage-dim)]">Mulai kerja</dt>
                      <dd className={`font-semibold tabular-nums ${e.joinDate ? "text-[var(--garage-fg)]" : "text-[var(--garage-amber)]"}`}>
                        {e.joinDate
                          ? new Date(`${e.joinDate}T12:00:00+07:00`).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              timeZone: "Asia/Jakarta",
                            })
                          : "Belum diisi"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-[var(--garage-dim)]">Potongan tetap</dt>
                      <dd className="font-semibold tabular-nums text-[var(--garage-fg)]">
                        {e.monthlyDeduction ? `${rupiah(e.monthlyDeduction)} / bln` : "—"}
                      </dd>
                    </div>
                  </dl>

                  {confirmReset === e.code ? (
                    <div className="space-y-2 rounded-xl border border-[var(--garage-amber)] p-3">
                      <p className="text-base text-[var(--garage-fg)]">
                        Reset PIN {e.name}? PIN lama langsung tidak berlaku.
                      </p>
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => setConfirmReset(null)} className={btnGhost} disabled={saving}>
                          Batal
                        </button>
                        <button type="button" onClick={() => void resetPin(e)} className={btnPrimary} disabled={saving}>
                          {saving ? "Memproses…" : "Ya, buat PIN baru"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setConfirmReset(e.code)} className={btnGhost}>
                        <KeyRound className="size-4" aria-hidden />
                        Reset PIN
                      </button>
                      <button type="button" onClick={() => openEditor(e.code)} className={btnGhost}>
                        <Pencil className="size-4" aria-hidden />
                        Ubah
                      </button>
                    </div>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
