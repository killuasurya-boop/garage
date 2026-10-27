"use client";

// Dialog POS yang dipindah dari pos-view.tsx (U0d). Perilaku sama; state dan
// handler tetap di PosView dan diteruskan sebagai props.

import { type ParkedOrder } from "@/components/garage/garage-app-helpers";
import { type CashierThemeMode } from "@/components/garage/garage-app-pickers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type CartLine, type MenuItem, type MenuVariant, type OrderType } from "@/lib/garage-api-types";
import { currency } from "@/lib/garage-data";
import { Archive, ArrowRight, Ban, Camera, Loader2, PauseCircle, Trash2, Users } from "lucide-react";
import { type ChangeEvent, type Dispatch, type RefObject, type SetStateAction } from "react";

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
