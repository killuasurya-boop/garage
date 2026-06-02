"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { seedNotifications, type Notification } from "../data/mockData";

export type DateRange = "7d" | "30d" | "90d" | "1y";
export type Department = "all" | "pos" | "kitchen" | "inventory" | "finance" | "hr" | "marketing" | "procurement";

type DashboardState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  department: Department;
  setDepartment: (d: Department) => void;
  notifications: Notification[];
  unreadCount: number;
  markAllRead: () => void;
  notifPanelOpen: boolean;
  setNotifPanelOpen: (v: boolean) => void;
  filterPanelOpen: boolean;
  setFilterPanelOpen: (v: boolean) => void;
};

const DashboardCtx = createContext<DashboardState | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [department, setDepartment] = useState<Department>("all");
  const [notifications, setNotifications] = useState<Notification[]>(seedNotifications);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), []);
  const markAllRead = useCallback(
    () => setNotifications((list) => list.map((n) => ({ ...n, read: true }))),
    [],
  );

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value = useMemo<DashboardState>(
    () => ({
      sidebarCollapsed,
      toggleSidebar,
      mobileNavOpen,
      setMobileNavOpen,
      dateRange,
      setDateRange,
      department,
      setDepartment,
      notifications,
      unreadCount,
      markAllRead,
      notifPanelOpen,
      setNotifPanelOpen,
      filterPanelOpen,
      setFilterPanelOpen,
    }),
    [sidebarCollapsed, toggleSidebar, mobileNavOpen, dateRange, department, notifications, unreadCount, markAllRead, notifPanelOpen, filterPanelOpen],
  );

  return <DashboardCtx.Provider value={value}>{children}</DashboardCtx.Provider>;
}

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardCtx);
  if (!ctx) throw new Error("useDashboard must be used inside <DashboardProvider>");
  return ctx;
}
