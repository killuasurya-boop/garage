"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  Hash,
  ListChecks,
  Loader2,
  Megaphone,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { garageApi, GarageApiError } from "@/lib/api-client";
import type { Role } from "@/lib/garage-data";
import { useDateFilterContext } from "@/components/garage/date-filter";

type ChannelType = "direct" | "role" | "broadcast";

type ChannelMember = { userId: string; name: string; role: Role };

type ChannelSummary = {
  id: string;
  type: ChannelType;
  name: string;
  roleKey: string | null;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  unread: number;
  members: ChannelMember[];
  preview: string | null;
};

type ChatMessage = {
  id: string;
  channelId: string;
  senderUserId: string;
  senderName: string;
  body: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  attachmentSize: number | null;
  replyToId: string | null;
  createdAt: string;
};

type ChatUser = {
  userId: string;
  name: string;
  role: Role;
};

type StaffTask = {
  id: string;
  targetRole: string;
  title: string;
  detail: string;
  priority: "low" | "medium" | "high";
  status: "open" | "acknowledged" | "done" | "cancelled";
  source: "ceo_ai" | "manual";
  dueAt: string | null;
  createdAt: string;
};

type StreamEvent =
  | { kind: "message"; channelId: string; memberUserIds: string[]; message: ChatMessage }
  | { kind: "read"; channelId: string; userId: string; lastReadAt: string };

function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.floor((today.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (d.toDateString() === today.toDateString()) return "Hari ini";
  if (diff === 1) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DRAFT_KEY_PREFIX = "garage:chat:draft:";

function loadDraft(channelId: string): string {
  try {
    return localStorage.getItem(DRAFT_KEY_PREFIX + channelId) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(channelId: string, value: string) {
  try {
    if (value) localStorage.setItem(DRAFT_KEY_PREFIX + channelId, value);
    else localStorage.removeItem(DRAFT_KEY_PREFIX + channelId);
  } catch {
    /* localStorage unavailable */
  }
}

function readAllDraftIds(): Set<string> {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(DRAFT_KEY_PREFIX)) {
        const v = localStorage.getItem(k);
        if (v && v.trim()) ids.add(k.slice(DRAFT_KEY_PREFIX.length));
      }
    }
  } catch {
    /* localStorage unavailable */
  }
  return ids;
}

function renderMessageBody(body: string, myName: string, myRole: string) {
  if (!body) return null;
  const targets = [myName, myRole]
    .map((t) => t?.trim().toLowerCase())
    .filter(Boolean);
  // Split on @token while keeping the @token segments
  const parts = body.split(/(@[\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+)?)/u);
  return parts.map((part, i) => {
    if (!part.startsWith("@")) return <span key={i}>{part}</span>;
    const tag = part.slice(1).trim().toLowerCase();
    const isMe = targets.some(
      (t) => tag === t || tag.startsWith(t + " ") || tag === t.replace(/\s+/g, ""),
    );
    return (
      <span
        key={i}
        className={
          isMe
            ? "rounded bg-[#ffd08a]/30 px-1 font-bold text-[#ffd08a]"
            : "font-semibold text-[#bfdbfe]"
        }
      >
        {part}
      </span>
    );
  });
}

export function ChatModule({
  currentUserId,
  currentUserName = "",
  currentUserRole = "" as Role | "",
}: {
  currentUserId: string;
  currentUserName?: string;
  currentUserRole?: Role | "";
}) {
  const { predicate: dateFilterPredicate } = useDateFilterContext();
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageLoading, setMessageLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    url: string;
    type: string;
    size: number;
    name: string;
  } | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [chatUsers, setChatUsers] = useState<ChatUser[]>([]);
  const [userQuery, setUserQuery] = useState("");
  const [streamConnected, setStreamConnected] = useState(false);
  const [draftChannels, setDraftChannels] = useState<Set<string>>(() => readAllDraftIds());

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId],
  );

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const res = await garageApi.get<{ channels: ChannelSummary[] }>("/api/chat/channels", {
        cache: "no-store",
      });
      setChannels(res.channels);
      if (!activeChannelId && res.channels.length > 0) {
        const broadcast = res.channels.find((c) => c.type === "broadcast");
        setActiveChannelId(broadcast?.id ?? res.channels[0].id);
      }
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat channel.");
    } finally {
      setChannelsLoading(false);
    }
  }, [activeChannelId]);

  const loadMessages = useCallback(async (channelId: string) => {
    setMessageLoading(true);
    setError(null);
    try {
      const res = await garageApi.get<{ messages: ChatMessage[] }>(
        `/api/chat/channels/${channelId}/messages?limit=80`,
        { cache: "no-store" },
      );
      setMessages(res.messages);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal memuat pesan.");
    } finally {
      setMessageLoading(false);
    }
  }, []);

  const markRead = useCallback(async (channelId: string) => {
    try {
      await garageApi.post(`/api/chat/channels/${channelId}/read`, {});
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId ? { ...c, unread: 0, lastReadAt: new Date().toISOString() } : c,
        ),
      );
    } catch {
      /* silent */
    }
  }, []);

  // Initial channel load
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void loadChannels();
  }, [loadChannels]);

  // Load messages when active channel changes
  useEffect(() => {
    if (!activeChannelId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load on selection
    void loadMessages(activeChannelId);
    void markRead(activeChannelId);
    // restore draft for the newly active channel
    setDraft(loadDraft(activeChannelId));
  }, [activeChannelId, loadMessages, markRead]);

  // Persist draft per channel — sync localStorage + indicator set.
  // setDraftChannels guard di dalam updater memastikan tidak ada
  // cascading render kalau membership tidak berubah.
  useEffect(() => {
    if (!activeChannelId) return;
    saveDraft(activeChannelId, draft);
    const should = draft.trim().length > 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync to indicator set; no-op when membership stable
    setDraftChannels((prev) => {
      if (prev.has(activeChannelId) === should) return prev;
      const next = new Set(prev);
      if (should) next.add(activeChannelId);
      else next.delete(activeChannelId);
      return next;
    });
  }, [draft, activeChannelId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, activeChannelId]);

  // SSE realtime
  useEffect(() => {
    const es = new EventSource("/api/chat/stream");
    es.addEventListener("ready", () => setStreamConnected(true));
    es.onopen = () => setStreamConnected(true);
    es.onerror = () => setStreamConnected(false);
    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as StreamEvent;
        if (event.kind === "message") {
          if (event.channelId === activeChannelId) {
            setMessages((prev) =>
              prev.some((m) => m.id === event.message.id) ? prev : [...prev, event.message],
            );
            if (event.message.senderUserId !== currentUserId) {
              void markRead(activeChannelId);
            }
          }
          setChannels((prev) => {
            const exists = prev.some((c) => c.id === event.channelId);
            if (!exists) {
              void loadChannels();
              return prev;
            }
            return prev.map((c) =>
              c.id === event.channelId
                ? {
                    ...c,
                    lastMessageAt: event.message.createdAt,
                    preview: event.message.body || (event.message.attachmentUrl ? "📎 Lampiran" : ""),
                    unread:
                      c.id === activeChannelId || event.message.senderUserId === currentUserId
                        ? 0
                        : c.unread + 1,
                  }
                : c,
            );
          });
        }
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
  }, [activeChannelId, currentUserId, loadChannels, markRead]);

  const handleSend = async () => {
    if (!activeChannelId) return;
    if (!draft.trim() && !pendingAttachment) return;
    setSending(true);
    try {
      const payload: Record<string, unknown> = { body: draft.trim() };
      if (pendingAttachment) {
        payload.attachmentUrl = pendingAttachment.url;
        payload.attachmentType = pendingAttachment.type;
        payload.attachmentSize = pendingAttachment.size;
      }
      await garageApi.post(`/api/chat/channels/${activeChannelId}/messages`, payload);
      setDraft("");
      saveDraft(activeChannelId, "");
      setDraftChannels((prev) => {
        if (!prev.has(activeChannelId)) return prev;
        const next = new Set(prev);
        next.delete(activeChannelId);
        return next;
      });
      setPendingAttachment(null);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal mengirim.");
    } finally {
      setSending(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingAttachment(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/chat/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || data?.error) {
        throw new Error(data?.error?.message ?? "Upload gagal.");
      }
      setPendingAttachment({
        url: data.data.url,
        type: data.data.type,
        size: data.data.size,
        name: data.data.name,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload gagal.");
    } finally {
      setUploadingAttachment(false);
    }
  };

  const openUserPicker = async () => {
    setUserPickerOpen(true);
    setUserQuery("");
    if (chatUsers.length === 0) {
      try {
        const res = await garageApi.get<{ users: ChatUser[] }>("/api/chat/users");
        setChatUsers(res.users);
      } catch (err) {
        setError(err instanceof GarageApiError ? err.message : "Gagal memuat user.");
      }
    }
  };

  const startDmWith = async (peerUserId: string) => {
    try {
      const res = await garageApi.post<{ channelId: string }>("/api/chat/channels", {
        type: "direct",
        peerUserId,
      });
      setUserPickerOpen(false);
      await loadChannels();
      setActiveChannelId(res.channelId);
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal membuat DM.");
    }
  };

  const [botSweeping, setBotSweeping] = useState(false);
  const [botSweepInfo, setBotSweepInfo] = useState<string | null>(null);
  const [ceoBroadcasting, setCeoBroadcasting] = useState(false);
  const [ceoBroadcastInfo, setCeoBroadcastInfo] = useState<string | null>(null);

  const canBroadcastCeo =
    currentUserRole === "Owner / CEO" || currentUserRole === "Admin";

  const runCeoBroadcast = useCallback(async () => {
    if (ceoBroadcasting) return;
    setCeoBroadcasting(true);
    setCeoBroadcastInfo(null);
    try {
      const res = await garageApi.post<{
        posted: Array<{ channel: string; role: string }>;
        skipped: Array<{ channel: string; role: string; reason: string }>;
        errors: Array<{ topic: string; message: string }>;
        actionDraftsCreated: number;
        providerUsed: string | null;
      }>("/api/ai/ceo-broadcast", {});
      const postedCount = res.posted.length;
      const drafts = res.actionDraftsCreated;
      setCeoBroadcastInfo(
        postedCount > 0
          ? `CEO AI broadcast ke ${postedCount} channel${drafts > 0 ? ` · ${drafts} draft aksi` : ""}.`
          : `Tidak ada broadcast terkirim. (${res.errors.length} error)`,
      );
      if (postedCount > 0) await loadChannels();
    } catch (err) {
      setCeoBroadcastInfo(
        err instanceof GarageApiError ? err.message : "Gagal jalankan CEO broadcast.",
      );
    } finally {
      setCeoBroadcasting(false);
    }
  }, [ceoBroadcasting, loadChannels]);

  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskActionId, setTaskActionId] = useState<string | null>(null);

  const activeRoleKey = activeChannel?.type === "role" ? activeChannel.roleKey : null;
  const activeRoleName = activeRoleKey?.startsWith("role:")
    ? activeRoleKey.slice("role:".length)
    : null;

  const loadTasks = useCallback(
    async (roleName: string) => {
      setTasksLoading(true);
      try {
        const res = await garageApi.get<{ tasks: StaffTask[] }>(
          `/api/staff-tasks?role=${encodeURIComponent(roleName)}`,
          { cache: "no-store" },
        );
        setTasks(res.tasks);
      } catch {
        /* silent — tasks panel optional */
      } finally {
        setTasksLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeRoleName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on channel change
      setTasks([]);
      return;
    }
    void loadTasks(activeRoleName);
  }, [activeRoleName, loadTasks]);

  // Refresh tasks tiap kali ada pesan baru dari CEO AI (broadcast biasanya
  // dibarengi task creation). Dipicu lewat messages length berubah.
  useEffect(() => {
    if (!activeRoleName) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch refresh on new messages
    void loadTasks(activeRoleName);
  }, [messages.length, activeRoleName, loadTasks]);

  const handleTaskAction = useCallback(
    async (taskId: string, action: "acknowledge" | "complete") => {
      setTaskActionId(taskId);
      try {
        await garageApi.patch(`/api/staff-tasks/${taskId}`, { action });
        if (action === "complete") {
          setTasks((prev) => prev.filter((t) => t.id !== taskId));
        } else {
          setTasks((prev) =>
            prev.map((t) => (t.id === taskId ? { ...t, status: "acknowledged" } : t)),
          );
        }
      } catch (err) {
        setError(err instanceof GarageApiError ? err.message : "Gagal update task.");
      } finally {
        setTaskActionId(null);
      }
    },
    [],
  );
  const runBotSweep = useCallback(
    async (silent = false) => {
      if (botSweeping) return;
      setBotSweeping(true);
      if (!silent) setBotSweepInfo(null);
      try {
        const res = await garageApi.post<{
          posted: Array<{ channel: string; topic: string }>;
          skipped: Array<{ channel: string; topic: string; reason: string }>;
        }>("/api/chat/bot/sweep", {});
        if (!silent) {
          const postedCount = res.posted.length;
          setBotSweepInfo(
            postedCount > 0
              ? `Bot kirim ${postedCount} alert.`
              : `Tidak ada alert baru. (${res.skipped.length} skipped)`,
          );
        }
        if (res.posted.length > 0) await loadChannels();
      } catch (err) {
        if (!silent) {
          setBotSweepInfo(err instanceof GarageApiError ? err.message : "Gagal sweep.");
        }
      } finally {
        setBotSweeping(false);
      }
    },
    [botSweeping, loadChannels],
  );

  // Auto-trigger sweep saat module dimount (debounce via localStorage 5 menit)
  useEffect(() => {
    const key = "garage:chat:lastBotSweepAt";
    try {
      const last = Number(localStorage.getItem(key) ?? 0);
      const now = Date.now();
      if (now - last >= 5 * 60 * 1000) {
        localStorage.setItem(key, String(now));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- background sweep on mount
        void runBotSweep(true);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, [runBotSweep]);

  // Group messages by day
  const groupedMessages = useMemo(() => {
    const groups: Array<{ day: string; items: ChatMessage[] }> = [];
    for (const msg of messages) {
      if (!dateFilterPredicate(msg.createdAt)) continue;
      const dayLabel = formatDayLabel(msg.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.day === dayLabel) {
        last.items.push(msg);
      } else {
        groups.push({ day: dayLabel, items: [msg] });
      }
    }
    return groups;
  }, [messages, dateFilterPredicate]);

  const sortedChannels = useMemo(() => {
    return [...channels].sort((a, b) => {
      const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bt - at;
    });
  }, [channels]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return chatUsers;
    return chatUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q),
    );
  }, [chatUsers, userQuery]);

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">
              Chat
            </p>
            <h1 className="mt-1 text-xl font-black text-white sm:text-2xl">
              Chat Internal Tim
            </h1>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Channel role, broadcast tim, dan DM 1-on-1.{" "}
              <span
                className={`garage-mono text-[10px] ${
                  streamConnected ? "text-[#bbf7d0]" : "text-[#ff8a93]"
                }`}
              >
                {streamConnected ? "● Realtime" : "○ Reconnecting…"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {botSweepInfo ? (
              <span className="garage-mono text-[10px] text-[#8f8f99]">{botSweepInfo}</span>
            ) : null}
            {ceoBroadcastInfo ? (
              <span className="garage-mono text-[10px] text-[#ffd08a]">{ceoBroadcastInfo}</span>
            ) : null}
            {canBroadcastCeo ? (
              <Button
                type="button"
                size="sm"
                onClick={() => void runCeoBroadcast()}
                disabled={ceoBroadcasting}
                className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/20 text-xs font-bold text-[#ffc2c8] hover:bg-[#d11a2a]/30"
                variant="outline"
                title="Jalankan Garage CEO AI: broadcast instruksi per role + buat draft approval"
              >
                {ceoBroadcasting ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Megaphone className="mr-1 h-3.5 w-3.5" />
                )}
                CEO AI Broadcast
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => void runBotSweep(false)}
              disabled={botSweeping}
              className="garage-press h-8 border-[#3b82f6]/40 bg-[#3b82f6]/15 text-xs font-bold text-[#bfdbfe] hover:bg-[#3b82f6]/25"
              variant="outline"
              title="Jalankan GarageBot smart-alert sweep"
            >
              {botSweeping ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageCircle className="mr-1 h-3.5 w-3.5" />
              )}
              Bot sweep
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void openUserPicker()}
              className="garage-press h-8 border-[#ffd08a]/40 bg-[#ffd08a]/15 text-xs font-bold text-[#ffd08a] hover:bg-[#ffd08a]/25"
              variant="outline"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              DM baru
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Sidebar */}
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-2">
          <div className="garage-mono px-2 pb-2 pt-1 text-[10px] uppercase text-[#8f8f99]">
            {channelsLoading ? "Memuat…" : `${sortedChannels.length} channel`}
          </div>
          <div className="garage-scroll max-h-[560px] space-y-1 overflow-y-auto pr-1">
            {sortedChannels.map((c) => {
              const isActive = c.id === activeChannelId;
              const Icon = c.type === "direct" ? MessageCircle : c.type === "role" ? Users : Hash;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveChannelId(c.id)}
                  className={`flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition ${
                    isActive
                      ? "border-[#d11a2a]/45 bg-[#d11a2a]/12"
                      : "border-transparent hover:bg-white/[0.04]"
                  }`}
                >
                  <Icon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      isActive ? "text-[#ff8a93]" : "text-[#b8b8bf]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] font-semibold text-white">{c.name}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {draftChannels.has(c.id) ? (
                          <span
                            title="Draft belum terkirim"
                            className="garage-mono rounded-full border border-[#f5a742]/50 bg-[#f5a742]/15 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-[#ffd08a]"
                          >
                            Draft
                          </span>
                        ) : null}
                        {c.unread > 0 ? (
                          <span className="garage-mono rounded-full bg-[#d11a2a] px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {c.preview ? (
                      <p className="garage-mono mt-0.5 truncate text-[10px] text-[#8f8f99]">
                        {c.preview}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
            {!channelsLoading && sortedChannels.length === 0 ? (
              <p className="garage-mono px-2 py-4 text-[10px] text-[#8f8f99]">
                Belum ada channel.
              </p>
            ) : null}
          </div>
        </div>

        {/* Thread */}
        <div className="flex h-[640px] flex-col rounded-lg border border-[#34343c] bg-[#111116]">
          {activeChannel ? (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-[#34343c] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{activeChannel.name}</p>
                  <p className="garage-mono text-[10px] text-[#8f8f99]">
                    {activeChannel.type === "direct"
                      ? "Direct message"
                      : activeChannel.type === "role"
                        ? "Role channel"
                        : "Broadcast tim"}
                    {" · "}
                    {activeChannel.members.length} member
                  </p>
                </div>
              </div>

              {activeRoleName && tasks.length > 0 ? (
                <div className="border-b border-[#34343c] bg-[#0f0f14] px-4 py-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5 text-[#ffd08a]" />
                    <p className="garage-mono text-[10px] uppercase tracking-wider text-[#ffd08a]">
                      Tugas CEO AI · {tasks.length}
                      {tasksLoading ? " · memuat…" : ""}
                    </p>
                  </div>
                  <div className="garage-scroll max-h-[140px] space-y-1.5 overflow-y-auto pr-1">
                    {tasks.map((t) => {
                      const isDone = t.status === "done";
                      const isAck = t.status === "acknowledged";
                      const priorityColor =
                        t.priority === "high"
                          ? "text-[#ff8a93] border-[#d11a2a]/45"
                          : t.priority === "medium"
                            ? "text-[#ffd08a] border-[#f5a742]/45"
                            : "text-[#bfdbfe] border-[#3b82f6]/40";
                      return (
                        <div
                          key={t.id}
                          className={`rounded-md border bg-[#111116] px-2.5 py-1.5 ${priorityColor.split(" ")[1]}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p
                                className={`truncate text-[12px] font-semibold ${
                                  isDone ? "text-[#8f8f99] line-through" : "text-white"
                                }`}
                              >
                                {t.title}
                              </p>
                              <p className="garage-mono mt-0.5 line-clamp-2 text-[10px] text-[#b8b8bf]">
                                {t.detail}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <span
                                className={`garage-mono rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold uppercase ${priorityColor}`}
                              >
                                {t.priority}
                              </span>
                              {!isDone ? (
                                <>
                                  {!isAck ? (
                                    <button
                                      type="button"
                                      title="Acknowledge"
                                      disabled={taskActionId === t.id}
                                      onClick={() => void handleTaskAction(t.id, "acknowledge")}
                                      className="garage-press flex h-6 w-6 items-center justify-center rounded border border-[#3b82f6]/40 bg-[#3b82f6]/15 text-[#bfdbfe] hover:bg-[#3b82f6]/25 disabled:opacity-50"
                                    >
                                      <Check className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    title="Tandai selesai"
                                    disabled={taskActionId === t.id}
                                    onClick={() => void handleTaskAction(t.id, "complete")}
                                    className="garage-press flex h-6 w-6 items-center justify-center rounded border border-[#86efac]/40 bg-[#86efac]/15 text-[#bbf7d0] hover:bg-[#86efac]/25 disabled:opacity-50"
                                  >
                                    <CheckCheck className="h-3 w-3" />
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div
                ref={scrollRef}
                className="garage-scroll flex-1 space-y-3 overflow-y-auto px-4 py-3"
              >
                {messageLoading && messages.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-[#8f8f99]">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="text-xs">Memuat pesan…</span>
                  </div>
                ) : null}
                {!messageLoading && messages.length === 0 ? (
                  <p className="garage-mono py-8 text-center text-[11px] text-[#8f8f99]">
                    Belum ada pesan. Mulai obrolan!
                  </p>
                ) : null}
                {groupedMessages.map((g) => (
                  <div key={g.day} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-[#34343c]" />
                      <span className="garage-mono text-[9px] uppercase text-[#8f8f99]">
                        {g.day}
                      </span>
                      <div className="h-px flex-1 bg-[#34343c]" />
                    </div>
                    {g.items.map((m) => {
                      const mine = m.senderUserId === currentUserId;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg border px-3 py-2 ${
                              mine
                                ? "border-[#d11a2a]/40 bg-[#d11a2a]/15 text-white"
                                : "border-[#34343c] bg-[#0f0f14] text-[#e5e5ea]"
                            }`}
                          >
                            {!mine ? (
                              <p className="garage-mono mb-1 text-[10px] font-bold text-[#ffd08a]">
                                {m.senderName}
                              </p>
                            ) : null}
                            {m.body ? (
                              <p className="whitespace-pre-wrap break-words text-[13px] leading-snug">
                                {renderMessageBody(m.body, currentUserName, currentUserRole)}
                              </p>
                            ) : null}
                            {m.attachmentUrl ? (
                              <div className="mt-2">
                                {m.attachmentType?.startsWith("image/") ? (
                                  <a href={m.attachmentUrl} target="_blank" rel="noreferrer">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={m.attachmentUrl}
                                      alt="attachment"
                                      className="max-h-56 rounded-md border border-[#34343c]"
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={m.attachmentUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="garage-mono inline-flex items-center gap-1 rounded-md border border-[#34343c] bg-black/30 px-2 py-1 text-[11px] text-[#ffd08a] hover:bg-black/50"
                                  >
                                    <Paperclip className="h-3 w-3" />
                                    Lampiran {formatSize(m.attachmentSize)}
                                  </a>
                                )}
                              </div>
                            ) : null}
                          </div>
                          <p className="garage-mono mt-0.5 text-[9px] text-[#8f8f99]">
                            {formatTime(m.createdAt)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="border-t border-[#34343c] p-2.5">
                {pendingAttachment ? (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-[#ffd08a]/30 bg-[#ffd08a]/10 px-2.5 py-1.5">
                    <div className="garage-mono flex items-center gap-1.5 text-[11px] text-[#ffd08a]">
                      <Paperclip className="h-3 w-3" />
                      {pendingAttachment.name}
                      <span className="text-[#8f8f99]">
                        ({formatSize(pendingAttachment.size)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingAttachment(null)}
                      className="text-[#ff8a93] hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => void handleFileSelect(e)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="garage-press h-10 w-10 shrink-0 border-[#4a4a54] p-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAttachment}
                  >
                    {uploadingAttachment ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </Button>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder="Tulis pesan… (Enter kirim, Shift+Enter newline)"
                    rows={1}
                    className="garage-scroll max-h-32 flex-1 resize-none rounded-md border border-[#34343c] bg-[#0f0f14] px-3 py-2 text-sm text-white placeholder:text-[#8f8f99] focus:border-[#ffd08a] focus:outline-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void handleSend()}
                    disabled={sending || (!draft.trim() && !pendingAttachment)}
                    className="garage-press h-10 shrink-0 border-[#d11a2a]/40 bg-[#d11a2a]/85 px-3 text-xs font-bold text-white hover:bg-[#d11a2a]"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {error ? (
                  <p className="mt-1.5 text-[11px] text-[#ff8a93]">{error}</p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-[#8f8f99]">
              <p className="garage-mono text-xs">Pilih channel untuk mulai chat.</p>
            </div>
          )}
        </div>
      </div>

      {userPickerOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setUserPickerOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[#34343c] bg-[#111116] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-white">Mulai DM</p>
              <button
                type="button"
                onClick={() => setUserPickerOpen(false)}
                className="text-[#8f8f99] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-2 flex items-center gap-2 rounded-md border border-[#34343c] bg-[#0f0f14] px-2.5">
              <Search className="h-3.5 w-3.5 text-[#8f8f99]" />
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Cari nama atau role…"
                className="h-9 flex-1 bg-transparent text-sm text-white placeholder:text-[#8f8f99] focus:outline-none"
              />
            </div>
            <div className="garage-scroll max-h-72 space-y-1 overflow-y-auto pr-1">
              {filteredUsers.length === 0 ? (
                <p className="garage-mono py-4 text-center text-[10px] text-[#8f8f99]">
                  Tidak ada user ditemukan.
                </p>
              ) : null}
              {filteredUsers.map((u) => (
                <button
                  key={u.userId}
                  type="button"
                  onClick={() => void startDmWith(u.userId)}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-[#34343c] bg-[#0f0f14] px-2.5 py-2 text-left hover:border-[#ffd08a]/30 hover:bg-[#ffd08a]/5"
                >
                  <div>
                    <p className="text-[12px] font-semibold text-white">{u.name}</p>
                    <p className="garage-mono text-[10px] text-[#8f8f99]">{u.role}</p>
                  </div>
                  <MessageCircle className="h-3.5 w-3.5 text-[#ffd08a]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
