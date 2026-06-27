"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Megaphone,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Video,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";

import { garageApi } from "@/lib/api-client";

function describeApiError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Terjadi kesalahan tidak terduga.";
}
import { BRANDS } from "@/lib/garage-social-brands";

type TikTokConnection = {
  accountId: string | null;
  accountName: string | null;
  status: string;
};

type PublishingItem = {
  id: string;
  title: string;
  contentText: string;
  caption: string;
  hashtags: string[];
  platforms: string[];
  status: string;
  createdAt: string;
  scheduledAt: string | null;
  revisionNotes: string | null;
  rejectionReason: string | null;
};

const STATUS_TONES: Record<string, string> = {
  draft: "border-[#d6d6dc]/45 bg-white/5 text-[#d6d6dc]",
  ai_ready: "border-[#3b82f6]/45 bg-[#3b82f6]/15 text-[#93c5fd]",
  needs_approval: "border-[#f5a742]/45 bg-[#f5a742]/15 text-[#ffd08a]",
  approved: "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#86efac]",
  scheduled: "border-[#f5a742]/45 bg-[#f5a742]/15 text-[#ffd08a]",
  publishing: "border-[#3b82f6]/45 bg-[#3b82f6]/15 text-[#93c5fd]",
  published: "border-[#22c55e]/45 bg-[#22c55e]/15 text-[#86efac]",
  partial: "border-[#f5a742]/45 bg-[#f5a742]/15 text-[#ffd08a]",
  failed: "border-[#d11a2a]/45 bg-[#d11a2a]/15 text-[#ffc2c8]",
  rejected: "border-[#d11a2a]/45 bg-[#d11a2a]/15 text-[#ffc2c8]",
  revision: "border-[#f97316]/45 bg-[#f97316]/15 text-[#fed7aa]",
};

function canSubmitForApproval(status: string) {
  return ["draft", "ai_ready", "revision"].includes(status);
}

function canPublishNow(status: string) {
  return ["approved", "scheduled", "partial", "failed"].includes(status);
}

export function ContentPublisher({ canWrite }: { canWrite: boolean }) {
  const [items, setItems] = useState<PublishingItem[]>([]);
  const [connection, setConnection] = useState<TikTokConnection | null>(null);
  const [metaConnection, setMetaConnection] = useState<TikTokConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [queue, tiktok, meta] = await Promise.all([
        garageApi.get<PublishingItem[]>("/api/marketing/publishing", { cache: "no-store" }),
        garageApi.get<TikTokConnection | null>("/api/integrations/tiktok/status", { cache: "no-store" }),
        garageApi.get<TikTokConnection | null>("/api/integrations/meta/status", { cache: "no-store" }),
      ]);
      setItems(queue || []);
      setConnection(tiktok);
      setMetaConnection(meta);
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  async function handleStatus(id: string, newStatus: string) {
    if (!canWrite) return;
    setWorkingId(id);
    setError(null);
    try {
      await garageApi.patch(`/api/marketing/publishing/${id}/status`, { status: newStatus });
      await load();
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive" className="border-[#d11a2a]/50 bg-[#d11a2a]/10">
          <AlertTriangle className="size-4 text-[#ffc2c8]" />
          <AlertTitle className="text-[#ffc2c8]">Gagal</AlertTitle>
          <AlertDescription className="text-[#ffc2c8]/80">{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4 rounded-lg border border-[#34343c] bg-[#111116] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Content Publisher</h2>
          <p className="mt-1 text-sm text-[#8f8f99]">
            GARAGE OS menjadi sumber status final konten.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connection?.status === "connected" ? (
            <Badge className="h-9 border-[#22c55e]/45 bg-[#22c55e]/15 px-3 text-[#86efac]">
              <ShieldCheck className="mr-2 size-4" />
              TikTok @{connection.accountName ?? "connected"}
            </Badge>
          ) : (
            <Button
              type="button"
              className="garage-press bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
              disabled={!canWrite}
              onClick={() => {
                window.location.href = "/api/integrations/tiktok/start?returnTo=/?module=marketing";
              }}
            >
              <Video className="mr-2 size-4" />
              Hubungkan TikTok
            </Button>
          )}

          {metaConnection?.status === "connected" ? (
            <Badge className="h-9 border-[#3b82f6]/45 bg-[#3b82f6]/15 px-3 text-[#93c5fd]">
              <ShieldCheck className="mr-2 size-4" />
              Meta (IG/FB) @{metaConnection.accountName ?? "connected"}
            </Badge>
          ) : (
            <Button
              type="button"
              className="garage-press bg-[#1877f2] text-white hover:bg-[#166fe5]"
              disabled={!canWrite}
              onClick={() => {
                window.location.href = "/api/integrations/meta/start?returnTo=/?module=marketing";
              }}
            >
              <Megaphone className="mr-2 size-4" />
              Hubungkan Meta
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            className="garage-press border-[#3b82f6]/45 bg-[#3b82f6]/10 text-[#bfdbfe] hover:bg-[#3b82f6]/20"
            disabled={!canWrite}
            onClick={() => setCreateOpen(true)}
          >
            <Sparkles className="mr-2 size-4" />
            Auto-Generate Konten
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {loading && items.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#8f8f99]">Memuat antrean...</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#8f8f99]">Belum ada antrean konten.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex flex-col justify-between gap-4 rounded-lg border border-[#34343c] bg-white/[0.02] p-4">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <Badge className={STATUS_TONES[item.status] || STATUS_TONES.draft}>{item.status}</Badge>
                </div>
                <p className="mt-2 text-sm text-[#d6d6dc]">{item.caption}</p>
                {item.hashtags?.length > 0 && (
                  <p className="mt-2 text-xs text-[#3b82f6]">{item.hashtags.join(" ")}</p>
                )}
                <div className="mt-3 flex gap-2">
                  {item.platforms.map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px] uppercase text-[#8f8f99]">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
              {item.status === "needs_approval" && canWrite && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleStatus(item.id, "rejected")} disabled={workingId === item.id}>
                    Tolak
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleStatus(item.id, "revision")} disabled={workingId === item.id}>
                    Revisi
                  </Button>
                  <Button size="sm" onClick={() => handleStatus(item.id, "approved")} disabled={workingId === item.id}>
                    Setujui
                  </Button>
                </div>
              )}
              {canSubmitForApproval(item.status) && canWrite && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatus(item.id, "needs_approval")}
                    disabled={workingId === item.id}
                  >
                    Ajukan Approval
                  </Button>
                </div>
              )}
              {canPublishNow(item.status) && canWrite && (
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      setWorkingId(item.id);
                      setError(null);
                      try {
                        await garageApi.post(`/api/marketing/publishing/${item.id}/publish`, {});
                        await load();
                      } catch (err) {
                        setError(describeApiError(err));
                      } finally {
                        setWorkingId(null);
                      }
                    }}
                    disabled={workingId === item.id}
                  >
                    <Send className="mr-2 size-4" />
                    {item.status === "partial" || item.status === "failed"
                      ? "Retry Publish"
                      : "Publish Sekarang"}
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <ContentPublisherFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          setCreateOpen(false);
          load();
        }}
      />
    </div>
  );
}

function ContentPublisherFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [brandKey, setBrandKey] = useState("garage");
  const [contentPillar, setContentPillar] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generatedCaption, setGeneratedCaption] = useState("");
  const [generatedHashtags, setGeneratedHashtags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Default platforms checkboxes
  const [platforms, setPlatforms] = useState({
    instagram: true,
    facebook: false,
    threads: false,
    tiktok: true,
  });

  const selectedBrand = BRANDS[brandKey as keyof typeof BRANDS] || BRANDS.garage;

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      const timeoutId = window.setTimeout(() => {
        setTopic("");
        setGeneratedTitle("");
        setGeneratedCaption("");
        setGeneratedHashtags([]);
        setError(null);
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [open]);

  async function handleGenerate() {
    if (!topic || !contentPillar) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await garageApi.post<{ result: { title: string; caption: string; hashtags: string[] } }>("/api/marketing/ai", {
        type: "social-media-content",
        brandKey,
        contentPillar,
        topic,
      });
      if (res.result) {
        setGeneratedTitle(res.result.title);
        setGeneratedCaption(res.result.caption);
        setGeneratedHashtags(res.result.hashtags);
      }
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!generatedTitle) return;
    setSaving(true);
    setError(null);
    try {
      const activePlatforms = Object.entries(platforms)
        .filter(([_, active]) => active)
        .map(([key]) => key);

      await garageApi.post("/api/marketing/publishing", {
        title: generatedTitle,
        caption: generatedCaption,
        hashtags: generatedHashtags,
        platforms: activePlatforms,
      });
      onSuccess();
    } catch (err) {
      setError(describeApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-[#34343c] bg-[#111116]/80 backdrop-blur-xl text-white shadow-2xl">
        <DialogHeader>
          <DialogTitle>Auto-Generate Konten Sosmed</DialogTitle>
          <DialogDescription className="text-[#8f8f99]">
            AI akan membuat copy konten yang on-brand berdasarkan pilar dan topik.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="border-[#d11a2a]/50 bg-[#d11a2a]/10">
            <AlertTriangle className="size-4 text-[#ffc2c8]" />
            <AlertDescription className="text-[#ffc2c8]/80">{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[#d6d6dc]">Brand</label>
              <select
                value={brandKey}
                onChange={(e) => setBrandKey(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-[#34343c] bg-white/[0.05] px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f5a742]"
              >
                {Object.values(BRANDS).map((b) => (
                  <option key={b.key} value={b.key} className="bg-[#111116]">
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#d6d6dc]">Content Pillar</label>
              <select
                value={contentPillar}
                onChange={(e) => setContentPillar(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-[#34343c] bg-white/[0.05] px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f5a742]"
              >
                <option value="" className="bg-[#111116]">Pilih Pilar...</option>
                {selectedBrand.contentPillars.map((p) => (
                  <option key={p} value={p} className="bg-[#111116]">
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-[#d6d6dc]">Topik / Brief Singkat</label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Contoh: Promo kopi susu akhir pekan beli 1 gratis 1"
              className="mt-1 border-[#34343c] bg-white/[0.05]"
            />
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="garage-press border-[#f5a742]/45 bg-[#f5a742]/10 text-[#ffd08a] hover:bg-[#f5a742]/20 shadow-[0_0_15px_rgba(245,167,66,0.1)]"
              onClick={handleGenerate}
              disabled={generating || !topic || !contentPillar}
            >
              {generating ? <RefreshCw className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
              Generate AI Copy
            </Button>
          </div>

          {generatedTitle && (
            <div className="space-y-4 border-t border-[#34343c] pt-4">
              <div>
                <label className="text-xs text-[#d6d6dc]">Judul Konten</label>
                <Input
                  value={generatedTitle}
                  onChange={(e) => setGeneratedTitle(e.target.value)}
                  className="mt-1 border-[#34343c] bg-white/[0.05]"
                />
              </div>
              <div>
                <label className="text-xs text-[#d6d6dc]">Caption</label>
                <Textarea
                  value={generatedCaption}
                  onChange={(e) => setGeneratedCaption(e.target.value)}
                  className="mt-1 min-h-32 border-[#34343c] bg-white/[0.05]"
                />
              </div>
              <div>
                <label className="text-xs text-[#d6d6dc]">Hashtags (pisahkan dengan spasi)</label>
                <Input
                  value={generatedHashtags.join(" ")}
                  onChange={(e) => setGeneratedHashtags(e.target.value.split(" "))}
                  className="mt-1 border-[#34343c] bg-white/[0.05]"
                />
              </div>

              <div>
                <label className="text-xs text-[#d6d6dc]">Publish ke Platform:</label>
                <div className="mt-2 flex gap-4">
                  {(["instagram", "facebook", "threads", "tiktok"] as const).map((platform) => (
                    <label key={platform} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={platforms[platform]}
                        onChange={(e) => setPlatforms({ ...platforms, [platform]: e.target.checked })}
                        className="rounded border-[#34343c] bg-white/[0.05] text-[#f5a742]"
                      />
                      <span className="text-sm capitalize text-[#d6d6dc]">{platform}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !generatedTitle}
            className="garage-press bg-[#f5a742] text-black font-semibold hover:bg-[#f5a742]/90 shadow-[0_0_20px_rgba(245,167,66,0.2)] transition-all"
          >
            {saving ? <RefreshCw className="mr-2 size-4 animate-spin" /> : "Kirim ke Antrean"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
