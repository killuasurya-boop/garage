"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Save, X } from "lucide-react";

import { MenuPhoto } from "@/components/garage/order/menu-card";
import { garageApi } from "@/lib/api-client";
import type { MenuItem } from "@/lib/garage-api-types";

type Group = { category: string; ids: string[] };

// Urutan awal = urutan dari server (sortOrder, lalu nama); kategori sesuai kemunculan pertama
// — sama dengan cara menu digital & POS menyusun kategori.
function buildGroups(items: MenuItem[]): Group[] {
  const groups: Group[] = [];
  for (const item of items) {
    const group = groups.find((entry) => entry.category === item.category);
    if (group) group.ids.push(item.id);
    else groups.push({ category: item.category, ids: [item.id] });
  }
  return groups;
}

function move<T>(list: T[], index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Mode "Atur urutan" di panel Menu Digital: naik/turunkan kategori & menu di dalamnya,
// lalu simpan sekali (PATCH /api/menu/reorder). Urutan berlaku di menu digital & POS.
export function MenuOrderEditor({
  items,
  onSaved,
  onCancel,
}: {
  items: MenuItem[];
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const initial = useMemo(() => buildGroups(items), [items]);
  const [groups, setGroups] = useState<Group[]>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(groups) !== JSON.stringify(initial);

  function moveItem(groupIndex: number, itemIndex: number, delta: number) {
    setGroups((current) =>
      current.map((group, index) =>
        index === groupIndex ? { ...group, ids: move(group.ids, itemIndex, delta) } : group,
      ),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await garageApi.patch("/api/menu/reorder", { ids: groups.flatMap((group) => group.ids) });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Urutan gagal disimpan.");
    } finally {
      setSaving(false);
    }
  }

  const arrowButton =
    "garage-press flex size-9 shrink-0 items-center justify-center rounded-md border border-garage-line bg-white/[0.04] text-white transition hover:border-garage-line-2 disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-md border border-garage-line bg-white/[0.03] p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-garage-dim">
          Naik/turunkan kategori dan menu. Urutan berlaku di <strong className="text-white">menu digital</strong> dan{" "}
          <strong className="text-white">POS</strong>.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="garage-press inline-flex h-9 items-center gap-1.5 rounded-md border border-garage-line px-3 text-xs font-bold text-white hover:border-white/40 disabled:opacity-60"
          >
            <X className="size-3.5" /> Batal
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="garage-press inline-flex h-9 items-center gap-1.5 rounded-md bg-garage-red px-3 text-xs font-bold text-white hover:bg-garage-red-bright disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Simpan urutan
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-garage-red-bright/50 bg-garage-red-bright/10 px-3 py-2 text-sm text-[#ffb3b3]">
          {error}
        </p>
      ) : null}

      <div className="garage-scroll max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {groups.map((group, groupIndex) => (
          <section key={group.category} className="rounded-md border border-garage-line bg-garage-bg-2">
            <header className="flex items-center gap-2 border-b border-garage-line px-3 py-2">
              <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-white">
                {group.category}{" "}
                <span className="font-mono text-xs font-semibold text-garage-dim">({group.ids.length})</span>
              </h3>
              <button
                type="button"
                className={arrowButton}
                disabled={groupIndex === 0 || saving}
                onClick={() => setGroups((current) => move(current, groupIndex, -1))}
                aria-label={`Naikkan kategori ${group.category}`}
              >
                <ArrowUp className="size-4" />
              </button>
              <button
                type="button"
                className={arrowButton}
                disabled={groupIndex === groups.length - 1 || saving}
                onClick={() => setGroups((current) => move(current, groupIndex, 1))}
                aria-label={`Turunkan kategori ${group.category}`}
              >
                <ArrowDown className="size-4" />
              </button>
            </header>
            <ol>
              {group.ids.map((id, itemIndex) => {
                const item = byId.get(id);
                if (!item) return null;
                return (
                  <li
                    key={id}
                    className="flex items-center gap-3 border-b border-garage-line/60 px-3 py-2 last:border-b-0"
                  >
                    <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-garage-dim">
                      {itemIndex + 1}
                    </span>
                    <span className="size-10 shrink-0 overflow-hidden rounded-md bg-black/30">
                      <MenuPhoto item={item} iconClassName="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                      {item.name}
                      {item.showInDigitalMenu === false ? (
                        <span className="ml-2 text-xs font-medium text-[#ffd08a]">(disembunyikan)</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className={arrowButton}
                      disabled={itemIndex === 0 || saving}
                      onClick={() => moveItem(groupIndex, itemIndex, -1)}
                      aria-label={`Naikkan ${item.name}`}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      className={arrowButton}
                      disabled={itemIndex === group.ids.length - 1 || saving}
                      onClick={() => moveItem(groupIndex, itemIndex, 1)}
                      aria-label={`Turunkan ${item.name}`}
                    >
                      <ArrowDown className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
