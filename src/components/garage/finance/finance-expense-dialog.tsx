"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Plus, RefreshCw, Wallet } from "lucide-react";
import { currency } from "@/lib/garage-data";
import { garageApi } from "@/lib/api-client";
import { GarageEmpty } from "@/components/garage/garage-state-display";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

type ExpenseRow = {
  id: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  status: string;
  expenseDate: string;
  receiptUrl: string | null;
  notes: string | null;
  approvedAt: string | null;
  createdAt: string;
};

/**
 * Dialog pengeluaran (daftar + filter + form tambah). Mengelola state & fetch
 * sendiri; memanggil `onOverviewRefresh` supaya KPI overview di parent ikut
 * ter-refresh setelah create/approve/reject.
 */
export function FinanceExpenseDialog({
  open,
  onOpenChange,
  onOverviewRefresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOverviewRefresh: () => void;
}) {
  const [list, setList] = useState<ExpenseRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [decisionId, setDecisionId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formCategory, setFormCategory] = useState("Operasional");
  const [formDescription, setFormDescription] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState("Cash");
  const [formNote, setFormNote] = useState("");
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const query = (() => {
    const params = new URLSearchParams();
    if (filterCategory && filterCategory !== "all") {
      params.set("category", filterCategory);
    }
    if (filterStatus && filterStatus !== "all") {
      params.set("status", filterStatus);
    }
    params.set("limit", "100");
    return params.toString();
  })();

  // Refresh manual (tombol) — boleh setState sinkron karena dipanggil dari onClick.
  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await garageApi.get<{ expenses: ExpenseRow[] }>(
        `/api/finance/expenses?${query}`,
      );
      setList(data.expenses);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal memuat daftar pengeluaran.",
      );
    } finally {
      setListLoading(false);
    }
  }, [query]);

  // Muat ulang saat dialog dibuka atau filter berubah — inline, setState hanya
  // setelah await (hindari cascading render dari setState sinkron di effect).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await garageApi.get<{ expenses: ExpenseRow[] }>(
          `/api/finance/expenses?${query}`,
        );
        if (!cancelled) setList(data.expenses);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Gagal memuat daftar pengeluaran.",
          );
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  async function decide(id: string, decision: "approve" | "reject") {
    setDecisionId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await garageApi.patch<{ pendingOwnerApproval?: boolean }>(`/api/finance/expenses/${id}/${decision}`, {});
      // Approval 2 tingkat: di atas batas Owner, approve Manajer = review saja.
      if (result?.pendingOwnerApproval) {
        setNotice("Review Manajer tercatat — pengeluaran ini menunggu keputusan final Owner.");
      }
      onOverviewRefresh();
      await loadList();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Keputusan pengeluaran gagal.",
      );
    } finally {
      setDecisionId(null);
    }
  }

  function openForm() {
    setFormCategory("Operasional");
    setFormDescription("");
    setFormAmount("");
    setFormPaymentMethod("Cash");
    setFormNote("");
    setFormError(null);
    setFormOpen(true);
  }

  async function submitForm() {
    const amount = Number(formAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Nominal tidak valid.");
      return;
    }
    const description = formDescription.trim();
    if (description.length < 2) {
      setFormError("Deskripsi wajib diisi.");
      return;
    }
    setFormSaving(true);
    setFormError(null);
    try {
      await garageApi.post("/api/finance/expenses", {
        category: formCategory.trim() || "Operasional",
        description,
        amount: Math.round(amount),
        paymentMethod: formPaymentMethod || "Cash",
        notes: formNote.trim() || undefined,
      });
      setFormOpen(false);
      onOverviewRefresh();
      await loadList();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Gagal menyimpan pengeluaran.",
      );
    } finally {
      setFormSaving(false);
    }
  }

  const pendingRows = list.filter((row) => row.status === "pending_approval");
  const visibleTotal = list.reduce((sum, row) => sum + row.amount, 0);
  const pendingTotal = pendingRows.reduce((sum, row) => sum + row.amount, 0);
  const cashTotal = list
    .filter((row) => row.paymentMethod.toLowerCase() === "cash")
    .reduce((sum, row) => sum + row.amount, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pengeluaran</DialogTitle>
            <DialogDescription>
              Catat &amp; pantau pengeluaran operasional outlet. Pengeluaran ≥ Rp
              1.000.000 otomatis butuh approval manager.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <p className="text-xs text-[#ffc2c8]">{error}</p>
          ) : null}
          {notice ? (
            <p className="text-xs font-semibold text-[#ffd8a8]">{notice}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-10 w-44 border-[#34343c] bg-white/[0.06]">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kategori</SelectItem>
                <SelectItem value="Belanja Dapur">Belanja Dapur</SelectItem>
                <SelectItem value="Belanja Bar">Belanja Bar</SelectItem>
                <SelectItem value="COGS">COGS</SelectItem>
                <SelectItem value="Operasional">Operasional</SelectItem>
                <SelectItem value="Payroll">Payroll</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Kasbon">Kasbon</SelectItem>
                <SelectItem value="Beli Air">Beli Air</SelectItem>
                <SelectItem value="Beli Tisu">Beli Tisu</SelectItem>
                <SelectItem value="Transport">Transport</SelectItem>
                <SelectItem value="Konsumsi Staff">Konsumsi Staff</SelectItem>
                <SelectItem value="Lain-lain">Lain-lain</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-10 w-44 border-[#34343c] bg-white/[0.06]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua status</SelectItem>
                <SelectItem value="recorded">Recorded</SelectItem>
                <SelectItem value="pending_approval">Pending approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54] bg-white/[0.055] px-3 text-xs"
              onClick={() => void loadList()}
              disabled={listLoading}
            >
              <RefreshCw
                className={`mr-2 size-3.5 ${listLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button
              type="button"
              className="garage-press ml-auto h-10"
              onClick={openForm}
            >
              <Plus className="mr-2 size-4" />
              Tambah
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-[#34343c] bg-black/15 p-3">
              <p className="garage-mono text-[10px] text-[#8f8f99]">Total tampil</p>
              <p className="mt-1 text-lg font-black text-white">
                {currency.format(visibleTotal)}
              </p>
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                {list.length} entry sesuai filter
              </p>
            </div>
            <div className="rounded-md border border-[#f5a742]/35 bg-[#f5a742]/10 p-3">
              <p className="garage-mono text-[10px] text-[#ffd08a]">
                Pending approval
              </p>
              <p className="mt-1 text-lg font-black text-[#ffd08a]">
                {currency.format(pendingTotal)}
              </p>
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                {pendingRows.length} butuh keputusan
              </p>
            </div>
            <div className="rounded-md border border-[#d4d4d8]/25 bg-white/[0.04] p-3">
              <p className="garage-mono text-[10px] text-[#8f8f99]">Cash impact</p>
              <p className="mt-1 text-lg font-black text-white">
                {currency.format(cashTotal)}
              </p>
              <p className="mt-1 text-[10px] text-[#8f8f99]">
                Mengurangi expected cash saat valid
              </p>
            </div>
          </div>

          <div className="garage-scroll min-h-[200px] flex-1 overflow-auto rounded-md border border-[#34343c] bg-black/10">
            {listLoading && list.length === 0 ? (
              <p className="py-8 text-center text-xs text-[#8f8f99]">
                Memuat daftar pengeluaran...
              </p>
            ) : list.length === 0 ? (
              <GarageEmpty
                icon={Wallet}
                title="Belum ada pengeluaran"
                description="Catat pengeluaran kategori ini untuk muncul di sini."
                compact
              />
            ) : (
              <Table className="min-w-[680px]">
                <TableHeader className="sticky top-0 z-10 bg-[#1b1b21]">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead>Deskripsi</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="text-[11px] text-[#b8b8bf]">
                        {new Date(row.expenseDate).toLocaleString("id-ID", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </TableCell>
                      <TableCell className="text-zinc-200">{row.category}</TableCell>
                      <TableCell className="max-w-[280px] whitespace-normal text-sm leading-5 text-white">
                        {row.description}
                        {row.notes ? (
                          <span className="mt-0.5 block text-[10px] text-[#8f8f99]">
                            {row.notes}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-white">
                        {currency.format(row.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            row.status === "pending_approval"
                              ? "border-[#f5a742]/55 bg-[#f5a742]/14 px-2 text-[10px] text-[#ffd08a]"
                              : row.status === "rejected"
                                ? "border-[#d11a2a]/45 bg-[#d11a2a]/12 px-2 text-[10px] text-[#ffc2c8]"
                                : "border-[#22c55e]/45 bg-[#22c55e]/14 px-2 text-[10px] text-[#dcfce7]"
                          }
                        >
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.status === "pending_approval" ? (
                          <div className="flex justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              className="garage-press h-8 px-2 text-[11px]"
                              disabled={decisionId === row.id}
                              onClick={() => void decide(row.id, "approve")}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 text-[11px] text-[#ffc2c8]"
                              disabled={decisionId === row.id}
                              onClick={() => void decide(row.id, "reject")}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#8f8f99]">
                            {row.approvedAt ? "signed" : "-"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-[#b8b8bf]">
              Total tampil:{" "}
              <span className="garage-mono text-[#ffd08a]">
                {currency.format(visibleTotal)}
              </span>{" "}
              ({list.length} entry)
            </p>
            <Button
              type="button"
              className="garage-press h-10"
              onClick={() => onOpenChange(false)}
            >
              Tutup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Form Tambah Pengeluaran */}
      <Dialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) setFormError(null);
        }}
      >
        <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Pengeluaran</DialogTitle>
            <DialogDescription>
              Pengeluaran ≥ Rp 1.000.000 otomatis masuk antrian approval.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitForm();
            }}
          >
            <div>
              <p className="garage-mono mb-1.5 text-[10px] text-[#b8b8bf]">
                Kategori
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    "Belanja Dapur",
                    "Belanja Bar",
                    "COGS",
                    "Operasional",
                    "Payroll",
                    "Marketing",
                    "Kasbon",
                    "Lain-lain",
                  ] as const
                ).map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant="outline"
                    className={`garage-press h-9 px-2 text-[11px] ${
                      formCategory === cat
                        ? "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd08a]"
                        : "border-[#4a4a54] bg-white/[0.055]"
                    }`}
                    onClick={() => setFormCategory(cat)}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
              {formCategory === "Belanja Dapur" || formCategory === "Belanja Bar" || formCategory === "COGS" ? (
                <p className="mt-2 rounded-md border border-[#f5a742]/40 bg-[#f5a742]/10 px-2.5 py-2 text-xs text-[#ffd79a]">
                  Belanja bahan sebaiknya dicatat lewat Penerimaan Gudang: stok bertambah dan biaya Bar/Dapur otomatis
                  masuk laba rugi. Pengeluaran di sini hanya mencatat uang keluar (tidak mengurangi profit lagi).
                </p>
              ) : null}
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                Deskripsi (wajib)
              </p>
              <Input
                value={formDescription}
                onChange={(event) =>
                  setFormDescription(event.target.value.slice(0, 180))
                }
                placeholder="mis. Beli galon Aqua, bayar listrik, gaji barista"
                className="h-11 border-[#34343c] bg-white/[0.06]"
                maxLength={180}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Nominal (Rp)
                </p>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={formAmount}
                  onChange={(event) => setFormAmount(event.target.value)}
                  placeholder="50000"
                  className="h-11 border-[#34343c] bg-white/[0.06]"
                />
              </div>
              <div>
                <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                  Metode bayar
                </p>
                <Select
                  value={formPaymentMethod}
                  onValueChange={setFormPaymentMethod}
                >
                  <SelectTrigger className="h-11 border-[#34343c] bg-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="QRIS">QRIS</SelectItem>
                    <SelectItem value="Transfer">Transfer Bank</SelectItem>
                    <SelectItem value="E-Wallet">E-Wallet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
                Catatan (opsional)
              </p>
              <Input
                value={formNote}
                onChange={(event) =>
                  setFormNote(event.target.value.slice(0, 200))
                }
                placeholder="Detail tambahan untuk audit"
                className="h-11 border-[#34343c] bg-white/[0.06]"
                maxLength={200}
              />
            </div>
            {Number(formAmount) >= 1_000_000 ? (
              <Alert className="border-[#f5a742]/45 bg-[#f5a742]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Butuh approval</AlertTitle>
                <AlertDescription>
                  Nominal ≥ Rp 1.000.000 akan masuk antrian approval manager.
                </AlertDescription>
              </Alert>
            ) : null}
            {formError ? (
              <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
                <AlertTriangle className="size-4" />
                <AlertTitle>Pengeluaran</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
                onClick={() => setFormOpen(false)}
                disabled={formSaving}
              >
                Batal
              </Button>
              <Button type="submit" className="garage-press h-10" disabled={formSaving}>
                {formSaving ? (
                  <>
                    <RefreshCw className="mr-2 size-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Check className="mr-2 size-4" />
                    Simpan
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
