"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  FileText,
  History,
  IdCard,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { StaffProfile360 } from "@/lib/staff-profile";
import { waLink } from "@/lib/whatsapp-link";

const rupiah = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `Rp ${Math.round(value).toLocaleString("id-ID")}`;

const dateLabel = (value: string | null | undefined, withYear = true) =>
  value
    ? new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        ...(withYear ? { year: "numeric" } : {}),
        timeZone: "Asia/Jakarta",
      })
    : "—";

const timeLabel = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }) : "—";

const hours = (minutes: number) => `${Math.floor(minutes / 60)}j ${minutes % 60}m`;

const CONTRACT_LABEL: Record<string, string> = { tetap: "Tetap", kontrak: "Kontrak", harian: "Harian", magang: "Magang" };
const STATUS_LABEL: Record<string, string> = { active: "Aktif", suspended: "Ditangguhkan", inactive: "Keluar" };
const ATT_STATUS: Record<string, string> = { valid: "Hadir", invalid: "Tidak valid", absent: "Alpa", pending: "Belum pulang" };
const LEAVE_LABEL: Record<string, string> = { izin: "Izin", sakit: "Sakit", cuti: "Cuti" };

type FormState = Record<
  | "whatsapp"
  | "address"
  | "birthDate"
  | "gender"
  | "nik"
  | "bankName"
  | "bankAccountNumber"
  | "bankAccountName"
  | "emergencyName"
  | "emergencyRelation"
  | "emergencyPhone"
  | "contractType"
  | "contractEnd"
  | "notes",
  string
>;

function formFrom(profile: StaffProfile360): FormState {
  const p = profile.personal;
  return {
    whatsapp: p.whatsapp ?? "",
    address: p.address ?? "",
    birthDate: p.birthDate ?? "",
    gender: p.gender ?? "",
    nik: profile.canSeeSensitive ? (p.nik ?? "") : "",
    bankName: p.bankName ?? "",
    bankAccountNumber: profile.canSeeSensitive ? (p.bankAccountNumber ?? "") : "",
    bankAccountName: p.bankAccountName ?? "",
    emergencyName: p.emergencyName ?? "",
    emergencyRelation: p.emergencyRelation ?? "",
    emergencyPhone: p.emergencyPhone ?? "",
    contractType: p.contractType ?? "",
    contractEnd: p.contractEnd ?? "",
    notes: p.notes ?? "",
  };
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-[#34343c] bg-[#1b1b22] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a9a9b3]">{label}</p>
      <p className={`mt-0.5 break-words text-sm font-semibold text-white ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" | "red" | "green" }) {
  const color = tone === "amber" ? "text-[#ffd08a]" : tone === "red" ? "text-[#ff9ea6]" : tone === "green" ? "text-[#9be8b4]" : "text-white";
  return (
    <div className="min-w-0 rounded-md border border-[#34343c] bg-[#1b1b22] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#a9a9b3]">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="garage-mono mb-2 text-[11px] font-bold uppercase tracking-wide text-[#f5a742]">{children}</p>;
}

const inputClass = "h-10 border-[#3a3a44] bg-[#1b1b22] text-white";
const labelClass = "text-[11px] font-semibold uppercase tracking-wide text-[#a9a9b3]";

export function StaffProfileDrawer({
  staffProfileId,
  onClose,
}: {
  staffProfileId: string | null;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<StaffProfile360 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [otherLabel, setOtherLabel] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<string>("photo");

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hr/staff/${id}/profile`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "Profil gagal dimuat.");
      setProfile(json.data);
      setForm(formFrom(json.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Profil gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!staffProfileId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset & muat profil saat karyawan dipilih
    setProfile(null);
    setEditing(false);
    void load(staffProfileId);
  }, [staffProfileId, load]);

  async function save() {
    if (!profile || !form) return;
    setSaving(true);
    setError(null);
    const payload: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(form)) {
      if ((key === "nik" || key === "bankName" || key === "bankAccountNumber" || key === "bankAccountName") && !profile.canEditSensitive) continue;
      payload[key] = value.trim() ? value.trim() : null;
    }
    try {
      const res = await fetch(`/api/hr/staff/${profile.id}/personal`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Data diri gagal disimpan.");
      setEditing(false);
      await load(profile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Data diri gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  function pickFile(kind: string) {
    pendingKind.current = kind;
    if (fileInput.current) {
      fileInput.current.accept = kind === "photo" ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf";
      fileInput.current.value = "";
      fileInput.current.click();
    }
  }

  async function upload(file: File) {
    if (!profile) return;
    const kind = pendingKind.current;
    setUploading(kind);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    if (kind === "other") body.set("label", otherLabel.trim() || file.name.replace(/\.[^.]+$/, "").slice(0, 60));
    try {
      const res = await fetch(`/api/hr/staff/${profile.id}/files`, { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? "Dokumen gagal diunggah.");
      setOtherLabel("");
      await load(profile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dokumen gagal diunggah.");
    } finally {
      setUploading(null);
    }
  }

  async function removeDoc(kind: string, url: string | null) {
    if (!profile || !window.confirm("Lepas dokumen ini dari profil?")) return;
    const res = await fetch(`/api/hr/staff/${profile.id}/files`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, url }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) setError(json?.error?.message ?? "Dokumen gagal dihapus.");
    else await load(profile.id);
  }

  const identity = profile?.identity;
  const wa = profile ? waLink(profile.personal.whatsapp) : null;
  const setField = (key: keyof FormState) => (value: string) => setForm((f) => (f ? { ...f, [key]: value } : f));

  return (
    <Sheet open={Boolean(staffProfileId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        data-testid="staff-profile-drawer"
        className="flex w-full flex-col gap-0 border-[#34343c] bg-[#121217] p-0 text-white data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-[#34343c] p-4 pr-14 text-left">
          <div className="flex items-start gap-3">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-[#3a3a44] bg-[#1b1b22]">
              {identity?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- file privat lewat API ber-auth
                <img src={identity.photoUrl} alt={`Foto ${identity.name}`} className="size-full object-cover" />
              ) : (
                <UserRound className="absolute inset-0 m-auto size-8 text-[#6b6b75]" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate font-sans text-lg font-bold text-white">
                {identity?.name ?? "Profil karyawan"}
              </SheetTitle>
              <SheetDescription className="mt-0.5 text-sm text-[#d0d0d6]">
                {identity
                  ? [identity.position, identity.division, identity.role].filter(Boolean).join(" · ")
                  : "Memuat profil…"}
              </SheetDescription>
              {identity ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span
                    className={`rounded border px-2 py-0.5 font-bold uppercase tracking-wide ${
                      identity.status === "active"
                        ? "border-[#3ecf72]/40 bg-[#3ecf72]/10 text-[#9be8b4]"
                        : "border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#ffb3b3]"
                    }`}
                  >
                    {STATUS_LABEL[identity.status] ?? identity.status}
                  </span>
                  {identity.absenCode ? (
                    <span className="rounded border border-[#f5a742]/40 bg-[#f5a742]/10 px-2 py-0.5 font-mono font-bold text-[#ffd08a]">
                      {identity.absenCode}
                    </span>
                  ) : null}
                  {identity.tenure ? <span className="text-[#c4c4cc]">Masa kerja {identity.tenure}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
          {profile ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {wa ? (
                <Button asChild size="sm" className="garage-press h-9 gap-1.5 bg-[#25d366] text-black hover:bg-[#34e377]">
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                className="garage-press h-9 gap-1.5 border-[#4a4a54]"
                onClick={() => pickFile("photo")}
                disabled={uploading !== null}
              >
                {uploading === "photo" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Ganti foto
              </Button>
            </div>
          ) : null}
        </SheetHeader>

        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        {error ? (
          <p role="alert" className="mx-4 mt-3 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-3 py-2 text-sm text-[#ffc2c8]">
            {error}
          </p>
        ) : null}

        {loading && !profile ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[#c4c4cc]">
            <Loader2 className="size-4 animate-spin" /> Memuat profil…
          </div>
        ) : null}

        {profile && form ? (
          <Tabs defaultValue="data" className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="overflow-x-auto border-b border-[#34343c] px-3 py-2">
              <TabsList className="inline-flex h-auto w-max gap-1 bg-[#1b1b22] p-1">
                {[
                  { value: "data", label: "Data diri", icon: IdCard },
                  { value: "absen", label: "Absensi", icon: CalendarClock },
                  { value: "gaji", label: "Gaji & fee", icon: Wallet },
                  { value: "dokumen", label: "Dokumen", icon: FileText },
                  { value: "aktivitas", label: "Aktivitas", icon: History },
                ].map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-[#c4c4cc] data-[state=active]:bg-[#d11a2a] data-[state=active]:text-white"
                  >
                    <Icon className="size-3.5" /> {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <div className="garage-scroll min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <TabsContent value="data" className="mt-0 space-y-4">
                {editing ? (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className={labelClass}>No. WhatsApp</span>
                        <Input value={form.whatsapp} onChange={(e) => setField("whatsapp")(e.target.value)} inputMode="tel" placeholder="08xx" className={inputClass} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>Tanggal lahir</span>
                        <Input type="date" value={form.birthDate} onChange={(e) => setField("birthDate")(e.target.value)} className={inputClass} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>Jenis kelamin</span>
                        <select value={form.gender} onChange={(e) => setField("gender")(e.target.value)} className={`w-full rounded-md border px-3 text-sm ${inputClass}`}>
                          <option value="">—</option>
                          <option value="Laki-laki">Laki-laki</option>
                          <option value="Perempuan">Perempuan</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>NIK (16 digit){profile.canEditSensitive ? "" : " · Owner saja"}</span>
                        <Input
                          value={profile.canEditSensitive ? form.nik : (profile.personal.nik ?? "")}
                          onChange={(e) => setField("nik")(e.target.value.replace(/\D/g, "").slice(0, 16))}
                          disabled={!profile.canEditSensitive}
                          inputMode="numeric"
                          className={`${inputClass} font-mono`}
                        />
                      </label>
                    </div>
                    <label className="block space-y-1">
                      <span className={labelClass}>Alamat</span>
                      <Textarea value={form.address} onChange={(e) => setField("address")(e.target.value)} rows={2} maxLength={300} className="border-[#3a3a44] bg-[#1b1b22] text-white" />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="space-y-1">
                        <span className={labelClass}>Kontak darurat</span>
                        <Input value={form.emergencyName} onChange={(e) => setField("emergencyName")(e.target.value)} placeholder="Nama" className={inputClass} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>Hubungan</span>
                        <Input value={form.emergencyRelation} onChange={(e) => setField("emergencyRelation")(e.target.value)} placeholder="Ibu / Suami / …" className={inputClass} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>No. darurat</span>
                        <Input value={form.emergencyPhone} onChange={(e) => setField("emergencyPhone")(e.target.value)} inputMode="tel" className={inputClass} />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="space-y-1">
                        <span className={labelClass}>Bank{profile.canEditSensitive ? "" : " · Owner saja"}</span>
                        <Input value={form.bankName} onChange={(e) => setField("bankName")(e.target.value)} disabled={!profile.canEditSensitive} placeholder="BNI / BRI / …" className={inputClass} />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>No. rekening</span>
                        <Input
                          value={profile.canEditSensitive ? form.bankAccountNumber : (profile.personal.bankAccountNumber ?? "")}
                          onChange={(e) => setField("bankAccountNumber")(e.target.value)}
                          disabled={!profile.canEditSensitive}
                          inputMode="numeric"
                          className={`${inputClass} font-mono`}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>Atas nama</span>
                        <Input value={form.bankAccountName} onChange={(e) => setField("bankAccountName")(e.target.value)} disabled={!profile.canEditSensitive} className={inputClass} />
                      </label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className={labelClass}>Status kerja</span>
                        <select value={form.contractType} onChange={(e) => setField("contractType")(e.target.value)} className={`w-full rounded-md border px-3 text-sm ${inputClass}`}>
                          <option value="">—</option>
                          {Object.entries(CONTRACT_LABEL).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className={labelClass}>Kontrak berakhir</span>
                        <Input type="date" value={form.contractEnd} onChange={(e) => setField("contractEnd")(e.target.value)} className={inputClass} />
                      </label>
                    </div>
                    <label className="block space-y-1">
                      <span className={labelClass}>Catatan</span>
                      <Textarea value={form.notes} onChange={(e) => setField("notes")(e.target.value)} rows={3} maxLength={1000} className="border-[#3a3a44] bg-[#1b1b22] text-white" />
                    </label>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="garage-press h-10 border-[#4a4a54]"
                        onClick={() => {
                          setEditing(false);
                          setForm(formFrom(profile));
                        }}
                        disabled={saving}
                      >
                        Batal
                      </Button>
                      <Button className="garage-press h-10 gap-1.5" onClick={() => void save()} disabled={saving}>
                        {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                        Simpan
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <SectionTitle>Kontak & identitas</SectionTitle>
                      <Button size="sm" variant="outline" className="garage-press h-8 gap-1.5 border-[#4a4a54]" onClick={() => setEditing(true)}>
                        <Pencil className="size-3.5" /> Edit
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field
                        label="WhatsApp"
                        value={
                          profile.personal.whatsapp ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="size-3.5 text-[#a9a9b3]" /> {profile.personal.whatsapp}
                            </span>
                          ) : null
                        }
                        mono
                      />
                      <Field label="Email login" value={identity?.email} />
                      <Field label="Tanggal lahir" value={dateLabel(profile.personal.birthDate)} />
                      <Field label="Jenis kelamin" value={profile.personal.gender} />
                      <Field label={profile.canSeeSensitive ? "NIK" : "NIK (tersamar)"} value={profile.personal.nik} mono />
                      <Field label="Tanggal masuk" value={dateLabel(identity?.joinDate ?? null)} />
                    </div>
                    <Field label="Alamat" value={profile.personal.address} />
                    <SectionTitle>Kontak darurat</SectionTitle>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Field label="Nama" value={profile.personal.emergencyName} />
                      <Field label="Hubungan" value={profile.personal.emergencyRelation} />
                      <Field label="Nomor" value={profile.personal.emergencyPhone} mono />
                    </div>
                    <SectionTitle>Rekening gaji & kontrak</SectionTitle>
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Field label="Bank" value={profile.personal.bankName} />
                      <Field label={profile.canSeeSensitive ? "No. rekening" : "No. rekening (tersamar)"} value={profile.personal.bankAccountNumber} mono />
                      <Field label="Atas nama" value={profile.personal.bankAccountName} />
                      <Field label="Status kerja" value={profile.personal.contractType ? CONTRACT_LABEL[profile.personal.contractType] : null} />
                      <Field label="Kontrak berakhir" value={dateLabel(profile.personal.contractEnd)} />
                      <Field label="Login terakhir" value={identity?.lastLoginAt ? `${dateLabel(identity.lastLoginAt)} ${timeLabel(identity.lastLoginAt)}` : null} />
                    </div>
                    {identity?.status !== "active" && identity?.suspendedReason ? (
                      <Field label="Alasan nonaktif" value={identity.suspendedReason} />
                    ) : null}
                    {profile.personal.notes ? <Field label="Catatan" value={profile.personal.notes} /> : null}
                  </>
                )}
              </TabsContent>

              <TabsContent value="absen" className="mt-0 space-y-4">
                <SectionTitle>Bulan {profile.attendance.month}</SectionTitle>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Hadir" value={`${profile.attendance.summary.hadir} hari`} tone="green" />
                  <Stat label="Telat" value={`${profile.attendance.summary.telat}× · ${profile.attendance.summary.lateMinutes}m`} tone={profile.attendance.summary.telat ? "red" : undefined} />
                  <Stat label="Lembur" value={hours(profile.attendance.summary.overtimeMinutes)} tone="amber" />
                  <Stat label="Jam kerja" value={hours(profile.attendance.summary.workedMinutes)} />
                  <Stat label="Alpa" value={String(profile.attendance.summary.absent)} tone={profile.attendance.summary.absent ? "red" : undefined} />
                  <Stat label="Izin" value={String(profile.attendance.summary.izin)} />
                  <Stat label="Sakit" value={String(profile.attendance.summary.sakit)} />
                  <Stat label="Cuti" value={String(profile.attendance.summary.cuti)} />
                </div>
                {profile.attendance.upcomingShifts.length > 0 ? (
                  <div>
                    <SectionTitle>Jadwal 7 hari ke depan</SectionTitle>
                    <div className="flex flex-wrap gap-2">
                      {profile.attendance.upcomingShifts.map((shift) => (
                        <span key={shift.date} className="rounded-md border border-[#34343c] bg-[#1b1b22] px-2.5 py-1 text-xs text-[#e4e4e8]">
                          {dateLabel(shift.date, false)} · {shift.shiftType === "off" ? "Libur" : `${shift.startTime ?? ""}–${shift.endTime ?? ""}`}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="overflow-x-auto rounded-md border border-[#34343c]">
                  <table className="w-full min-w-[460px] text-sm">
                    <thead className="bg-[#1b1b22] text-left text-[11px] uppercase tracking-wide text-[#a9a9b3]">
                      <tr>
                        <th className="px-3 py-2">Tanggal</th>
                        <th className="px-3 py-2">Masuk</th>
                        <th className="px-3 py-2">Pulang</th>
                        <th className="px-3 py-2 text-right">Telat</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2a2a32]">
                      {profile.attendance.days.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-[#a9a9b3]">
                            Belum ada absensi bulan ini.
                          </td>
                        </tr>
                      ) : (
                        profile.attendance.days.map((day) => (
                          <tr key={day.date}>
                            <td className="px-3 py-2 font-medium">{dateLabel(day.date, false)}</td>
                            <td className="px-3 py-2 font-mono tabular-nums">{timeLabel(day.checkinAt)}</td>
                            <td className="px-3 py-2 font-mono tabular-nums">{timeLabel(day.checkoutAt)}</td>
                            <td className={`px-3 py-2 text-right font-mono tabular-nums ${day.lateMinutes ? "text-[#ff9ea6]" : ""}`}>
                              {day.lateMinutes ? `${day.lateMinutes}m` : "—"}
                            </td>
                            <td className="px-3 py-2">{ATT_STATUS[day.status] ?? day.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {profile.attendance.leaves.length > 0 ? (
                  <div className="space-y-1.5">
                    <SectionTitle>Izin / sakit / cuti</SectionTitle>
                    {profile.attendance.leaves.map((leave) => (
                      <p key={leave.date} className="text-sm text-[#e4e4e8]">
                        {dateLabel(leave.date, false)} · <b>{LEAVE_LABEL[leave.type] ?? leave.type}</b>
                        {leave.reason ? ` — ${leave.reason}` : ""}
                      </p>
                    ))}
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="gaji" className="mt-0 space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <Stat label="Gaji bulanan" value={rupiah(profile.pay.monthlySalary)} />
                  <Stat label="Upah harian" value={rupiah(profile.pay.dailyWage)} />
                  <Stat label="Lembur / jam" value={rupiah(profile.pay.overtimeHourly)} />
                  <Stat label="Saldo gaji" value={rupiah(profile.pay.walletGaji)} tone="amber" />
                  <Stat label="Saldo fee" value={profile.pay.excludeFromFee ? "Tidak ikut fee" : rupiah(profile.pay.walletFee)} tone="amber" />
                  <Stat label="Sisa kasbon" value={rupiah(profile.pay.outstandingAdvance)} tone={profile.pay.outstandingAdvance ? "red" : undefined} />
                </div>
                <p className="text-xs text-[#a9a9b3]">Saldo = gaji/fee yang belum dibayar lewat gajian. Slip lengkap ada di Payroll → Slip gaji.</p>
                <div>
                  <SectionTitle>Riwayat gajian</SectionTitle>
                  {profile.pay.payments.length === 0 ? (
                    <p className="text-sm text-[#a9a9b3]">Belum ada gajian.</p>
                  ) : (
                    <div className="space-y-2">
                      {profile.pay.payments.map((payment) => (
                        <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#34343c] bg-[#1b1b22] px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="font-semibold">s/d {dateLabel(payment.paidUntil)}</p>
                            <p className="text-xs text-[#a9a9b3]">
                              Gaji {rupiah(payment.grossGaji)} · Fee {rupiah(payment.grossFee)}
                              {payment.advanceDeducted ? ` · Kasbon −${rupiah(payment.advanceDeducted)}` : ""} · {payment.method}
                            </p>
                          </div>
                          <p className={`font-mono font-bold tabular-nums ${payment.status === "paid" ? "text-[#9be8b4]" : "text-[#ff9ea6] line-through"}`}>
                            {rupiah(payment.netPaid)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {profile.pay.advances.length > 0 ? (
                  <div>
                    <SectionTitle>Kasbon</SectionTitle>
                    <div className="space-y-2">
                      {profile.pay.advances.map((advance) => (
                        <div key={advance.id} className="flex items-center justify-between gap-2 rounded-md border border-[#34343c] bg-[#1b1b22] px-3 py-2 text-sm">
                          <span className="min-w-0 truncate">
                            {dateLabel(advance.date)}
                            {advance.note ? ` · ${advance.note}` : ""}
                            {advance.status !== "active" ? " · dibatalkan" : ""}
                          </span>
                          <span className="shrink-0 font-mono tabular-nums">
                            {rupiah(advance.amount)} <span className="text-xs text-[#a9a9b3]">(lunas {rupiah(advance.settledAmount)})</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </TabsContent>

              <TabsContent value="dokumen" className="mt-0 space-y-3">
                {(
                  [
                    { kind: "photo", label: "Foto profil", url: profile.documents.photoUrl },
                    { kind: "ktp", label: "KTP", url: profile.documents.ktpUrl, ownerOnly: true, has: profile.documents.hasKtp },
                    { kind: "cv", label: "CV / riwayat hidup", url: profile.documents.cvUrl },
                    { kind: "contract", label: "Kontrak kerja", url: profile.documents.contractUrl },
                  ] as Array<{ kind: string; label: string; url: string | null; ownerOnly?: boolean; has?: boolean }>
                ).map((doc) => {
                  const locked = doc.ownerOnly && !profile.canSeeSensitive;
                  return (
                    <div key={doc.kind} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#34343c] bg-[#1b1b22] px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{doc.label}</p>
                        <p className="text-xs text-[#a9a9b3]">
                          {locked ? (doc.has ? "Tersimpan · hanya Owner yang bisa membuka" : "Belum ada · hanya Owner") : doc.url ? "Tersimpan" : "Belum diunggah"}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        {doc.url && !locked ? (
                          <Button asChild size="sm" variant="outline" className="h-8 border-[#4a4a54]">
                            <a href={doc.url} target="_blank" rel="noopener noreferrer">
                              Lihat
                            </a>
                          </Button>
                        ) : null}
                        {!locked ? (
                          <Button size="sm" variant="outline" className="h-8 gap-1 border-[#4a4a54]" onClick={() => pickFile(doc.kind)} disabled={uploading !== null}>
                            {uploading === doc.kind ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                            {doc.url ? "Ganti" : "Unggah"}
                          </Button>
                        ) : null}
                        {doc.url && !locked ? (
                          <Button size="sm" variant="ghost" className="h-8 px-2 text-[#ff9ea6]" onClick={() => void removeDoc(doc.kind, null)} aria-label={`Lepas ${doc.label}`}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-md border border-[#34343c] bg-[#1b1b22] p-3">
                  <p className="text-sm font-semibold">Dokumen lain</p>
                  <p className="text-xs text-[#a9a9b3]">Sertifikat, SKCK, surat dokter, dll. JPG/PNG/WEBP/PDF maks 5 MB.</p>
                  <div className="mt-2 space-y-1.5">
                    {profile.documents.otherDocs.map((doc) => (
                      <div key={doc.url} className="flex items-center justify-between gap-2 text-sm">
                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-[#ffd08a] underline">
                          {doc.label}
                        </a>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-[#ff9ea6]" onClick={() => void removeDoc("other", doc.url)} aria-label={`Lepas ${doc.label}`}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} maxLength={60} placeholder="Nama dokumen" className={inputClass} />
                    <Button variant="outline" className="h-10 shrink-0 gap-1 border-[#4a4a54]" onClick={() => pickFile("other")} disabled={uploading !== null}>
                      {uploading === "other" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                      Unggah
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="aktivitas" className="mt-0 space-y-2">
                {profile.activity.length === 0 ? (
                  <p className="text-sm text-[#a9a9b3]">Belum ada aktivitas tercatat.</p>
                ) : (
                  profile.activity.map((log) => (
                    <div key={log.id} className="rounded-md border border-[#34343c] bg-[#1b1b22] px-3 py-2 text-sm">
                      <p className="font-semibold text-white">{log.action}</p>
                      <p className="text-xs text-[#a9a9b3]">
                        {dateLabel(log.createdAt)} {timeLabel(log.createdAt)} · {log.actor}
                      </p>
                    </div>
                  ))
                )}
              </TabsContent>
            </div>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
