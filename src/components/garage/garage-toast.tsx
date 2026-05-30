"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Check, Info, TriangleAlert, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
  ttl: number;
};

type ToastContextValue = {
  push: (input: {
    tone?: ToastTone;
    title: string;
    body?: string;
    ttl?: number;
  }) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { border: string; bg: string; fg: string; icon: ReactNode }> = {
  success: {
    border: "border-[#22c55e]/55",
    bg: "bg-[#22c55e]/16",
    fg: "text-[#dcfce7]",
    icon: <Check size={16} />,
  },
  error: {
    border: "border-[#d11a2a]/55",
    bg: "bg-[#d11a2a]/16",
    fg: "text-[#ffe1e5]",
    icon: <TriangleAlert size={16} />,
  },
  info: {
    border: "border-white/20",
    bg: "bg-white/[0.06]",
    fg: "text-[#f4f4f5]",
    icon: <Info size={16} />,
  },
};

const GARAGE_TOAST_EVENT = "garage:toast";

type ToastEventDetail = {
  tone?: ToastTone;
  title: string;
  body?: string;
  ttl?: number;
};

export function emitGarageToast(detail: ToastEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastEventDetail>(GARAGE_TOAST_EVENT, { detail }));
}

export function GarageToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastContextValue["push"]>(
    ({ tone = "info", title, body, ttl = 3800 }) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      const toast: Toast = { id, tone, title, body, ttl };
      setToasts((prev) => [...prev, toast]);
      if (ttl > 0) {
        window.setTimeout(() => dismiss(id), ttl);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ToastEventDetail>).detail;
      if (!detail?.title) return;
      push(detail);
    };
    window.addEventListener(GARAGE_TOAST_EVENT, handler);
    return () => window.removeEventListener(GARAGE_TOAST_EVENT, handler);
  }, [push]);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="garage-toast-stack" role="region" aria-live="polite">
        {toasts.map((toast) => {
          const style = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              className={`garage-toast border ${style.border} ${style.bg} ${style.fg}`}
              role="status"
            >
              <span className="garage-toast__icon">{style.icon}</span>
              <div className="garage-toast__body">
                <p className="garage-toast__title">{toast.title}</p>
                {toast.body ? <p className="garage-toast__detail">{toast.body}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Tutup notifikasi"
                onClick={() => dismiss(toast.id)}
                className="garage-toast__close"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useGarageToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      push: (input: ToastEventDetail) => {
        emitGarageToast(input);
        return "";
      },
      dismiss: () => undefined,
    } satisfies ToastContextValue;
  }
  return ctx;
}
