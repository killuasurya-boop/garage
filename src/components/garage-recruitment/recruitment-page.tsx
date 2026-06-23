"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  FileText,
  ImageIcon,
  Loader2,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  User,
} from "lucide-react";

import type { RecruitmentPosition } from "@/lib/garage-recruitment-data";
import { ApplicantTracker } from "./applicant-tracker";

const RECRUITMENT_WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/HQ6hItzXVgULWHVwlw7mDd";
const DRAFT_KEY = "garage-recruitment-draft-v2";
const DATABASE_RETRY_MESSAGE = "Sistem recruitment sedang menyiapkan database. Coba kirim ulang beberapa saat lagi.";

function publicRecruitmentError(message: unknown, fallback: string) {
  if (typeof message !== "string" || !message.trim()) return fallback;
  if (/PGlite|ensureDatabaseReady|database|DB_|Aborted/i.test(message)) {
    return DATABASE_RETRY_MESSAGE;
  }
  return message;
}

const SKILL_OPTIONS = [
  "Kasir",
  "Barista",
  "Kitchen / Dapur",
  "Waiter / Waitress",
  "Cleaning",
  "Admin",
  "Social Media",
  "Design",
  "Customer Service",
  "Leadership",
  "Lainnya",
];

const SKILL_LEVELS = ["Pemula", "Menengah", "Mahir", "Berpengalaman"] as const;
const WORK_TYPES = ["Full-time", "Part-time", "Freelance"] as const;
const REFERRAL_SOURCES = [
  "Instagram",
  "TikTok",
  "Facebook",
  "Teman / Kenalan",
  "Poster di Outlet",
  "Website GARAGE",
  "Job Portal",
  "Lainnya",
] as const;

type UploadKind = "cv" | "photo" | "ktp" | "portfolio" | "certificate";

type UploadRule = {
  kind: UploadKind;
  label: string;
  required?: boolean;
  accept: string;
  helper: string;
  maxBytes: number;
  allowed: string[];
  preview?: boolean;
};

const UPLOAD_RULES: Record<UploadKind, UploadRule> = {
  cv: {
    kind: "cv",
    label: "CV / Resume",
    required: true,
    accept: ".pdf,.doc,.docx",
    helper: "PDF, DOC, DOCX. Maksimal 5 MB.",
    maxBytes: 5 * 1024 * 1024,
    allowed: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  photo: {
    kind: "photo",
    label: "Pas foto",
    required: true,
    accept: ".jpg,.jpeg,.png,.webp",
    helper: "JPG, PNG, WebP. Maksimal 3 MB.",
    maxBytes: 3 * 1024 * 1024,
    allowed: ["image/jpeg", "image/png", "image/webp"],
    preview: true,
  },
  ktp: {
    kind: "ktp",
    label: "KTP (opsional)",
    accept: ".jpg,.jpeg,.png,.pdf",
    helper: "Opsional. Diminta lagi saat interview/final bila diperlukan.",
    maxBytes: 5 * 1024 * 1024,
    allowed: ["application/pdf", "image/jpeg", "image/png"],
  },
  portfolio: {
    kind: "portfolio",
    label: "Portfolio file (opsional)",
    accept: ".pdf,.jpg,.jpeg,.png",
    helper: "PDF, JPG, PNG. Maksimal 10 MB.",
    maxBytes: 10 * 1024 * 1024,
    allowed: ["application/pdf", "image/jpeg", "image/png"],
  },
  certificate: {
    kind: "certificate",
    label: "Sertifikat (opsional)",
    accept: ".pdf,.jpg,.jpeg,.png",
    helper: "PDF, JPG, PNG. Maksimal 10 MB.",
    maxBytes: 10 * 1024 * 1024,
    allowed: ["application/pdf", "image/jpeg", "image/png"],
  },
};

type UploadedFile = {
  file: File;
  url: string;
  progress: number;
  status: "ready" | "uploading" | "done" | "error";
  error?: string;
  previewUrl?: string;
};

type FormState = {
  appliedPosition: string;
  preferredLocation: string;
  workType: string;
  availableStartDate: string;
  fullName: string;
  whatsapp: string;
  email: string;
  domicile: string;
  birthDate: string;
  education: string;
  mainSkill: string;
  skillLevel: string;
  lastExperience: string;
  motivation: string;
  instagramUrl: string;
  tiktokUrl: string;
  linkedinUrl: string;
  portfolioUrl: string;
  referralSource: string;
  consent: boolean;
};

const emptyForm: FormState = {
  appliedPosition: "",
  preferredLocation: "",
  workType: "Full-time",
  availableStartDate: "",
  fullName: "",
  whatsapp: "",
  email: "",
  domicile: "",
  birthDate: "",
  education: "",
  mainSkill: "",
  skillLevel: "",
  lastExperience: "",
  motivation: "",
  instagramUrl: "",
  tiktokUrl: "",
  linkedinUrl: "",
  portfolioUrl: "",
  referralSource: "",
  consent: false,
};

const steps = [
  { id: 1, label: "Posisi", icon: BriefcaseBusiness },
  { id: 2, label: "Data diri", icon: User },
  { id: 3, label: "Skill", icon: FileCheck2 },
  { id: 4, label: "Social", icon: MessageCircle },
  { id: 5, label: "Berkas", icon: UploadCloud },
  { id: 6, label: "Review", icon: ShieldCheck },
];

const inputClass =
  "h-11 w-full rounded-lg border border-zinc-700/80 bg-zinc-950/70 px-3 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-[#d11a2a]/80 focus:bg-zinc-950";
const textAreaClass =
  "min-h-[112px] w-full rounded-lg border border-zinc-700/80 bg-zinc-950/70 px-3 py-3 text-sm leading-relaxed text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-[#d11a2a]/80 focus:bg-zinc-950";
const labelClass = "mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-zinc-400";

function validateFile(file: File, rule: UploadRule) {
  if (!rule.allowed.includes(file.type)) return `${rule.label}: format file tidak sesuai. ${rule.helper}`;
  if (file.size > rule.maxBytes) return `${rule.label}: ukuran file terlalu besar. ${rule.helper}`;
  return null;
}

function formatSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadBox({
  rule,
  value,
  onChange,
}: {
  rule: UploadRule;
  value: UploadedFile | null;
  onChange: (next: UploadedFile | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    };
  }, [value?.previewUrl]);

  async function upload(file: File) {
    const validation = validateFile(file, rule);
    if (validation) {
      onChange({ file, url: "", progress: 0, status: "error", error: validation });
      return;
    }

    const previewUrl = rule.preview ? URL.createObjectURL(file) : undefined;
    onChange({ file, url: "", progress: 28, status: "uploading", previewUrl });

    const progressTimer = window.setInterval(() => {
      onChange({ file, url: "", progress: 72, status: "uploading", previewUrl });
    }, 260);

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", rule.kind);
      const res = await fetch("/api/recruitment/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Upload file gagal.");
      onChange({ file, url: json.data.url, progress: 100, status: "done", previewUrl });
    } catch (err) {
      onChange({
        file,
        url: "",
        progress: 100,
        status: "error",
        previewUrl,
        error: err instanceof Error ? err.message : "Upload file gagal.",
      });
    } finally {
      window.clearInterval(progressTimer);
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(file);
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-zinc-50">
            {rule.label} {rule.required ? <span className="text-[#ef4444]">*</span> : null}
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{rule.helper}</p>
        </div>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-[#ef4444]/35 px-2 text-xs font-bold text-[#fca5a5] transition hover:bg-[#ef4444]/10"
          >
            <Trash2 className="size-3.5" /> Hapus
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={`flex min-h-[132px] w-full flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center transition ${
          dragging ? "border-[#d11a2a] bg-[#d11a2a]/10" : "border-zinc-700 bg-zinc-900/40 hover:border-[#d11a2a]/60"
        }`}
      >
        {value?.previewUrl && rule.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.previewUrl} alt="Preview pas foto" className="mb-3 h-24 w-24 rounded-lg object-cover" />
        ) : (
          <UploadCloud className="mb-3 size-7 text-[#d11a2a]" />
        )}
        <span className="max-w-full truncate text-sm font-bold text-zinc-50">
          {value ? value.file.name : "Drag & drop atau klik untuk pilih file"}
        </span>
        <span className="mt-1 text-xs text-zinc-500">
          {value ? `${formatSize(value.file.size)} - klik untuk ganti file` : "Upload langsung divalidasi sebelum submit"}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={rule.accept}
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />

      {value ? (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${
                value.status === "error" ? "bg-[#ef4444]" : value.status === "done" ? "bg-[#22c55e]" : "bg-[#d11a2a]"
              }`}
              style={{ width: `${value.progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {value.status === "uploading" ? <Loader2 className="size-3.5 animate-spin text-[#facc15]" /> : null}
            {value.status === "done" ? <CheckCircle2 className="size-3.5 text-[#22c55e]" /> : null}
            {value.status === "error" ? <AlertCircle className="size-3.5 text-[#ef4444]" /> : null}
            <span className={value.status === "error" ? "text-[#fca5a5]" : "text-zinc-400"}>
              {value.status === "uploading"
                ? "Mengupload file..."
                : value.status === "done"
                  ? "Upload berhasil."
                  : value.error}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RecruitmentPage({ positions }: { positions: RecruitmentPosition[] }) {
  const [activeTab, setActiveTab] = useState<"apply" | "track">("apply");
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() => {
    if (typeof window === "undefined") return emptyForm;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      return raw ? { ...emptyForm, ...JSON.parse(raw) } : emptyForm;
    } catch {
      return emptyForm;
    }
  });
  const [files, setFiles] = useState<Record<UploadKind, UploadedFile | null>>({
    cv: null,
    photo: null,
    ktp: null,
    portfolio: null,
    certificate: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState(RECRUITMENT_WHATSAPP_GROUP_URL);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const selectedPosition = useMemo(
    () => positions.find((position) => position.title === form.appliedPosition),
    [form.appliedPosition, positions],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // localStorage can be unavailable in strict browser modes.
    }
  }, [form]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Auto-Fill data diri dari CV via AI (Gemini). Hanya mengisi field yang
  // MASIH KOSONG — tidak menimpa yang sudah kamu ketik manual.
  async function handleAutoFill() {
    const cv = files.cv?.file;
    if (!cv) {
      setAiMsg("Upload CV dulu (langkah Berkas) untuk Auto-Fill AI.");
      return;
    }
    setAiLoading(true);
    setAiMsg(null);
    try {
      const body = new FormData();
      body.append("file", cv);
      const res = await fetch("/api/recruitment/parse-cv", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error ?? "Auto-Fill gagal.");
      const data = (json.data ?? {}) as Record<string, string>;
      let filled = 0;
      setForm((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(data)) {
          if (!(k in next)) continue;
          const cur = String((prev as Record<string, unknown>)[k] ?? "").trim();
          if (typeof v === "string" && v.trim() && !cur) {
            (next as Record<string, unknown>)[k] = v.trim();
            filled++;
          }
        }
        return next;
      });
      setAiMsg(
        filled > 0
          ? `AI mengisi ${filled} field kosong dari CV. Cek langkah Data Diri & Skill, lengkapi sisanya.`
          : "AI tidak menemukan data baru (field sudah terisi atau CV kurang lengkap).",
      );
    } catch (e) {
      setAiMsg(e instanceof Error ? e.message : "Auto-Fill gagal.");
    } finally {
      setAiLoading(false);
    }
  }

  function scrollToForm(position?: string) {
    setActiveTab("apply");
    if (position) set("appliedPosition", position);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function stepError(currentStep = step) {
    if (currentStep === 1) {
      if (!form.appliedPosition) return "Pilih posisi yang ingin dilamar.";
      if (!form.preferredLocation.trim()) return "Isi lokasi kerja pilihan.";
      if (!form.workType) return "Pilih tipe kerja.";
      if (!form.availableStartDate) return "Isi tanggal ketersediaan mulai kerja.";
    }
    if (currentStep === 2) {
      if (!form.fullName.trim()) return "Nama lengkap wajib diisi.";
      if (!form.whatsapp.trim()) return "Nomor WhatsApp wajib diisi.";
      if (!form.email.trim()) return "Email wajib diisi.";
      if (!form.domicile.trim()) return "Domisili wajib diisi.";
      if (!form.education.trim()) return "Pendidikan terakhir wajib diisi.";
    }
    if (currentStep === 3) {
      if (!form.mainSkill.trim()) return "Skill utama wajib diisi.";
      if (!form.skillLevel) return "Level skill wajib dipilih.";
      if (!form.lastExperience.trim()) return "Pengalaman kerja wajib diisi.";
      if (!form.motivation.trim()) return "Alasan bergabung wajib diisi.";
    }
    if (currentStep === 4) {
      const needsSocial = /social|content|design/i.test(form.appliedPosition);
      if (needsSocial && !form.instagramUrl.trim() && !form.tiktokUrl.trim() && !form.linkedinUrl.trim() && !form.portfolioUrl.trim()) {
        return "Untuk posisi kreatif/social media, isi minimal satu social media atau portfolio.";
      }
    }
    if (currentStep === 5) {
      if (files.cv?.status !== "done") return "CV wajib diupload sampai berhasil.";
      if (files.photo?.status !== "done") return "Pas foto wajib diupload sampai berhasil.";
      const failed = Object.values(files).find((file) => file?.status === "error");
      if (failed?.error) return failed.error;
      const uploading = Object.values(files).some((file) => file?.status === "uploading");
      if (uploading) return "Tunggu semua upload selesai sebelum lanjut.";
    }
    if (currentStep === 6 && !form.consent) {
      return "Centang persetujuan penggunaan data recruitment.";
    }
    return null;
  }

  function nextStep() {
    const nextError = stepError();
    if (nextError) {
      setError(nextError);
      return;
    }
    setError(null);
    setStep((prev) => Math.min(prev + 1, steps.length));
  }

  function previousStep() {
    setError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const submitError = stepError(6);
    if (submitError) {
      setError(submitError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        willingShift: true,
        willingRelocate: false,
        cvUrl: files.cv?.url ?? "",
        photoUrl: files.photo?.url ?? "",
        ktpUrl: files.ktp?.url ?? "",
        certificateUrl: files.certificate?.url ?? "",
        portfolioUrl: files.portfolio?.url || form.portfolioUrl,
        socialMediaUrl: [form.instagramUrl, form.tiktokUrl, form.linkedinUrl].filter(Boolean).join(" | "),
      };
      const res = await fetch("/api/recruitment/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(publicRecruitmentError(json?.error?.message, "Lamaran gagal dikirim."));
      }

      setSuccess(json.data.message);
      setWhatsappGroupUrl(json.data.whatsappGroupUrl ?? RECRUITMENT_WHATSAPP_GROUP_URL);
      setForm(emptyForm);
      setFiles({ cv: null, photo: null, ktp: null, portfolio: null, certificate: null });
      setStep(1);
      window.localStorage.removeItem(DRAFT_KEY);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldSummary = [
    ["Posisi", form.appliedPosition],
    ["Tipe kerja", form.workType],
    ["Nama", form.fullName],
    ["WhatsApp", form.whatsapp],
    ["Email", form.email],
    ["Domisili", form.domicile],
    ["Pendidikan", form.education],
    ["Skill", `${form.mainSkill} - ${form.skillLevel}`],
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#08080a] text-zinc-50 antialiased">
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#09090b]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 sm:gap-4">
          <Link href="/" className="flex items-center gap-3 text-white no-underline">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/garage-brand/logo-website.png" alt="GARAGE Coffee & Motor" className="h-6 w-auto object-contain sm:h-8" />
          </Link>
          <nav className="hidden shrink-0 rounded-full border border-zinc-800 bg-zinc-950/70 p-1 sm:flex">
            <button
              type="button"
              onClick={() => setActiveTab("apply")}
              className={`rounded-full px-2.5 py-2 text-[10px] font-black transition sm:px-4 sm:text-xs ${
                activeTab === "apply" ? "bg-[#d11a2a] text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Recruitment
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("track")}
              className={`hidden rounded-full px-2.5 py-2 text-[10px] font-black transition sm:inline-block sm:px-4 sm:text-xs ${
                activeTab === "track" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"
              }`}
            >
              Cek Status
            </button>
          </nav>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === "track" ? (
          <motion.div key="track" initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}>
            <div className="mx-auto max-w-3xl px-6 py-12 lg:px-10">
              <ApplicantTracker />
            </div>
          </motion.div>
        ) : (
          <motion.div key="apply" initial={false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}>
            <section className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-10 lg:py-16">
              <div className="flex min-w-0 flex-col justify-center">
                <p className="mb-4 text-xs font-black uppercase tracking-[0.18em] text-[#d11a2a] sm:tracking-[0.24em]">Garage Recruitment</p>
                <h1 className="max-w-[310px] break-words text-[1.62rem] font-black uppercase leading-[1.08] tracking-normal text-white sm:max-w-4xl sm:text-5xl lg:text-6xl xl:text-7xl">
                  Lamar kerja tanpa form yang bikin capek.
                </h1>
                <p className="mt-5 max-w-[315px] text-base leading-7 text-zinc-300 sm:max-w-2xl sm:text-lg">
                  Pilih posisi, isi data penting, upload berkas, lalu review sebelum dikirim. Data KTP tetap opsional dan hanya diakses tim internal.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => scrollToForm()}
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-[#d11a2a] px-6 text-sm font-black text-white shadow-[0_18px_50px_rgba(209,26,42,.32)] transition hover:bg-[#ef3344]"
                  >
                    Mulai Lamaran <ChevronRight className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("track")}
                    className="inline-flex h-12 items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/50 px-6 text-sm font-bold text-white transition hover:border-zinc-500"
                  >
                    Cek Status
                  </button>
                </div>
              </div>

              <div className="self-start rounded-2xl border border-zinc-800 bg-zinc-950/55 p-4 shadow-2xl shadow-black/20">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-zinc-400">Posisi Dibuka</p>
                <div className="grid gap-2">
                  {positions.slice(0, 5).map((position) => (
                    <button
                      key={position.slug}
                      type="button"
                      onClick={() => scrollToForm(position.title)}
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-900/45 p-3 text-left transition hover:border-[#d11a2a]/55 hover:bg-[#d11a2a]/10"
                    >
                      <p className="text-sm font-black text-white">{position.title}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">{position.location} - {position.type}</p>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section ref={formRef} className="border-t border-zinc-800 bg-[#0d0d10] py-10 lg:py-12">
              <div className="mx-auto max-w-5xl px-6 lg:px-10">
                {success ? (
                  <motion.div
                    initial={false}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mx-auto max-w-2xl rounded-2xl border border-[#22c55e]/35 bg-[#22c55e]/10 p-8 text-center"
                  >
                    <CheckCircle2 className="mx-auto mb-4 size-14 text-[#22c55e]" />
                    <h2 className="text-2xl font-black text-white">Lamaran Terkirim</h2>
                    <p className="mt-3 text-sm leading-6 text-[#d4d4d8]">{success}</p>
                    <a
                      href={whatsappGroupUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#25d366] px-5 text-sm font-black text-white no-underline"
                    >
                      <MessageCircle className="size-4" /> Gabung Grup WhatsApp
                    </a>
                  </motion.div>
                ) : (
                  <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-800 bg-[#111115] p-4 shadow-2xl shadow-black/20 sm:p-6">
                    <div className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
                      {steps.map((item) => {
                        const Icon = item.icon;
                        const active = step === item.id;
                        const done = step > item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (item.id < step) setStep(item.id);
                            }}
                            className={`min-h-[74px] rounded-xl border p-3 text-left transition ${
                              active
                                ? "border-[#d11a2a]/70 bg-[#d11a2a]/14"
                              : done
                                  ? "border-[#22c55e]/35 bg-[#22c55e]/8"
                                  : "border-zinc-800 bg-zinc-950/40"
                            }`}
                          >
                            <Icon className={`mb-2 size-4 ${active ? "text-[#ff7884]" : "text-[#a1a1aa]"}`} />
                            <p className="truncate text-xs font-black text-white">{item.label}</p>
                          </button>
                        );
                      })}
                    </div>

                    {error ? (
                      <div className="mb-5 flex gap-2 rounded-xl border border-[#ef4444]/35 bg-[#ef4444]/10 p-3 text-sm text-[#fca5a5]">
                        <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
                      </div>
                    ) : null}

                    <AnimatePresence mode="wait">
                      <motion.div key={step} initial={false} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }}>
                        {step === 1 ? (
                          <div className="grid gap-5 md:grid-cols-2">
                            <div className="md:col-span-2">
                              <label className={labelClass}>Posisi dilamar *</label>
                              <select className={inputClass} value={form.appliedPosition} onChange={(event) => set("appliedPosition", event.target.value)}>
                                <option value="">Pilih posisi</option>
                                {positions.map((position) => (
                                  <option key={position.slug} value={position.title}>{position.title}</option>
                                ))}
                              </select>
                              {selectedPosition ? <p className="mt-2 text-xs leading-5 text-zinc-400">{selectedPosition.description}</p> : null}
                            </div>
                            <div>
                              <label className={labelClass}>Lokasi kerja *</label>
                              <input className={inputClass} value={form.preferredLocation} onChange={(event) => set("preferredLocation", event.target.value)} placeholder="Tebing Tinggi / Hybrid" />
                            </div>
                            <div>
                              <label className={labelClass}>Tipe kerja *</label>
                              <select className={inputClass} value={form.workType} onChange={(event) => set("workType", event.target.value)}>
                                {WORK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass}>Ketersediaan mulai kerja *</label>
                              <input className={inputClass} type="date" value={form.availableStartDate} onChange={(event) => set("availableStartDate", event.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                              <label className={labelClass}>Dari mana kamu tahu lowongan ini?</label>
                              <select className={inputClass} value={form.referralSource} onChange={(event) => set("referralSource", event.target.value)}>
                                <option value="">Pilih sumber info (opsional)</option>
                                {REFERRAL_SOURCES.map((src) => <option key={src} value={src}>{src}</option>)}
                              </select>
                            </div>
                          </div>
                        ) : null}

                        {step === 2 ? (
                          <div className="grid gap-5 md:grid-cols-2">
                            <div>
                              <label className={labelClass}>Nama lengkap *</label>
                              <input className={inputClass} value={form.fullName} onChange={(event) => set("fullName", event.target.value)} />
                            </div>
                            <div>
                              <label className={labelClass}>WhatsApp aktif *</label>
                              <input className={inputClass} type="tel" value={form.whatsapp} onChange={(event) => set("whatsapp", event.target.value)} placeholder="08..." />
                            </div>
                            <div>
                              <label className={labelClass}>Email *</label>
                              <input className={inputClass} type="email" value={form.email} onChange={(event) => set("email", event.target.value)} />
                            </div>
                            <div>
                              <label className={labelClass}>Domisili *</label>
                              <input className={inputClass} value={form.domicile} onChange={(event) => set("domicile", event.target.value)} />
                            </div>
                            <div>
                              <label className={labelClass}>Tanggal lahir</label>
                              <input className={inputClass} type="date" value={form.birthDate} onChange={(event) => set("birthDate", event.target.value)} />
                            </div>
                            <div>
                              <label className={labelClass}>Pendidikan terakhir *</label>
                              <input className={inputClass} value={form.education} onChange={(event) => set("education", event.target.value)} placeholder="SMA / SMK / S1" />
                            </div>
                          </div>
                        ) : null}

                        {step === 3 ? (
                          <div className="grid gap-5 md:grid-cols-2">
                            <div>
                              <label className={labelClass}>Skill utama *</label>
                              <select className={inputClass} value={form.mainSkill} onChange={(event) => set("mainSkill", event.target.value)}>
                                <option value="">Pilih skill</option>
                                {SKILL_OPTIONS.map((skill) => <option key={skill} value={skill}>{skill}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className={labelClass}>Level skill *</label>
                              <select className={inputClass} value={form.skillLevel} onChange={(event) => set("skillLevel", event.target.value)}>
                                <option value="">Pilih level</option>
                                {SKILL_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                              </select>
                            </div>
                            <div className="md:col-span-2">
                              <label className={labelClass}>Pengalaman kerja *</label>
                              <textarea className={textAreaClass} value={form.lastExperience} onChange={(event) => set("lastExperience", event.target.value)} placeholder="Ceritakan pengalaman kerja atau pengalaman organisasi yang relevan." />
                            </div>
                            <div className="md:col-span-2">
                              <label className={labelClass}>Alasan ingin bergabung *</label>
                              <textarea className={textAreaClass} value={form.motivation} onChange={(event) => set("motivation", event.target.value)} placeholder="Kenapa kamu ingin bergabung dengan Garage?" />
                            </div>
                          </div>
                        ) : null}

                        {step === 4 ? (
                          <div className="grid gap-5 md:grid-cols-2">
                            <div>
                              <label className={labelClass}>Instagram</label>
                              <input className={inputClass} value={form.instagramUrl} onChange={(event) => set("instagramUrl", event.target.value)} placeholder="https://instagram.com/..." />
                            </div>
                            <div>
                              <label className={labelClass}>TikTok</label>
                              <input className={inputClass} value={form.tiktokUrl} onChange={(event) => set("tiktokUrl", event.target.value)} placeholder="https://tiktok.com/@..." />
                            </div>
                            <div>
                              <label className={labelClass}>LinkedIn</label>
                              <input className={inputClass} value={form.linkedinUrl} onChange={(event) => set("linkedinUrl", event.target.value)} placeholder="https://linkedin.com/in/..." />
                            </div>
                            <div>
                              <label className={labelClass}>Portfolio / Website</label>
                              <input className={inputClass} value={form.portfolioUrl} onChange={(event) => set("portfolioUrl", event.target.value)} placeholder="https://..." />
                            </div>
                            <div className="rounded-xl border border-[#facc15]/25 bg-[#facc15]/8 p-3 text-sm leading-6 text-[#fde68a] md:col-span-2">
                              Social media opsional, kecuali untuk posisi Social Media, Content Creator, atau Design. Untuk posisi kreatif, isi minimal satu link.
                            </div>
                          </div>
                        ) : null}

                        {step === 5 ? (
                          <div className="space-y-4">
                            <div className="rounded-xl border border-[#d11a2a]/40 bg-gradient-to-br from-[#d11a2a]/12 to-zinc-950/40 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="flex items-center gap-2 text-sm font-black text-white">
                                    <Sparkles className="h-4 w-4 text-[#f5a742]" /> Auto-Fill dari CV (AI)
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-400">
                                    Upload CV dulu, lalu AI mengisi otomatis data diri yang masih kosong. Tetap bisa kamu edit.
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleAutoFill}
                                  disabled={aiLoading || files.cv?.status !== "done"}
                                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#d11a2a] px-4 text-sm font-bold text-white transition hover:bg-[#b3121f] disabled:opacity-50"
                                >
                                  {aiLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4" />
                                  )}
                                  {aiLoading ? "Membaca CV..." : "Auto-Fill"}
                                </button>
                              </div>
                              {aiMsg ? (
                                <p className="mt-3 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 py-2 text-xs text-zinc-200">
                                  {aiMsg}
                                </p>
                              ) : null}
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                              {(Object.keys(UPLOAD_RULES) as UploadKind[]).map((kind) => (
                                <UploadBox
                                  key={kind}
                                  rule={UPLOAD_RULES[kind]}
                                  value={files[kind]}
                                  onChange={(next) => setFiles((prev) => ({ ...prev, [kind]: next }))}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {step === 6 ? (
                          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-4">
                              <h3 className="mb-4 text-lg font-black text-white">Review Data Lamaran</h3>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {fieldSummary.map(([label, value]) => (
                                  <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
                                    <p className="mt-1 text-sm font-semibold text-white">{value || "-"}</p>
                                  </div>
                                ))}
                              </div>
                              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                                <input
                                  type="checkbox"
                                  checked={form.consent}
                                  onChange={(event) => set("consent", event.target.checked)}
                                  className="mt-1 size-4"
                                />
                                <span className="text-sm leading-6 text-[#d4d4d8]">
                                  Saya menyetujui bahwa data saya digunakan oleh Garage untuk proses recruitment.
                                </span>
                              </label>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-4">
                              <h3 className="mb-4 text-sm font-black uppercase tracking-[0.16em] text-zinc-400">File yang diupload</h3>
                              <div className="space-y-2">
                                {(["cv", "photo", "ktp", "portfolio", "certificate"] as UploadKind[]).map((kind) => {
                                  const uploaded = files[kind];
                                  return (
                                    <div key={kind} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-xs">
                                      {kind === "photo" ? <ImageIcon className="size-4 text-[#d11a2a]" /> : <FileText className="size-4 text-[#d11a2a]" />}
                                      <span className="min-w-0 flex-1 truncate text-[#d4d4d8]">{uploaded?.file.name ?? `${UPLOAD_RULES[kind].label}: belum diupload`}</span>
                                      {uploaded?.status === "done" ? <CheckCircle2 className="size-4 text-[#22c55e]" /> : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </motion.div>
                    </AnimatePresence>

                    <div className="mt-8 flex items-center justify-between gap-3 border-t border-zinc-800 pt-5">
                      <button
                        type="button"
                        onClick={previousStep}
                        disabled={step === 1 || submitting}
                        className="inline-flex h-11 items-center gap-2 rounded-full border border-zinc-700 px-5 text-sm font-bold text-white transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="size-4" /> Kembali
                      </button>
                      {step < steps.length ? (
                        <button
                          type="button"
                          onClick={nextStep}
                          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#d11a2a] px-5 text-sm font-black text-white transition hover:bg-[#ef3344]"
                        >
                          Lanjut <ChevronRight className="size-4" />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={submitting}
                          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#d11a2a] px-5 text-sm font-black text-white transition hover:bg-[#ef3344] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                          Kirim Lamaran
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
