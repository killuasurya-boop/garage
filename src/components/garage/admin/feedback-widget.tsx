"use client";

import { useState } from "react";
import { Bug, Lightbulb, MessageSquare, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Floating bug/feedback widget — mount di layout untuk semua role.
// Staff bisa submit cepat saat ada issue selama shift.

type Category = "bug" | "suggestion" | "praise" | "question";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [category, setCategory] = useState<Category>("bug");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (title.length < 3 || detail.length < 10) {
      setError("Title min 3 karakter, detail min 10 karakter.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category,
        priority,
        title,
        detail,
        currentUrl: typeof window !== "undefined" ? window.location.pathname : undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error?.message ?? "Gagal submit. Coba lagi.");
      return;
    }
    setSubmitted(true);
    setTitle("");
    setDetail("");
    setTimeout(() => {
      setOpen(false);
      setSubmitted(false);
    }, 1500);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report bug / feedback"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)] text-white shadow-lg ring-2 ring-[var(--primary)]/30 transition hover:scale-110"
      >
        <Bug className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-[var(--border)] bg-[var(--card)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[var(--primary)]" />
              Feedback / Report Bug
            </DialogTitle>
            <DialogDescription className="text-[var(--muted-foreground)]">
              Ada bug, saran, atau pertanyaan? Submit langsung — admin review tiap sore.
            </DialogDescription>
          </DialogHeader>

          {submitted ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
                <Send className="h-5 w-5 text-emerald-400" />
              </div>
              <p className="text-sm font-medium">Terkirim. Makasih!</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Kategori
                  </label>
                  <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                    <SelectTrigger className="mt-1 border-[var(--border)] bg-[var(--background)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bug">🐛 Bug / Error</SelectItem>
                      <SelectItem value="suggestion">💡 Saran / Improvement</SelectItem>
                      <SelectItem value="praise">⭐ Pujian / Works well</SelectItem>
                      <SelectItem value="question">❓ Pertanyaan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                    Prioritas
                  </label>
                  <Select
                    value={priority}
                    onValueChange={(v) => setPriority(v as typeof priority)}
                  >
                    <SelectTrigger className="mt-1 border-[var(--border)] bg-[var(--background)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">🔥 Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Judul singkat
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="cth: Tombol void gak respon di POS"
                  className="mt-1 border-[var(--border)] bg-[var(--background)]"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Detail (apa yang terjadi, expected vs actual)
                </label>
                <Textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="Klik tombol void → modal muncul tapi tombol confirm gak bisa diklik. Expected: order ke-void."
                  className="mt-1 border-[var(--border)] bg-[var(--background)]"
                  rows={4}
                  maxLength={5000}
                />
              </div>

              {error ? (
                <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
                  {error}
                </div>
              ) : null}

              <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
                <Lightbulb className="h-3 w-3" />
                URL halaman + role lo otomatis tercatat
              </div>
            </div>
          )}

          {!submitted ? (
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                <X className="mr-2 h-3.5 w-3.5" />
                Batal
              </Button>
              <Button
                onClick={submit}
                disabled={submitting}
                className="bg-[var(--primary)] hover:opacity-90"
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                {submitting ? "Mengirim…" : "Submit"}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
