"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  Search,
  FileText,
  ExternalLink,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Phone,
  Mail,
  User,
  Briefcase,
  BookOpen,
  ToggleLeft,
  ToggleRight,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
} from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { garageApi } from "@/lib/api-client";
import {
  RECRUITMENT_POSITIONS,
  RECRUITMENT_STATUSES,
} from "@/lib/garage-recruitment-data";

// ─── Types ───────────────────────────────────────────────────────────────────

type Candidate = {
  id: string;
  fullName: string;
  whatsapp: string;
  email: string;
  domicile: string;
  gender: string | null;
  birthDate: string | null;
  appliedPosition: string;
  preferredLocation: string | null;
  availableStartDate: string | null;
  willingShift: boolean;
  willingRelocate: boolean;
  education: string | null;
  lastExperience: string | null;
  experienceDuration: string | null;
  previousCompany: string | null;
  resignReason: string | null;
  mainSkill: string | null;
  strength: string | null;
  weakness: string | null;
  motivation: string | null;
  customerExperience: string | null;
  expectedSalary: number | null;
  interviewAvailability: string | null;
  cvUrl: string | null;
  photoUrl: string | null;
  portfolioUrl: string | null;
  socialMediaUrl?: string | null;
  status: string;
  score?: number | null;
  notes?: string | null;
  followUpDate?: string | null;
  assignedTo?: string | null;
  finalDecision?: string | null;
  interviewDate?: string | null;
  interviewLink?: string | null;
  cvParsedData?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type ApiResp = {
  items: Candidate[];
  stats: { total: number; byStatus: Record<string, number> };
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type PositionRow = {
  id: string;
  slug: string;
  title: string;
  location: string;
  type: string;
  experience: string;
  description: string;
  isOpen: boolean;
  sortOrder: number;
};

type PositionsApiResp = { positions: PositionRow[] };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusTone: Record<string, string> = {
  "Pelamar Baru": "border-[#3b82f6]/45 bg-[#3b82f6]/14 text-[#bfdbfe]",
  "Sedang Direview": "border-[#a78bfa]/45 bg-[#a78bfa]/14 text-[#ddd6fe]",
  "Dijadwalkan Interview": "border-[#f0abfc]/45 bg-[#f0abfc]/14 text-[#f5d0fe]",
  "Selesai Interview": "border-[#818cf8]/45 bg-[#818cf8]/14 text-[#c7d2fe]",
  "Diterima": "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#bbf7d0]",
  "Ditolak": "border-[#ef4444]/45 bg-[#ef4444]/14 text-[#fca5a5]",
  "Disimpan": "border-[#2dd4bf]/45 bg-[#2dd4bf]/14 text-[#99f6e4]",
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const fmtRp = (n: number | null | undefined) => {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
};

const whatsappLink = (raw: string, name: string, position: string) => {
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  const text = encodeURIComponent(
    `Halo ${name}, kami dari GARAGE Recruitment. Lamaran kamu untuk posisi ${position} sudah kami terima. Kami ingin follow up proses seleksi kamu.`,
  );
  return `https://wa.me/${normalized}?text=${text}`;
};

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function CandidateDrawer({
  candidate,
  onClose,
  onStatusChange,
  onSaved,
}: {
  candidate: Candidate;
  onClose: () => void;
  onStatusChange: (c: Candidate, status: string) => Promise<void>;
  onSaved: () => void;
}) {
  const [score, setScore] = useState(candidate.score?.toString() ?? "");
  const [notes, setNotes] = useState(candidate.notes ?? "");
  const [followUpDate, setFollowUpDate] = useState(candidate.followUpDate ?? "");
  const [assignedTo, setAssignedTo] = useState(candidate.assignedTo ?? "");
  const [finalDecision, setFinalDecision] = useState(candidate.finalDecision ?? "");
  
  // Superpowers Goal: Jadwal Interview
  const [interviewDate, setInterviewDate] = useState<string>(
    candidate.interviewDate ? new Date(candidate.interviewDate).toISOString().slice(0, 16) : ""
  );
  const [interviewLink, setInterviewLink] = useState(candidate.interviewLink ?? "");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSavedOk(false);
    try {
      await garageApi.patch(`/api/recruitment/candidates/${candidate.id}`, {
        notes: notes || null,
        followUpDate: followUpDate || null,
        assignedTo: assignedTo || null,
        finalDecision: finalDecision || null,
        interviewDate: interviewDate ? new Date(interviewDate).toISOString() : null,
        interviewLink: interviewLink || null,
        ...(score !== "" ? { score: Number(score) } : {}),
      });
      setSavedOk(true);
      onSaved();
      setTimeout(() => setSavedOk(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(s: string) {
    setUpdatingStatus(true);
    await onStatusChange(candidate, s);
    setUpdatingStatus(false);
  }

  const inputCls = "w-full rounded-md border border-[#34343c] bg-black/20 px-3 py-2 text-sm text-white placeholder-[#666] focus:border-[#d11a2a]/60 focus:outline-none";
  const labelCls = "block text-[11px] font-semibold uppercase tracking-wider text-[#888] mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside className="garage-scroll absolute right-0 top-0 h-full w-full max-w-[850px] overflow-y-auto border-l border-[#34343c] bg-[#0f0f13] shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#34343c] bg-[#0f0f13]/95 px-4 py-3 backdrop-blur-sm">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#888]">Detail Kandidat</p>
            <h3 className="font-black text-white">{candidate.fullName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[#34343c] text-[#888] transition-colors hover:border-[#d11a2a]/40 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-5 p-5">
          {/* KOLOM KIRI: Info Detail Kandidat */}
          <div className="flex-1 space-y-5">
            {/* Identitas */}
          <div className="rounded-md border border-[#34343c] bg-white/[0.02] p-3">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#d11a2a]">Identitas</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2.5 text-[#d4d4d8]">
                <Phone className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <a href={whatsappLink(candidate.whatsapp, candidate.fullName, candidate.appliedPosition)} target="_blank" rel="noopener noreferrer" className="hover:text-[#22c55e] hover:underline">{candidate.whatsapp}</a>
              </div>
              <div className="flex items-start gap-2.5 text-[#d4d4d8]">
                <Mail className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>{candidate.email}</span>
              </div>
              <div className="flex items-start gap-2.5 text-[#d4d4d8]">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                <span>{candidate.domicile}</span>
              </div>
              {candidate.gender && (
                <div className="flex items-start gap-2.5 text-[#d4d4d8]">
                  <User className="mt-0.5 size-3.5 shrink-0 text-[#888]" />
                  <span>{candidate.gender} · {candidate.birthDate ? fmtDate(candidate.birthDate) : "—"}</span>
                </div>
              )}
            </div>
          </div>

          {/* Posisi */}
          <div className="rounded-md border border-[#34343c] bg-white/[0.02] p-3">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#d11a2a]">Posisi & Ketersediaan</p>
            <div className="space-y-1.5 text-sm text-[#d4d4d8]">
              <p><span className="text-[#888]">Posisi:</span> <strong>{candidate.appliedPosition}</strong></p>
              {candidate.preferredLocation && <p><span className="text-[#888]">Lokasi:</span> {candidate.preferredLocation}</p>}
              {candidate.availableStartDate && <p><span className="text-[#888]">Mulai:</span> {fmtDate(candidate.availableStartDate)}</p>}
              {candidate.interviewAvailability && <p><span className="text-[#888]">Interview:</span> {candidate.interviewAvailability}</p>}
              <div className="flex gap-3 pt-1">
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${candidate.willingShift ? "bg-[#22c55e]/14 text-[#bbf7d0]" : "bg-white/[0.06] text-[#888]"}`}>
                  {candidate.willingShift ? "✓" : "✗"} Bersedia shift
                </span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full ${candidate.willingRelocate ? "bg-[#22c55e]/14 text-[#bbf7d0]" : "bg-white/[0.06] text-[#888]"}`}>
                  {candidate.willingRelocate ? "✓" : "✗"} Bersedia relokasi
                </span>
                </div>
              </div>
            </div>
          </div>

          {/* Pendidikan & Pengalaman */}
          {(candidate.education || candidate.lastExperience || candidate.experienceDuration || candidate.previousCompany) && (
            <div className="rounded-md border border-[#34343c] bg-white/[0.02] p-3">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#d11a2a]">Pendidikan & Pengalaman</p>
              <div className="space-y-1.5 text-sm text-[#d4d4d8]">
                {candidate.education && <p><span className="text-[#888]">Pendidikan:</span> {candidate.education}</p>}
                {candidate.experienceDuration && <p><span className="text-[#888]">Lama pengalaman:</span> {candidate.experienceDuration}</p>}
                {candidate.previousCompany && <p><span className="text-[#888]">Perusahaan:</span> {candidate.previousCompany}</p>}
                {candidate.lastExperience && (
                  <div className="mt-2">
                    <p className="text-[#888] text-[11px] mb-1">Pengalaman terakhir:</p>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed">{candidate.lastExperience}</p>
                  </div>
                )}
                {candidate.resignReason && (
                  <div className="mt-2">
                    <p className="text-[#888] text-[11px] mb-1">Alasan berhenti:</p>
                    <p className="whitespace-pre-wrap text-xs leading-relaxed">{candidate.resignReason}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Skill & Karakter */}
          {(candidate.mainSkill || candidate.strength || candidate.weakness || candidate.motivation || candidate.customerExperience) && (
            <div className="rounded-md border border-[#34343c] bg-white/[0.02] p-3">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#d11a2a]">Skill & Karakter</p>
              <div className="space-y-2 text-sm text-[#d4d4d8]">
                {candidate.mainSkill && <p><span className="text-[#888]">Skill utama:</span> {candidate.mainSkill}</p>}
                {candidate.strength && (
                  <div><p className="text-[#888] text-[11px] mb-1">Kelebihan:</p><p className="whitespace-pre-wrap text-xs leading-relaxed">{candidate.strength}</p></div>
                )}
                {candidate.weakness && (
                  <div><p className="text-[#888] text-[11px] mb-1">Kekurangan:</p><p className="whitespace-pre-wrap text-xs leading-relaxed">{candidate.weakness}</p></div>
                )}
                {candidate.motivation && (
                  <div><p className="text-[#888] text-[11px] mb-1">Motivasi:</p><p className="whitespace-pre-wrap text-xs leading-relaxed">{candidate.motivation}</p></div>
                )}
                {candidate.customerExperience && (
                  <div><p className="text-[#888] text-[11px] mb-1">Pengalaman customer:</p><p className="whitespace-pre-wrap text-xs leading-relaxed">{candidate.customerExperience}</p></div>
                )}
              </div>
            </div>
          )}

          {/* Ekspektasi & Dokumen */}
          <div className="rounded-md border border-[#34343c] bg-white/[0.02] p-3">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[#d11a2a]">Ekspektasi & Dokumen</p>
            <div className="space-y-2 text-sm text-[#d4d4d8]">
              <p><span className="text-[#888]">Gaji diharapkan:</span> {fmtRp(candidate.expectedSalary)}</p>
              {candidate.cvUrl && (
                <a href={candidate.cvUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[#22c55e]/30 bg-[#22c55e]/10 px-3 py-1.5 text-xs font-semibold text-[#bbf7d0] hover:bg-[#22c55e]/20">
                  <FileText className="size-3.5" /> Lihat CV <ExternalLink className="size-3" />
                </a>
              )}
              {candidate.photoUrl && (
                <a href={candidate.photoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[#34343c] bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-[#d4d4d8] hover:bg-white/[0.1]">
                  <User className="size-3.5" /> Foto Diri <ExternalLink className="size-3" />
                </a>
              )}
              {candidate.portfolioUrl && (
                <a href={candidate.portfolioUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[#34343c] bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-[#d4d4d8] hover:bg-white/[0.1]">
                  <Briefcase className="size-3.5" /> Portfolio <ExternalLink className="size-3" />
                </a>
              )}
              {candidate.socialMediaUrl && (
                <a href={candidate.socialMediaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-[#34343c] bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-[#d4d4d8] hover:bg-white/[0.1]">
                  <ExternalLink className="size-3.5" /> Sosial Media
                </a>
              )}
              <p className="text-[11px] text-[#666]">Apply: {fmtDate(candidate.createdAt)}</p>
            </div>
          </div>

          </div>

          {/* KOLOM KANAN: Manajemen Internal HR */}
          <div className="w-full md:w-[320px] shrink-0 space-y-5">
            
            {/* Status Update (Dipindah ke atas HR Form) */}
            <div className="rounded-md border border-[#3b82f6]/30 bg-[#3b82f6]/[0.04] p-4">
              <label className={labelCls}>Status Pipeline</label>
              <Select value={candidate.status} onValueChange={handleStatus} disabled={updatingStatus}>
                <SelectTrigger className="h-9 border-[#3b82f6]/50 bg-black/40 text-xs text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECRUITMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Form internal HR */}
            <div className="rounded-md border border-[#d11a2a]/30 bg-[#d11a2a]/[0.04] p-4">
              <p className="mb-4 text-[11px] font-bold uppercase tracking-wider text-[#d11a2a]">Catatan Internal HR</p>
              <div className="space-y-3">
              <div>
                <label className={labelCls}>Score (1–10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="mis. 8"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Notes / Catatan HR</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan untuk kandidat ini…"
                  rows={4}
                  className={`${inputCls} resize-none`}
                />
              </div>

              {/* Seksi Jadwal Interview */}
              <div className="rounded border border-[#34343c] bg-black/10 p-3 mt-2 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#ffd08a]">Jadwal Interview</p>
                <div>
                  <label className={labelCls}>Tanggal & Jam Interview</label>
                  <input
                    type="datetime-local"
                    value={interviewDate}
                    onChange={(e) => setInterviewDate(e.target.value)}
                    className={inputCls}
                  />
                  <p className="mt-1 text-[10px] text-[#888]">
                    Tentukan jadwal ini sebelum mengubah status menjadi &quot;Interview Scheduled&quot;. Notifikasi WA otomatis akan terkirim.
                  </p>
                </div>
                <div>
                  <label className={labelCls}>Link Meeting / Lokasi</label>
                  <input
                    type="text"
                    value={interviewLink}
                    onChange={(e) => setInterviewLink(e.target.value)}
                    placeholder="mis. https://meet.google.com/xxx atau GARAGE Tebing Tinggi"
                    className={inputCls}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>Follow-up Date</label>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Assigned To</label>
                <input
                  type="text"
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  placeholder="Nama HR / interviewer"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Final Decision</label>
                <input
                  type="text"
                  value={finalDecision}
                  onChange={(e) => setFinalDecision(e.target.value)}
                  placeholder="mis. Diterima Barista Outlet A"
                  className={inputCls}
                />
              </div>

              {saveError && (
                <p className="rounded-md border border-[#ef444455] bg-[#ef444414] px-3 py-2 text-xs text-[#fca5a5]">{saveError}</p>
              )}

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className={`flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-sm font-bold transition-colors ${saving ? "bg-[#7a0f0f] cursor-wait" : "bg-[#d11a2a] hover:bg-[#b01525]"} text-white`}
              >
                {savedOk ? <CheckCircle2 className="size-4" /> : <Save className="size-4" />}
                {saving ? "Menyimpan…" : savedOk ? "Tersimpan!" : "Simpan Catatan"}
              </button>
            </div>
          </div>

          {/* WhatsApp CTA */}
          <a
            href={whatsappLink(candidate.whatsapp, candidate.fullName, candidate.appliedPosition)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#25d366] py-2.5 text-sm font-bold text-[#06130a] transition-colors hover:bg-[#20bc5a]"
          >
            <MessageCircle className="size-4" />
            Follow Up via WhatsApp
          </a>
        </div>
      </aside>
    </div>
  );
}

// ─── Positions Manager ────────────────────────────────────────────────────────

function PositionsManager() {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ slug: "", title: "", location: "Tebing Tinggi", type: "Full-time", experience: "", description: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<PositionsApiResp>("/api/admin/recruitment/positions", { cache: "no-store" });
      setPositions(res.positions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat posisi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { 
    // eslint-disable-next-line
    void load(); 
  }, [load]);

  async function toggleOpen(pos: PositionRow) {
    setToggling(pos.id);
    try {
      await garageApi.patch(`/api/admin/recruitment/positions/${pos.id}`, { isOpen: !pos.isOpen });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal update posisi.");
    } finally {
      setToggling(null);
    }
  }

  async function deletePos(id: string) {
    if (!confirm("Yakin hapus posisi ini?")) return;
    setDeleting(id);
    try {
      await fetch(`/api/admin/recruitment/positions/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal hapus posisi.");
    } finally {
      setDeleting(null);
    }
  }

  async function addPosition(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true);
    setAddError(null);
    try {
      await garageApi.post("/api/admin/recruitment/positions", {
        ...addForm,
        slug: addForm.slug || addForm.title.toLowerCase().replace(/\s+/g, "-"),
      });
      setAddForm({ slug: "", title: "", location: "Tebing Tinggi", type: "Full-time", experience: "", description: "" });
      setShowAdd(false);
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Gagal tambah posisi.");
    } finally {
      setAddSaving(false);
    }
  }

  const inputCls = "rounded-md border border-[#34343c] bg-black/20 px-2.5 py-1.5 text-xs text-white placeholder-[#666] focus:border-[#d11a2a]/60 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white">Kelola Posisi</h3>
          <p className="text-xs text-[#888]">Buka/tutup posisi tanpa deploy ulang.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="garage-press h-9 gap-2 border-[#34343c] bg-white/[0.04] px-3 text-xs"
          onClick={() => setShowAdd((v) => !v)}
        >
          <Plus className="size-3.5" />
          Tambah Posisi
        </Button>
      </div>

      {error && <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffb4bd]">{error}</div>}

      {showAdd && (
        <form onSubmit={(e) => void addPosition(e)} className="rounded-md border border-[#34343c] bg-white/[0.02] p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-[#d11a2a]">Posisi Baru</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="block text-[11px] text-[#888] mb-1">Judul Posisi *</label><input required value={addForm.title} onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))} placeholder="mis. Barista" className={`${inputCls} w-full`} /></div>
            <div><label className="block text-[11px] text-[#888] mb-1">Lokasi</label><input value={addForm.location} onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))} placeholder="Tebing Tinggi" className={`${inputCls} w-full`} /></div>
            <div><label className="block text-[11px] text-[#888] mb-1">Tipe</label><input value={addForm.type} onChange={(e) => setAddForm((f) => ({ ...f, type: e.target.value }))} placeholder="Full-time" className={`${inputCls} w-full`} /></div>
            <div><label className="block text-[11px] text-[#888] mb-1">Pengalaman</label><input value={addForm.experience} onChange={(e) => setAddForm((f) => ({ ...f, experience: e.target.value }))} placeholder="Fresh graduate / berpengalaman" className={`${inputCls} w-full`} /></div>
            <div className="sm:col-span-2"><label className="block text-[11px] text-[#888] mb-1">Deskripsi</label><textarea rows={2} value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} placeholder="Tanggung jawab posisi…" className={`${inputCls} w-full resize-none`} /></div>
          </div>
          {addError && <p className="text-xs text-[#fca5a5]">{addError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={addSaving} className="rounded-md bg-[#d11a2a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#b01525]">
              {addSaving ? "Menyimpan…" : "Simpan Posisi"}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="rounded-md border border-[#34343c] px-3 py-1.5 text-xs text-[#888] hover:text-white">Batal</button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="py-6 text-center text-sm text-[#888]">Memuat posisi…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[#34343c]">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[#34343c] bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-[#8f8f99]">
                <th className="p-3">Posisi</th>
                <th className="p-3">Lokasi / Tipe</th>
                <th className="p-3">Pengalaman</th>
                <th className="p-3">Status</th>
                <th className="p-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#34343c]">
              {positions.map((pos) => (
                <tr key={pos.id} className="bg-white/[0.02] align-top hover:bg-white/[0.04]">
                  <td className="p-3">
                    <p className="font-bold text-white">{pos.title}</p>
                    <p className="text-[11px] text-[#666]">{pos.description.slice(0, 60)}{pos.description.length > 60 ? "…" : ""}</p>
                  </td>
                  <td className="p-3 text-[#d4d4d8] text-xs">{pos.location}<br /><span className="text-[#888]">{pos.type}</span></td>
                  <td className="p-3 text-xs text-[#d4d4d8]">{pos.experience || "—"}</td>
                  <td className="p-3">
                    <Badge className={pos.isOpen ? "border-[#22c55e]/45 bg-[#22c55e]/14 text-[#bbf7d0]" : "border-[#34343c] bg-white/[0.04] text-[#888]"}>
                      {pos.isOpen ? "Buka" : "Tutup"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={toggling === pos.id}
                        onClick={() => void toggleOpen(pos)}
                        className="flex items-center gap-1 rounded border border-[#34343c] px-2 py-1 text-[11px] text-[#d4d4d8] hover:border-[#f5a742]/40 hover:text-[#ffd08a]"
                      >
                        {pos.isOpen ? <ToggleRight className="size-3.5 text-[#22c55e]" /> : <ToggleLeft className="size-3.5 text-[#888]" />}
                        {pos.isOpen ? "Tutup" : "Buka"}
                      </button>
                      <button
                        type="button"
                        disabled={deleting === pos.id}
                        onClick={() => void deletePos(pos.id)}
                        className="flex items-center gap-1 rounded border border-[#34343c] px-2 py-1 text-[11px] text-[#888] hover:border-[#d11a2a]/40 hover:text-[#fca5a5]"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main RecruitmentView ─────────────────────────────────────────────────────

export function RecruitmentView() {
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"candidates" | "positions">("candidates");

  const load = useCallback(async (pageToLoad: number) => {
    setLoading(true);
    setError(null);
    try {
      const qp = new URLSearchParams();
      if (statusFilter !== "all") qp.set("status", statusFilter);
      if (positionFilter !== "all") qp.set("position", positionFilter);
      if (q.trim()) qp.set("q", q.trim());
      qp.set("page", pageToLoad.toString());
      qp.set("pageSize", "25");
      const resp = await garageApi.get<ApiResp>(
        `/api/recruitment/candidates?${qp.toString()}`,
        { cache: "no-store" },
      );
      setData(resp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat kandidat.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, positionFilter, q]);

  useEffect(() => {
    // eslint-disable-next-line
    void load(page);
  }, [load, page]);

  // Search dengan debounce
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      void load(1);
    }, 350);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [q]);

  async function updateStatus(candidate: Candidate, status: string) {
    setUpdatingId(candidate.id);
    setError(null);
    try {
      await garageApi.patch<{ candidate: Candidate }>(`/api/recruitment/candidates/${candidate.id}`, { status });
      // Update candidate in list & in drawer optimistically
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((c) => c.id === candidate.id ? { ...c, status } : c),
        };
      });
      if (selectedCandidate?.id === candidate.id) {
        setSelectedCandidate((prev) => prev ? { ...prev, status } : prev);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal update status kandidat.");
    } finally {
      setUpdatingId(null);
    }
  }

  const stats = data?.stats;

  const STAT_CARDS = [
    { label: "Total", value: stats?.total ?? 0 },
    { label: "Baru", value: stats?.byStatus["Pelamar Baru"] ?? 0, hot: true },
    { label: "Review", value: stats?.byStatus["Sedang Direview"] ?? 0 },
    { label: "Interview", value: (stats?.byStatus["Dijadwalkan Interview"] ?? 0) + (stats?.byStatus["Selesai Interview"] ?? 0) },
    { label: "Diterima", value: stats?.byStatus["Diterima"] ?? 0 },
    { label: "Ditolak", value: stats?.byStatus["Ditolak"] ?? 0 },
  ];

  const funnelData = [
    { name: "Pelamar Masuk", value: stats?.total ?? 0, fill: "#3b82f6" },
    { name: "Diproses", value: (stats?.total ?? 0) - (stats?.byStatus["Pelamar Baru"] ?? 0) - (stats?.byStatus["Ditolak"] ?? 0), fill: "#8b5cf6" },
    { name: "Lolos Interview", value: (stats?.byStatus["Selesai Interview"] ?? 0) + (stats?.byStatus["Diterima"] ?? 0), fill: "#ec4899" },
    { name: "Diterima", value: stats?.byStatus["Diterima"] ?? 0, fill: "#22c55e" },
  ].filter(d => d.value > 0);

  return (
    <>
      {/* Detail Drawer */}
      {selectedCandidate && (
        <CandidateDrawer
          candidate={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          onStatusChange={updateStatus}
          onSaved={() => void load(page)}
        />
      )}

      <section className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">Recruitment</h2>
            <p className="text-sm text-[#a1a1aa]">Kelola kandidat open hiring Garage.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-9 gap-2 border-[#34343c] bg-white/[0.04] px-3 text-xs"
            onClick={() => void load(page)}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[#34343c]">
          {(["candidates", "positions"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-[#d11a2a] text-white" : "border-transparent text-[#888] hover:text-[#d4d4d8]"}`}
            >
              {tab === "candidates" ? "Kandidat" : "Kelola Posisi"}
            </button>
          ))}
        </div>

        {activeTab === "positions" ? (
          <PositionsManager />
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {STAT_CARDS.map((s) => (
                <div key={s.label} className={`rounded-md border p-3 ${s.hot && (s.value > 0) ? "border-[#3b82f6]/45 bg-[#3b82f6]/10" : "border-[#34343c] bg-white/[0.03]"}`}>
                  <p className="text-[10px] uppercase tracking-wider text-[#8f8f99]">{s.label}</p>
                  <p className={`mt-1 text-2xl font-black ${s.hot && s.value > 0 ? "text-[#bfdbfe]" : "text-white"}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Funnel Analytics - UX Pro Max */}
            {funnelData.length > 0 && (() => {
              const maxVal = Math.max(...funnelData.map(d => d.value), 1);
              return (
                <div className="rounded-xl border border-[#34343c] bg-gradient-to-b from-[#141418] to-[#0c0c0e] p-6 shadow-xl">
                  <div className="mb-8 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black tracking-wide text-white">Pipeline Konversi Kandidat</h3>
                      <p className="mt-1 text-[11px] text-[#888]">Menganalisis tingkat kelulusan tiap tahapan rekrutmen</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-[#d11a2a]/20 bg-[#d11a2a]/10 px-3 py-1.5 text-xs font-bold text-[#d11a2a]">
                      <User className="size-3.5" />
                      Total: {maxVal}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center">
                    {funnelData.map((d, i) => {
                      const widthPercent = Math.max((d.value / maxVal) * 100, 20); // Min 20% width
                      const isLast = i === funnelData.length - 1;
                      return (
                        <div key={d.name} className="group relative flex w-full flex-col items-center">
                          <div 
                            className="flex h-12 items-center justify-between rounded-lg border px-4 transition-all duration-300 group-hover:scale-[1.01] group-hover:brightness-125"
                            style={{ 
                              width: `${widthPercent}%`,
                              backgroundImage: `linear-gradient(135deg, ${d.fill}15, ${d.fill}35)`,
                              borderColor: `${d.fill}45`,
                              boxShadow: `0 4px 20px -5px ${d.fill}30`
                            }}
                          >
                            <span className="truncate text-xs font-bold text-white drop-shadow">
                              {d.name}
                            </span>
                            <div className="flex items-center gap-3">
                              <span className="hidden sm:inline-block text-[11px] font-medium text-white/60">
                                {Math.round((d.value / maxVal) * 100)}%
                              </span>
                              <span 
                                className="flex min-w-[28px] items-center justify-center rounded bg-black/40 px-1.5 py-0.5 text-xs font-black" 
                                style={{ color: d.fill }}
                              >
                                {d.value}
                              </span>
                            </div>
                          </div>
                          {!isLast && (
                            <div className="my-1.5 flex h-5 w-full flex-col items-center justify-center">
                              <div className="h-full w-px bg-gradient-to-b from-white/20 to-transparent" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Filters */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8f8f99]" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari nama / WA / email / posisi…"
                  className="h-9 border-[#34343c] bg-black/20 pl-9 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="all">Semua status</SelectItem>
                  {RECRUITMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={positionFilter} onValueChange={(v) => { setPositionFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 border-[#34343c] bg-black/20 text-xs">
                  <SelectValue placeholder="Posisi" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  <SelectItem value="all">Semua posisi</SelectItem>
                  {RECRUITMENT_POSITIONS.map((p) => (
                    <SelectItem key={p.slug} value={p.title}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {error && (
              <div className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffb4bd]">{error}</div>
            )}

            {/* Table */}
            <div className="garage-scroll overflow-x-auto rounded-md border border-[#34343c]">
              <table className="w-full min-w-[840px] text-sm">
                <thead>
                  <tr className="border-b border-[#34343c] bg-white/[0.03] text-left text-[11px] uppercase tracking-wider text-[#8f8f99]">
                    <th className="p-3">Kandidat</th>
                    <th className="p-3">Posisi</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Apply</th>
                    <th className="p-3">CV</th>
                    <th className="p-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#34343c]">
                  {loading ? (
                    <tr><td colSpan={6} className="p-6 text-center text-[#888]">Memuat kandidat…</td></tr>
                  ) : (data?.items ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-[#888]">Belum ada kandidat.</td></tr>
                  ) : (
                    (data?.items ?? []).map((c) => (
                      <tr key={c.id} className="bg-white/[0.02] align-top hover:bg-white/[0.04]">
                        <td className="p-3">
                          <p className="font-bold text-white">{c.fullName}</p>
                          <p className="text-xs text-[#a1a1aa]">{c.whatsapp} · {c.domicile}</p>
                        </td>
                        <td className="p-3 text-[#d4d4d8]">
                          {c.appliedPosition}
                          {c.preferredLocation ? <span className="block text-xs text-[#888]">{c.preferredLocation}</span> : null}
                        </td>
                        <td className="p-3 min-w-[160px]">
                          <Select
                            value={c.status}
                            onValueChange={(v) => void updateStatus(c, v)}
                            disabled={updatingId === c.id}
                          >
                            <SelectTrigger className="h-7 border-transparent bg-transparent p-0 text-xs shadow-none focus:ring-0">
                              <Badge className={`${statusTone[c.status] ?? "border-[#34343c] bg-white/[0.06] text-[#d4d4d8]"} cursor-pointer text-[11px]`}>
                                {updatingId === c.id ? "…" : c.status}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4}>
                              {RECRUITMENT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-xs text-[#a1a1aa]">{fmtDate(c.createdAt)}</td>
                        <td className="p-3">
                          {c.cvUrl ? (
                            <a href={c.cvUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#bbf7d0] hover:underline">
                              <FileText className="size-3.5" /> CV <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <span className="text-xs text-[#666]">—</span>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedCandidate(c)}
                              className="flex h-7 items-center gap-1 rounded border border-[#34343c] px-2 text-[11px] text-[#d4d4d8] transition-colors hover:border-[#d11a2a]/40 hover:text-white"
                            >
                              <BookOpen className="size-3.5" /> Detail
                            </button>
                            <a
                              href={whatsappLink(c.whatsapp, c.fullName, c.appliedPosition)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-7 items-center gap-1 rounded border border-[#25d366]/30 bg-[#25d366]/10 px-2 text-[11px] text-[#bbf7d0] transition-colors hover:bg-[#25d366]/20"
                            >
                              <MessageCircle className="size-3.5" /> WA
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-[#888]">
                  Halaman {data.page} dari {data.totalPages} · {data.total} kandidat total
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => p - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-[#34343c] text-[#888] disabled:opacity-40 hover:border-[#d11a2a]/40 hover:text-white"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  {Array.from({ length: Math.min(data.totalPages, 7) }, (_, i) => {
                    const p = data.totalPages <= 7 ? i + 1 : Math.max(1, page - 3) + i;
                    if (p > data.totalPages) return null;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={`flex h-7 w-7 items-center justify-center rounded border text-xs font-semibold transition-colors ${p === page ? "border-[#d11a2a]/45 bg-[#d11a2a]/18 text-white" : "border-[#34343c] text-[#888] hover:border-[#d11a2a]/40 hover:text-white"}`}
                      >
                        {p}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={page >= data.totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded border border-[#34343c] text-[#888] disabled:opacity-40 hover:border-[#d11a2a]/40 hover:text-white"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            )}
            {data && data.totalPages <= 1 && (
              <p className="px-1 text-xs text-[#888]">
                Menampilkan {data.items.length} dari {data.total} kandidat.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
