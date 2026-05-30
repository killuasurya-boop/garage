"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, ShieldCheck, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { ModuleId, Role } from "@/lib/garage-data";
import {
  modulesForRole,
  permissionsForRole,
  rolePermissions,
  roleModules,
} from "@/lib/role-access";

const ROLES = Object.keys(rolePermissions) as Role[];

const ALL_PERMISSIONS = Array.from(
  new Set(ROLES.flatMap((role) => rolePermissions[role])),
).sort() as Array<ReturnType<typeof permissionsForRole>[number]>;

const ALL_MODULES = Array.from(
  new Set(ROLES.flatMap((role) => roleModules[role])),
).sort() as ModuleId[];

const PERMISSION_GROUPS = (() => {
  const groups = new Map<string, string[]>();
  for (const perm of ALL_PERMISSIONS) {
    const [domain] = perm.split(":");
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain)!.push(perm);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
})();

export function PermissionMatrix() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"permission" | "module">("permission");

  const filteredPermissions = useMemo(() => {
    if (!query) return ALL_PERMISSIONS;
    const lower = query.toLowerCase();
    return ALL_PERMISSIONS.filter((perm) => perm.toLowerCase().includes(lower));
  }, [query]);

  const filteredModules = useMemo(() => {
    if (!query) return ALL_MODULES;
    const lower = query.toLowerCase();
    return ALL_MODULES.filter((mod) => mod.toLowerCase().includes(lower));
  }, [query]);

  return (
    <div className="px-4 py-8 lg:px-10">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
        <header className="flex flex-col gap-3 border-b border-zinc-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-red-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Garage Control · Permission Matrix
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-100">
              Role & Akses Matrix
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Visualisasi siapa bisa apa. Matrix ini di-load langsung dari{" "}
              <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-xs text-amber-300">
                src/lib/role-access.ts
              </code>{" "}
              — type-safe, baca-only.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Card className="border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Roles</div>
              <div className="text-2xl font-semibold text-zinc-100">{ROLES.length}</div>
            </Card>
            <Card className="border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Permissions</div>
              <div className="text-2xl font-semibold text-zinc-100">{ALL_PERMISSIONS.length}</div>
            </Card>
            <Card className="border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500">Modules</div>
              <div className="text-2xl font-semibold text-zinc-100">{ALL_MODULES.length}</div>
            </Card>
          </div>
        </header>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as "permission" | "module")}
            >
              <TabsList className="bg-zinc-950">
                <TabsTrigger value="permission">Permissions ({ALL_PERMISSIONS.length})</TabsTrigger>
                <TabsTrigger value="module">Module Access ({ALL_MODULES.length})</TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                activeTab === "permission" ? "Cari permission…" : "Cari module…"
              }
              className="lg:w-64 border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500"
            />
          </CardHeader>
          <CardContent>
            {activeTab === "permission" ? (
              <MatrixGrid
                rows={filteredPermissions}
                columns={ROLES}
                groups={PERMISSION_GROUPS}
                check={(perm, role) => permissionsForRole(role).includes(perm)}
                emptyHint="Tidak ada permission yang cocok dengan pencarian."
              />
            ) : (
              <MatrixGrid
                rows={filteredModules}
                columns={ROLES}
                groups={null}
                check={(mod, role) => modulesForRole(role).includes(mod as ModuleId)}
                emptyHint="Tidak ada module yang cocok dengan pencarian."
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <h2 className="text-lg font-semibold text-zinc-100">Permission preset per role</h2>
            <p className="text-xs text-zinc-500">
              Daftar permission untuk tiap role. Untuk ubah, edit{" "}
              <code className="rounded bg-zinc-950 px-1 py-0.5 text-amber-300">
                rolePermissions
              </code>{" "}
              di role-access.ts.
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={ROLES[0]}>
              <TabsList className="flex h-auto flex-wrap gap-1 bg-zinc-950 p-1">
                {ROLES.map((role) => (
                  <TabsTrigger key={role} value={role} className="text-xs">
                    {role}
                  </TabsTrigger>
                ))}
              </TabsList>
              {ROLES.map((role) => (
                <TabsContent key={role} value={role} className="mt-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
                        Permission ({permissionsForRole(role).length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {permissionsForRole(role).map((perm) => (
                          <Badge
                            key={perm}
                            className="border-emerald-800 bg-emerald-950/40 text-[11px] text-emerald-300"
                          >
                            {perm}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
                        Module Access ({modulesForRole(role).length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {modulesForRole(role).map((mod) => (
                          <Badge
                            key={mod}
                            className="border-amber-800 bg-amber-950/40 text-[11px] text-amber-300"
                          >
                            {mod}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MatrixGrid<T extends string>({
  rows,
  columns,
  groups,
  check,
  emptyHint,
}: {
  rows: T[];
  columns: Role[];
  groups: Array<[string, string[]]> | null;
  check: (row: T, column: Role) => boolean;
  emptyHint: string;
}) {
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-zinc-500">{emptyHint}</div>;
  }

  const grouped = groups
    ? groups
        .map(([domain, perms]) => [domain, perms.filter((perm) => rows.includes(perm as T))] as const)
        .filter(([, perms]) => perms.length)
    : ([["all", rows as string[]]] as const);

  return (
    <div className="overflow-auto rounded-md border border-zinc-800">
      <table className="min-w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-zinc-950">
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-950 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Capability
            </th>
            {columns.map((role) => (
              <th
                key={role}
                className="border-l border-zinc-800 px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-zinc-400"
                style={{ minWidth: 80 }}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span>{role.split(" ")[0]}</span>
                  <span className="text-zinc-600">{role.split(" ").slice(1).join(" ")}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map(([domain, perms]) => (
            <Fragment key={`group-${domain}`}>
              {groups ? (
                <tr className="bg-zinc-900/40">
                  <td
                    colSpan={columns.length + 1}
                    className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-400"
                  >
                    {domain}
                  </td>
                </tr>
              ) : null}
              {perms.map((row, index) => (
                <tr
                  key={row}
                  className={index % 2 === 0 ? "bg-zinc-950/40" : "bg-zinc-900/30"}
                >
                  <td className="sticky left-0 z-[5] bg-inherit px-3 py-1.5 font-mono text-xs text-zinc-300">
                    {row}
                  </td>
                  {columns.map((role) => {
                    const allowed = check(row as T, role);
                    return (
                      <td
                        key={role}
                        className="border-l border-zinc-800 px-2 py-1.5 text-center"
                      >
                        {allowed ? (
                          <Check className="mx-auto h-4 w-4 text-emerald-400" />
                        ) : (
                          <X className="mx-auto h-3.5 w-3.5 text-zinc-700" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
