"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  Plus,
  Check,
  Settings,
  Calendar,
  Info,
  User,
  Sparkles,
  RefreshCw,
  Clock,
} from "lucide-react";

type StaffMember = {
  id: string;
  name: string;
  role: string;
  outletId: string;
};

type SopChecklist = {
  id: string;
  title: string;
  description: string | null;
  roleTarget: string;
  shiftTarget: string;
  status: string;
};

type SopLog = {
  id: string;
  checklistId: string;
  staffId: string;
  date: string;
  status: string;
  notes: string | null;
  createdAt: string;
};

function formatDateString(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TeamSopManager() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeView, setActiveView] = useState<"daily" | "manage">("daily");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [checklists, setChecklists] = useState<SopChecklist[]>([]);
  const [logs, setLogs] = useState<Record<string, SopLog>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newRole, setNewRole] = useState("All");
  const [newShift, setNewShift] = useState("all");
  const [selectedStaffIds, setSelectedStaffIds] = useState<Record<string, string>>({});

  const dateStr = formatDateString(selectedDate);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [staffRes, sopRes] = await Promise.all([
        fetch("/api/hr/team/staff"),
        fetch(`/api/hr/team/sop?date=${dateStr}`),
      ]);

      if (staffRes.ok) {
        const data = await staffRes.json();
        setStaff(data.staff ?? []);
      }

      if (sopRes.ok) {
        const data = await sopRes.json();
        setChecklists(data.checklists ?? []);
        const logMap: Record<string, SopLog> = {};
        for (const log of data.logs ?? []) {
          logMap[log.checklistId] = log;
        }
        setLogs(logMap);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Gagal menyelaraskan data SOP." });
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const handleToggleTask = async (checklistId: string, currentStatus: boolean, staffId: string) => {
    if (!staffId) {
      setMessage({ type: "error", text: "Pilih staf yang bertugas terlebih dahulu." });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const nextStatus = currentStatus ? "pending" : "done";
      const res = await fetch("/api/hr/team/sop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "log_task",
          log: { checklistId, staffId, date: dateStr, status: nextStatus },
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Status SOP diperbarui." });
        fetchData();
      } else {
        setMessage({ type: "error", text: "Gagal menyimpan SOP." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Terjadi gangguan koneksi." });
    } finally {
      setSaving(false);
    }
  };

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setSaving(true);
    setMessage(null);
    const outletId = staff[0]?.outletId || "";

    try {
      const res = await fetch("/api/hr/team/sop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "manage_template",
          template: {
            title: newTitle,
            description: newDesc,
            roleTarget: newRole,
            shiftTarget: newShift,
            outletId,
          },
        }),
      });

      if (res.ok) {
        setMessage({ type: "success", text: "Templat SOP baru ditambahkan." });
        setNewTitle("");
        setNewDesc("");
        setNewRole("All");
        setNewShift("all");
        fetchData();
      } else {
        setMessage({ type: "error", text: "Gagal menambahkan SOP." });
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: "error", text: "Terjadi gangguan koneksi." });
    } finally {
      setSaving(false);
    }
  };

  const morningChecklists = checklists.filter(
    (c) => c.shiftTarget === "morning" || c.shiftTarget === "all",
  );
  const eveningChecklists = checklists.filter(
    (c) => c.shiftTarget === "evening" || c.shiftTarget === "all",
  );

  const handleStaffSelect = (checklistId: string, val: string) => {
    setSelectedStaffIds((prev) => ({ ...prev, [checklistId]: val }));
  };

  const renderChecklistRow = (task: SopChecklist) => {
    const log = logs[task.id];
    const isDone = log?.status === "done";
    const logStaff = staff.find((s) => s.id === log?.staffId);
    const selectedStaff = selectedStaffIds[task.id] || "";

    return (
      <div
        key={task.id}
        className={`p-4 rounded-lg border transition-all ${
          isDone ? "bg-emerald-500/5 border-emerald-500/30" : "bg-card hover:bg-muted"
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h4
              className={`text-sm font-semibold tracking-wide ${
                isDone
                  ? "text-emerald-600 dark:text-emerald-500 line-through opacity-80"
                  : "text-foreground"
              }`}
            >
              {task.title}
            </h4>
            {task.description && (
              <p className="text-xs text-muted-foreground">{task.description}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-[9px] px-1">
                Role: {task.roleTarget}
              </Badge>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {isDone ? (
              <div className="text-right space-y-1">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-500 font-semibold flex items-center gap-1">
                  <Check className="size-3" /> Selesai
                </span>
                <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <User className="size-3" /> {logStaff?.name || "Karyawan"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={selectedStaff}
                  onChange={(e) => handleStaffSelect(task.id, e.target.value)}
                  className="text-[10px] px-1.5 py-1 rounded border bg-background text-foreground"
                >
                  <option value="">Pilih Staf...</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  disabled={saving}
                  onClick={() => handleToggleTask(task.id, isDone, selectedStaff)}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white size-7 p-0 flex items-center justify-center rounded-md"
                >
                  <Check className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={activeView === "daily" ? "default" : "outline"}
            onClick={() => setActiveView("daily")}
            className="gap-2"
          >
            <ClipboardCheck className="size-4" /> Checklist Harian
          </Button>
          <Button
            variant={activeView === "manage" ? "default" : "outline"}
            onClick={() => setActiveView("manage")}
            className="gap-2"
          >
            <Settings className="size-4" /> Master SOP
          </Button>
        </div>

        {activeView === "daily" && (
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-primary" />
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="text-xs font-semibold px-3 py-2 rounded border bg-muted text-foreground"
            />
          </div>
        )}
      </div>

      {message && (
        <div
          className={`p-4 rounded-md border text-sm shadow-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-500"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 flex-shrink-0" />
            <p className="font-medium">{message.text}</p>
          </div>
        </div>
      )}

      {activeView === "daily" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="shadow-sm overflow-hidden border">
            <CardHeader className="border-b bg-muted/20 py-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Clock className="size-4 text-emerald-500" />
                Checklist Shift Pagi
              </CardTitle>
              <CardDescription className="text-xs">
                Tugas awal shift sampai operasional siang hari.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-primary opacity-75" />
                  Memuat checklist...
                </div>
              ) : morningChecklists.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  <Info className="size-6 mx-auto mb-2 opacity-50" />
                  Belum ada master SOP untuk shift pagi.
                </div>
              ) : (
                morningChecklists.map(renderChecklistRow)
              )}
            </CardContent>
          </Card>

          <Card className="shadow-sm overflow-hidden border">
            <CardHeader className="border-b bg-muted/20 py-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Clock className="size-4 text-blue-500" />
                Checklist Shift Sore (Closing)
              </CardTitle>
              <CardDescription className="text-xs">
                Tugas sore hari, pembersihan berkala, dan penutupan gerai.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-primary opacity-75" />
                  Memuat checklist...
                </div>
              ) : eveningChecklists.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  <Info className="size-6 mx-auto mb-2 opacity-50" />
                  Belum ada master SOP untuk shift sore.
                </div>
              ) : (
                eveningChecklists.map(renderChecklistRow)
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeView === "manage" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="shadow-sm border lg:col-span-1 h-fit">
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Plus className="size-5 text-primary" /> Buat Master SOP
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form onSubmit={handleAddTemplate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Judul Tugas</label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Kalibrasi espresso"
                    className="w-full text-sm px-3 py-2 rounded border bg-background text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Deskripsi</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Timbang espresso output 36g..."
                    className="w-full text-sm px-3 py-2 rounded border bg-background text-foreground h-20 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Target Peran</label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded border bg-background text-foreground"
                    >
                      <option value="All">Semua</option>
                      <option value="Barista">Barista</option>
                      <option value="Kasir">Kasir</option>
                      <option value="Koki">Koki</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Target Shift</label>
                    <select
                      value={newShift}
                      onChange={(e) => setNewShift(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded border bg-background text-foreground"
                    >
                      <option value="all">Semua Shift</option>
                      <option value="morning">Pagi</option>
                      <option value="evening">Sore</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" disabled={saving} className="w-full mt-2 font-bold gap-2">
                  <Plus className="size-4" /> Tambahkan
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm border lg:col-span-2">
            <CardHeader className="border-b bg-muted/20 py-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ClipboardCheck className="size-5 text-primary" /> Daftar Master Aktif
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">
                  <RefreshCw className="size-6 animate-spin mx-auto mb-2 opacity-75" />
                </div>
              ) : checklists.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  Belum ada master SOP terdaftar.
                </div>
              ) : (
                checklists.map((template) => (
                  <div
                    key={template.id}
                    className="p-3 rounded border bg-card hover:bg-muted flex items-start justify-between gap-4"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">{template.title}</h4>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {template.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-[10px]">
                          Target: {template.roleTarget}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          Shift: {template.shiftTarget}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
