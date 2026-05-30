"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Activity,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  Trash2,
  UserCog,
  UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminUserRow, AdminUserStatus } from "@/lib/admin-user-service";
import type { Role } from "@/lib/garage-data";
import { permissionsForRole } from "@/lib/role-access";

const ROLES: Role[] = [
  "Owner / CEO",
  "Admin",
  "Manager Operasional",
  "Finance / CFO",
  "Supervisor Shift",
  "Kasir",
  "Barista",
  "Koki",
  "Asisten Koki",
  "Waiter 1",
  "Waiter 2",
  "Kitchen / Barista",
  "Gudang",
  "Delivery Admin",
];

type OutletOption = { id: string; code: string; name: string };

type Props = {
  initialRows: AdminUserRow[];
  initialTotal: number;
  outlets: OutletOption[];
  currentUserId: string;
};

type CreateForm = {
  email: string;
  name: string;
  password: string;
  role: Role;
  outletId: string;
  shiftLabel: string;
  deviceLabel: string;
};

type SessionRow = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function UserManagement({
  initialRows,
  initialTotal,
  outlets,
  currentUserId,
}: Props) {
  const [rows, setRows] = useState<AdminUserRow[]>(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [filterRole, setFilterRole] = useState<Role | "all">("all");
  const [filterStatus, setFilterStatus] = useState<AdminUserStatus | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserRow | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [sessionTarget, setSessionTarget] = useState<AdminUserRow | null>(null);
  const [sessionList, setSessionList] = useState<SessionRow[]>([]);

  const counts = useMemo(() => {
    const active = rows.filter((row) => row.status === "active").length;
    const suspended = rows.filter((row) => row.status === "suspended").length;
    const online = rows.filter((row) => row.activeSessions > 0).length;
    return { active, suspended, online };
  }, [rows]);

  function refresh(extra?: Partial<{ q: string; role: string; status: string }>) {
    const params = new URLSearchParams();
    const q = extra?.q ?? query;
    const role = extra?.role ?? (filterRole === "all" ? "" : filterRole);
    const status = extra?.status ?? (filterStatus === "all" ? "" : filterStatus);
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    params.set("limit", "100");

    startTransition(async () => {
      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Gagal memuat data user.");
        return;
      }
      setError(null);
      setRows(json.data.rows);
      setTotal(json.data.total);
      setSelected(new Set());
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((row) => row.userId)),
    );
  }

  async function runBulk(action: "suspend" | "activate" | "delete" | "force_logout") {
    if (!selected.size) return;
    if (action === "delete" && !confirm(`Hapus ${selected.size} user permanen?`)) return;
    startTransition(async () => {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(selected), action }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "Bulk action gagal.");
        return;
      }
      refresh();
    });
  }

  async function openSessions(row: AdminUserRow) {
    setSessionTarget(row);
    setSessionList([]);
    const res = await fetch(`/api/admin/users/${row.userId}/sessions`, {
      cache: "no-store",
    });
    const json = await res.json();
    if (res.ok) setSessionList(json.data.sessions);
  }

  async function forceLogoutOne(userId: string, sessionId?: string) {
    const url = sessionId
      ? `/api/admin/users/${userId}/sessions?sessionId=${sessionId}`
      : `/api/admin/users/${userId}/sessions`;
    const res = await fetch(url, { method: "DELETE" });
    if (res.ok && sessionTarget) {
      const refreshed = await fetch(`/api/admin/users/${userId}/sessions`, {
        cache: "no-store",
      });
      const json = await refreshed.json();
      setSessionList(json.data.sessions);
      refresh();
    }
  }

  return (
    <div className="px-4 py-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-zinc-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-red-400">
              <UserCog className="h-3.5 w-3.5" />
              Garage Control · User Management
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-100">
              Master User & Akses Operasional
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Kelola staff, role, sesi login, dan akses outlet untuk seluruh tim Garage.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Card className="border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Total Staff</div>
              <div className="text-2xl font-semibold text-zinc-100">{total}</div>
            </Card>
            <Card className="border-emerald-900/40 bg-emerald-950/30 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-emerald-400">Aktif</div>
              <div className="text-2xl font-semibold text-emerald-300">{counts.active}</div>
            </Card>
            <Card className="border-amber-900/40 bg-amber-950/30 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-amber-400">Online</div>
              <div className="text-2xl font-semibold text-amber-300">{counts.online}</div>
            </Card>
            <Card className="border-rose-900/40 bg-rose-950/30 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-rose-400">Suspended</div>
              <div className="text-2xl font-semibold text-rose-300">{counts.suspended}</div>
            </Card>
          </div>
        </header>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") refresh({ q: query });
                  }}
                  placeholder="Cari email atau nama…"
                  className="border-zinc-700 bg-zinc-950 pl-9 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              <Select
                value={filterRole}
                onValueChange={(value) => {
                  setFilterRole(value as Role | "all");
                  refresh({ role: value === "all" ? "" : value });
                }}
              >
                <SelectTrigger className="w-48 border-zinc-700 bg-zinc-950 text-zinc-100">
                  <SelectValue placeholder="Semua role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua role</SelectItem>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterStatus}
                onValueChange={(value) => {
                  setFilterStatus(value as AdminUserStatus | "all");
                  refresh({ status: value === "all" ? "" : value });
                }}
              >
                <SelectTrigger className="w-40 border-zinc-700 bg-zinc-950 text-zinc-100">
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Tambah Staff
            </Button>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="mb-4 rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            ) : null}

            {selected.size > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2">
                <span className="text-sm text-amber-200">{selected.size} dipilih</span>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => runBulk("activate")}>
                    Aktifkan
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runBulk("suspend")}>
                    Suspend
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => runBulk("force_logout")}>
                    Force Logout
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => runBulk("delete")}
                  >
                    Hapus Permanen
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-md border border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-950/60 hover:bg-zinc-950/60">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={selected.size > 0 && selected.size === rows.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 cursor-pointer accent-red-500"
                      />
                    </TableHead>
                    <TableHead>Staff</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sesi Aktif</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && !rows.length ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-zinc-500">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                        Memuat data…
                      </TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-12 text-center text-zinc-500">
                        Belum ada staff sesuai filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.userId} className="hover:bg-zinc-900/40">
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selected.has(row.userId)}
                            onChange={() => toggleSelect(row.userId)}
                            disabled={row.userId === currentUserId}
                            className="h-4 w-4 cursor-pointer accent-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-red-500/30 to-amber-500/20 text-xs font-semibold uppercase text-red-200">
                              {row.name.slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-medium text-zinc-100">
                                {row.name}
                                {row.userId === currentUserId ? (
                                  <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">
                                    (anda)
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-zinc-500">{row.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="border-zinc-700 bg-zinc-950 text-zinc-200"
                          >
                            {row.role}
                          </Badge>
                          <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">
                            {row.permissionCount} permission
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-zinc-200">{row.outletCode}</div>
                          <div className="text-xs text-zinc-500">{row.outletName}</div>
                        </TableCell>
                        <TableCell>
                          {row.status === "active" ? (
                            <Badge className="border-emerald-700 bg-emerald-950/60 text-emerald-300">
                              Aktif
                            </Badge>
                          ) : (
                            <Badge className="border-rose-800 bg-rose-950/60 text-rose-300">
                              Suspended
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.activeSessions > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300">
                              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                              {row.activeSessions} online
                            </span>
                          ) : (
                            <span className="text-zinc-500">offline</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400">
                          {formatDate(row.lastLoginAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Edit"
                              onClick={() => setEditTarget(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Reset password"
                              onClick={() => setResetTarget(row)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              title="Sesi login"
                              onClick={() => openSessions(row)}
                            >
                              <Activity className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        outlets={outlets}
        onCreated={() => {
          setCreateOpen(false);
          refresh();
        }}
      />

      {editTarget ? (
        <EditUserDialog
          row={editTarget}
          outlets={outlets}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            refresh();
          }}
        />
      ) : null}

      {resetTarget ? (
        <ResetPasswordDialog
          row={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => setResetTarget(null)}
        />
      ) : null}

      {sessionTarget ? (
        <SessionsDialog
          row={sessionTarget}
          sessions={sessionList}
          onClose={() => setSessionTarget(null)}
          onLogoutAll={() => forceLogoutOne(sessionTarget.userId)}
          onLogoutOne={(sessionId) => forceLogoutOne(sessionTarget.userId, sessionId)}
        />
      ) : null}
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  outlets,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outlets: OutletOption[];
  onCreated: () => void;
}) {
  const [form, setForm] = useState<CreateForm>({
    email: "",
    name: "",
    password: "",
    role: "Kasir",
    outletId: outlets[0]?.id ?? "",
    shiftLabel: "Shift aktif",
    deviceLabel: "POS-01",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(json?.error?.message ?? "Gagal membuat user.");
      return;
    }
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-red-400" /> Tambah Staff Baru
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Buat akun login + assign role + outlet. Password awal akan dipakai user untuk login pertama.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Nama lengkap">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="border-zinc-700 bg-zinc-900"
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              className="border-zinc-700 bg-zinc-900"
            />
          </Field>
          <Field label="Password awal">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="min 8 karakter"
                className="border-zinc-700 bg-zinc-900 pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-0 h-full w-10 text-zinc-500 hover:bg-transparent hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select
                value={form.role}
                onValueChange={(value) => setForm({ ...form, role: value as Role })}
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Outlet">
              <Select
                value={form.outletId}
                onValueChange={(value) => setForm({ ...form, outletId: value })}
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-100">
                  <SelectValue placeholder="Pilih outlet" />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((outlet) => (
                    <SelectItem key={outlet.id} value={outlet.id}>
                      {outlet.code} · {outlet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shift label">
              <Input
                value={form.shiftLabel}
                onChange={(event) => setForm({ ...form, shiftLabel: event.target.value })}
                className="border-zinc-700 bg-zinc-900"
              />
            </Field>
            <Field label="Device label">
              <Input
                value={form.deviceLabel}
                onChange={(event) => setForm({ ...form, deviceLabel: event.target.value })}
                className="border-zinc-700 bg-zinc-900"
              />
            </Field>
          </div>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
            <div className="mb-1 text-zinc-300">Preview permission untuk role ini:</div>
            <div className="flex flex-wrap gap-1">
              {permissionsForRole(form.role).map((perm) => (
                <Badge
                  key={perm}
                  variant="outline"
                  className="border-zinc-700 bg-zinc-950 text-[10px] text-zinc-300"
                >
                  {perm}
                </Badge>
              ))}
            </div>
          </div>
          {error ? (
            <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={submit} disabled={submitting} className="bg-red-600 hover:bg-red-500">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  row,
  outlets,
  onClose,
  onSaved,
}: {
  row: AdminUserRow;
  outlets: OutletOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: row.name,
    role: row.role,
    outletId: row.outletId,
    shiftLabel: row.shiftLabel,
    deviceLabel: row.deviceLabel,
    status: row.status,
    newPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const payload = {
      ...form,
      newPassword: form.newPassword.trim() ? form.newPassword : null,
    };
    const res = await fetch(`/api/admin/users/${row.userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(json?.error?.message ?? "Gagal menyimpan perubahan.");
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!confirm(`Hapus ${row.name} permanen?`)) return;
    const res = await fetch(`/api/admin/users/${row.userId}`, { method: "DELETE" });
    if (res.ok) onSaved();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-red-400" /> Edit {row.email}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Nama">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="border-zinc-700 bg-zinc-900"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <Select
                value={form.role}
                onValueChange={(value) => setForm({ ...form, role: value as Role })}
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Outlet">
              <Select
                value={form.outletId}
                onValueChange={(value) => setForm({ ...form, outletId: value })}
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {outlets.map((outlet) => (
                    <SelectItem key={outlet.id} value={outlet.id}>
                      {outlet.code} · {outlet.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shift">
              <Input
                value={form.shiftLabel}
                onChange={(event) => setForm({ ...form, shiftLabel: event.target.value })}
                className="border-zinc-700 bg-zinc-900"
              />
            </Field>
            <Field label="Device">
              <Input
                value={form.deviceLabel}
                onChange={(event) => setForm({ ...form, deviceLabel: event.target.value })}
                className="border-zinc-700 bg-zinc-900"
              />
            </Field>
          </div>
          <Field label="Status akun">
            <Select
              value={form.status}
              onValueChange={(value) =>
                setForm({ ...form, status: value as AdminUserStatus })
              }
            >
              <SelectTrigger className="border-zinc-700 bg-zinc-900 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ganti Password Baru (Opsional)">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={form.newPassword}
                onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
                placeholder="Kosongkan jika tidak ingin mengganti password"
                className="border-zinc-700 bg-zinc-900 pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-0 h-full w-10 text-zinc-500 hover:bg-transparent hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </Field>
          {error ? (
            <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          ) : null}
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={handleDelete}
            className="border-rose-800 text-rose-300 hover:bg-rose-950"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Hapus user
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button onClick={submit} disabled={submitting} className="bg-red-600 hover:bg-red-500">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Simpan
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  row,
  onClose,
  onDone,
}: {
  row: AdminUserRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/admin/users/${row.userId}/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newPassword: password }),
    });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(json?.error?.message ?? "Gagal reset password.");
      return;
    }
    setSuccess(true);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-400" /> Reset Password
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Set password baru untuk <span className="text-zinc-200">{row.email}</span>. Semua sesi
            login user ini akan otomatis di-logout.
          </DialogDescription>
        </DialogHeader>
        {success ? (
          <div className="rounded-md border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200">
            Password berhasil di-reset. Beritahu user password barunya.
          </div>
        ) : (
          <Field label="Password baru">
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="min 8 karakter"
                className="border-zinc-700 bg-zinc-900 pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-0 h-full w-10 text-zinc-500 hover:bg-transparent hover:text-zinc-300"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </Field>
        )}
        {error ? (
          <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={success ? onDone : onClose}>
            {success ? "Selesai" : "Batal"}
          </Button>
          {!success ? (
            <Button onClick={submit} disabled={submitting} className="bg-amber-600 hover:bg-amber-500">
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Reset
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionsDialog({
  row,
  sessions,
  onClose,
  onLogoutAll,
  onLogoutOne,
}: {
  row: AdminUserRow;
  sessions: SessionRow[];
  onClose: () => void;
  onLogoutAll: () => void;
  onLogoutOne: (sessionId: string) => void;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl border-zinc-800 bg-zinc-950 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" /> Sesi Login — {row.name}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Device & IP yang lagi login. Force logout untuk akhiri sesi sekarang juga.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-auto rounded-md border border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-950 hover:bg-zinc-950">
                <TableHead>Device / User Agent</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Dibuat</TableHead>
                <TableHead>Expired</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-zinc-500">
                    Tidak ada sesi aktif.
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="max-w-[260px] truncate text-xs text-zinc-300">
                      {session.userAgent ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {session.ipAddress ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {formatDate(session.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-400">
                      {formatDate(session.expiresAt)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onLogoutOne(session.id)}
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="outline"
            onClick={onLogoutAll}
            disabled={sessions.length === 0}
            className="border-rose-800 text-rose-300 hover:bg-rose-950"
          >
            <ShieldOff className="mr-2 h-4 w-4" /> Force Logout Semua
          </Button>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
