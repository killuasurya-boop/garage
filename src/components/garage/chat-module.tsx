"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  Bold,
  Check,
  CheckCheck,
  Clock,
  Eye,
  Handshake,
  Hash,
  Italic,
  List,
  ListChecks,
  Loader2,
  Megaphone,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Signature,
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

type ChatWorkspaceScreen = "thread" | "relay" | "broadcast" | "handover";

type OrderRelayStatus = "received" | "in_progress" | "ready" | "served";

type OrderRelayItem = {
  id: string;
  orderNo: string;
  tableNo: string;
  items: Array<{ name: string; qty: number }>;
  notes: string;
  status: OrderRelayStatus;
  quickText: string;
  targetUserId: string;
};

type StreamEvent =
  | { kind: "message"; channelId: string; memberUserIds: string[]; message: ChatMessage }
  | { kind: "read"; channelId: string; userId: string; lastReadAt: string };

const orderStatusSteps: Array<{ id: OrderRelayStatus; label: string }> = [
  { id: "received", label: "Received" },
  { id: "in_progress", label: "In Progress" },
  { id: "ready", label: "Ready" },
  { id: "served", label: "Served" },
];

const customerFacingRoles: Role[] = ["Kasir", "Waiter 1", "Waiter 2", "Supervisor Shift"];

const initialRelayOrders: OrderRelayItem[] = [
  {
    id: "relay-1034",
    orderNo: "ORD-1034",
    tableNo: "M05",
    items: [
      { name: "Es Kopi Garage", qty: 2 },
      { name: "Burger Brisket", qty: 1 },
      { name: "Kentang Goreng", qty: 1 },
    ],
    notes: "Tanpa bawang, antar dulu minuman.",
    status: "received",
    quickText: "Tolong update pelanggan meja M05: minuman diproses dulu, makanan menyusul.",
    targetUserId: "",
  },
  {
    id: "relay-1035",
    orderNo: "ORD-1035",
    tableNo: "T02",
    items: [
      { name: "V60 Flores", qty: 1 },
      { name: "Kebab Chicken", qty: 2 },
    ],
    notes: "Pelanggan minta estimasi waktu karena ada meeting.",
    status: "in_progress",
    quickText: "Kabari meja T02 estimasi order sekitar 8-10 menit lagi.",
    targetUserId: "",
  },
];

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
            : "font-semibold text-[#d4d4d8]"
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
  const [workspaceScreen, setWorkspaceScreen] = useState<ChatWorkspaceScreen>("thread");
  const [relayOrders, setRelayOrders] = useState<OrderRelayItem[]>(initialRelayOrders);
  const [relayActionId, setRelayActionId] = useState<string | null>(null);
  const [broadcastRecipientMode, setBroadcastRecipientMode] = useState<"all" | "role" | "shift">(
    "all",
  );
  const [broadcastRole, setBroadcastRole] = useState<Role>("Kasir");
  const [broadcastShift, setBroadcastShift] = useState("Shift aktif");
  const [broadcastUrgency, setBroadcastUrgency] = useState<"normal" | "urgent">("normal");
  const [broadcastSchedule, setBroadcastSchedule] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastPreviewOpen, setBroadcastPreviewOpen] = useState(true);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastScheduleInfo, setBroadcastScheduleInfo] = useState<string | null>(null);
  const [handoverForm, setHandoverForm] = useState({
    ongoingOrders: "",
    stockNotes: "",
    incidents: "",
    reminders: "",
    incomingStaff: "",
    signature: currentUserName,
  });
  const [handoverAckName, setHandoverAckName] = useState("");
  const [handoverSending, setHandoverSending] = useState(false);
  const [handoverAcked, setHandoverAcked] = useState(false);

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
      
      const msgText = draft.trim().toLowerCase();
      if (msgText.includes("!tanya") || msgText.includes("@garagebot") || msgText.includes("@bot")) {
        garageApi.post("/api/chat/bot/ask", { channelId: activeChannelId, text: draft.trim() }).catch(console.error);
      }
      
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

  const ensureChatUsersLoaded = useCallback(async () => {
    if (chatUsers.length > 0) return chatUsers;
    const res = await garageApi.get<{ users: ChatUser[] }>("/api/chat/users", {
      cache: "no-store",
    });
    setChatUsers(res.users);
    return res.users;
  }, [chatUsers]);

  const sendMessageToChannel = useCallback(
    async (channelId: string, body: string) => {
      await garageApi.post(`/api/chat/channels/${channelId}/messages`, { body });
      await loadChannels();
      if (channelId === activeChannelId) {
        await loadMessages(channelId);
      }
    },
    [activeChannelId, loadChannels, loadMessages],
  );

  const globalChannelId = useMemo(
    () => channels.find((c) => c.type === "broadcast")?.id ?? activeChannelId,
    [activeChannelId, channels],
  );

  const customerFacingUsers = useMemo(
    () => chatUsers.filter((u) => customerFacingRoles.includes(u.role)),
    [chatUsers],
  );

  const activeRoleChannelId = useMemo(
    () => channels.find((c) => c.roleKey === `role:${broadcastRole}`)?.id ?? null,
    [broadcastRole, channels],
  );

  const setRelayStatus = useCallback((orderId: string, status: OrderRelayStatus) => {
    setRelayOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, status } : order)),
    );
  }, []);

  const updateRelayOrder = useCallback(
    (orderId: string, patch: Partial<OrderRelayItem>) => {
      setRelayOrders((prev) =>
        prev.map((order) => (order.id === orderId ? { ...order, ...patch } : order)),
      );
    },
    [],
  );

  const acknowledgeRelayOrder = useCallback(
    async (order: OrderRelayItem) => {
      if (!globalChannelId) return;
      setRelayActionId(order.id);
      try {
        setRelayStatus(order.id, "in_progress");
        await sendMessageToChannel(
          globalChannelId,
          `[ORDER RELAY ACK]\n${order.orderNo} meja ${order.tableNo} sudah diterima dan masuk proses.\nCatatan: ${order.notes || "-"}`,
        );
      } catch (err) {
        setError(err instanceof GarageApiError ? err.message : "Gagal acknowledge order.");
      } finally {
        setRelayActionId(null);
      }
    },
    [globalChannelId, sendMessageToChannel, setRelayStatus],
  );

  const completeRelayOrder = useCallback(
    async (order: OrderRelayItem) => {
      if (!globalChannelId) return;
      setRelayActionId(order.id);
      try {
        setRelayStatus(order.id, "served");
        await sendMessageToChannel(
          globalChannelId,
          `[ORDER RELAY DONE]\n${order.orderNo} meja ${order.tableNo} sudah served.\nItem: ${order.items
            .map((item) => `${item.qty}x ${item.name}`)
            .join(", ")}`,
        );
      } catch (err) {
        setError(err instanceof GarageApiError ? err.message : "Gagal menandai order selesai.");
      } finally {
        setRelayActionId(null);
      }
    },
    [globalChannelId, sendMessageToChannel, setRelayStatus],
  );

  const sendRelayQuickChat = useCallback(
    async (order: OrderRelayItem) => {
      setRelayActionId(order.id);
      try {
        const users = await ensureChatUsersLoaded();
        const targetId =
          order.targetUserId ||
          users.find((u) => customerFacingRoles.includes(u.role))?.userId ||
          null;
        if (!targetId) {
          throw new Error("Belum ada staff customer-facing untuk quick chat.");
        }
        const res = await garageApi.post<{ channelId: string }>("/api/chat/channels", {
          type: "direct",
          peerUserId: targetId,
        });
        await sendMessageToChannel(
          res.channelId,
          `[ORDER QUICK CHAT]\n${order.orderNo} meja ${order.tableNo}\n${order.quickText.trim()}`,
        );
        setActiveChannelId(res.channelId);
        setWorkspaceScreen("thread");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal kirim quick chat.");
      } finally {
        setRelayActionId(null);
      }
    },
    [ensureChatUsersLoaded, sendMessageToChannel],
  );

  const insertBroadcastMarkup = useCallback((before: string, after = before) => {
    setBroadcastBody((current) => {
      const trimmed = current.trim();
      if (!trimmed) return `${before}teks${after}`;
      return `${before}${trimmed}${after}`;
    });
  }, []);

  const broadcastRecipientLabel =
    broadcastRecipientMode === "all"
      ? "All Staff"
      : broadcastRecipientMode === "role"
        ? `Role: ${broadcastRole}`
        : `Shift: ${broadcastShift || "Shift aktif"}`;

  const broadcastPreview = `${broadcastUrgency === "urgent" ? "[URGENT]\n" : ""}[BROADCAST]\nKepada: ${broadcastRecipientLabel}${
    broadcastSchedule ? `\nJadwal kirim: ${broadcastSchedule}` : ""
  }\n\n${broadcastBody.trim() || "(isi pengumuman kosong)"}`;

  const sendBroadcastComposer = useCallback(async () => {
    const targetChannelId =
      broadcastRecipientMode === "role" && activeRoleChannelId
        ? activeRoleChannelId
        : globalChannelId;
    if (!targetChannelId) return;
    if (!broadcastBody.trim()) {
      setError("Isi broadcast belum boleh kosong.");
      return;
    }
    setBroadcastSending(true);
    setError(null);
    try {
      const scheduledAt = broadcastSchedule ? new Date(broadcastSchedule).getTime() : 0;
      const delayMs = scheduledAt - Date.now();
      if (delayMs > 1000) {
        window.setTimeout(() => {
          void sendMessageToChannel(targetChannelId, broadcastPreview).catch(() => {
            setError("Broadcast terjadwal gagal terkirim.");
          });
        }, delayMs);
        setBroadcastScheduleInfo(
          `Broadcast dijadwalkan untuk ${new Date(scheduledAt).toLocaleString("id-ID")}. Browser ini harus tetap aktif.`,
        );
      } else {
        await sendMessageToChannel(targetChannelId, broadcastPreview);
        setBroadcastScheduleInfo(null);
      }
      setBroadcastBody("");
      setBroadcastSchedule("");
      setBroadcastPreviewOpen(true);
      setActiveChannelId(targetChannelId);
      setWorkspaceScreen("thread");
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal mengirim broadcast.");
    } finally {
      setBroadcastSending(false);
    }
  }, [
    activeRoleChannelId,
    broadcastBody,
    broadcastPreview,
    broadcastRecipientMode,
    broadcastSchedule,
    globalChannelId,
    sendMessageToChannel,
  ]);

  const handoverPreview = `[PINNED HANDOVER]\nDari: ${currentUserName || "Staff"}\nUntuk: ${
    handoverForm.incomingStaff || "Incoming shift"
  }\nTanda tangan: ${handoverForm.signature || "-"}\n\nOngoing orders:\n${
    handoverForm.ongoingOrders || "-"
  }\n\nStock notes:\n${handoverForm.stockNotes || "-"}\n\nIncidents:\n${
    handoverForm.incidents || "-"
  }\n\nReminders:\n${handoverForm.reminders || "-"}`;

  const sendHandoverMessage = useCallback(async () => {
    if (!globalChannelId) return;
    if (!handoverForm.signature.trim()) {
      setError("Tanda tangan digital wajib diisi.");
      return;
    }
    setHandoverSending(true);
    setError(null);
    try {
      await sendMessageToChannel(globalChannelId, handoverPreview);
      setHandoverAcked(false);
      setActiveChannelId(globalChannelId);
      setWorkspaceScreen("thread");
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal kirim handover.");
    } finally {
      setHandoverSending(false);
    }
  }, [globalChannelId, handoverForm.signature, handoverPreview, sendMessageToChannel]);

  const acknowledgeHandover = useCallback(async () => {
    if (!globalChannelId || !handoverAckName.trim()) return;
    setHandoverSending(true);
    try {
      await sendMessageToChannel(
        globalChannelId,
        `[HANDOVER ACK]\n${handoverAckName.trim()} sudah acknowledge handover dari ${currentUserName || "shift sebelumnya"}.`,
      );
      setHandoverAcked(true);
      setHandoverAckName("");
    } catch (err) {
      setError(err instanceof GarageApiError ? err.message : "Gagal acknowledge handover.");
    } finally {
      setHandoverSending(false);
    }
  }, [currentUserName, globalChannelId, handoverAckName, sendMessageToChannel]);

  const [botSweeping, setBotSweeping] = useState(false);
  const [botSweepInfo, setBotSweepInfo] = useState<string | null>(null);
  const [ceoBroadcasting, setCeoBroadcasting] = useState(false);
  const [ceoBroadcastInfo, setCeoBroadcastInfo] = useState<string | null>(null);
  const [ceoBroadcastFocus, setCeoBroadcastFocus] = useState("");

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
      }>("/api/ai/ceo-broadcast", { focus: ceoBroadcastFocus || undefined });
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
  }, [ceoBroadcasting, ceoBroadcastFocus, loadChannels]);

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
            <p className="font-mono text-[11px] uppercase text-[#f5a742]">
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
            {broadcastScheduleInfo ? (
              <span className="garage-mono text-[10px] text-[#bbf7d0]">
                {broadcastScheduleInfo}
              </span>
            ) : null}
            {canBroadcastCeo ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Fokus instruksi (opsional)..."
                  value={ceoBroadcastFocus}
                  onChange={(e) => setCeoBroadcastFocus(e.target.value)}
                  disabled={ceoBroadcasting}
                  className="h-8 w-48 rounded-md border border-[#3f3f46] bg-[#18181b] px-2 py-1 text-xs text-white placeholder:text-[#71717a] focus:border-[#d11a2a] focus:outline-none"
                />
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
              </div>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => void runBotSweep(false)}
              disabled={botSweeping}
              className="garage-press h-8 border-[#d4d4d8]/35 bg-[#d4d4d8]/10 text-xs font-bold text-[#d4d4d8] hover:bg-[#d4d4d8]/15"
              variant="outline"
              title="Jalankan GarageBot smart-alert sweep"
            >
              {botSweeping ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageCircle className="mr-1 h-3.5 w-3.5" />
              )}
              Sweep bot
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

      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-2">
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            { id: "thread", label: "Live Chat", icon: MessageCircle },
            { id: "relay", label: "Order Relay", icon: BellRing },
            { id: "broadcast", label: "Broadcast", icon: Megaphone },
            { id: "handover", label: "Shift Handover", icon: Handshake },
          ].map((item) => {
            const Icon = item.icon;
            const active = workspaceScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  const nextScreen = item.id as ChatWorkspaceScreen;
                  setWorkspaceScreen(nextScreen);
                  if (nextScreen === "relay") {
                    void ensureChatUsersLoaded().catch(() => {
                      setError("Gagal memuat staff untuk quick chat order.");
                    });
                  }
                }}
                className={`garage-press flex h-10 items-center justify-center gap-2 rounded-md border px-3 text-xs font-bold transition ${
                  active
                    ? "border-[#d11a2a]/55 bg-[#d11a2a]/18 text-white"
                    : "border-[#34343c] bg-[#18181f] text-[#b8b8bf] hover:border-[#4a4a54] hover:text-white"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {workspaceScreen === "relay" ? (
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="garage-mono text-[10px] uppercase text-[#ffd08a]">
                Order Relay Screen
              </p>
              <h2 className="text-lg font-black text-white">Incoming order relay</h2>
              <p className="mt-1 text-xs text-[#b8b8bf]">
                Card notifikasi order, tracker status, ACK/DONE, dan quick chat ke staff customer-facing.
              </p>
            </div>
            <span className="garage-mono rounded-full border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-2 py-1 text-[10px] text-[#ffb0b8]">
              {relayOrders.filter((order) => order.status !== "served").length} aktif
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {relayOrders.map((order) => {
              const statusIndex = orderStatusSteps.findIndex((step) => step.id === order.status);
              return (
                <div key={order.id} className="rounded-lg border border-[#34343c] bg-[#0f0f14] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="garage-mono text-[10px] text-[#8f8f99]">Order number</p>
                      <h3 className="text-base font-black text-white">{order.orderNo}</h3>
                    </div>
                    <div className="rounded-md border border-[#ffd08a]/35 bg-[#ffd08a]/10 px-2 py-1 text-right">
                      <p className="garage-mono text-[9px] text-[#ffd08a]">Table</p>
                      <p className="text-sm font-black text-white">{order.tableNo}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md border border-[#34343c] bg-[#18181f] p-2">
                    <p className="garage-mono mb-1 text-[10px] uppercase text-[#8f8f99]">Items</p>
                    <div className="space-y-1">
                      {order.items.map((item) => (
                        <div key={`${order.id}-${item.name}`} className="flex justify-between gap-2 text-xs">
                          <span className="text-[#e5e5ea]">{item.name}</span>
                          <span className="garage-mono text-[#ffd08a]">{item.qty}x</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 rounded border border-[#d11a2a]/25 bg-[#d11a2a]/10 px-2 py-1 text-xs text-[#ffc2c8]">
                      {order.notes}
                    </p>
                  </div>

                  <div className="mt-3">
                    <p className="garage-mono mb-2 text-[10px] uppercase text-[#8f8f99]">Status tracker</p>
                    <div className="grid grid-cols-4 gap-1">
                      {orderStatusSteps.map((step, index) => {
                        const done = index <= statusIndex;
                        return (
                          <button
                            key={step.id}
                            type="button"
                            onClick={() => setRelayStatus(order.id, step.id)}
                            className={`min-h-11 rounded border px-1.5 py-1 text-center text-[10px] font-bold transition ${
                              done
                                ? "border-[#86efac]/40 bg-[#86efac]/12 text-[#bbf7d0]"
                                : "border-[#34343c] bg-[#18181f] text-[#8f8f99]"
                            }`}
                          >
                            {step.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void acknowledgeRelayOrder(order)}
                      disabled={relayActionId === order.id || order.status === "served"}
                      className="garage-press border-[#ffd08a]/40 bg-[#ffd08a]/12 text-xs font-bold text-[#ffd08a]"
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Acknowledge
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void completeRelayOrder(order)}
                      disabled={relayActionId === order.id}
                      className="garage-press bg-[#d11a2a] text-xs font-bold text-white hover:bg-[#b51624]"
                    >
                      <CheckCheck className="mr-1 h-3.5 w-3.5" />
                      Done
                    </Button>
                  </div>

                  <div className="mt-3 rounded-md border border-[#34343c] bg-[#111116] p-2">
                    <div className="mb-2 flex items-center gap-1.5">
                      <MessageCircle className="h-3.5 w-3.5 text-[#ffd08a]" />
                      <p className="garage-mono text-[10px] uppercase text-[#ffd08a]">
                        Quick chat customer-facing staff
                      </p>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto]">
                      <select
                        value={order.targetUserId}
                        onChange={(event) =>
                          updateRelayOrder(order.id, { targetUserId: event.target.value })
                        }
                        className="h-9 rounded-md border border-[#34343c] bg-[#18181f] px-2 text-xs text-white"
                      >
                        <option value="">Auto pilih staff</option>
                        {customerFacingUsers.map((staff) => (
                          <option key={staff.userId} value={staff.userId}>
                            {staff.name} - {staff.role}
                          </option>
                        ))}
                      </select>
                      <input
                        value={order.quickText}
                        onChange={(event) =>
                          updateRelayOrder(order.id, { quickText: event.target.value })
                        }
                        className="h-9 rounded-md border border-[#34343c] bg-[#18181f] px-2 text-xs text-white placeholder:text-[#8f8f99]"
                        placeholder="Pesan cepat untuk staff..."
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void sendRelayQuickChat(order)}
                        disabled={relayActionId === order.id || !order.quickText.trim()}
                        className="garage-press h-9 bg-[#f5a742] text-xs font-black text-[#111116] hover:bg-[#ffd08a]"
                      >
                        <Send className="mr-1 h-3.5 w-3.5" />
                        Kirim
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {workspaceScreen === "broadcast" ? (
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="garage-mono text-[10px] uppercase text-[#ffd08a]">
                Broadcast / Announcement Composer
              </p>
              <h2 className="text-lg font-black text-white">Composer pengumuman staff</h2>
              <p className="mt-1 text-xs text-[#b8b8bf]">
                Rich text markdown, recipient selector, schedule send, urgency, dan preview sebelum kirim.
              </p>
            </div>
            {broadcastUrgency === "urgent" ? (
              <span className="garage-mono inline-flex items-center gap-1 rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/18 px-2 py-1 text-[10px] font-black text-[#ffb0b8]">
                <AlertTriangle className="h-3 w-3" />
                URGENT
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="garage-mono text-[10px] text-[#8f8f99]">Recipient</span>
                  <select
                    value={broadcastRecipientMode}
                    onChange={(event) =>
                      setBroadcastRecipientMode(event.target.value as "all" | "role" | "shift")
                    }
                    className="h-10 w-full rounded-md border border-[#34343c] bg-[#18181f] px-2 text-sm text-white"
                  >
                    <option value="all">All Staff</option>
                    <option value="role">By Role</option>
                    <option value="shift">By Shift</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="garage-mono text-[10px] text-[#8f8f99]">Role / Shift</span>
                  {broadcastRecipientMode === "role" ? (
                    <select
                      value={broadcastRole}
                      onChange={(event) => setBroadcastRole(event.target.value as Role)}
                      className="h-10 w-full rounded-md border border-[#34343c] bg-[#18181f] px-2 text-sm text-white"
                    >
                      {["Owner / CEO", "Admin", "Manager Operasional", "Kasir", "Barista", "Koki", "Waiter 1", "Waiter 2", "Supervisor Shift"].map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={broadcastShift}
                      onChange={(event) => setBroadcastShift(event.target.value)}
                      disabled={broadcastRecipientMode !== "shift"}
                      className="h-10 w-full rounded-md border border-[#34343c] bg-[#18181f] px-2 text-sm text-white disabled:opacity-50"
                      placeholder="Shift aktif / Pagi / Malam"
                    />
                  )}
                </label>
                <label className="space-y-1">
                  <span className="garage-mono text-[10px] text-[#8f8f99]">Send later</span>
                  <input
                    type="datetime-local"
                    value={broadcastSchedule}
                    onChange={(event) => setBroadcastSchedule(event.target.value)}
                    className="h-10 w-full rounded-md border border-[#34343c] bg-[#18181f] px-2 text-sm text-white"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#34343c] bg-[#0f0f14] p-2">
                <Button type="button" size="sm" variant="outline" onClick={() => insertBroadcastMarkup("**")} className="h-8 border-[#4a4a54] px-2">
                  <Bold className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => insertBroadcastMarkup("_")} className="h-8 border-[#4a4a54] px-2">
                  <Italic className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setBroadcastBody((current) => `${current}${current.endsWith("\n") || !current ? "" : "\n"}- item pengumuman`)}
                  className="h-8 border-[#4a4a54] px-2"
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
                <div className="ml-auto flex rounded-md border border-[#34343c] bg-[#18181f] p-1">
                  {(["normal", "urgent"] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setBroadcastUrgency(level)}
                      className={`rounded px-3 py-1 text-xs font-bold ${
                        broadcastUrgency === level
                          ? level === "urgent"
                            ? "bg-[#d11a2a] text-white"
                            : "bg-[#d4d4d8] text-[#111116]"
                          : "text-[#8f8f99]"
                      }`}
                    >
                      {level === "urgent" ? "Urgent" : "Normal"}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={broadcastBody}
                onChange={(event) => setBroadcastBody(event.target.value)}
                rows={7}
                className="garage-scroll w-full resize-none rounded-md border border-[#34343c] bg-[#0f0f14] px-3 py-2 text-sm text-white placeholder:text-[#8f8f99] focus:border-[#ffd08a] focus:outline-none"
                placeholder="Tulis pengumuman. Gunakan tombol B, I, list untuk format cepat."
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBroadcastPreviewOpen((value) => !value)}
                  className="garage-press border-[#4a4a54] text-xs"
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  {broadcastPreviewOpen ? "Sembunyikan preview" : "Preview"}
                </Button>
                <Button
                  type="button"
                  onClick={() => void sendBroadcastComposer()}
                  disabled={broadcastSending || !broadcastBody.trim()}
                  className="garage-press bg-[#d11a2a] text-xs font-black text-white hover:bg-[#b51624]"
                >
                  {broadcastSending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 h-3.5 w-3.5" />}
                  Kirim broadcast
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-[#34343c] bg-[#0f0f14] p-3">
              <div className="mb-2 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-[#ffd08a]" />
                <p className="garage-mono text-[10px] uppercase text-[#ffd08a]">Preview before sending</p>
              </div>
              {broadcastUrgency === "urgent" ? (
                <div className="mb-3 rounded-md border border-[#d11a2a]/55 bg-[#d11a2a]/18 px-3 py-2 text-xs font-bold text-[#ffc2c8]">
                  Urgent announcement akan tampil dengan banner merah di pesan.
                </div>
              ) : null}
              {broadcastPreviewOpen ? (
                <pre className="garage-scroll max-h-80 whitespace-pre-wrap rounded-md border border-[#34343c] bg-[#18181f] p-3 text-xs leading-5 text-[#e5e5ea]">
                  {broadcastPreview}
                </pre>
              ) : (
                <p className="garage-mono rounded-md border border-[#34343c] p-3 text-[10px] text-[#8f8f99]">
                  Preview disembunyikan.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {workspaceScreen === "handover" ? (
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="garage-mono text-[10px] uppercase text-[#ffd08a]">
                Shift Handover Chat
              </p>
              <h2 className="text-lg font-black text-white">Operan shift terstruktur</h2>
              <p className="mt-1 text-xs text-[#b8b8bf]">
                Form ongoing orders, stock notes, incidents, reminders, auto pinned message, dan acknowledge incoming shift.
              </p>
            </div>
            <span className={`garage-mono rounded-full border px-2 py-1 text-[10px] ${
              handoverAcked
                ? "border-[#86efac]/45 bg-[#86efac]/12 text-[#bbf7d0]"
                : "border-[#ffd08a]/40 bg-[#ffd08a]/10 text-[#ffd08a]"
            }`}>
              {handoverAcked ? "ACKED" : "WAITING ACK"}
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["ongoingOrders", "Ongoing orders", "Order yang masih berjalan, meja, estimasi, dan kendala."],
                ["stockNotes", "Stock notes", "Bahan menipis, stok kritis, item kosong."],
                ["incidents", "Incidents", "Komplain, refund, equipment issue, security."],
                ["reminders", "Reminders", "Reminder untuk shift berikutnya."],
              ].map(([key, label, placeholder]) => (
                <label key={key} className="space-y-1">
                  <span className="garage-mono text-[10px] text-[#8f8f99]">{label}</span>
                  <textarea
                    value={handoverForm[key as keyof typeof handoverForm]}
                    onChange={(event) =>
                      setHandoverForm((prev) => ({ ...prev, [key]: event.target.value }))
                    }
                    rows={4}
                    className="garage-scroll w-full resize-none rounded-md border border-[#34343c] bg-[#0f0f14] px-3 py-2 text-sm text-white placeholder:text-[#8f8f99]"
                    placeholder={placeholder}
                  />
                </label>
              ))}
              <label className="space-y-1">
                <span className="garage-mono text-[10px] text-[#8f8f99]">Incoming shift staff</span>
                <input
                  value={handoverForm.incomingStaff}
                  onChange={(event) =>
                    setHandoverForm((prev) => ({ ...prev, incomingStaff: event.target.value }))
                  }
                  className="h-10 w-full rounded-md border border-[#34343c] bg-[#0f0f14] px-3 text-sm text-white"
                  placeholder="Nama staff shift masuk"
                />
              </label>
              <label className="space-y-1">
                <span className="garage-mono text-[10px] text-[#8f8f99]">Digital signature</span>
                <div className="flex items-center gap-2">
                  <Signature className="h-4 w-4 text-[#ffd08a]" />
                  <input
                    value={handoverForm.signature}
                    onChange={(event) =>
                      setHandoverForm((prev) => ({ ...prev, signature: event.target.value }))
                    }
                    className="h-10 min-w-0 flex-1 rounded-md border border-[#34343c] bg-[#0f0f14] px-3 text-sm text-white"
                    placeholder="Tanda tangan digital"
                  />
                </div>
              </label>
              <div className="md:col-span-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => void sendHandoverMessage()}
                  disabled={handoverSending || !handoverForm.signature.trim()}
                  className="garage-press bg-[#d11a2a] text-xs font-black text-white hover:bg-[#b51624]"
                >
                  {handoverSending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Handshake className="mr-1 h-3.5 w-3.5" />}
                  Generate pinned message
                </Button>
                <input
                  value={handoverAckName}
                  onChange={(event) => setHandoverAckName(event.target.value)}
                  className="h-9 min-w-56 rounded-md border border-[#34343c] bg-[#0f0f14] px-3 text-xs text-white"
                  placeholder="Nama staff incoming untuk ACK"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void acknowledgeHandover()}
                  disabled={handoverSending || !handoverAckName.trim()}
                  className="garage-press h-9 border-[#86efac]/40 bg-[#86efac]/12 text-xs font-bold text-[#bbf7d0]"
                >
                  <CheckCheck className="mr-1 h-3.5 w-3.5" />
                  Acknowledge
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-[#34343c] bg-[#0f0f14] p-3">
              <p className="garage-mono mb-2 text-[10px] uppercase text-[#ffd08a]">
                Auto pinned message preview
              </p>
              <pre className="garage-scroll max-h-96 whitespace-pre-wrap rounded-md border border-[#34343c] bg-[#18181f] p-3 text-xs leading-5 text-[#e5e5ea]">
                {handoverPreview}
              </pre>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Sidebar */}
        <div className="rounded-lg border border-[#34343c] bg-[#111116] p-2">
          <div className="garage-mono px-2 pb-2 pt-1 text-[10px] uppercase text-[#8f8f99]">
            {channelsLoading ? "Memuat..." : `${sortedChannels.length} channel`}
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
                      : "border-transparent hover:bg-[#18181f]"
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
                            className="garage-mono rounded-full border border-[#f5a742]/50 bg-[#f5a742]/15 px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-[#ffd08a]"
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
                      ? "DM langsung"
                      : activeChannel.type === "role"
                        ? "Channel role"
                        : "Broadcast tim"}
                    {" - "}
                    {activeChannel.members.length} member
                  </p>
                </div>
              </div>

              {activeRoleName && tasks.length > 0 ? (
                <div className="border-b border-[#34343c] bg-[#0f0f14] px-4 py-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <ListChecks className="h-3.5 w-3.5 text-[#ffd08a]" />
                    <p className="garage-mono text-[10px] uppercase text-[#ffd08a]">
                      Tugas CEO AI - {tasks.length}
                      {tasksLoading ? " - memuat..." : ""}
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
                            : "text-[#d4d4d8] border-[#d4d4d8]/35";
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
                                      title="Akui tugas"
                                      disabled={taskActionId === t.id}
                                      onClick={() => void handleTaskAction(t.id, "acknowledge")}
                                      className="garage-press flex h-6 w-6 items-center justify-center rounded border border-[#d4d4d8]/35 bg-[#d4d4d8]/10 text-[#d4d4d8] hover:bg-[#d4d4d8]/15 disabled:opacity-50"
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
                    <span className="text-xs">Memuat pesan...</span>
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
                      const isUrgentBroadcast = m.body.startsWith("[URGENT]");
                      const isPinnedHandover = m.body.startsWith("[PINNED HANDOVER]");
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
                            {isUrgentBroadcast ? (
                              <div className="mb-2 flex items-center gap-1.5 rounded-md border border-[#d11a2a]/60 bg-[#d11a2a]/25 px-2 py-1 text-[10px] font-black uppercase text-[#ffc2c8]">
                                <AlertTriangle className="h-3 w-3" />
                                Urgent announcement
                              </div>
                            ) : null}
                            {isPinnedHandover ? (
                              <div className="mb-2 flex items-center gap-1.5 rounded-md border border-[#ffd08a]/45 bg-[#ffd08a]/15 px-2 py-1 text-[10px] font-black uppercase text-[#ffd08a]">
                                <Handshake className="h-3 w-3" />
                                Pinned shift handover
                              </div>
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
                                    className="garage-mono inline-flex items-center gap-1 rounded-md border border-[#34343c] bg-[#18181f] px-2 py-1 text-[11px] text-[#ffd08a] hover:bg-[#202027]"
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
                    placeholder="Tulis pesan... (Enter kirim, Shift+Enter baris baru)"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
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
                placeholder="Cari nama atau role..."
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
