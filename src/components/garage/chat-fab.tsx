"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, MessageCircle, X } from "lucide-react";

import { ChatModule } from "@/components/garage/chat-module";
import { garageApi } from "@/lib/api-client";
import type { Role } from "@/lib/garage-data";

type ChannelSummary = { id: string; unread: number };

const POS_KEY = "garage:chat:fab:pos";
const DRAG_THRESHOLD_PX = 6;
const EDGE_MARGIN = 12;

function mentionsMe(body: string, name: string, role: string): boolean {
  if (!body) return false;
  const targets = [name, role]
    .map((t) => t?.trim())
    .filter(Boolean)
    .map((t) => t.toLowerCase());
  if (targets.length === 0) return false;
  const re = /@([\p{L}\p{N} _-]{1,30})/giu;
  let m: RegExpExecArray | null;
  const lowerBody = body.toLowerCase();
  while ((m = re.exec(lowerBody)) !== null) {
    const tag = m[1].trim().toLowerCase();
    for (const target of targets) {
      if (tag === target || tag.startsWith(target + " ") || tag === target.replace(/\s+/g, "")) {
        return true;
      }
    }
  }
  return false;
}

function clampToViewport(x: number, y: number, size: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.max(EDGE_MARGIN, Math.min(x, vw - size - EDGE_MARGIN)),
    y: Math.max(EDGE_MARGIN, Math.min(y, vh - size - EDGE_MARGIN)),
  };
}

function loadPosition(size: number): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { x: number; y: number };
    if (typeof p.x !== "number" || typeof p.y !== "number") return null;
    return clampToViewport(p.x, p.y, size);
  } catch {
    return null;
  }
}

function savePosition(p: { x: number; y: number }) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function ChatFab({
  currentUserId,
  currentUserName,
  currentUserRole,
  hidden = false,
  compact = false,
}: {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: Role;
  hidden?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [mentioned, setMentioned] = useState(false);

  const fabSize = compact ? 44 : 56;
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    lastX: number;
    lastY: number;
  } | null>(null);

  // Initialize position once mounted (depends on window size).
  useEffect(() => {
    const init = () => {
      const saved = loadPosition(fabSize);
      if (saved) {
        setPos(saved);
      } else {
        // default: bottom-right
        setPos({
          x: window.innerWidth - fabSize - 20,
          y: window.innerHeight - fabSize - 20,
        });
      }
    };
    init();
    const onResize = () => {
      setPos((p) => (p ? clampToViewport(p.x, p.y, fabSize) : p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fabSize]);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await garageApi.get<{ channels: ChannelSummary[] }>(
        "/api/chat/channels",
        { cache: "no-store" },
      );
      const total = res.channels.reduce((sum, c) => sum + (c.unread ?? 0), 0);
      setUnread(total);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (open) return;
    // Fetch via microtask supaya bukan setState sinkron di body effect.
    const initial = window.setTimeout(() => void refreshUnread(), 0);
    const id = window.setInterval(() => void refreshUnread(), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(id);
    };
  }, [open, refreshUnread]);

  useEffect(() => {
    if (open) return;
    const es = new EventSource("/api/chat/stream");
    es.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as {
          kind: string;
          message?: { senderUserId: string; body: string };
        };
        if (
          event.kind === "message" &&
          event.message &&
          event.message.senderUserId !== currentUserId
        ) {
          setUnread((n) => n + 1);
          if (mentionsMe(event.message.body, currentUserName, currentUserRole)) {
            setMentioned(true);
          }
        }
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      /* browser auto-reconnect */
    };
    return () => es.close();
  }, [open, currentUserId, currentUserName, currentUserRole]);

  const openChat = useCallback(() => {
    setOpen(true);
    setUnread(0);
    setMentioned(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pos) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    try {
      (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore — synthetic pointers or older browsers */
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pos.x,
      originY: pos.y,
      moved: false,
      lastX: pos.x,
      lastY: pos.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    e.preventDefault();
    const next = clampToViewport(d.originX + dx, d.originY + dy, fabSize);
    d.lastX = next.x;
    d.lastY = next.y;
    setPos(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const moved = d.moved;
    const final = { x: d.lastX, y: d.lastY };
    dragRef.current = null;
    if (moved) {
      savePosition(final);
    } else {
      openChat();
    }
  };

  if (hidden) return null;

  return (
    <>
      {!open && pos ? (
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          aria-label={
            mentioned
              ? `Buka chat tim — kamu disebut${unread > 0 ? `, ${unread} pesan belum dibaca` : ""}`
              : "Buka chat tim (tahan & geser untuk pindah)"
          }
          title="Tahan & geser untuk pindah tombol"
          className={`garage-press fixed z-40 flex touch-none items-center justify-center rounded-full border text-white shadow-[0_10px_30px_rgba(209,26,42,0.45)] ${
            mentioned
              ? "garage-fab-mention border-[#ffd08a] bg-[#d11a2a] ring-2 ring-[#ffd08a]"
              : "border-[#d11a2a]/60 bg-[#d11a2a] hover:bg-[#ff2a3a]"
          } ${compact ? "h-11 w-11" : "h-14 w-14"}`}
          style={{ left: pos.x, top: pos.y, cursor: "grab" }}
        >
          {mentioned ? (
            <AtSign className={compact ? "h-5 w-5" : "h-6 w-6"} />
          ) : (
            <MessageCircle className={compact ? "h-5 w-5" : "h-6 w-6"} />
          )}
          {unread > 0 ? (
            <span
              className={`garage-mono absolute -right-1 -top-1 min-w-[20px] rounded-full border border-[#0b0b0e] px-1.5 py-0.5 text-[10px] font-extrabold ${
                mentioned ? "bg-[#ffd08a] text-[#101014]" : "bg-[#f5a742] text-[#101014]"
              }`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      ) : null}

      {open ? (
        // Widget live-chat mengambang: kompak di pojok kanan-bawah, TANPA backdrop
        // full-screen, supaya app di belakang tetap terlihat & bisa dipakai.
        <div
          className="garage-chat-widget fixed bottom-4 right-4 z-50 flex max-h-[calc(100dvh-2rem)] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-[#34343c] bg-[#0b0b0e] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
          style={{ height: "min(640px, calc(100dvh - 2rem))" }}
          role="dialog"
          aria-label="Chat tim"
        >
          {/* Header widget */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#34343c] bg-[#15151b] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d11a2a] text-white">
                <MessageCircle className="h-4 w-4" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#15151b] bg-[#22c55e]" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">Chat Tim Garage</p>
                <p className="truncate text-[10px] text-[#22c55e]">Online</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup chat"
              className="garage-press flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#4a4a54] bg-[#15151b] text-[#d4d4d8] hover:bg-[#1f1f27] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Isi chat */}
          <div className="garage-scroll min-h-0 flex-1 overflow-y-auto p-3">
            <ChatModule
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserRole={currentUserRole}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
