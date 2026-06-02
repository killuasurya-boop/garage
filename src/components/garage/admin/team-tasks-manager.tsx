"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Plus, Send, Calendar, Circle, CheckCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Task {
  id: string;
  targetRole: string;
  title: string;
  detail: string;
  priority: string;
  status: string;
  createdAt: string;
  dueAt: string | null;
}

interface StaffMember {
  id: string;
  userId: string;
  name: string;
  role: string;
}

export function TeamTasksManager() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState("active"); // 'active' (open, acknowledged) or 'done'

  // Form states
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [targetRole, setTargetRole] = useState("Barista");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchTasks() {
    try {
      setLoading(true);
      const statusParam = filterStatus === "active" ? "open,acknowledged" : "done";
      const res = await fetch(`/api/staff-tasks?status=${statusParam}`);
      const data = await res.json();
      if (data.tasks) {
        setTasks(data.tasks);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStaff() {
    try {
      const res = await fetch("/api/hr/team/staff");
      const data = await res.json();
      if (data.staff) {
        setStaff(data.staff);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStaff();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/staff-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          detail,
          targetRole,
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          assigneeUserId: assigneeUserId || null,
        }),
      });
      if (res.ok) {
        setTitle("");
        setDetail("");
        setDueAt("");
        setAssigneeUserId("");
        setShowAddForm(false);
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSyncFromSop() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`/api/hr/team/sop?date=${today}`);
      const data = await res.json();
      if (data.checklists) {
        let count = 0;
        for (const item of data.checklists) {
          const postRes = await fetch("/api/staff-tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: `[SOP] ${item.title}`,
              detail: item.description || `Instruksi SOP ${item.shiftTarget} untuk ${item.roleTarget}`,
              targetRole: item.roleTarget,
              priority: "medium",
            }),
          });
          if (postRes.ok) count++;
        }
        alert(`Berhasil menyalin ${count} tugas harian dari templat SOP.`);
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUpdateStatus(id: string, action: "acknowledge" | "complete" | "cancel") {
    try {
      const res = await fetch(`/api/staff-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <CheckSquare className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-100">Delegasi Tugas & Pekerjaan</h3>
            <p className="text-xs text-zinc-400">Pendelegasian penugasan eksternal / di luar SOP rutin karyawan.</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSyncFromSop}
            variant="outline"
            className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 gap-2 text-xs font-semibold h-9"
          >
            <RefreshCw className="size-3.5" />
            Salin dari SOP
          </Button>
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold gap-2 border border-amber-400/20 text-xs h-9"
          >
            <Plus className="size-3.5" />
            Delegasikan Tugas
          </Button>
        </div>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4 backdrop-blur-md">
          <h4 className="text-sm font-semibold text-zinc-200">Buat Delegasi Tugas Baru</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Target Jabatan / Peran</label>
              <select
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-zinc-950/50 border border-zinc-800 text-zinc-200 focus:border-amber-500 text-sm focus:outline-none"
              >
                <option value="Barista">Barista</option>
                <option value="Kasir">Kasir</option>
                <option value="Koki">Koki</option>
                <option value="Waiter 1">Waiter</option>
                <option value="Mekanik">Mekanik</option>
                <option value="Gudang">Staf Gudang</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Karyawan Penerima (Opsional)</label>
              <select
                value={assigneeUserId}
                onChange={(e) => setAssigneeUserId(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-zinc-950/50 border border-zinc-800 text-zinc-200 focus:border-amber-500 text-sm focus:outline-none"
              >
                <option value="">Semua Karyawan di Jabatan Tersebut</option>
                {staff
                  .filter((s) => s.role === targetRole)
                  .map((s) => (
                    <option key={s.id} value={s.userId}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Judul Tugas</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Stok opname kampas rem motor matik"
              className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Detail / Petunjuk Tugas</label>
            <Textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Berikan langkah pengerjaan atau detail instruksi..."
              rows={3}
              className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Prioritas</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-zinc-950/50 border border-zinc-800 text-zinc-200 focus:border-amber-500 text-sm focus:outline-none"
              >
                <option value="low">Rendah</option>
                <option value="medium">Sedang</option>
                <option value="high">Tinggi</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Tenggat Waktu (Due Date)</label>
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowAddForm(false)}
              className="text-zinc-400 hover:text-zinc-200"
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold gap-2 border border-amber-400/20"
            >
              <Send className="size-4" />
              {submitting ? "Mengirim..." : "Delegasikan"}
            </Button>
          </div>
        </form>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-zinc-800 pb-px">
        <button
          onClick={() => setFilterStatus("active")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            filterStatus === "active"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Tugas Aktif ({tasks.filter((t) => t.status !== "done").length})
        </button>
        <button
          onClick={() => setFilterStatus("done")}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
            filterStatus === "done"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          Tugas Terselesaikan
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-zinc-500">Memuat penugasan...</div>
      ) : tasks.length === 0 ? (
        <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-12 text-center text-zinc-500 space-y-2">
          <Circle className="size-8 mx-auto text-zinc-600" />
          <p className="font-medium text-zinc-400">Tidak ada tugas</p>
          <p className="text-xs">Seluruh penugasan aktif telah selesai dikerjakan.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="bg-zinc-900/30 hover:bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    task.priority === "high"
                      ? "bg-red-500/10 text-red-400 border-red-500/20"
                      : task.priority === "medium"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  }`}>
                    {task.priority === "high" ? "Penting" : task.priority === "medium" ? "Sedang" : "Biasa"}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-zinc-700">
                    {task.targetRole}
                  </span>
                  <h4 className="font-semibold text-zinc-100">{task.title}</h4>
                </div>
                {task.detail && <p className="text-zinc-400 text-xs leading-relaxed">{task.detail}</p>}
                
                {task.dueAt && (
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <Calendar className="size-3.5" />
                    <span>Tenggat: {new Date(task.dueAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 self-end md:self-center">
                {task.status === "open" && (
                  <Button
                    onClick={() => handleUpdateStatus(task.id, "acknowledge")}
                    size="sm"
                    variant="outline"
                    className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  >
                    Konfirmasi Diterima
                  </Button>
                )}
                {task.status === "acknowledged" && (
                  <Button
                    onClick={() => handleUpdateStatus(task.id, "complete")}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-zinc-100 font-semibold gap-1.5"
                  >
                    <CheckCircle className="size-4" />
                    Selesaikan Tugas
                  </Button>
                )}
                {task.status === "done" && (
                  <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold">
                    <CheckCircle className="size-4" />
                    Terselesaikan
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
