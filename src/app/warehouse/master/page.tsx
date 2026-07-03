"use client";

import { useEffect, useState } from "react";
import { Plus, Tags, Trash2, Truck } from "lucide-react";

import { garageApi } from "@/lib/api-client";

type Category = { id: string; name: string; area: "bar" | "dapur" | "umum" };
type Supplier = { id: string; name: string; phone: string; note: string };

const AREA_LABEL: Record<string, string> = { bar: "Bar", dapur: "Dapur", umum: "Umum" };

export default function WmsMasterPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [sups, setSups] = useState<Supplier[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function loadCats() { setCats(await garageApi.get<Category[]>("/api/wms/categories")); }
  async function loadSups() { setSups(await garageApi.get<Supplier[]>("/api/wms/suppliers")); }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [c, s] = await Promise.all([
        garageApi.get<Category[]>("/api/wms/categories"),
        garageApi.get<Supplier[]>("/api/wms/suppliers"),
      ]);
      if (!alive) return;
      setCats(c);
      setSups(s);
    })();
    return () => { alive = false; };
  }, []);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 2500); }

  const input = "h-9 rounded-md border border-[#E8E8E8] bg-white px-3 text-[13px] text-[#111111] outline-none focus:border-[#C8102E]";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold text-[#111111]">Kelola Master</h1>
        <p className="text-[13px] text-[#6B7280]">Atur kategori bahan (area Bar/Dapur) & supplier. Dipakai di seluruh sistem.</p>
      </div>
      {msg && <p className="text-[12.5px] font-semibold text-[#16A34A]">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <CategorySection cats={cats} input={input} reload={loadCats} onFlash={flash} />
        <SupplierSection sups={sups} input={input} reload={loadSups} onFlash={flash} />
      </div>
    </div>
  );
}

function CategorySection({ cats, input, reload, onFlash }: { cats: Category[]; input: string; reload: () => Promise<void>; onFlash: (m: string) => void }) {
  const [name, setName] = useState("");
  const [area, setArea] = useState<"bar" | "dapur" | "umum">("umum");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      await garageApi.post("/api/wms/categories", { name: name.trim(), area });
      setName("");
      await reload();
      onFlash("Kategori ditambahkan.");
    } finally { setBusy(false); }
  }
  async function setCatArea(c: Category, next: "bar" | "dapur" | "umum") {
    await garageApi.patch(`/api/wms/categories/${c.id}`, { area: next });
    await reload();
    onFlash(`Area "${c.name}" → ${AREA_LABEL[next]}.`);
  }
  async function del(c: Category) {
    if (!window.confirm(`Hapus kategori "${c.name}"?`)) return;
    try {
      await garageApi.delete(`/api/wms/categories/${c.id}`);
      await reload();
      onFlash("Kategori dihapus.");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Gagal hapus kategori.");
    }
  }

  return (
    <section className="rounded-xl border border-[#E8E8E8] bg-white">
      <p className="flex items-center gap-2 border-b border-[#E8E8E8] px-4 py-2.5 text-[14px] font-bold text-[#111111]"><Tags className="size-4 text-[#C8102E]" /> Kategori Bahan</p>
      <div className="flex gap-2 border-b border-[#F0F1F4] p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kategori baru" className={`${input} flex-1`} />
        <select value={area} onChange={(e) => setArea(e.target.value as "bar" | "dapur" | "umum")} className={input}>
          <option value="bar">Bar</option>
          <option value="dapur">Dapur</option>
          <option value="umum">Umum</option>
        </select>
        <button type="button" disabled={busy} onClick={() => void add()} className="flex items-center gap-1 rounded-md bg-[#C8102E] px-3 text-[12px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50"><Plus className="size-3.5" /> Tambah</button>
      </div>
      <div className="max-h-[420px] divide-y divide-[#F0F1F4] overflow-y-auto">
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-2 px-4 py-2">
            <span className="flex-1 text-[13px] font-semibold text-[#111111]">{c.name}</span>
            <select value={c.area} onChange={(e) => void setCatArea(c, e.target.value as "bar" | "dapur" | "umum")} className={`${input} h-8`}>
              <option value="bar">Bar</option>
              <option value="dapur">Dapur</option>
              <option value="umum">Umum</option>
            </select>
            <button type="button" onClick={() => void del(c)} className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#FDF1F3] hover:text-[#C8102E]"><Trash2 className="size-3.5" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function SupplierSection({ sups, input, reload, onFlash }: { sups: Supplier[]; input: string; reload: () => Promise<void>; onFlash: (m: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (name.trim().length < 2 || busy) return;
    setBusy(true);
    try {
      await garageApi.post("/api/wms/suppliers", { name: name.trim(), phone: phone.trim() });
      setName("");
      setPhone("");
      await reload();
      onFlash("Supplier ditambahkan.");
    } finally { setBusy(false); }
  }
  async function archive(s: Supplier) {
    if (!window.confirm(`Arsipkan supplier "${s.name}"?`)) return;
    await garageApi.delete(`/api/wms/suppliers/${s.id}`);
    await reload();
    onFlash("Supplier diarsipkan.");
  }
  async function savePhone(s: Supplier, phoneVal: string) {
    await garageApi.patch(`/api/wms/suppliers/${s.id}`, { phone: phoneVal });
    await reload();
  }

  return (
    <section className="rounded-xl border border-[#E8E8E8] bg-white">
      <p className="flex items-center gap-2 border-b border-[#E8E8E8] px-4 py-2.5 text-[14px] font-bold text-[#111111]"><Truck className="size-4 text-[#2563EB]" /> Supplier</p>
      <div className="flex gap-2 border-b border-[#F0F1F4] p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama supplier" className={`${input} flex-1`} />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telp" className={`${input} w-28`} />
        <button type="button" disabled={busy} onClick={() => void add()} className="flex items-center gap-1 rounded-md bg-[#C8102E] px-3 text-[12px] font-bold text-white hover:bg-[#a60d26] disabled:opacity-50"><Plus className="size-3.5" /> Tambah</button>
      </div>
      <div className="max-h-[420px] divide-y divide-[#F0F1F4] overflow-y-auto">
        {sups.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-[#9CA3AF]">Belum ada supplier.</p>}
        {sups.map((s) => (
          <div key={s.id} className="flex items-center gap-2 px-4 py-2">
            <span className="flex-1 text-[13px] font-semibold text-[#111111]">{s.name}</span>
            <input defaultValue={s.phone} onBlur={(e) => { if (e.target.value !== s.phone) void savePhone(s, e.target.value); }} placeholder="Telp" className={`${input} h-8 w-28`} />
            <button type="button" onClick={() => void archive(s)} className="grid size-7 place-items-center rounded-md text-[#6B7280] hover:bg-[#FDF1F3] hover:text-[#C8102E]"><Trash2 className="size-3.5" /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
