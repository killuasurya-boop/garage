"use client";

import { useEffect, useState } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  RefreshCw, 
  Info,
  Clock,
  Sparkles,
  Sun,
  Moon,
  Coffee
} from "lucide-react";

type StaffMember = {
  id: string;
  userId: string;
  outletId: string;
  role: string;
  shiftLabel: string;
  deviceLabel: string;
  status: string;
  name: string;
  email: string;
};

type ShiftSchedule = {
  id: string;
  staffId: string;
  outletId: string;
  date: string;
  shiftType: string; // 'morning', 'evening', 'off'
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
};

export function TeamShiftScheduler() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [schedules, setSchedules] = useState<Record<string, ShiftSchedule>>({}); // keyed by 'staffId_date'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Dialog state
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Calendar logic
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // 0 = Monday, 6 = Sunday
  };

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  const formatDateString = (year: number, month: number, day: number) => {
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${year}-${m}-${d}`;
  };

  const fetchStaffAndShifts = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const staffRes = await fetch("/api/hr/team/staff");
      let staffList: StaffMember[] = [];
      if (staffRes.ok) {
        const data = await staffRes.json();
        staffList = data.staff || [];
        setStaff(staffList);
      }

      const startDateStr = formatDateString(currentYear, currentMonth, 1);
      const endDateStr = formatDateString(currentYear, currentMonth, daysInMonth);

      const shiftsRes = await fetch(`/api/hr/team/shifts?startDate=${startDateStr}&endDate=${endDateStr}`);
      if (shiftsRes.ok) {
        const data = await shiftsRes.json();
        const rawSchedules: ShiftSchedule[] = data.schedules || [];
        
        const scheduleMap: Record<string, ShiftSchedule> = {};
        rawSchedules.forEach((sched) => {
          scheduleMap[`${sched.staffId}_${sched.date}`] = sched;
        });
        setSchedules(scheduleMap);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Gagal memuat data dari server." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStaffAndShifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  const handleMonthChange = (direction: "prev" | "next") => {
    const newDate = new Date(currentDate);
    if (direction === "prev") {
      newDate.setMonth(currentDate.getMonth() - 1);
    } else {
      newDate.setMonth(currentDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const handleShiftChange = (staffId: string, dateStr: string, shiftType: string) => {
    const key = `${staffId}_${dateStr}`;
    const outletId = staff.find((s) => s.id === staffId)?.outletId || "";

    let startTime = null;
    let endTime = null;
    if (shiftType === "morning") {
      startTime = "08:00";
      endTime = "16:00";
    } else if (shiftType === "evening") {
      startTime = "15:00";
      endTime = "23:00";
    }

    setSchedules((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || { id: "", staffId, outletId, date: dateStr, notes: "" }),
        shiftType,
        startTime,
        endTime,
      },
    }));
  };

  const saveShifts = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const shiftList = Object.values(schedules);
      const res = await fetch("/api/hr/team/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shifts: shiftList }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Jadwal shift karyawan berhasil disimpan!" });
        setSelectedDay(null);
        fetchStaffAndShifts();
      } else {
        setMessage({ type: "error", text: "Gagal menyimpan jadwal ke database." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Terjadi kesalahan koneksi saat menyimpan." });
    } finally {
      setSaving(false);
    }
  };

  const formatMonthYear = () => {
    return currentDate.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  };

  const weekDaysHeader = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

  const blanks = Array.from({ length: firstDay }).map((_, i) => (
    <div key={`blank-${i}`} className="p-2 min-h-[120px] bg-muted/20 border-r border-b border-border"></div>
  ));

  const dayCells = Array.from({ length: daysInMonth }).map((_, i) => {
    const dayNum = i + 1;
    const dateStr = formatDateString(currentYear, currentMonth, dayNum);
    const isToday = formatDateString(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) === dateStr;
    
    const dayShifts = Object.values(schedules).filter(s => s.date === dateStr && s.shiftType !== "off");
    const morningCount = dayShifts.filter(s => s.shiftType === "morning").length;
    const eveningCount = dayShifts.filter(s => s.shiftType === "evening").length;

    return (
      <div 
        key={`day-${dayNum}`} 
        onClick={() => setSelectedDay(dateStr)}
        className={`min-h-[120px] p-2 sm:p-3 border-r border-b border-border bg-card hover:bg-muted cursor-pointer transition-colors relative group flex flex-col gap-1.5 ${isToday ? 'bg-primary/5 border-primary/30' : ''}`}
      >
        <div className={`font-bold text-sm transition-colors ${isToday ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
          {dayNum}
        </div>
        
        <div className="flex flex-col gap-1.5 mt-1 flex-1">
          {morningCount > 0 && (
            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 border border-emerald-500/30 text-[10px] px-1.5 py-1 rounded w-full">
              <Sun className="size-3 flex-shrink-0"/>
              <span className="font-semibold truncate">Pagi ({morningCount})</span>
            </div>
          )}
          {eveningCount > 0 && (
            <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-500 border border-blue-500/30 text-[10px] px-1.5 py-1 rounded w-full">
              <Moon className="size-3 flex-shrink-0"/>
              <span className="font-semibold truncate">Sore ({eveningCount})</span>
            </div>
          )}
          {morningCount === 0 && eveningCount === 0 && (
            <div className="text-[10px] text-muted-foreground italic mt-auto opacity-0 group-hover:opacity-100 transition-opacity">
              + Atur Shift
            </div>
          )}
        </div>
      </div>
    );
  });

  const totalCells = [...blanks, ...dayCells];
  const remainder = totalCells.length % 7;
  if (remainder > 0) {
    for (let i = 0; i < 7 - remainder; i++) {
      totalCells.push(
        <div key={`end-blank-${i}`} className="p-2 min-h-[120px] bg-muted/20 border-r border-b border-border"></div>
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-4 rounded-lg border shadow-sm relative overflow-hidden">
        <div className="flex items-center gap-3 relative z-10">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => handleMonthChange("prev")}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Calendar className="size-5 text-primary" />
            <span className="text-base font-bold text-foreground tracking-wide uppercase">
              {formatMonthYear()}
            </span>
          </div>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => handleMonthChange("next")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto relative z-10">
          <Button 
            onClick={fetchStaffAndShifts} 
            disabled={loading} 
            variant="outline" 
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Segarkan
          </Button>
          <Button 
            onClick={saveShifts} 
            disabled={saving || loading} 
            className="gap-2"
          >
            {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
            Simpan Semua
          </Button>
        </div>
      </div>

      {/* Toast Alert Message */}
      {message && (
        <div className={`p-4 rounded-md border text-sm transition-all duration-300 ${
          message.type === "success" 
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-500" 
            : "bg-destructive/10 border-destructive/30 text-destructive"
        }`}>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 flex-shrink-0" />
            <p className="font-medium">{message.text}</p>
          </div>
        </div>
      )}

      {/* Visual Calendar Component */}
      <Card className="shadow-sm overflow-hidden border">
        <CardHeader className="border-b bg-muted/20 py-4">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Clock className="size-5 text-primary" />
            Kalender Shift Visual
          </CardTitle>
          <CardDescription>
            Klik pada tanggal di kalender untuk mengatur shift karyawan pada hari tersebut.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 bg-card">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <RefreshCw className="size-8 animate-spin mx-auto mb-3 text-primary opacity-70" />
              Memuat kalender shift bulan {formatMonthYear()}...
            </div>
          ) : (
            <div className="w-full">
              {/* Header Days */}
              <div className="grid grid-cols-7 border-b bg-muted/30">
                {weekDaysHeader.map((day, idx) => (
                  <div key={idx} className="p-3 text-center border-r border-border last:border-r-0">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{day}</span>
                  </div>
                ))}
              </div>
              
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 border-l border-border">
                {totalCells}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Helpful Hint Card */}
      <div className="flex items-start gap-3 bg-primary/10 border border-primary/20 p-4 rounded-lg">
        <Info className="size-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm text-foreground leading-relaxed space-y-1">
          <p className="font-bold text-primary">Panduan Praktis Shift:</p>
          <p>• **Shift Pagi (08:00 - 16:00)**: Direkomendasikan untuk tugas pembukaan (*Opening*) toko, kalibrasi awal, dan operasional pagi hari.</p>
          <p>• **Shift Sore (15:00 - 23:00)**: Direkomendasikan untuk operasional puncak kafe/bengkel dan tugas penutupan (*Closing*) seperti opname harian.</p>
          <p>• Klik pada salah satu kotak hari di atas untuk memunculkan panel penugasan staf.</p>
        </div>
      </div>

      {/* Day Shift Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => {
        if (!open) setSelectedDay(null);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <div className="p-6 pb-4 border-b bg-muted/20">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2 text-primary">
                <Calendar className="size-5" />
                Atur Shift: {selectedDay ? new Date(selectedDay).toLocaleDateString("id-ID", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
              </DialogTitle>
            </DialogHeader>
          </div>
          
          <div className="overflow-y-auto p-6 space-y-4 flex-1">
            {staff.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Coffee className="size-12 mx-auto mb-3 opacity-20" />
                Belum ada staf terdaftar di sistem.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {staff.map((emp) => {
                  const key = selectedDay ? `${emp.id}_${selectedDay}` : '';
                  const currentShift = schedules[key]?.shiftType || "off";

                  return (
                    <div key={emp.id} className={`flex flex-col gap-3 p-4 rounded-lg border transition-all ${
                      currentShift === "morning" ? "bg-emerald-500/5 border-emerald-500/30" :
                      currentShift === "evening" ? "bg-blue-500/5 border-blue-500/30" :
                      "bg-card border-border"
                    }`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-card-foreground">{emp.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {emp.role}
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1.5 bg-background p-1 rounded-md border">
                          <select
                            value={currentShift}
                            onChange={(e) => handleShiftChange(emp.id, selectedDay!, e.target.value)}
                            className={`text-xs font-bold px-2 py-1.5 rounded cursor-pointer outline-none bg-transparent ${
                              currentShift === "morning" ? "text-emerald-600 dark:text-emerald-500" :
                              currentShift === "evening" ? "text-blue-600 dark:text-blue-500" :
                              "text-muted-foreground"
                            }`}
                          >
                            <option value="off" className="bg-background text-muted-foreground">💤 Libur</option>
                            <option value="morning" className="bg-background text-emerald-600 dark:text-emerald-500">🌅 Pagi (08-16)</option>
                            <option value="evening" className="bg-background text-blue-600 dark:text-blue-500">🌌 Sore (15-23)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="p-4 border-t bg-muted/20 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setSelectedDay(null)}>
              Batal
            </Button>
            <Button onClick={saveShifts} disabled={saving} className="gap-2">
              {saving ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}
              Terapkan Shift
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
