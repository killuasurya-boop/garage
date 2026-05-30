"use client";

import { useEffect, useState } from "react";
import { Users, Edit2, ShieldAlert, Key, Check, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface StaffProfile {
  id: string;
  userId: string;
  outletId: string;
  role: string;
  shiftLabel: string;
  deviceLabel: string;
  status: string;
  division: string | null;
  position: string | null;
  pinCode: string | null;
  name: string;
  email: string;
}

export function TeamDirectoryManager() {
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Editing form states
  const [division, setDivision] = useState("");
  const [position, setPosition] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [status, setStatus] = useState("active");
  const [role, setRole] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function fetchStaff() {
    try {
      setLoading(true);
      const res = await fetch("/api/hr/team/staff");
      const data = await res.json();
      if (data.staff) {
        setStaff(data.staff);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStaff();
  }, []);

  function startEdit(item: StaffProfile) {
    setEditingId(item.id);
    setDivision(item.division || "F&B Kafe");
    setPosition(item.position || "");
    setPinCode(item.pinCode || "");
    setStatus(item.status);
    setRole(item.role);
  }

  async function handleSave(id: string) {
    try {
      setSubmitting(true);
      const res = await fetch("/api/hr/team/staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          division,
          position,
          pinCode,
          status,
          role,
        }),
      });
      if (res.ok) {
        setEditingId(null);
        fetchStaff();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Users className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-100">Daftar Karyawan & Jabatan</h3>
            <p className="text-xs text-zinc-400">Pengaturan Divisi, Jabatan kerja, status aktif, dan PIN kehadiran.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-zinc-500">Memuat direktori karyawan...</div>
      ) : (
        <div className="bg-zinc-900/20 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 font-semibold bg-zinc-950/20">
                  <th className="p-4">Nama & Email</th>
                  <th className="p-4">Divisi</th>
                  <th className="p-4">Jabatan</th>
                  <th className="p-4">Role Sistem</th>
                  <th className="p-4 text-center">PIN Presensi</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {staff.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-zinc-900/10 transition-colors">
                      {/* Name */}
                      <td className="p-4">
                        <div className="font-semibold text-zinc-100">{item.name}</div>
                        <div className="text-xs text-zinc-500">{item.email}</div>
                      </td>

                      {/* Division */}
                      <td className="p-4">
                        {isEditing ? (
                          <select
                            value={division}
                            onChange={(e) => setDivision(e.target.value)}
                            className="h-8 px-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:outline-none"
                          >
                            <option value="F&B Kafe">F&B Kafe</option>
                            <option value="Bengkel Motor">Bengkel Motor</option>
                            <option value="Backoffice">Backoffice Support</option>
                          </select>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded font-medium border ${
                            item.division === "Bengkel Motor"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : item.division === "F&B Kafe"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-zinc-800 text-zinc-300 border-zinc-700"
                          }`}>
                            {item.division || "Belum Set"}
                          </span>
                        )}
                      </td>

                      {/* Position */}
                      <td className="p-4">
                        {isEditing ? (
                          <Input
                            value={position}
                            onChange={(e) => setPosition(e.target.value)}
                            placeholder="Head Barista, Senior Mekanik, dll"
                            className="h-8 px-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs w-32 focus:border-amber-500"
                          />
                        ) : (
                          <span className="text-zinc-300 font-medium text-xs">
                            {item.position || "-"}
                          </span>
                        )}
                      </td>

                      {/* Role */}
                      <td className="p-4">
                        <span className="text-zinc-400 text-xs">{item.role}</span>
                      </td>

                      {/* PIN Presensi */}
                      <td className="p-4 text-center">
                        {isEditing ? (
                          <Input
                            value={pinCode}
                            onChange={(e) => setPinCode(e.target.value)}
                            placeholder="4-6 Angka"
                            className="h-8 px-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs text-center w-20 mx-auto focus:border-amber-500"
                          />
                        ) : (
                          <span className="text-zinc-400 font-mono text-xs flex items-center justify-center gap-1">
                            <Key className="size-3.5 text-zinc-600" />
                            {item.pinCode ? "••••" : "Belum Set"}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-4 text-center">
                        {isEditing ? (
                          <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="h-8 px-2 rounded bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs focus:outline-none"
                          >
                            <option value="active">Aktif</option>
                            <option value="suspended">Ditangguhkan</option>
                          </select>
                        ) : (
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                            item.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-red-500/10 text-red-400 border-red-500/20"
                          }`}>
                            {item.status === "active" ? (
                              <>
                                <ShieldCheck className="size-3" />
                                Aktif
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="size-3" />
                                Ditutup
                              </>
                            )}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              onClick={() => handleSave(item.id)}
                              disabled={submitting}
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-zinc-100 h-7 w-7 p-0 rounded-md"
                            >
                              <Check className="size-3.5" />
                            </Button>
                            <Button
                              onClick={() => setEditingId(null)}
                              size="sm"
                              variant="ghost"
                              className="text-zinc-400 hover:text-zinc-200 h-7 w-7 p-0 rounded-md"
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            onClick={() => startEdit(item)}
                            size="sm"
                            variant="ghost"
                            className="text-zinc-400 hover:text-zinc-200 h-7 px-2 rounded-md border border-zinc-800"
                          >
                            <Edit2 className="size-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
