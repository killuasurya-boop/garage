"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Clock,
  CalendarDays,
  ClipboardCheck,
  TrendingUp,
  DollarSign,
  Megaphone,
  CheckSquare,
  Users,
  Coins,
  MapPin,
  BookOpen,
  LayoutDashboard,
  Handshake
} from "lucide-react";

import type { Role } from "@/lib/garage-data";
import { canUseApi } from "@/lib/role-access";
import { TeamHrOverview } from "./team-hr-overview";
import { HrAttendanceLog } from "./hr-attendance-log";
import { TeamShiftScheduler } from "./team-shift-scheduler";
import { TeamShiftHandover } from "./team-shift-handover";
import { TeamSopManager } from "./team-sop-manager";
import { TeamKpiDashboard } from "./team-kpi-dashboard";
import { TeamPayrollManager } from "./team-payroll-manager";
import { TeamAnnouncements } from "./team-announcements";
import { TeamTasksManager } from "./team-tasks-manager";
import { TeamDirectoryManager } from "./team-directory-manager";
import { TeamAdvancesManager } from "./team-advances-manager";
import { TeamLocationsManager } from "./team-locations-manager";
import { TeamGlossaryManager } from "./team-glossary-manager";

type NavItemProps = {
  value: string;
  label: string;
  icon: LucideIcon;
  activeTab: string;
  onSelect: (value: string) => void;
};

function NavItem({ value, label, icon: Icon, activeTab, onSelect }: NavItemProps) {
  const isActive = activeTab === value;
  return (
    <button
      onClick={() => onSelect(value)}
      className={`flex items-center gap-3 px-3 py-2 rounded-md w-full text-left text-sm font-medium transition-colors ${
        isActive
          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

export function TeamManagementDashboard({ role }: { role: Role }) {
  const [activeTab, setActiveTab] = useState("overview");
  const canViewFinance = canUseApi(role, "finance:read");

  // Komponen Helper untuk merender konten yang aktif
  const renderContent = () => {
    switch (activeTab) {
      case "overview": return <TeamHrOverview onNavigate={setActiveTab} />;
      case "attendance": return <HrAttendanceLog />;
      case "rostering": return <TeamShiftScheduler />;
      case "handover": return <TeamShiftHandover />;
      case "tasks": return <TeamTasksManager />;
      case "sop": return <TeamSopManager />;
      case "advances": return <TeamAdvancesManager />;
      case "payroll": return canViewFinance ? <TeamPayrollManager /> : <TeamHrOverview onNavigate={setActiveTab} />;
      case "kpi": return <TeamKpiDashboard />;
      case "directory": return <TeamDirectoryManager />;
      case "announcements": return <TeamAnnouncements />;
      case "locations": return <TeamLocationsManager />;
      case "glossary": return <TeamGlossaryManager />;
      default: return <TeamHrOverview onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="flex flex-col space-y-6">
      {/* Header Halaman */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Manajemen Tim & SDM</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Pusat kendali operasional harian, administrasi staf, dan performa tim yang terintegrasi secara profesional.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 w-full items-start">
        {/* Navigasi Layar HP (Mobile Dropdown) */}
        <div className="block lg:hidden w-full mb-4">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
            Pilih Modul HR
          </label>
          <select 
            value={activeTab} 
            onChange={(e) => setActiveTab(e.target.value)}
            className="w-full p-3.5 rounded-lg border bg-card text-foreground font-bold shadow-sm focus:ring-2 focus:ring-primary focus:outline-none appearance-none"
          >
            <optgroup label="Pusat Kendali">
               <option value="overview">📊 Ringkasan HR</option>
            </optgroup>
            <optgroup label="Operasional Harian">
               <option value="attendance">⏰ Log Kehadiran</option>
               <option value="rostering">📅 Jadwal Shift</option>
               <option value="handover">🤝 Operan Shift</option>
               <option value="tasks">☑️ Delegasi Tugas</option>
               <option value="sop">📋 SOP & Checklist</option>
            </optgroup>
            <optgroup label="Keuangan & Performa">
               <option value="advances">💰 Kasbon Karyawan</option>
               {canViewFinance && <option value="payroll">💵 Gaji & Payroll</option>}
               <option value="kpi">📈 KPI & Evaluasi</option>
            </optgroup>
            <optgroup label="Data Master">
               <option value="directory">👥 Direktori Staf</option>
               <option value="announcements">📢 Pengumuman</option>
               <option value="locations">📍 Geofence GPS</option>
               <option value="glossary">📖 Daftar Istilah</option>
            </optgroup>
          </select>
        </div>

        {/* Navigasi Sidebar Desktop */}
        <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col pb-0">
          <div className="flex flex-col gap-6">
             
             {/* Grup 1: Utama */}
             <div className="flex flex-col gap-1">
               <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">Pusat Kendali</h3>
               <NavItem value="overview" label="Ringkasan HR" icon={LayoutDashboard} activeTab={activeTab} onSelect={setActiveTab} />
             </div>

             {/* Grup 2: Operasional Harian */}
             <div className="flex flex-col gap-1">
               <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">Operasional Harian</h3>
               <NavItem value="attendance" label="Log Kehadiran" icon={Clock} activeTab={activeTab} onSelect={setActiveTab} />
               <NavItem value="rostering" label="Jadwal Shift" icon={CalendarDays} activeTab={activeTab} onSelect={setActiveTab} />
               <NavItem value="handover" label="Operan Shift" icon={Handshake} activeTab={activeTab} onSelect={setActiveTab} />
               <NavItem value="tasks" label="Delegasi Tugas" icon={CheckSquare} activeTab={activeTab} onSelect={setActiveTab} />
               <NavItem value="sop" label="SOP & Checklist" icon={ClipboardCheck} activeTab={activeTab} onSelect={setActiveTab} />
             </div>

             {/* Grup 3: Performa & Keuangan */}
             <div className="flex flex-col gap-1">
               <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">Keuangan & Performa</h3>
               <NavItem value="advances" label="Kasbon Karyawan" icon={Coins} activeTab={activeTab} onSelect={setActiveTab} />
               {canViewFinance && (
                 <NavItem value="payroll" label="Gaji & Payroll" icon={DollarSign} activeTab={activeTab} onSelect={setActiveTab} />
               )}
               <NavItem value="kpi" label="KPI & Evaluasi" icon={TrendingUp} activeTab={activeTab} onSelect={setActiveTab} />
             </div>

             {/* Grup 4: Administrasi */}
             <div className="flex flex-col gap-1">
               <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3">Data Master</h3>
               <NavItem value="directory" label="Direktori Staf" icon={Users} activeTab={activeTab} onSelect={setActiveTab} />
               <NavItem value="announcements" label="Pengumuman" icon={Megaphone} activeTab={activeTab} onSelect={setActiveTab} />
               <NavItem value="locations" label="Geofence GPS" icon={MapPin} activeTab={activeTab} onSelect={setActiveTab} />
               <NavItem value="glossary" label="Daftar Istilah" icon={BookOpen} activeTab={activeTab} onSelect={setActiveTab} />
             </div>
          </div>
        </aside>

        {/* Konten Utama (Card Panel) */}
        <main className="flex-1 w-full bg-card text-card-foreground rounded-xl border p-4 sm:p-6 shadow-sm min-h-[600px] overflow-hidden relative">
           <div className="animate-in fade-in duration-300">
             {renderContent()}
           </div>
        </main>
      </div>
    </div>
  );
}
