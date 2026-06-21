"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, CheckCircle2, ChevronRight, UploadCloud, User, FileText, Send, Eye } from "lucide-react";

import type { RecruitmentPosition } from "@/lib/garage-recruitment-data";
import { ApplicantTracker } from "./applicant-tracker";
import "@/components/garage-website/garage-website.css";

const BENEFITS = [
  { icon: "🏆", title: "Lingkungan Profesional", desc: "Sistem kerja jelas, tim solid, dan standar pelayanan tinggi." },
  { icon: "📈", title: "Training & Pengembangan", desc: "Pelatihan skill rutin agar kamu terus bertumbuh." },
  { icon: "🚀", title: "Jenjang Karier", desc: "Kesempatan naik level dari crew sampai manajemen." },
  { icon: "🤝", title: "Tim Muda & Kreatif", desc: "Budaya kerja disiplin, kolaboratif, dan bertanggung jawab." },
];

const ALUR_LOCATIONS = ["Tebing Tinggi", "Hybrid", "Lainnya"];
const RECRUITMENT_WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/HQ6hItzXVgULWHVwlw7mDd";

type FormState = {
  fullName: string; whatsapp: string; email: string; domicile: string; birthDate: string; gender: string;
  appliedPosition: string; preferredLocation: string; availableStartDate: string; willingShift: boolean;
  willingRelocate: boolean; education: string; lastExperience: string; experienceDuration: string;
  previousCompany: string; resignReason: string; mainSkill: string; strength: string; weakness: string;
  motivation: string; customerExperience: string; expectedSalary: string; interviewAvailability: string;
  portfolioUrl: string; socialMediaUrl: string; consent: boolean;
};

const emptyForm: FormState = {
  fullName: "", whatsapp: "", email: "", domicile: "", birthDate: "", gender: "", appliedPosition: "",
  preferredLocation: "", availableStartDate: "", willingShift: false, willingRelocate: false, education: "",
  lastExperience: "", experienceDuration: "", previousCompany: "", resignReason: "", mainSkill: "",
  strength: "", weakness: "", motivation: "", customerExperience: "", expectedSalary: "",
  interviewAvailability: "", portfolioUrl: "", socialMediaUrl: "", consent: false,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "12px 16px", borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)",
  color: "var(--fg)", fontSize: 14, fontFamily: "inherit", transition: "all 0.2s"
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 600, color: "var(--fg-dim)", marginBottom: 8,
};

export function RecruitmentPage({ positions }: { positions: RecruitmentPosition[] }) {
  const [activeTab, setActiveTab] = useState<"apply" | "track">("apply");
  const [formStep, setFormStep] = useState(1);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState(RECRUITMENT_WHATSAPP_GROUP_URL);
  
  const formRef = useRef<HTMLDivElement | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function scrollToForm(position?: string) {
    setActiveTab("apply");
    setFormStep(1);
    if (position) set("appliedPosition", position);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  async function handleAIFill() {
    if (!cvFile) return setError("Silakan pilih file CV terlebih dahulu sebelum menggunakan Auto-Fill AI.");
    
    setAiLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", cvFile);
      
      const res = await fetch("/api/recruitment/parse-cv", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal ekstrak data dari CV");
      
      const aiData = json.data;
      setForm(prev => ({
        ...prev,
        fullName: aiData.fullName || prev.fullName,
        email: aiData.email || prev.email,
        whatsapp: aiData.whatsapp || prev.whatsapp,
        education: aiData.education || prev.education,
        experienceDuration: aiData.experienceDuration || prev.experienceDuration,
        lastExperience: aiData.lastExperience || prev.lastExperience,
        mainSkill: (aiData.skills || []).join(", ") || prev.mainSkill,
      }));
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghubungi AI Parser.");
    } finally {
      setAiLoading(false);
    }
  }

  async function uploadFile(file: File, kind: string): Promise<string> {
    const body = new FormData();
    body.append("file", file);
    body.append("kind", kind);
    const res = await fetch("/api/recruitment/upload", { method: "POST", body });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? "Upload file gagal.");
    return json.data.url as string;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.consent) return setError("Kamu wajib menyetujui penggunaan data.");

    setSubmitting(true);
    try {
      const cvUrl = await uploadFile(cvFile!, "cv");
      const photoUrl = photoFile ? await uploadFile(photoFile, "photo") : "";
      const payload = {
        ...form,
        expectedSalary: form.expectedSalary ? Number(form.expectedSalary.replace(/[^\d]/g, "")) : null,
        cvUrl,
        photoUrl,
      };
      const res = await fetch("/api/recruitment/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "Lamaran gagal dikirim.");
      setSuccess(json.data.message);
      setWhatsappGroupUrl(json.data.whatsappGroupUrl ?? RECRUITMENT_WHATSAPP_GROUP_URL);
      setForm(emptyForm);
      setCvFile(null);
      setPhotoFile(null);
      setFormStep(1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  function validateStep1() {
    if (!form.appliedPosition) return "Posisi yang dilamar wajib dipilih.";
    if (!form.fullName.trim() || !form.whatsapp.trim() || !form.email.trim() || !form.domicile.trim()) {
      return "Mohon lengkapi semua field personal yang wajib.";
    }
    return null;
  }
  
  function validateStep2() {
    if (!form.education || !form.lastExperience) return "Mohon lengkapi riwayat pendidikan & pengalaman.";
    return null;
  }

  function goNext() {
    setError(null);
    if (formStep === 1) {
      const err = validateStep1();
      if (err) return setError(err);
      setFormStep(2);
    } else if (formStep === 2) {
      const err = validateStep2();
      if (err) return setError(err);
      setFormStep(3);
    }
  }

  return (
    <main className="garage-website" style={{ minHeight: "100vh", background: "var(--bg-0)", color: "var(--fg)" }}>
      {/* Navbar Glass */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "rgba(11,11,14,0.7)", backdropFilter: "blur(16px)", zIndex: 50 }}>
        <Link href="/" style={{ color: "var(--fg)", textDecoration: "none", fontWeight: 800, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 24, height: 24, background: "var(--red)", borderRadius: 6 }} />
          GARAGE
        </Link>
        <div style={{ display: "flex", gap: 12, background: "rgba(255,255,255,0.05)", padding: 4, borderRadius: 100 }}>
          <button 
            onClick={() => setActiveTab("apply")} 
            style={{ background: activeTab === "apply" ? "var(--red)" : "transparent", color: activeTab === "apply" ? "#fff" : "var(--fg-dim)", border: "none", padding: "8px 16px", borderRadius: 100, fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all 0.3s" }}
          >
            Lowongan
          </button>
          <button 
            onClick={() => setActiveTab("track")} 
            style={{ background: activeTab === "track" ? "rgba(255,255,255,0.1)" : "transparent", color: activeTab === "track" ? "#fff" : "var(--fg-dim)", border: "none", padding: "8px 16px", borderRadius: 100, fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all 0.3s" }}
          >
            Cek Status
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "track" ? (
          <motion.div key="track" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <ApplicantTracker />
          </motion.div>
        ) : (
          <motion.div key="apply" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            
            {/* Hero Section */}
            <section style={{ padding: "80px 24px 60px", maxWidth: 1100, margin: "0 auto", textAlign: "center", position: "relative" }}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}>
                <div className="mono" style={{ color: "var(--red)", marginBottom: 16, letterSpacing: "0.2em", fontSize: 13, fontWeight: 600 }}>JOIN THE SQUAD</div>
                <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(48px, 8vw, 100px)", lineHeight: 1, margin: 0, textTransform: "uppercase", textShadow: "0 10px 40px rgba(239,68,68,0.2)" }}>
                  Build Your Career<br />at <span style={{ color: "var(--red)" }}>Garage</span>
                </h1>
                <p style={{ maxWidth: 580, margin: "24px auto 0", color: "var(--fg-dim)", fontSize: 18, lineHeight: 1.6 }}>
                  Bergabunglah bersama kami. Kami mencari individu yang disiplin, super kreatif, dan memiliki obsesi terhadap kualitas.
                </p>
                <div style={{ marginTop: 40, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                  <button onClick={() => scrollToForm()} style={{ background: "var(--red)", color: "#fff", border: "none", padding: "16px 32px", borderRadius: 100, fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 4px 20px rgba(239,68,68,0.4)" }}>Apply Sekarang</button>
                </div>
              </motion.div>
            </section>

            {/* Benefit Section */}
            <section style={{ padding: "40px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
              <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))" }}>
                {BENEFITS.map((b, i) => (
                  <motion.div key={b.title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} viewport={{ once: true }} style={{ border: "1px solid rgba(255,255,255,0.05)", borderRadius: 20, padding: 28, background: "rgba(255,255,255,0.02)" }}>
                    <div style={{ fontSize: 36, marginBottom: 16 }}>{b.icon}</div>
                    <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800, color: "#fff" }}>{b.title}</h3>
                    <p style={{ fontSize: 14, color: "var(--fg-dim)", lineHeight: 1.6, margin: 0 }}>{b.desc}</p>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* Pendaftaran Section */}
            <section ref={formRef} id="apply-form" style={{ padding: "60px 24px", background: "var(--bg-1)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ maxWidth: 800, margin: "0 auto" }}>
                <div style={{ textAlign: "center", marginBottom: 40 }}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: 40, textTransform: "uppercase", margin: "0 0 12px" }}>Submit <span style={{ color: "var(--red)" }}>Application</span></h2>
                  <p style={{ color: "var(--fg-dim)", fontSize: 15 }}>Isi form dengan lengkap. Anda juga dapat menggunakan AI untuk mengisi otomatis data dari CV.</p>
                </div>

                {success ? (
                  <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ padding: 40, background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: 20, textAlign: "center" }}>
                    <CheckCircle2 size={64} color="#22c55e" style={{ margin: "0 auto 20px" }} />
                    <h3 style={{ color: "#22c55e", fontSize: 24, fontWeight: 800, margin: "0 0 12px" }}>Lamaran Terkirim!</h3>
                    <p style={{ color: "#fff", fontSize: 15, lineHeight: 1.6 }}>{success}</p>
                    <a href={whatsappGroupUrl} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 24, background: "#25D366", color: "#fff", padding: "14px 28px", borderRadius: 100, textDecoration: "none", fontWeight: 700 }}>Join Grup WhatsApp Rekrutmen</a>
                  </motion.div>
                ) : (
                  <div style={{ background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 24, padding: "32px 40px" }}>
                    
                    {/* Stepper Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32, position: "relative" }}>
                      <div style={{ position: "absolute", top: 16, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.1)", zIndex: 0 }} />
                      {[ { id: 1, icon: User, label: "Personal" }, { id: 2, icon: FileText, label: "Experience" }, { id: 3, icon: UploadCloud, label: "Upload & AI" } ].map(s => (
                        <div key={s.id} style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 80 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 17, background: formStep >= s.id ? "var(--red)" : "var(--bg-1)", border: formStep >= s.id ? "none" : "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.3s" }}>
                            <s.icon size={16} color={formStep >= s.id ? "#fff" : "var(--fg-dim)"} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: formStep >= s.id ? "#fff" : "var(--fg-dim)" }}>{s.label}</span>
                        </div>
                      ))}
                    </div>

                    {error && (
                      <div style={{ padding: 16, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 12, color: "#ef4444", fontSize: 14, marginBottom: 24 }}>
                        {error}
                      </div>
                    )}

                    <form onSubmit={handleSubmit}>
                      {formStep === 1 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={labelStyle}>Posisi yang Dilamar *</label>
                              <select style={inputStyle} value={form.appliedPosition} onChange={e => set("appliedPosition", e.target.value)}>
                                <option value="" style={{ backgroundColor: "#111" }}>-- Pilih Posisi --</option>
                                {positions.map(p => <option key={p.slug} value={p.title} style={{ backgroundColor: "#111" }}>{p.title}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>Nama Lengkap *</label>
                              <input style={inputStyle} value={form.fullName} onChange={e => set("fullName", e.target.value)} />
                            </div>
                            <div>
                              <label style={labelStyle}>Nomor WhatsApp *</label>
                              <input style={inputStyle} type="tel" value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)} />
                            </div>
                            <div>
                              <label style={labelStyle}>Email *</label>
                              <input style={inputStyle} type="email" value={form.email} onChange={e => set("email", e.target.value)} />
                            </div>
                            <div>
                              <label style={labelStyle}>Domisili Saat Ini *</label>
                              <input style={inputStyle} value={form.domicile} onChange={e => set("domicile", e.target.value)} />
                            </div>
                          </div>
                          <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end" }}>
                            <button type="button" onClick={goNext} style={{ background: "var(--red)", color: "#fff", border: "none", padding: "12px 24px", borderRadius: 100, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                              Lanjut <ChevronRight size={18} />
                            </button>
                          </div>
                        </motion.div>
                      )}

                      {formStep === 2 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={labelStyle}>Pendidikan Terakhir *</label>
                              <input style={inputStyle} value={form.education} onChange={e => set("education", e.target.value)} placeholder="Contoh: S1 Manajemen, Universitas A" />
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={labelStyle}>Pengalaman Kerja Terakhir *</label>
                              <input style={inputStyle} value={form.lastExperience} onChange={e => set("lastExperience", e.target.value)} placeholder="Contoh: Barista di Kafe XYZ" />
                            </div>
                            <div>
                              <label style={labelStyle}>Durasi Pengalaman</label>
                              <input style={inputStyle} value={form.experienceDuration} onChange={e => set("experienceDuration", e.target.value)} placeholder="Contoh: 2 Tahun" />
                            </div>
                            <div>
                              <label style={labelStyle}>Skill Utama (Pisahkan koma)</label>
                              <input style={inputStyle} value={form.mainSkill} onChange={e => set("mainSkill", e.target.value)} placeholder="Contoh: Latte Art, Kasir" />
                            </div>
                          </div>
                          <div style={{ marginTop: 32, display: "flex", justifyContent: "space-between" }}>
                            <button type="button" onClick={() => setFormStep(1)} style={{ background: "transparent", color: "var(--fg)", border: "1px solid rgba(255,255,255,0.1)", padding: "12px 24px", borderRadius: 100, fontWeight: 700, cursor: "pointer" }}>Kembali</button>
                            <button type="button" onClick={goNext} style={{ background: "var(--red)", color: "#fff", border: "none", padding: "12px 24px", borderRadius: 100, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>Lanjut <ChevronRight size={18} /></button>
                          </div>
                        </motion.div>
                      )}

                      {formStep === 3 && (
                        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                          <div style={{ background: "rgba(59, 130, 246, 0.1)", border: "1px dashed rgba(59, 130, 246, 0.4)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
                            <h4 style={{ margin: "0 0 12px", color: "#60a5fa", display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={18} /> Auto-Fill dengan AI</h4>
                            <p style={{ fontSize: 13, color: "var(--fg-dim)", marginBottom: 16 }}>Unggah CV Anda terlebih dahulu, lalu AI akan otomatis mengekstrak informasi dan mengisi form yang masih kosong.</p>
                            
                            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                              <div style={{ flex: 1, minWidth: 200 }}>
                                <input type="file" accept=".pdf,image/*" onChange={e => setCvFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13, color: "var(--fg-dim)", width: "100%" }} />
                              </div>
                              <button 
                                type="button" 
                                onClick={handleAIFill}
                                disabled={aiLoading || !cvFile}
                                style={{ background: "#3b82f6", color: "#fff", border: "none", padding: "10px 16px", borderRadius: 100, fontWeight: 600, fontSize: 13, cursor: (aiLoading || !cvFile) ? "not-allowed" : "pointer", opacity: (aiLoading || !cvFile) ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}
                              >
                                {aiLoading ? "Sedang Mengekstrak..." : "✨ Ekstrak CV dengan AI"}
                              </button>
                            </div>
                          </div>

                          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
                            <div>
                              <label style={labelStyle}>Ekspektasi Gaji</label>
                              <input style={inputStyle} value={form.expectedSalary} onChange={e => set("expectedSalary", e.target.value)} placeholder="Contoh: 3.000.000" />
                            </div>
                            <label style={{ display: "flex", gap: 12, alignItems: "flex-start", marginTop: 8, cursor: "pointer" }}>
                              <input type="checkbox" checked={form.consent} onChange={e => set("consent", e.target.checked)} style={{ width: 18, height: 18, marginTop: 2 }} />
                              <span style={{ fontSize: 13, color: "var(--fg-dim)", lineHeight: 1.5 }}>
                                Saya setuju bahwa data yang saya berikan akan disimpan dan diproses oleh tim HR GARAGE untuk keperluan rekrutmen. *
                              </span>
                            </label>
                          </div>

                          <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 24 }}>
                            <button type="button" onClick={() => setFormStep(2)} style={{ background: "transparent", color: "var(--fg)", border: "1px solid rgba(255,255,255,0.1)", padding: "12px 24px", borderRadius: 100, fontWeight: 700, cursor: "pointer" }}>Kembali</button>
                            <button type="submit" disabled={submitting} style={{ background: "var(--red)", color: "#fff", border: "none", padding: "12px 32px", borderRadius: 100, fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                              {submitting ? "Mengirim..." : <><Send size={18} /> Kirim Lamaran</>}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </form>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
