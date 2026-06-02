"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";

export type Column<T> = {
  key: keyof T & string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
};

export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  pageSize = 5,
  searchableKeys,
  emptyHint = "Belum ada data",
}: {
  rows: T[];
  columns: Column<T>[];
  pageSize?: number;
  searchableKeys?: (keyof T & string)[];
  emptyHint?: string;
}) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<(keyof T & string) | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !searchableKeys?.length) return rows;
    return rows.filter((r) =>
      searchableKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query, searchableKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSort = (k: keyof T & string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  return (
    <div className="rounded-lg border border-[color-mix(in_srgb,var(--garage-line)_78%,transparent)] bg-[var(--garage-bg-2)] p-4 shadow-[var(--garage-shadow-panel)]">
      {searchableKeys?.length ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-[var(--garage-bg-3)] px-3 py-1.5">
          <Search className="h-3.5 w-3.5 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Cari data..."
            className="flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-500"
          />
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase text-zinc-400">
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}
                >
                  {c.sortable ? (
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-zinc-200">
                      {c.header}
                      {sortKey === c.key ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center text-zinc-500">{emptyHint}</td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={i} className="border-b border-white/5 transition hover:bg-white/5">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      style={{ width: c.width }}
                      className={`px-3 py-2.5 text-zinc-200 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}
                    >
                      {c.render ? c.render(row) : String(row[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
        <span>
          {sorted.length} data - halaman {page + 1} / {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1 disabled:opacity-40 enabled:hover:bg-[var(--garage-bg-1)]"
          >
            Sebelumnya
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-md border border-white/10 bg-[var(--garage-bg-3)] px-2 py-1 disabled:opacity-40 enabled:hover:bg-[var(--garage-bg-1)]"
          >
            Berikutnya
          </button>
        </div>
      </div>
    </div>
  );
}
