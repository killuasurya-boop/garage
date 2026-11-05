"use client";

// Dialog POS yang dipindah dari pos-view.tsx (U0d). Perilaku sama; state dan
// handler tetap di PosView dan diteruskan sebagai props.

import { generateTemporaryMemberPin, hasOpenTableBill, type ParkedOrder, tableNumbers } from "@/components/garage/garage-app-helpers";
import { type CashierThemeMode } from "@/components/garage/garage-app-pickers";
import { type OrderCancelTarget } from "@/components/garage/pos-order-cancel-dialog";
import { formatReceiptDate } from "@/components/garage/pos/pos-ui-shared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type AppSettings, type CartLine, type CustomerOrder, type MenuItem, type MenuVariant, type OrderReceipt, type OrderType, type TableLiveRow } from "@/lib/garage-api-types";
import { currency, type GarageMenuItem } from "@/lib/garage-data";
import { AlertTriangle, Archive, ArrowRight, Ban, Banknote, Camera, Check, Loader2, PauseCircle, Percent, Plus, Printer, RefreshCw, Trash2, Users } from "lucide-react";
import { type ChangeEvent, type Dispatch, type FormEvent, type RefObject, type SetStateAction } from "react";

export function PosClearCartDialog({
  clearCartOpen,
  setClearCartOpen,
  setCart,
}: {
  clearCartOpen: boolean;
  setClearCartOpen: Dispatch<SetStateAction<boolean>>;
  setCart: Dispatch<SetStateAction<CartLine[]>>;
}) {
  return (
    <Dialog open={clearCartOpen} onOpenChange={setClearCartOpen}>
      <DialogContent className="border-[#34343c] bg-[#111116]">
        <DialogHeader>
          <DialogTitle>Hapus keranjang?</DialogTitle>
          <DialogDescription>
            Semua item di current bill akan dihapus dari cart.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="garage-press border-[#4a4a54]"
            onClick={() => setClearCartOpen(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="garage-press bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
            onClick={() => {
              setCart([]);
              setClearCartOpen(false);
            }}
          >
            <Trash2 className="mr-2 size-4" />
            Hapus keranjang
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosParkBillDialog({
  parkDialogOpen,
  setParkDialogOpen,
  cartLines,
  estimateCartTotal,
  cart,
  orderType,
  selectedTableNumber,
  parkLabel,
  setParkLabel,
  parkCurrentOrder,
}: {
  parkDialogOpen: boolean;
  setParkDialogOpen: Dispatch<SetStateAction<boolean>>;
  cartLines: (CartLine & { item: MenuItem; variant: MenuVariant; })[];
  estimateCartTotal: (lines: CartLine[]) => number;
  cart: CartLine[];
  orderType: OrderType;
  selectedTableNumber: string;
  parkLabel: string;
  setParkLabel: Dispatch<SetStateAction<string>>;
  parkCurrentOrder: (customLabel?: string) => void;
}) {
  return (
    <Dialog open={parkDialogOpen} onOpenChange={setParkDialogOpen}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PauseCircle className="size-5 text-[#f5a742]" />
            Parkir Bill Saat Ini
          </DialogTitle>
          <DialogDescription>
            Cart akan disimpan sementara dan kasir bisa layani customer lain dulu.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
            <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
              Bill yang akan di-park
            </p>
            <p className="mt-1 text-sm font-semibold text-white">
              {cartLines.length} item · {currency.format(estimateCartTotal(cart))}
            </p>
            <p className="mt-0.5 text-[10px] text-[#8f8f99]">
              {orderType === "dine-in" && selectedTableNumber
                ? `Meja ${selectedTableNumber}`
                : orderType === "takeaway"
                  ? "Take Away"
                  : "Delivery"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
              Label (opsional)
            </p>
            <Input
              value={parkLabel}
              onChange={(event) => setParkLabel(event.target.value)}
              placeholder={`Misal: Budi T-04, baju biru, dll`}
              maxLength={60}
              className="mt-1 h-10 border-[#34343c] bg-white/[0.06]"
              autoFocus
            />
            <p className="mt-1 text-[10px] text-[#8f8f99]">
              Kosongkan untuk auto-label berdasarkan meja/order type.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54]"
              onClick={() => setParkDialogOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              className="garage-press h-10 gap-2"
              onClick={() => parkCurrentOrder(parkLabel)}
            >
              <PauseCircle className="size-4" />
              Parkir Sekarang
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosParkedBillsDialog({
  parkedListOpen,
  setParkedListOpen,
  parkedOrders,
  parkedListNowTick,
  resumeParkedOrder,
  askConfirm,
  deleteParkedOrder,
}: {
  parkedListOpen: boolean;
  setParkedListOpen: Dispatch<SetStateAction<boolean>>;
  parkedOrders: ParkedOrder[];
  parkedListNowTick: number;
  resumeParkedOrder: (parked: ParkedOrder) => Promise<void>;
  askConfirm: (opts: { title: string; message?: string; confirmLabel?: string; needsReason?: boolean; reasonPlaceholder?: string; danger?: boolean; }) => Promise<string | boolean>;
  deleteParkedOrder: (id: string) => void;
}) {
  return (
    <Dialog open={parkedListOpen} onOpenChange={setParkedListOpen}>
      <DialogContent className="max-h-[80svh] overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="size-5 text-[#f5a742]" />
            Parked Orders ({parkedOrders.length})
          </DialogTitle>
          <DialogDescription>
            Bill yang sedang ditahan. Klik Lanjutkan untuk meneruskan transaksi.
          </DialogDescription>
        </DialogHeader>
        {parkedOrders.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#8f8f99]">
            <Archive className="mx-auto mb-2 size-6 text-[#4a4a54]" />
            Tidak ada bill yang sedang di-park.
          </div>
        ) : (
          <div className="garage-scroll max-h-[60svh] space-y-2 overflow-y-auto pr-1">
            {parkedOrders.map((parked) => {
              // Pakai parkedAt langsung sebagai display tanpa Date.now() di render
              const parkedDate = new Date(parked.parkedAt);
              const ageMinutes = Math.max(
                0,
                Math.floor((parkedListNowTick - parkedDate.getTime()) / 60_000),
              );
              return (
                <div
                  key={parked.id}
                  className="rounded-md border border-[#34343c] bg-[#17171c] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {parked.label}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-[#8f8f99]">
                        {parked.itemCount} item ·{" "}
                        {currency.format(parked.estimatedTotal)} ·{" "}
                        {ageMinutes === 0 ? "baru saja" : `${ageMinutes}m lalu`}
                      </p>
                      <p className="mt-0.5 text-[10px] text-[#8f8f99]">
                        {parked.orderType === "dine-in" &&
                        parked.selectedTableNumber
                          ? `Meja ${parked.selectedTableNumber}`
                          : parked.orderType}
                        {parked.posCustomerMode === "member" &&
                          parked.memberPhone &&
                          ` · Member ${parked.memberPhone}`}
                        {parked.posCustomerMode === "guest" &&
                          parked.guestName &&
                          ` · ${parked.guestName}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        className="garage-press h-8 gap-1 text-xs"
                        onClick={() => resumeParkedOrder(parked)}
                      >
                        <ArrowRight className="size-3" />
                        Lanjutkan
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="garage-press h-8 border-[#d11a2a]/45 bg-[#d11a2a]/10 px-2 text-[#ffc2c8]"
                        onClick={async () => {
                          const ok = await askConfirm({
                            title: "Hapus parked bill?",
                            message: `Hapus parked bill "${parked.label}"?`,
                            confirmLabel: "Hapus",
                            danger: true,
                          });
                          if (ok) deleteParkedOrder(parked.id);
                        }}
                        aria-label="Hapus parked bill"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-end border-t border-[#34343c] pt-3">
          <p className="text-[10px] text-[#8f8f99]">
            Auto-hapus saat browser cache clear · max 20 bill
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosSplitBillDialog({
  splitBillOpen,
  setSplitBillOpen,
  totalDue,
  splitPeopleCount,
  setSplitPeopleCount,
}: {
  splitBillOpen: boolean;
  setSplitBillOpen: Dispatch<SetStateAction<boolean>>;
  totalDue: number;
  splitPeopleCount: string;
  setSplitPeopleCount: Dispatch<SetStateAction<string>>;
}) {
  return (
    <Dialog open={splitBillOpen} onOpenChange={setSplitBillOpen}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5 text-[#f5a742]" />
            Bagi Rata (Split Bill)
          </DialogTitle>
          <DialogDescription>
            Kalkulator untuk customer yang bayar terpisah. Tidak mengubah total bill di kasir.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3">
            <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
              Total Bill
            </p>
            <p className="mt-1 garage-display text-2xl font-bold text-[#ffd79a]">
              {currency.format(totalDue)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[#8f8f99]">
              Bagi jadi berapa orang?
            </p>
            <Input
              type="number"
              min={2}
              max={20}
              value={splitPeopleCount}
              onChange={(event) =>
                setSplitPeopleCount(event.target.value.replace(/\D/g, ""))
              }
              className="mt-1 h-12 border-[#34343c] bg-white/[0.06] text-center text-2xl font-bold"
              autoFocus
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSplitPeopleCount(String(n))}
                  className={`garage-press flex-1 rounded-md border px-2 py-1.5 text-xs font-bold ${
                    splitPeopleCount === String(n)
                      ? "border-[#f5a742] bg-[#f5a742]/16 text-[#ffd79a]"
                      : "border-[#34343c] bg-white/[0.04] text-[#d6d6dc] hover:border-[#4a4a54]"
                  }`}
                >
                  {n} org
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const count = Math.max(2, Math.min(20, Number(splitPeopleCount) || 0));
            if (!count || count < 2) return null;
            const exactPerPerson = totalDue / count;
            const roundedPerPerson = Math.ceil(exactPerPerson / 1000) * 1000;
            const totalRounded = roundedPerPerson * count;
            const extraOverpay = totalRounded - totalDue;
            return (
              <div className="space-y-2">
                <div className="rounded-md border border-[#f5a742]/45 bg-[#f5a742]/10 p-4 text-center">
                  <p className="garage-mono text-[10px] uppercase tracking-wide text-[#ffd79a]">
                    Per Orang (rounded ke Rp 1.000)
                  </p>
                  <p className="mt-1 garage-display text-3xl font-bold text-white">
                    {currency.format(roundedPerPerson)}
                  </p>
                  <p className="mt-1 text-[10px] text-[#ffd79a]/80">
                    × {count} orang = {currency.format(totalRounded)}
                    {extraOverpay > 0 && ` (lebih ${currency.format(extraOverpay)})`}
                  </p>
                </div>
                <div className="rounded-md border border-[#34343c] bg-[#17171c] p-3 text-center">
                  <p className="garage-mono text-[10px] uppercase tracking-wide text-[#8f8f99]">
                    Exact (tanpa pembulatan)
                  </p>
                  <p className="mt-1 font-mono text-sm font-semibold text-[#d6d6dc]">
                    {currency.format(Math.round(exactPerPerson))} per orang
                  </p>
                </div>
                <p className="text-center text-[10px] text-[#8f8f99]">
                  Kasir tetap input total ({currency.format(totalDue)}) di kasir.
                  Customer urus bagi-bagi sendiri.
                </p>
              </div>
            );
          })()}

          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 w-full border-[#4a4a54]"
            onClick={() => setSplitBillOpen(false)}
          >
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosQuickMemberDialog({
  memberRegOpen,
  setMemberRegOpen,
  isCashierKiosk,
  memberRegName,
  setMemberRegName,
  memberRegPhone,
  setMemberRegPhone,
  memberRegPin,
  setMemberRegPin,
  memberRegMsg,
  memberRegBusy,
  submitMemberRegister,
  cashierTheme,
}: {
  memberRegOpen: boolean;
  setMemberRegOpen: Dispatch<SetStateAction<boolean>>;
  isCashierKiosk: boolean;
  memberRegName: string;
  setMemberRegName: Dispatch<SetStateAction<string>>;
  memberRegPhone: string;
  setMemberRegPhone: Dispatch<SetStateAction<string>>;
  memberRegPin: string;
  setMemberRegPin: Dispatch<SetStateAction<string>>;
  memberRegMsg: string | null;
  memberRegBusy: boolean;
  submitMemberRegister: () => Promise<void>;
  cashierTheme: CashierThemeMode;
}) {
  return (
    <Dialog open={memberRegOpen} onOpenChange={setMemberRegOpen}>
      <DialogContent
        data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
        className="border-[#34343c] bg-[#111116] sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Daftar Member Baru</DialogTitle>
          <DialogDescription>
            Daftarkan pelanggan jadi member Silver. Pakai PIN sederhana yang mudah
            diingat (mis. 6 digit). Tier lebih tinggi diatur lewat menu Membership.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-[#d6d6dc]">Nama</span>
            <Input
              value={memberRegName}
              onChange={(e) => setMemberRegName(e.target.value)}
              placeholder="Nama pelanggan"
              className="h-11 border-[#34343c] bg-white/[0.06]"
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-[#d6d6dc]">Nomor HP</span>
            <Input
              value={memberRegPhone}
              onChange={(e) => setMemberRegPhone(e.target.value)}
              placeholder="0813..."
              inputMode="tel"
              className="h-11 border-[#34343c] bg-white/[0.06]"
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-[#d6d6dc]">PIN</span>
            <Input
              value={memberRegPin}
              onChange={(e) => setMemberRegPin(e.target.value)}
              placeholder="Min. 6 digit"
              type="password"
              className="h-11 border-[#34343c] bg-white/[0.06]"
            />
          </div>
          {memberRegMsg ? (
            <p className="rounded-md border border-[#d11a2a]/40 bg-[#d11a2a]/12 px-3 py-2 text-xs font-semibold text-[#ffb4bd]">
              {memberRegMsg}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#4a4a54]"
            onClick={() => setMemberRegOpen(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="garage-press h-10"
            disabled={memberRegBusy}
            onClick={() => void submitMemberRegister()}
          >
            {memberRegBusy ? "Mendaftar..." : "Daftarkan (Silver)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosSoldOutDialog({
  soldOutDialogOpen,
  setSoldOutDialogOpen,
  isCashierKiosk,
  soldOutQuery,
  setSoldOutQuery,
  clearAllSoldOut,
  soldOutIds,
  soldOutPendingIds,
  updateSoldOutStock,
  menuPhotoUploadingId,
  openMenuPhotoPicker,
  removeMenuItemPhoto,
  menuPhotoInputRef,
  onMenuPhotoSelected,
  cashierTheme,
  menuItems,
}: {
  soldOutDialogOpen: boolean;
  setSoldOutDialogOpen: Dispatch<SetStateAction<boolean>>;
  isCashierKiosk: boolean;
  soldOutQuery: string;
  setSoldOutQuery: Dispatch<SetStateAction<string>>;
  clearAllSoldOut: () => Promise<void>;
  soldOutIds: Set<string>;
  soldOutPendingIds: Set<string>;
  updateSoldOutStock: (itemId: string, soldOut: boolean) => Promise<void>;
  menuPhotoUploadingId: string | null;
  openMenuPhotoPicker: (itemId: string) => void;
  removeMenuItemPhoto: (itemId: string) => Promise<void>;
  menuPhotoInputRef: RefObject<HTMLInputElement | null>;
  onMenuPhotoSelected: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  cashierTheme: CashierThemeMode;
  menuItems: MenuItem[];
}) {
  return (
    <Dialog open={soldOutDialogOpen} onOpenChange={setSoldOutDialogOpen}>
      <DialogContent
        data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
        className="flex max-h-[88svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>Atur Menu Digital</DialogTitle>
          <DialogDescription>
            Ketuk item untuk tandai HABIS (terkunci di POS &amp; Menu Digital QR),
            atau tekan ikon kamera untuk set foto menu.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input
            value={soldOutQuery}
            onChange={(event) => setSoldOutQuery(event.target.value)}
            placeholder="Cari item..."
            className="h-10 border-[#34343c] bg-white/[0.06]"
          />
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#4a4a54] bg-white/[0.055] px-3 text-xs"
            onClick={() => void clearAllSoldOut()}
            disabled={!soldOutIds.size || soldOutPendingIds.size > 0}
          >
            Reset ({soldOutIds.size})
          </Button>
        </div>
        <div className="garage-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {(() => {
            const q = soldOutQuery.trim().toLowerCase();
            const filtered = menuItems.filter((item) =>
              q ? item.name.toLowerCase().includes(q) : true,
            );
            if (!filtered.length) {
              return (
                <p className="py-6 text-center text-xs text-[#8f8f99]">
                  Tidak ada item.
                </p>
              );
            }
            return filtered.map((item) => {
              const isSoldOut = soldOutIds.has(item.id);
              const isPending = soldOutPendingIds.has(item.id);
              const hasPhoto = Boolean(item.imageUrl);
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition ${
                    isSoldOut
                      ? "border-[#d11a2a]/55 bg-[#d11a2a]/14"
                      : "border-[#34343c] bg-white/[0.04]"
                  }`}
                >
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => void updateSoldOutStock(item.id, !isSoldOut)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded px-1 py-1 text-left transition hover:bg-white/[0.05] disabled:cursor-wait disabled:opacity-70"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {item.name}
                      </p>
                      <p className="truncate text-[11px] text-[#b8b8bf]">
                        {item.category} &middot; {item.section}
                      </p>
                    </div>
                    {isPending ? (
                      <Badge className="border-[#f5a742]/55 bg-[#f5a742]/14 px-2 text-[10px] text-[#ffd08a]">
                        Sync...
                      </Badge>
                    ) : isSoldOut ? (
                      <Badge className="border-[#d11a2a]/55 bg-[#d11a2a]/22 px-2 text-[10px] font-extrabold text-[#ffe1e5]">
                        <Ban className="mr-1 size-3" />
                        HABIS
                      </Badge>
                    ) : (
                      <Badge className="border-[#4a4a54] bg-white/[0.08] px-2 text-[10px] text-[#d6d6dc]">
                        Tersedia
                      </Badge>
                    )}
                  </button>
                  <button
                    type="button"
                    title={hasPhoto ? "Ganti foto menu" : "Unggah foto menu"}
                    aria-label={`Unggah foto ${item.name}`}
                    disabled={menuPhotoUploadingId === item.id}
                    onClick={() => openMenuPhotoPicker(item.id)}
                    className={`garage-press flex size-9 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-60 ${
                      hasPhoto
                        ? "border-[#79e2b9]/45 bg-[#79e2b9]/12 text-[#8df7cc] hover:bg-[#79e2b9]/20"
                        : "border-[#4a4a54] bg-white/[0.05] text-[#d6d6dc] hover:bg-white/[0.1]"
                    }`}
                  >
                    {menuPhotoUploadingId === item.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Camera className="size-4" />
                    )}
                  </button>
                  {hasPhoto ? (
                    <button
                      type="button"
                      title="Hapus foto"
                      aria-label={`Hapus foto ${item.name}`}
                      onClick={() => void removeMenuItemPhoto(item.id)}
                      className="garage-press flex size-9 shrink-0 items-center justify-center rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/10 text-[#ffb4bd] transition hover:bg-[#d11a2a]/20"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              );
            });
          })()}
        </div>
        <input
          ref={menuPhotoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void onMenuPhotoSelected(event)}
        />
        <div className="flex justify-end pt-2">
          <Button
            type="button"
            className="garage-press h-10"
            onClick={() => setSoldOutDialogOpen(false)}
          >
            Selesai
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosResetTableDialog({
  resetTableDialogOpen,
  resetTableBusy,
  setResetTableDialogOpen,
  setSelectedTableToReset,
  setResetTableError,
  selectedTableToReset,
  resetTableError,
  resetTableCleaning,
}: {
  resetTableDialogOpen: boolean;
  resetTableBusy: boolean;
  setResetTableDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedTableToReset: Dispatch<SetStateAction<TableLiveRow | null>>;
  setResetTableError: Dispatch<SetStateAction<string | null>>;
  selectedTableToReset: TableLiveRow | null;
  resetTableError: string | null;
  resetTableCleaning: (tableNumber: string) => Promise<void>;
}) {
  return (
    <Dialog
      open={resetTableDialogOpen}
      onOpenChange={(open) => {
        if (resetTableBusy) return;
        setResetTableDialogOpen(open);
        if (!open) {
          setSelectedTableToReset(null);
          setResetTableError(null);
        }
      }}
    >
      <DialogContent className="max-w-xs border-[#34343c] bg-[#111116] sm:max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle>Tandai Meja {selectedTableToReset?.tableNumber} bersih?</DialogTitle>
          <DialogDescription>
            Sesi meja ditutup dan meja siap dipakai tamu baru.
          </DialogDescription>
        </DialogHeader>
        {selectedTableToReset && hasOpenTableBill(selectedTableToReset) ? (
          <div className="rounded-md border border-[#ff2a3a]/45 bg-[#d11a2a]/12 p-3" role="alert">
            <p className="text-sm font-semibold text-white">Masih ada bill belum lunas</p>
            <p className="mt-1 text-[13px] leading-5 text-[#ffc2c8]">
              {selectedTableToReset.orderNo ? `${selectedTableToReset.orderNo} · ` : ""}
              Bayar atau batalkan bill dulu sebelum meja dikosongkan.
            </p>
          </div>
        ) : null}
        {resetTableError ? (
          <p className="rounded-md border border-[#ff2a3a]/45 bg-[#d11a2a]/12 p-3 text-[13px] text-[#ffc2c8]" role="alert">
            {resetTableError}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="garage-press h-11 border-[#4a4a54] bg-white/[0.055] text-sm"
            disabled={resetTableBusy}
            onClick={() => {
              setResetTableDialogOpen(false);
              setSelectedTableToReset(null);
              setResetTableError(null);
            }}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="garage-press h-11 text-sm"
            disabled={
              resetTableBusy ||
              !selectedTableToReset ||
              hasOpenTableBill(selectedTableToReset)
            }
            onClick={() => {
              if (selectedTableToReset) {
                void resetTableCleaning(selectedTableToReset.tableNumber);
              }
            }}
          >
            {resetTableBusy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {resetTableBusy ? "Menyimpan…" : "Ya, tandai bersih"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosRejectOrderDialog({
  rejectOrderTarget,
  setRejectOrderTarget,
  rejectReasonChoice,
  setRejectReasonChoice,
  rejectReasonOther,
  setRejectReasonOther,
  confirmRejectOrder,
}: {
  rejectOrderTarget: CustomerOrder | null;
  setRejectOrderTarget: Dispatch<SetStateAction<CustomerOrder | null>>;
  rejectReasonChoice: string;
  setRejectReasonChoice: Dispatch<SetStateAction<string>>;
  rejectReasonOther: string;
  setRejectReasonOther: Dispatch<SetStateAction<string>>;
  confirmRejectOrder: () => void;
}) {
  return (
    <Dialog
      open={Boolean(rejectOrderTarget)}
      onOpenChange={(open) => {
        if (!open) setRejectOrderTarget(null);
      }}
    >
      <DialogContent className="border-[#34343c] bg-[#111116] max-w-xs sm:max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle>Tolak order?</DialogTitle>
          <DialogDescription>
            {rejectOrderTarget
              ? `${rejectOrderTarget.tableLabel} · ${rejectOrderTarget.orderNo} · ${currency.format(rejectOrderTarget.total)}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#8f8f98]">
            Alasan
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {["Stok habis", "Salah pesan", "Pelanggan batal", "Duplikat", "Lainnya"].map(
              (option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  className={`garage-press h-10 text-xs ${
                    rejectReasonChoice === option
                      ? "border-[#d11a2a]/70 bg-[#d11a2a]/18 text-white"
                      : "border-[#34343c] bg-white/[0.045] text-[#d6d6dc]"
                  }`}
                  onClick={() => setRejectReasonChoice(option)}
                >
                  {option}
                </Button>
              ),
            )}
          </div>
          {rejectReasonChoice === "Lainnya" ? (
            <Input
              autoFocus
              value={rejectReasonOther}
              onChange={(event) => setRejectReasonOther(event.target.value)}
              placeholder="Tulis alasan (min 3 huruf)"
              className="h-11 border-[#34343c] bg-white/[0.06]"
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            className="garage-press h-11 flex-1 bg-[#d11a2a] text-sm text-white hover:bg-[#ff2a3a]"
            disabled={
              rejectReasonChoice === "Lainnya" &&
              rejectReasonOther.trim().length < 3
            }
            onClick={confirmRejectOrder}
          >
            Tolak order
          </Button>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-11 flex-1 border-[#4a4a54] bg-white/[0.05] text-sm"
            onClick={() => setRejectOrderTarget(null)}
          >
            Batal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosConfirmDialog({
  confirmState,
  resolveConfirm,
  confirmReason,
  setConfirmReason,
}: {
  confirmState: { title: string; message?: string; confirmLabel?: string; needsReason?: boolean; reasonPlaceholder?: string; danger?: boolean; } | null;
  resolveConfirm: (value: string | boolean) => void;
  confirmReason: string;
  setConfirmReason: Dispatch<SetStateAction<string>>;
}) {
  return (
    <Dialog
      open={Boolean(confirmState)}
      onOpenChange={(open) => {
        if (!open) resolveConfirm(false);
      }}
    >
      <DialogContent className="border-[#34343c] bg-[#111116] max-w-xs sm:max-w-sm">
        <DialogHeader className="text-left">
          <DialogTitle>{confirmState?.title}</DialogTitle>
          {confirmState?.message ? (
            <DialogDescription>{confirmState.message}</DialogDescription>
          ) : null}
        </DialogHeader>
        {confirmState?.needsReason ? (
          <Input
            autoFocus
            value={confirmReason}
            onChange={(event) => setConfirmReason(event.target.value)}
            placeholder={confirmState.reasonPlaceholder ?? "Tulis alasan (min 3 huruf)"}
            className="h-11 border-[#34343c] bg-white/[0.06]"
          />
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            className={`garage-press h-11 flex-1 text-sm text-white ${
              confirmState?.danger
                ? "bg-[#d11a2a] hover:bg-[#ff2a3a]"
                : "bg-[#22c55e] hover:bg-[#16a34a]"
            }`}
            disabled={
              confirmState?.needsReason
                ? confirmReason.trim().length < 3
                : false
            }
            onClick={() =>
              resolveConfirm(
                confirmState?.needsReason ? confirmReason.trim() : true,
              )
            }
          >
            {confirmState?.confirmLabel ?? "Konfirmasi"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="garage-press h-11 flex-1 border-[#4a4a54] bg-white/[0.05] text-sm"
            onClick={() => resolveConfirm(false)}
          >
            Batal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosMemberCreateDialog({
  memberCreateOpen,
  setMemberCreateOpen,
  createPosMember,
  memberCreateName,
  setMemberCreateName,
  memberCreatePending,
  memberCreatePhone,
  setMemberCreatePhone,
  memberCreateEmail,
  setMemberCreateEmail,
  memberCreatePin,
  setMemberCreatePin,
}: {
  memberCreateOpen: boolean;
  setMemberCreateOpen: Dispatch<SetStateAction<boolean>>;
  createPosMember: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  memberCreateName: string;
  setMemberCreateName: Dispatch<SetStateAction<string>>;
  memberCreatePending: boolean;
  memberCreatePhone: string;
  setMemberCreatePhone: Dispatch<SetStateAction<string>>;
  memberCreateEmail: string;
  setMemberCreateEmail: Dispatch<SetStateAction<string>>;
  memberCreatePin: string;
  setMemberCreatePin: Dispatch<SetStateAction<string>>;
}) {
  return (
    <Dialog open={memberCreateOpen} onOpenChange={setMemberCreateOpen}>
      <DialogContent className="border-[#34343c] bg-[#111116] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Member</DialogTitle>
          <DialogDescription>
            Buat akun member langsung dari POS. PIN sementara hanya tampil setelah berhasil.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void createPosMember(event)} className="space-y-3">
          <div className="space-y-1.5">
            <label className="garage-mono text-[10px] text-[#b8b8bf]">Nama</label>
            <Input
              value={memberCreateName}
              onChange={(event) => setMemberCreateName(event.target.value)}
              className="h-11 border-[#34343c] bg-white/[0.06]"
              placeholder="Nama pelanggan"
              disabled={memberCreatePending}
            />
          </div>
          <div className="space-y-1.5">
            <label className="garage-mono text-[10px] text-[#b8b8bf]">No HP</label>
            <Input
              value={memberCreatePhone}
              onChange={(event) => setMemberCreatePhone(event.target.value)}
              className="h-11 border-[#34343c] bg-white/[0.06]"
              placeholder="08xxxxxxxxxx"
              disabled={memberCreatePending}
            />
          </div>
          <div className="space-y-1.5">
            <label className="garage-mono text-[10px] text-[#b8b8bf]">Email opsional</label>
            <Input
              type="email"
              value={memberCreateEmail}
              onChange={(event) => setMemberCreateEmail(event.target.value)}
              className="h-11 border-[#34343c] bg-white/[0.06]"
              placeholder="nama@email.com"
              disabled={memberCreatePending}
            />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <div className="space-y-1.5">
              <label className="garage-mono text-[10px] text-[#b8b8bf]">PIN sementara</label>
              <Input
                value={memberCreatePin}
                onChange={(event) => setMemberCreatePin(event.target.value)}
                className="h-11 border-[#34343c] bg-white/[0.06]"
                disabled={memberCreatePending}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="garage-press mt-5 h-11 border-[#4a4a54]"
              disabled={memberCreatePending}
              onClick={() => setMemberCreatePin(generateTemporaryMemberPin())}
            >
              Generate
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 border-[#4a4a54] bg-white/[0.055]"
              disabled={memberCreatePending}
              onClick={() => setMemberCreateOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              className="garage-press h-11"
              disabled={memberCreatePending}
            >
              {memberCreatePending ? (
                <>
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  <Check className="mr-2 size-4" />
                  Simpan Member
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PosVariantPickerDialog({
  variantItem,
  setVariantItem,
  addItem,
}: {
  variantItem: GarageMenuItem | null;
  setVariantItem: Dispatch<SetStateAction<GarageMenuItem | null>>;
  addItem: (itemId: string, variantId: string) => void;
}) {
  return (
    <Dialog
      open={Boolean(variantItem)}
      onOpenChange={(open) => {
        if (!open) {
          setVariantItem(null);
        }
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-hidden border-[#34343c] bg-[#111116]">
        <DialogHeader>
          <DialogTitle>{variantItem?.name ?? "Pilih varian"}</DialogTitle>
          <DialogDescription>
            Tap varian untuk langsung masuk ke keranjang.
          </DialogDescription>
        </DialogHeader>
        <div className="garage-scroll max-h-[58vh] overflow-y-auto pr-1">
          <div className="grid gap-2 sm:grid-cols-2">
            {variantItem?.variants.map((variant) => (
              <Button
                key={variant.id}
                type="button"
                variant="outline"
                className="garage-press h-auto min-h-16 justify-between border-[#4a4a54] px-3 py-3"
                onClick={() => {
                  addItem(variantItem.id, variant.id);
                  setVariantItem(null);
                }}
              >
                <span className="text-left">
                  <span className="block text-sm font-semibold">{variant.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {currency.format(variant.price)}
                  </span>
                </span>
                <Plus className="size-4" />
              </Button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosReceiptHistoryDialog({
  receiptHistoryOpen,
  setReceiptHistoryOpen,
  setReprintTargetId,
  setReprintStatus,
  setReprintError,
  isCashierKiosk,
  receiptHistory,
  reprintStatus,
  reprintError,
  reprintTargetId,
  canCancelOrder,
  setCancelTarget,
  reprintReceipt,
  clearReceiptHistory,
  cashierTheme,
}: {
  receiptHistoryOpen: boolean;
  setReceiptHistoryOpen: Dispatch<SetStateAction<boolean>>;
  setReprintTargetId: Dispatch<SetStateAction<string | null>>;
  setReprintStatus: Dispatch<SetStateAction<"idle" | "printing" | "success" | "error">>;
  setReprintError: Dispatch<SetStateAction<string | null>>;
  isCashierKiosk: boolean;
  receiptHistory: OrderReceipt[];
  reprintStatus: "idle" | "printing" | "success" | "error";
  reprintError: string | null;
  reprintTargetId: string | null;
  canCancelOrder: boolean;
  setCancelTarget: Dispatch<SetStateAction<OrderCancelTarget | null>>;
  reprintReceipt: (receipt: OrderReceipt) => Promise<void>;
  clearReceiptHistory: () => Promise<void>;
  cashierTheme: CashierThemeMode;
}) {
  return (
    <Dialog
      open={receiptHistoryOpen}
      onOpenChange={(open) => {
        setReceiptHistoryOpen(open);
        if (!open) {
          setReprintTargetId(null);
          setReprintStatus("idle");
          setReprintError(null);
        }
      }}
    >
      <DialogContent
        data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
        className="flex max-h-[88svh] flex-col overflow-hidden border-[#34343c] bg-[#111116] sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>Riwayat Struk Shift</DialogTitle>
          <DialogDescription>
            {receiptHistory.length} struk terakhir dari device ini. Untuk
            riwayat penjualan lengkap, gunakan menu Riwayat Penjualan.
          </DialogDescription>
        </DialogHeader>
        {reprintStatus === "error" && reprintError ? (
          <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
            <AlertTriangle className="size-4" />
            <AlertTitle>Cetak ulang gagal</AlertTitle>
            <AlertDescription>{reprintError}</AlertDescription>
          </Alert>
        ) : null}
        <div className="garage-scroll min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {receiptHistory.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#8f8f99]">
              Belum ada struk yang dicetak di shift ini.
            </p>
          ) : (
            receiptHistory.map((receipt) => {
              const isTarget = reprintTargetId === receipt.invoiceNo;
              const printing = isTarget && reprintStatus === "printing";
              const success = isTarget && reprintStatus === "success";
              return (
                <div
                  key={`${receipt.invoiceNo}-${receipt.createdAt}`}
                  className="rounded-md border border-[#34343c] bg-white/[0.04] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="garage-mono text-[10px] uppercase tracking-wide text-[#b8b8bf]">
                        {receipt.invoiceNo}
                      </p>
                      <p className="truncate text-sm font-semibold text-white">
                        {receipt.orderNo} · {receipt.tableLabel}
                      </p>
                      <p className="text-[11px] text-[#b8b8bf]">
                        {formatReceiptDate(receipt.createdAt)} ·{" "}
                        {receipt.payment.method}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="garage-mono text-sm font-extrabold text-[#ffd08a]">
                        {currency.format(receipt.total)}
                      </p>
                      <p className="text-[10px] text-[#8f8f99]">
                        {receipt.items.reduce((sum, it) => sum + it.qty, 0)} item
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                    {success ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#4ade80]">
                        <Check className="size-3.5" />
                        Terkirim ke printer
                      </span>
                    ) : null}
                    {canCancelOrder ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="garage-press h-9 border-[#d11a2a]/45 bg-[#d11a2a]/14 px-3 text-xs text-[#ffe1e5] hover:bg-[#d11a2a]/22"
                        onClick={() =>
                          setCancelTarget({
                            orderNo: receipt.orderNo,
                            tableLabel: receipt.tableLabel,
                            total: receipt.total,
                          })
                        }
                      >
                        <Ban className="mr-1.5 size-3.5" />
                        Batal / Refund
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="garage-press h-9 border-[#4a4a54] bg-white/[0.055] px-3 text-xs"
                      onClick={() => void reprintReceipt(receipt)}
                      disabled={printing}
                    >
                      {printing ? (
                        <>
                          <RefreshCw className="mr-1.5 size-3.5 animate-spin" />
                          Mencetak...
                        </>
                      ) : (
                        <>
                          <Printer className="mr-1.5 size-3.5" />
                          Cetak ulang
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            className="garage-press h-10 border-[#d11a2a]/45 bg-[#d11a2a]/14 text-[#ffe1e5] hover:bg-[#d11a2a]/22"
            onClick={clearReceiptHistory}
            disabled={!receiptHistory.length}
          >
            <Trash2 className="mr-2 size-4" />
            Bersihkan
          </Button>
          <Button
            type="button"
            className="garage-press h-10"
            onClick={() => setReceiptHistoryOpen(false)}
          >
            Tutup
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PosManualDiscountDialog({
  manualDiscountOpen,
  setManualDiscountOpen,
  setManualDiscountError,
  isCashierKiosk,
  applyManualDiscount,
  manualDiscountTypeInput,
  setManualDiscountTypeInput,
  manualDiscountValueInput,
  setManualDiscountValueInput,
  manualDiscountReasonInput,
  setManualDiscountReasonInput,
  total,
  voucher,
  manualDiscountError,
  cashierTheme,
  settings,
}: {
  manualDiscountOpen: boolean;
  setManualDiscountOpen: Dispatch<SetStateAction<boolean>>;
  setManualDiscountError: Dispatch<SetStateAction<string | null>>;
  isCashierKiosk: boolean;
  applyManualDiscount: () => Promise<void>;
  manualDiscountTypeInput: "amount" | "percent";
  setManualDiscountTypeInput: Dispatch<SetStateAction<"amount" | "percent">>;
  manualDiscountValueInput: string;
  setManualDiscountValueInput: Dispatch<SetStateAction<string>>;
  manualDiscountReasonInput: string;
  setManualDiscountReasonInput: Dispatch<SetStateAction<string>>;
  total: number;
  voucher: number;
  manualDiscountError: string | null;
  cashierTheme: CashierThemeMode;
  settings: AppSettings;
}) {
  return (
    <Dialog
      open={manualDiscountOpen}
      onOpenChange={(open) => {
        setManualDiscountOpen(open);
        if (!open) setManualDiscountError(null);
      }}
    >
      <DialogContent
        data-cashier-theme-scope={isCashierKiosk ? cashierTheme : undefined}
        className="border-[#34343c] bg-[#111116] sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>Diskon Kasir</DialogTitle>
          <DialogDescription>
            Potongan goodwill kasir. Di atas {settings.manualDiscountApprovalPct ?? 10}%
            bill otomatis masuk Approvals. Maks {settings.manualDiscountMaxPct}% per bill.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void applyManualDiscount();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              className={`garage-press h-11 ${
                manualDiscountTypeInput === "amount"
                  ? "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd08a]"
                  : "border-[#4a4a54] bg-white/[0.055]"
              }`}
              onClick={() => setManualDiscountTypeInput("amount")}
            >
              <Banknote className="mr-2 size-4" />
              Nominal (Rp)
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`garage-press h-11 ${
                manualDiscountTypeInput === "percent"
                  ? "border-[#f5a742]/55 bg-[#f5a742]/14 text-[#ffd08a]"
                  : "border-[#4a4a54] bg-white/[0.055]"
              }`}
              onClick={() => setManualDiscountTypeInput("percent")}
            >
              <Percent className="mr-2 size-4" />
              Persen (%)
            </Button>
          </div>
          <div>
            <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
              {manualDiscountTypeInput === "percent"
                ? "Persen diskon (1–100)"
                : "Nominal diskon (Rp)"}
            </p>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={manualDiscountTypeInput === "percent" ? 100 : undefined}
              value={manualDiscountValueInput}
              onChange={(event) =>
                setManualDiscountValueInput(event.target.value)
              }
              placeholder={manualDiscountTypeInput === "percent" ? "10" : "5000"}
              className="h-11 border-[#34343c] bg-white/[0.06]"
              autoFocus
            />
          </div>
          <div>
            <p className="garage-mono mb-1 text-[10px] text-[#b8b8bf]">
              Alasan / approval (wajib)
            </p>
            <Input
              value={manualDiscountReasonInput}
              onChange={(event) =>
                setManualDiscountReasonInput(event.target.value.slice(0, 60))
              }
              placeholder="mis. Komplain dapur lama, Member ultah, Promo kasir"
              className="h-11 border-[#34343c] bg-white/[0.06]"
              maxLength={60}
            />
          </div>
          <div className="rounded-md border border-[#34343c] bg-[#0f0f14] p-2.5">
            <div className="flex items-center justify-between text-xs text-[#b8b8bf]">
              <span>Sebelum diskon kasir</span>
              <span className="garage-mono">
                {currency.format(Math.max(0, total - voucher))}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-sm font-semibold text-[#ffd08a]">
              <span>Setelah diskon kasir</span>
              <span className="garage-mono">
                {(() => {
                  const raw = Number(manualDiscountValueInput);
                  if (!Number.isFinite(raw) || raw <= 0)
                    return currency.format(Math.max(0, total - voucher));
                  const base = Math.max(0, total - voucher);
                  const cut =
                    manualDiscountTypeInput === "percent"
                      ? Math.min(base, Math.round((base * raw) / 100))
                      : Math.min(base, Math.round(raw));
                  return currency.format(Math.max(0, base - cut));
                })()}
              </span>
            </div>
          </div>
          {manualDiscountError ? (
            <Alert className="border-[#d11a2a]/45 bg-[#d11a2a]/12 text-[#f4f4f5]">
              <AlertTriangle className="size-4" />
              <AlertTitle>Diskon kasir</AlertTitle>
              <AlertDescription>{manualDiscountError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-10 border-[#4a4a54] bg-white/[0.055]"
              onClick={() => setManualDiscountOpen(false)}
            >
              Batal
            </Button>
            <Button type="submit" className="garage-press h-10">
              <Check className="mr-2 size-4" />
              Terapkan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PosTablePrintDialog({
  tablePrintOpen,
  setTablePrintOpen,
  tablePrintMode,
  setTablePrintMode,
  tablePrintSingle,
  setTablePrintSingle,
  tablePrintStart,
  setTablePrintStart,
  tablePrintEnd,
  setTablePrintEnd,
  tablePrintTables,
  tablePrintAutoUrl,
  openTablePrintPreview,
  cashierTheme,
}: {
  tablePrintOpen: boolean;
  setTablePrintOpen: Dispatch<SetStateAction<boolean>>;
  tablePrintMode: "single" | "range" | "all";
  setTablePrintMode: Dispatch<SetStateAction<"single" | "range" | "all">>;
  tablePrintSingle: string;
  setTablePrintSingle: Dispatch<SetStateAction<string>>;
  tablePrintStart: string;
  setTablePrintStart: Dispatch<SetStateAction<string>>;
  tablePrintEnd: string;
  setTablePrintEnd: Dispatch<SetStateAction<string>>;
  tablePrintTables: string[];
  tablePrintAutoUrl: string;
  openTablePrintPreview: () => void;
  cashierTheme: CashierThemeMode;
}) {
  return (
    <Dialog open={tablePrintOpen} onOpenChange={setTablePrintOpen}>
      <DialogContent
        data-cashier-theme-scope={cashierTheme}
        className="border-[#34343c] bg-[#111116] sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Cetak QR No Meja</DialogTitle>
          <DialogDescription>
            Pilih meja yang ingin dicetak. Preview memakai layout QR meja permanen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Tabs
            value={tablePrintMode}
            onValueChange={(value) =>
              setTablePrintMode(value as "single" | "range" | "all")
            }
          >
            <TabsList className="grid w-full grid-cols-3 bg-[#202027]">
              <TabsTrigger value="single">Satu</TabsTrigger>
              <TabsTrigger value="range">Rentang</TabsTrigger>
              <TabsTrigger value="all">Semua</TabsTrigger>
            </TabsList>
          </Tabs>

          {tablePrintMode === "single" ? (
            <div className="space-y-2">
              <label className="garage-mono text-[10px] text-[#b8b8bf]">
                Nomor meja
              </label>
              <Select value={tablePrintSingle} onValueChange={setTablePrintSingle}>
                <SelectTrigger className="h-11 border-[#34343c] bg-white/[0.06]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tableNumbers.map((table) => (
                    <SelectItem key={table} value={table}>
                      Meja {table}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="garage-scroll grid max-h-52 grid-cols-5 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-10">
                {tableNumbers.map((table) => (
                  <Button
                    key={table}
                    type="button"
                    variant={tablePrintSingle === table ? "default" : "outline"}
                    className={`garage-press h-11 px-0 text-sm font-black ${
                      tablePrintSingle === table
                        ? "bg-[#d11a2a] text-white hover:bg-[#ff2a3a]"
                        : "border-[#4a4a54] bg-white/[0.045]"
                    }`}
                    onClick={() => setTablePrintSingle(table)}
                  >
                    {table}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {tablePrintMode === "range" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="garage-mono text-[10px] text-[#b8b8bf]">
                  Dari meja
                </label>
                <Select value={tablePrintStart} onValueChange={setTablePrintStart}>
                  <SelectTrigger className="h-11 border-[#34343c] bg-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tableNumbers.map((table) => (
                      <SelectItem key={table} value={table}>
                        Meja {table}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="garage-mono text-[10px] text-[#b8b8bf]">
                  Sampai meja
                </label>
                <Select value={tablePrintEnd} onValueChange={setTablePrintEnd}>
                  <SelectTrigger className="h-11 border-[#34343c] bg-white/[0.06]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tableNumbers.map((table) => (
                      <SelectItem key={table} value={table}>
                        Meja {table}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-[#34343c] bg-white/[0.045] p-3">
            <p className="text-sm font-semibold text-white">
              {tablePrintTables.length} QR meja siap dicetak
            </p>
            <p className="mt-1 break-words text-xs leading-5 text-[#b8b8bf]">
              {tablePrintAutoUrl}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="garage-press h-11 border-[#4a4a54] bg-white/[0.055]"
              onClick={() => setTablePrintOpen(false)}
            >
              Tutup
            </Button>
            <Button
              type="button"
              className="garage-press h-11"
              onClick={openTablePrintPreview}
            >
              <Printer className="mr-2 size-4" />
              Buka & Cetak
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
