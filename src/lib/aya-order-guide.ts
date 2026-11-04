// Panduan cara pesan Aya di menu digital (keputusan Owner OD-01, A2): customer TETAP memesan
// sendiri di /order; Aya hanya menjelaskan, menggulir ke tombol, terbang ke sampingnya, menunjuk,
// dan menyorot. Aya tidak pernah menekan tombol atau mengisi data pembayaran. Saat outlet belum
// menerima order, Aya tidak menunjuk ke checkout. Fungsi murni (tanpa DOM) agar bisa dites.

export type AyaGuideAnchor = "order-type" | "search" | "add-item" | "checkout";

export type AyaGuideStep = {
  id: string;
  /** Elemen yang ditunjuk (data-aya-anchor); null = Aya hanya menjelaskan. */
  anchor: AyaGuideAnchor | null;
  title: string;
  text: string;
};

export type AyaGuideContext = {
  /** Kasir sedang buka (order bisa dikirim). */
  orderingOpen: boolean;
  /** Keranjang sudah berisi. */
  hasCart: boolean;
  /** Baris tipe pesanan (makan di tempat / take away / delivery) tampil. */
  hasOrderType: boolean;
  orderType?: "dine-in" | "takeaway" | "delivery" | string | null;
};

export function buildOrderGuideSteps(ctx: AyaGuideContext): AyaGuideStep[] {
  const steps: AyaGuideStep[] = [];
  if (ctx.hasOrderType) {
    steps.push({
      id: "order-type",
      anchor: "order-type",
      title: "Cek cara pesannya",
      text:
        ctx.orderType === "dine-in"
          ? "Ini tanda kamu makan di tempat. Pesananmu nanti diantar ke meja ya!"
          : "Di sini kamu lihat atau ganti cara pesan: makan di tempat, bawa pulang, atau diantar.",
    });
  }
  steps.push(
    {
      id: "search",
      anchor: "search",
      title: "Cari menu favoritmu",
      text: "Ketik nama menu di sini, misalnya “latte” atau “nasi”. Atau gulir saja, semua kategori ada di bawah.",
    },
    {
      id: "add-item",
      anchor: "add-item",
      title: "Tambah ke keranjang",
      text: "Tekan tombol + di kartu menu. Kalau ada pilihan rasa atau ukuran, pilihannya muncul dulu.",
    },
  );
  if (!ctx.orderingOpen) {
    steps.push({
      id: "closed",
      anchor: null,
      title: "Kasir belum buka",
      text: "Kamu boleh lihat-lihat dan isi keranjang dulu. Pesanan baru bisa dikirim setelah outlet buka ya.",
    });
    return steps;
  }
  steps.push(
    {
      id: "checkout",
      anchor: ctx.hasCart ? "checkout" : null,
      title: "Lanjut ke checkout",
      text: `${ctx.hasCart ? "Sudah pas? Tekan tombol ini" : "Setelah ada menu di keranjang, tekan tombol checkout"} untuk cek pesanan, isi data pemesan, lalu pilih pembayaran${
        ctx.orderType === "delivery" ? " — delivery bayar QRIS dulu ya." : ": tunai, QRIS, atau transfer."
      }`,
    },
    {
      id: "send",
      anchor: null,
      title: "Kirim, lalu tunggu konfirmasi",
      text: "Setelah dikirim, kasir mengonfirmasi dulu, baru Bar/Dapur membuatnya. Status pesananmu tampil di halaman ini.",
    },
  );
  return steps;
}

export type Rect = { left: number; top: number; width: number; height: number };
export type Viewport = { width: number; height: number };
export type Point = { x: number; y: number };

const GAP = 8;
const EDGE = 8;

/** Elemen pertama yang benar-benar terlihat (lebar & tinggi > 0); null bila tidak ada. */
export function pickVisible<T extends { rect: Rect }>(candidates: T[]): T | null {
  return candidates.find((c) => c.rect.width > 0 && c.rect.height > 0) ?? null;
}

/**
 * Posisi Aya (pojok kiri atas, ukuran `size`) di samping elemen: kanan → kiri → atas → bawah,
 * pilih yang muat di layar tanpa menutupi elemen. `faceLeft` = Aya menghadap kiri (tangan
 * penunjuk mengarah ke elemen).
 */
export type PetSpot = Point & {
  faceLeft: boolean;
  /** Sisi balon dari Aya — selalu menjauhi elemen agar tombol yang ditunjuk tidak tertutup. */
  bubble: "above" | "below";
};

/** Perkiraan tinggi balon panduan (judul + 2–3 baris + tombol) untuk memastikan balon muat di layar. */
export const GUIDE_BUBBLE_HEIGHT = 220;

export function petSpotBeside(rect: Rect, vp: Viewport, size: number, bubbleHeight = GUIDE_BUBBLE_HEIGHT): PetSpot {
  const need = bubbleHeight + 6;
  const midY = rect.top + rect.height / 2 - size / 2;
  const midX = rect.left + rect.width / 2;
  const fitsX = (x: number) => x >= EDGE && x + size <= vp.width - EDGE;
  const fitsY = (y: number) => y >= EDGE && y + size <= vp.height - EDGE;
  const clampX = (x: number) => Math.min(Math.max(EDGE, x), Math.max(EDGE, vp.width - size - EDGE));
  const clampY = (y: number) => Math.min(Math.max(EDGE, y), Math.max(EDGE, vp.height - size - EDGE));
  // Aya di samping elemen: balon ke sisi layar yang lebih lapang (di luar tinggi elemen).
  const sideBubble = (): PetSpot["bubble"] => (rect.top > vp.height - (rect.top + rect.height) ? "above" : "below");

  // Elemen lebih tinggi dari Aya: sejajarkan dengan tepinya agar balon tidak menutupi elemen.
  const side = sideBubble();
  const sideY = side === "above" ? Math.min(midY, rect.top) : Math.max(midY, rect.top + rect.height - size);

  const right = rect.left + rect.width + GAP;
  if (fitsX(right) && fitsY(sideY)) return { x: right, y: sideY, faceLeft: true, bubble: side };
  const left = rect.left - size - GAP;
  if (fitsX(left) && fitsY(sideY)) return { x: left, y: sideY, faceLeft: false, bubble: side };
  // Elemen lebar (mis. kotak cari di HP): di atas/bawah, dekat ujung kanan elemen; balon menjauh.
  const x = clampX(Math.min(rect.left + rect.width - size, vp.width - size - EDGE));
  const faceLeft = x + size / 2 > midX;
  const above = rect.top - size - GAP;
  const below = rect.top + rect.height + GAP;
  // Di atas elemen hanya bila balon (di atas Aya) masih muat; elemen di puncak halaman → di bawahnya.
  if (fitsY(above) && above - need >= EDGE) return { x, y: above, faceLeft, bubble: "above" };
  if (fitsY(below) && below + size + need <= vp.height - EDGE) return { x, y: below, faceLeft, bubble: "below" };
  // Layar sempit: pilih sisi yang lebih lapang.
  return fitsY(above) && rect.top > vp.height - (rect.top + rect.height)
    ? { x, y: above, faceLeft, bubble: "above" }
    : { x, y: clampY(below), faceLeft, bubble: "below" };
}
