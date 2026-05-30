"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Search, Trash2, Tag, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  category: string;
  createdAt: string;
}

export function TeamGlossaryManager() {
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  // Form states
  const [term, setTerm] = useState("");
  const [definition, setDefinition] = useState("");
  const [category, setCategory] = useState("F&B Kafe");
  const [submitting, setSubmitting] = useState(false);

  async function fetchTerms() {
    try {
      setLoading(true);
      const res = await fetch("/api/hr/team/glossary");
      const data = await res.json();
      if (data.glossary) {
        setTerms(data.glossary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTerms();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!term || !definition) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/hr/team/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term,
          definition,
          category,
        }),
      });
      if (res.ok) {
        setTerm("");
        setDefinition("");
        setCategory("F&B Kafe");
        setShowAddForm(false);
        fetchTerms();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Apakah Anda yakin ingin menghapus istilah ini?")) return;

    try {
      const res = await fetch("/api/hr/team/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (res.ok) {
        fetchTerms();
      }
    } catch (err) {
      console.error(err);
    }
  }

  const filteredTerms = terms.filter((item) => {
    const matchesSearch =
      item.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.definition.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <BookOpen className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-100">Kamus Operasional & Glosarium Tim</h3>
            <p className="text-xs text-zinc-400">Daftar istilah standar resep kopi, suku cadang bengkel, dan kode operasional.</p>
          </div>
        </div>

        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold gap-2 border border-amber-400/20"
        >
          <Plus className="size-4" />
          Tambah Istilah
        </Button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4 backdrop-blur-md">
          <h4 className="text-sm font-semibold text-zinc-200">Tambah Istilah Glosarium Baru</h4>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Istilah / Kode</label>
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Contoh: Dialing Espresso atau CV Joint"
                className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Kategori Istilah</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-zinc-950/50 border border-zinc-800 text-zinc-200 focus:border-amber-500 text-sm focus:outline-none"
              >
                <option value="F&B Kafe">F&B Kafe</option>
                <option value="Bengkel Motor">Bengkel Motor</option>
                <option value="Umum">Umum / Backoffice</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-400">Definisi / Keterangan Standar</label>
            <Textarea
              value={definition}
              onChange={(e) => setDefinition(e.target.value)}
              placeholder="Jelaskan arti, takaran, resep, atau kegunaan alat secara lengkap sesuai standar SOP..."
              rows={3}
              className="bg-zinc-950/50 border-zinc-800 text-zinc-200 focus:border-amber-500"
              required
            />
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
              {submitting ? "Menyimpan..." : "Simpan Istilah"}
            </Button>
          </div>
        </form>
      )}

      {/* Search & Categories Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Categories */}
        <div className="flex flex-wrap gap-1.5 bg-white/[0.02] border border-zinc-800 p-1 rounded-xl">
          {["All", "F&B Kafe", "Bengkel Motor", "Umum"].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeCategory === cat
                  ? "bg-amber-500 text-zinc-950"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]"
              }`}
            >
              {cat === "All" ? "Semua Istilah" : cat}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari istilah atau arti..."
            className="pl-9 bg-zinc-950/50 border-zinc-800 text-zinc-200 text-xs focus:border-amber-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-zinc-500">Memuat kamus istilah...</div>
      ) : filteredTerms.length === 0 ? (
        <div className="bg-zinc-900/20 border border-zinc-800/50 rounded-xl p-12 text-center text-zinc-500 space-y-2">
          <HelpCircle className="size-8 mx-auto text-zinc-600" />
          <p className="font-medium text-zinc-400">Glosarium masih kosong</p>
          <p className="text-xs">Tambahkan istilah resep barista atau alat bengkel untuk membantu penyamaan standar staf.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTerms.map((item) => (
            <div
              key={item.id}
              className="bg-zinc-900/30 hover:bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 transition-all flex flex-col justify-between gap-3 relative group"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                    item.category === "Bengkel Motor"
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      : item.category === "F&B Kafe"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-zinc-800 text-zinc-300 border-zinc-700"
                  }`}>
                    <Tag className="size-2.5" />
                    {item.category}
                  </span>
                  <h4 className="font-semibold text-zinc-100 text-sm">{item.term}</h4>
                </div>

                <p className="text-zinc-300 text-xs leading-relaxed leading-5">{item.definition}</p>
              </div>

              <div className="flex justify-end border-t border-zinc-800/50 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  onClick={() => handleDelete(item.id)}
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 w-7 p-0 rounded-md"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
