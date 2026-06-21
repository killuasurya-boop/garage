"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, CheckCircle2, Clock, XCircle, Calendar, Briefcase } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type TrackerData = {
  id: string;
  fullName: string;
  status: string;
  appliedPosition: string;
  createdAt: string;
  interviewDate: string | null;
  interviewLink: string | null;
};

const STEPS = [
  { id: "New", label: "Lamaran Diterima" },
  { id: "Qualified", label: "Screening Lolos" },
  { id: "CEO Review", label: "Review Manajemen" },
  { id: "Interview Scheduled", label: "Jadwal Interview" },
  { id: "Hired", label: "Diterima (Hired)" },
];

export function ApplicantTracker() {
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TrackerData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!whatsapp.trim()) return;

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch("/api/recruitment/track-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal melacak status");
      
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  function getStepIndex(status: string) {
    if (status === "Rejected") return -1;
    const idx = STEPS.findIndex(s => s.id === status);
    return idx === -1 ? 0 : idx;
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 0" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 8 }}>
          Cek Status Lamaran
        </h2>
        <p style={{ color: "var(--fg-dim)", fontSize: 14 }}>
          Masukkan nomor WhatsApp yang Anda gunakan saat mendaftar.
        </p>
      </div>

      <form onSubmit={handleSearch} style={{ display: "flex", gap: 12, marginBottom: 32 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search size={18} style={{ position: "absolute", left: 14, top: 13, color: "var(--fg-mute)" }} />
          <Input 
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="Contoh: 08123456789"
            style={{ 
              paddingLeft: 42, 
              background: "rgba(255,255,255,0.05)", 
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              height: 44
            }}
          />
        </div>
        <Button 
          type="submit" 
          disabled={loading || !whatsapp}
          style={{ 
            height: 44, 
            borderRadius: 12, 
            background: "var(--red)", 
            color: "#fff",
            fontWeight: 700
          }}
        >
          {loading ? "Mencari..." : "Lacak Status"}
        </Button>
      </form>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            style={{ padding: 16, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 12, color: "#ef4444", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}
          >
            <XCircle size={18} />
            {error}
          </motion.div>
        )}

        {data && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ background: "var(--bg-1)", border: "1px solid var(--line)", borderRadius: 16, padding: 24 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid var(--line)", paddingBottom: 16, marginBottom: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: 24, background: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20 }}>
                {data.fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>{data.fullName}</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--fg-dim)", fontSize: 13 }}>
                  <Briefcase size={14} />
                  {data.appliedPosition}
                </div>
              </div>
            </div>

            {data.status === "Rejected" ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <XCircle size={48} color="#ef4444" style={{ margin: "0 auto 16px" }} />
                <h4 style={{ color: "#fff", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Mohon Maaf</h4>
                <p style={{ color: "var(--fg-dim)", fontSize: 14, lineHeight: 1.5 }}>
                  Saat ini kami belum dapat melanjutkan lamaran Anda ke tahap berikutnya. Jangan menyerah dan coba lagi di kesempatan lain!
                </p>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 15, top: 20, bottom: 20, width: 2, background: "var(--line)", zIndex: 0 }} />
                
                {STEPS.map((step, i) => {
                  const currentIndex = getStepIndex(data.status);
                  const isCompleted = i <= currentIndex;
                  const isCurrent = i === currentIndex;
                  
                  return (
                    <div key={step.id} style={{ display: "flex", gap: 16, position: "relative", zIndex: 1, marginBottom: i === STEPS.length - 1 ? 0 : 24 }}>
                      <div style={{ 
                        width: 32, height: 32, borderRadius: 16, 
                        background: isCompleted ? "var(--red)" : "var(--bg-1)",
                        border: isCompleted ? "none" : "2px solid var(--line)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: isCurrent ? "0 0 0 4px rgba(239, 68, 68, 0.2)" : "none",
                        transition: "all 0.3s ease"
                      }}>
                        {isCompleted ? <CheckCircle2 size={16} color="#fff" /> : <Clock size={14} color="var(--fg-dim)" />}
                      </div>
                      <div style={{ paddingTop: 6 }}>
                        <div style={{ color: isCompleted ? "#fff" : "var(--fg-dim)", fontWeight: isCurrent ? 700 : 500, fontSize: 15 }}>
                          {step.label}
                        </div>
                        {isCurrent && data.status === "Interview Scheduled" && data.interviewDate && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }} 
                            animate={{ opacity: 1, height: "auto" }}
                            style={{ marginTop: 12, padding: 12, background: "rgba(255,255,255,0.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--red)", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                              <Calendar size={14} /> Jadwal Interview:
                            </div>
                            <div style={{ color: "#fff", fontSize: 13, marginLeft: 20 }}>
                              {format(new Date(data.interviewDate), "EEEE, dd MMMM yyyy - HH:mm", { locale: idLocale })} WIB
                            </div>
                            {data.interviewLink && (
                              <div style={{ marginTop: 8, marginLeft: 20 }}>
                                <a href={data.interviewLink} target="_blank" rel="noreferrer" style={{ color: "var(--red)", fontSize: 13, textDecoration: "underline" }}>
                                  Link/Lokasi Pertemuan
                                </a>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
