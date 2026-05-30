"use client";

import { useEffect, useState } from "react";
import { Megaphone, Plus, Bell, Send, User, Calendar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Announcement {
  id: string;
  title: string;
  content: string;
  targetRole: string;
  createdAt: string;
  authorName: string | null;
}

export function TeamAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [targetRole, setTargetRole] = useState("All");
  const [submitting, setSubmitting] = useState(false);

  async function fetchAnnouncements() {
    try {
      setLoading(true);
      const res = await fetch("/api/hr/team/announcements");
      const data = await res.json();
      if (data.announcements) {
        setAnnouncements(data.announcements);
      }
    } catch (err) {
      console.error("Failed to load announcements:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAnnouncements();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/hr/team/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, targetRole }),
      });
      if (res.ok) {
        setTitle("");
        setContent("");
        setTargetRole("All");
        setShowAddForm(false);
        fetchAnnouncements();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Megaphone className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-100">Pengumuman & Siaran Internal</h3>
            <p className="text-xs text-zinc-400">Siaran berita penting dari Owner & Manajer untuk seluruh staf.</p>
          </div>
        </div>

        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold gap-2 shadow-lg shadow-amber-500/10 border border-amber-400/20"
        >
          <Plus className="size-4" />
          Tulis Pengumuman
        </Button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4 backdrop-blur-md">
          <h4 className="text-sm font-semibold text-zinc-200">Buat Siaran Baru</h4>
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Judul Pengumuman</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Perubahan Jadwal Operasional Selama Libur Nasional"
              className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Target Penerima (Role)</label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-zinc-950/50 border border-zinc-800 text-zinc-200 focus:border-amber-500 text-sm focus:outline-none"
              >
                <option value="All">Semua Karyawan</option>
                <option value="Barista">Khusus Barista</option>
                <option value="Kasir">Khusus Kasir</option>
                <option value="Koki">Khusus Koki</option>
                <option value="Mekanik">Khusus Mekanik</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Isi Pengumuman / Pesan</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tulis pesan lengkap Anda di sini..."
              rows={4}
              className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAddForm(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold gap-2 border border-amber-400/20"
            >
              <Send className="size-4" />
              {submitting ? "Mengirim..." : "Siarkan Sekarang"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="py-12 text-center text-zinc-500">Memuat pengumuman...</div>
      ) : announcements.length === 0 ? (
        <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-12 text-center text-zinc-500 space-y-2">
          <Bell className="size-8 mx-auto text-zinc-600" />
          <p className="font-medium text-zinc-400">Belum ada pengumuman</p>
          <p className="text-xs">Pengumuman penting yang dibuat owner akan muncul di sini.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((item) => (
            <div
              key={item.id}
              className="bg-zinc-900/30 hover:bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 transition-all space-y-3 relative group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {item.targetRole === "All" ? "Semua Staf" : item.targetRole}
                    </span>
                    <h4 className="font-semibold text-zinc-100 text-md">{item.title}</h4>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-500">
                    <span className="flex items-center gap-1">
                      <User className="size-3.5" />
                      {item.authorName || "System / Owner"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3.5" />
                      {new Date(item.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{item.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
