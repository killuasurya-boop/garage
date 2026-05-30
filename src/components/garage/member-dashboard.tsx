"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  Check,
  Copy,
  Download,
  Lock,
  LogOut,
  Pencil,
  RefreshCw,
  RotateCcw,
  Share2,
  ShoppingBag,
  TicketPercent,
  X,
} from "lucide-react";

import { MemberLevelCard } from "@/components/garage/member-card";
import { MemberAnalytics } from "@/components/garage/member-analytics";
import { PremiumMembershipCard } from "@/components/garage/premium-membership-card";
import { useGarageToast } from "@/components/garage/garage-toast";
import {
  calculateRedeemDiscount,
  DISCOUNT_PER_REDEEM_UNIT,
  GOLD_ANNUAL_SPEND,
  PLATINUM_ANNUAL_SPEND,
  POINTS_PER_REDEEM_UNIT,
  type MemberLevel,
} from "@/lib/member-types";

type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; message: string };

type MemberProfile = {
  id: string;
  name: string;
  phone: string;
  level: MemberLevel;
  cardTier: MemberLevel;
  memberCode: string | null;
  totalPoints: number;
  visits: number;
  multiplier: number;
  perks: string[];
  annualSpend?: number;
  birthday?: string | null;
  address?: string | null;
  photoUrl?: string | null;
  expiresAt?: string | null;
  expired?: boolean;
  expiringSoon?: boolean;
  referralCode?: string | null;
  membershipSince?: string | null;
  ultraCandidate?: boolean;
  ultraApprovedAt?: string | null;
  progress: {
    currentLevel: MemberLevel;
    nextLevel: MemberLevel | null;
    next: number | null;
    percent: number;
    remaining: number;
  };
};

type ProfileFormState = {
  name: string;
  phone: string;
  address: string;
  birthday: string;
  photoUrl: string | null;
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const PHOTO_MAX_BYTES = 220_000;

function profileFormFrom(member: MemberProfile): ProfileFormState {
  return {
    name: member.name ?? "",
    phone: member.phone ?? "",
    address: member.address ?? "",
    birthday: member.birthday ?? "",
    photoUrl: member.photoUrl ?? null,
  };
}

async function patchJson<T>(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const json = (await response.json()) as
    | { success: true; data: T }
    | { success: false; message: string };
  if (!response.ok || !json.success) {
    throw new Error(json.success ? "Request gagal." : json.message);
  }
  return json.data;
}

async function readImageAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca foto."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Format foto tidak didukung."));
    };
    reader.readAsDataURL(file);
  });
}

type MemberTransaction = {
  id: string;
  source: "WEBSITE" | "POS" | "WELCOME" | "REFERRAL";
  amount: number;
  pointsEarned: number;
  levelBefore: string;
  levelAfter: string;
  upgradeNotification: string | null;
  createdAt: string;
};

type PointRedemption = {
  id: string;
  pointsUsed: number;
  discount: number;
  createdAt: string;
};

type WalletVoucher = {
  id: string;
  code: string;
  title: string;
  type: string;
  value: number;
  maxDiscount: number | null;
  minSpend: number;
  endsAt: string | null;
  status: string;
  note: string;
};

type WalletMission = {
  key: string;
  title: string;
  reward: string;
  progress: number;
  target: number;
  completed: boolean;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("id-ID");

async function getJson<T>(url: string) {
  const response = await fetch(url, { credentials: "include" });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.success) {
    throw new Error(json.success ? "Request gagal." : json.message);
  }
  return json.data;
}

async function postJson<T>(url: string, payload?: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const json = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !json.success) {
    throw new Error(json.success ? "Request gagal." : json.message);
  }
  return json.data;
}

function ReferralPanel({
  code,
  memberName,
}: {
  code: string | null;
  memberName: string;
}) {
  const [copied, setCopied] = useState(false);
  const trimmed = code?.trim() ?? "";

  const copy = useCallback(async () => {
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore — environment without clipboard permission
    }
  }, [trimmed]);

  const share = useCallback(async () => {
    if (!trimmed) return;
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const message = [
      `Halo! Pakai kode referral GARAGE aku: ${trimmed}`,
      `Daftar member di GARAGE Coffee & Motor — dapat welcome reward, point setiap order, dan bonus referral 30 poin untuk kita berdua.`,
      url ? `Daftar: ${url}/member-login?mode=register&ref=${encodeURIComponent(trimmed)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "GARAGE Referral", text: message });
        return;
      } catch {
        // fallthrough — buka WA web share
      }
    }
    if (typeof window !== "undefined") {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
    }
  }, [trimmed]);

  return (
    <section className="garage-panel sm:col-span-2 lg:col-span-1 xl:col-span-2 min-w-0 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="garage-mono">Referral GARAGE</p>
          <h3 className="garage-display mt-2 text-2xl">Kode referral kamu</h3>
          <p className="mt-1 text-sm text-[#b8b8bf]">
            Bagikan kode ini ke teman. Saat mereka daftar &amp; transaksi pertama, kamu &amp; mereka
            sama-sama dapat <span className="text-[#ffd79a]">30 poin bonus</span>.
          </p>
        </div>
        <span className="border border-[#f5a742]/45 bg-[#f5a742]/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#ffd79a]">
          {memberName}
        </span>
      </div>

      <div className="mt-4 border border-[#f5a742]/35 bg-black/30 p-4">
        {trimmed ? (
          <>
            <p className="garage-mono text-[10px] text-[#9696a1]">Kode aktif</p>
            <p className="mt-1 break-all font-mono text-3xl font-black tracking-wide text-[#ffd79a]">
              {trimmed}
            </p>
          </>
        ) : (
          <p className="text-sm text-[#9696a1]">
            Kode referral belum siap. Refresh dashboard atau hubungi staff Garage.
          </p>
        )}
      </div>

      {trimmed ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void copy()}
            className="inline-flex items-center justify-center gap-2 border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm font-semibold text-[#d0d0d6] hover:border-[#f5a742]/55 hover:text-white"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Tersalin" : "Salin kode"}
          </button>
          <button
            type="button"
            onClick={() => void share()}
            className="inline-flex items-center justify-center gap-2 border border-[#22c55e]/45 bg-[#22c55e]/12 px-3 py-2.5 text-sm font-semibold text-[#bbf7d0] hover:border-[#22c55e] hover:text-white"
          >
            <Share2 size={14} />
            Bagikan
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function MemberDashboard() {
  const router = useRouter();
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [transactions, setTransactions] = useState<MemberTransaction[]>([]);
  const [redemptions, setRedemptions] = useState<PointRedemption[]>([]);
  const [walletVouchers, setWalletVouchers] = useState<WalletVoucher[]>([]);
  const [walletMissions, setWalletMissions] = useState<WalletMission[]>([]);
  const [redeemPoints, setRedeemPoints] = useState(100);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileFormState>({
    name: "",
    phone: "",
    address: "",
    birthday: "",
    photoUrl: null,
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [cardSide, setCardSide] = useState<"front" | "back">("front");
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const toast = useGarageToast();

  const load = useCallback(async () => {
    try {
      const profile = await getJson<{ member: MemberProfile }>("/api/member/profile");
      const history = await getJson<{
        transactions: MemberTransaction[];
        redemptions: PointRedemption[];
      }>("/api/member/history");
      const wallet = await getJson<{ vouchers: WalletVoucher[]; missions: WalletMission[] }>("/api/member/wallet");
      setMember(profile.member);
      setForm(profileFormFrom(profile.member));
      setTransactions(history.transactions);
      setRedemptions(history.redemptions);
      setWalletVouchers(wallet.vouchers);
      setWalletMissions(wallet.missions);
      setMessage("");
    } catch {
      router.replace("/member-login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const redeemDiscount = useMemo(() => calculateRedeemDiscount(redeemPoints), [redeemPoints]);

  async function handleRedeem() {
    setBusy(true);
    setMessage("");
    try {
      const result = await postJson<{ discount: number; totalPoints: number }>("/api/points/redeem", {
        pointsToRedeem: redeemPoints,
      });
      setMessage(`Redeem berhasil: potongan ${rupiah.format(result.discount)}. Sisa point ${number.format(result.totalPoints)}.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Redeem gagal.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    await postJson("/api/member/auth/logout");
    router.replace("/member-login");
  }

  async function handlePhotoChange(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.push({ tone: "error", title: "File harus berupa gambar." });
      return;
    }
    try {
      const dataUrl = await readImageAsDataUrl(file);
      if (dataUrl.length > PHOTO_MAX_BYTES) {
        toast.push({
          tone: "error",
          title: "Foto terlalu besar",
          body: "Maks ~200KB. Coba kompres dulu.",
        });
        return;
      }
      setForm((prev) => ({ ...prev, photoUrl: dataUrl }));
    } catch (error) {
      toast.push({
        tone: "error",
        title: "Gagal membaca foto",
        body: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function handleProfileSave() {
    if (!member) return;
    setProfileBusy(true);
    try {
      const result = await patchJson<{ member: MemberProfile }>(
        "/api/member/profile",
        {
          name: form.name.trim() || undefined,
          phone: form.phone.trim() || undefined,
          address: form.address.trim() ? form.address.trim() : null,
          birthday: form.birthday ? form.birthday : null,
          photoUrl: form.photoUrl ?? null,
        },
      );
      setMember(result.member);
      setForm(profileFormFrom(result.member));
      setEditing(false);
      toast.push({ tone: "success", title: "Profil tersimpan." });
    } catch (error) {
      toast.push({
        tone: "error",
        title: "Gagal simpan profil",
        body: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setProfileBusy(false);
    }
  }

  function handleProfileReset() {
    if (!member) return;
    setForm(profileFormFrom(member));
    setEditing(false);
  }

  async function handlePasswordSave() {
    const currentPassword = passwordForm.currentPassword.trim();
    const newPassword = passwordForm.newPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (newPassword !== confirmPassword) {
      toast.push({
        tone: "error",
        title: "Password belum sama",
        body: "Konfirmasi password baru harus cocok.",
      });
      return;
    }

    setPasswordBusy(true);
    try {
      await patchJson<{ updated: boolean }>("/api/member/profile/password", {
        currentPassword,
        newPassword,
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.push({ tone: "success", title: "Password member diperbarui." });
    } catch (error) {
      toast.push({
        tone: "error",
        title: "Gagal update password",
        body: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="garage-shell flex min-h-screen items-center justify-center px-4 sm:px-6">
        <div className="garage-logo-loading garage-logo-wrap">
          <div className="garage-logo-frame">
            <Image
              src="/garage-brand/logo-website.png"
              alt="Garage"
              width={1024}
              height={325}
              priority
              sizes="(max-width: 640px) 82vw, 340px"
              className="garage-logo-image"
            />
          </div>
        </div>
      </main>
    );
  }

  if (!member) {
    return null;
  }

  return (
    <main className="garage-shell min-h-screen overflow-x-hidden px-4 py-4 text-white sm:px-7 sm:py-6 lg:px-10">
      <section className="mx-auto w-full max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <Link href="/" className="block w-[min(200px,52vw)] sm:w-[230px]" aria-label="Kembali ke website Garage">
            <Image
              src="/garage-brand/logo-website.png"
              alt="Garage Coffee & Motor"
              width={1024}
              height={325}
              priority
              sizes="(max-width: 768px) 52vw, 230px"
              className="h-auto w-full object-contain drop-shadow-[0_14px_34px_rgba(0,0,0,0.5)]"
            />
          </Link>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <Link href="/order" className="btn btn-primary justify-center" style={{ padding: "12px 14px", fontSize: 11 }}>
              <ShoppingBag size={15} />
              <span>Order</span>
            </Link>
            <button className="btn justify-center" onClick={() => window.open("/api/member/card.pdf", "_blank")} style={{ padding: "12px 14px", fontSize: 11 }}>
              <Download size={15} />
              <span>Kartu</span>
            </button>
            <button className="btn justify-center" onClick={() => void load()} style={{ padding: "12px 14px", fontSize: 11 }}>
              <RefreshCw size={15} />
              <span>Refresh</span>
            </button>
            <button className="btn justify-center" onClick={handleLogout} style={{ padding: "12px 14px", fontSize: 11 }}>
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <section className="garage-panel mt-8 grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:p-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="garage-mono">Premium Card</p>
                <h2 className="garage-display text-3xl sm:text-4xl">
                  Kartu {member.cardTier} aktif
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCardSide((side) => (side === "front" ? "back" : "front"))}
                  className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-semibold tracking-wide text-[#d0d0d6] transition hover:border-[#f5a742]/60 hover:text-white"
                  aria-pressed={cardSide === "back"}
                >
                  <RotateCcw size={14} />
                  <span>{cardSide === "front" ? "Lihat belakang" : "Lihat depan"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.open("/api/member/card.pdf", "_blank")}
                  className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-semibold tracking-wide text-[#d0d0d6] transition hover:border-[#f5a742]/60 hover:text-white"
                >
                  <Download size={14} />
                  <span>PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.open(`/api/member/card.png?side=${cardSide}`, "_blank")
                  }
                  className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-2.5 py-2 text-xs font-semibold tracking-wide text-[#d0d0d6] transition hover:border-[#f5a742]/60 hover:text-white"
                >
                  <span>PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.open(`/api/member/card.jpg?side=${cardSide}`, "_blank")
                  }
                  className="inline-flex items-center gap-1.5 border border-white/15 bg-white/[0.04] px-2.5 py-2 text-xs font-semibold tracking-wide text-[#d0d0d6] transition hover:border-[#f5a742]/60 hover:text-white"
                >
                  <span>JPG</span>
                </button>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <PremiumMembershipCard
                className="w-full max-w-[460px]"
                side={cardSide}
                flippable
                data={{
                  name: editing ? form.name || member.name : member.name,
                  memberId: member.memberCode ?? member.referralCode ?? member.id,
                  phone: editing ? form.phone || member.phone : member.phone,
                  address:
                    editing && form.address.length > 0
                      ? form.address
                      : member.address ?? null,
                  tier: member.cardTier,
                  membershipSince: member.membershipSince ?? null,
                  validThru: member.expiresAt ?? null,
                  photoUrl: editing ? form.photoUrl : member.photoUrl ?? null,
                }}
              />
              {member.expired ? (
                <p className="mt-3 inline-flex items-center gap-1 self-center border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#ffc2c8]">
                  Kartu sudah expired
                </p>
              ) : member.expiringSoon ? (
                <p className="mt-3 inline-flex items-center gap-1 self-center border border-[#f5a742]/45 bg-[#f5a742]/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#ffd79a]">
                  Berlaku &lt; 30 hari lagi
                </p>
              ) : null}
            </div>

            <p className="mt-4 text-center text-xs leading-relaxed text-[#9696a1]">
              Hover/tap kartu untuk efek 3D · klik untuk flip front/back · perubahan editor
              tampil real-time sebelum kamu simpan.
            </p>
          </div>

          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="garage-mono">Profil</p>
                <h3 className="garage-display text-2xl">Edit data kartu</h3>
              </div>
              {editing ? (
                <button
                  type="button"
                  onClick={handleProfileReset}
                  className="inline-flex items-center gap-1 border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-[#d0d0d6] hover:border-[#d11a2a]/60 hover:text-white"
                >
                  <X size={14} />
                  <span>Batal</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 border border-[#f5a742]/40 bg-[#f5a742]/12 px-3 py-2 text-xs font-semibold text-[#ffd79a] hover:border-[#f5a742]/70"
                >
                  <Pencil size={14} />
                  <span>Edit</span>
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-1.5">
                <span className="garage-mono">Nama</span>
                <input
                  type="text"
                  value={form.name}
                  disabled={!editing}
                  maxLength={80}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="w-full border border-[#34343c] bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#f5a742] disabled:opacity-60"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="garage-mono">Nomor telepon</span>
                <input
                  type="tel"
                  value={form.phone}
                  disabled={!editing}
                  maxLength={20}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  className="w-full border border-[#34343c] bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#f5a742] disabled:opacity-60"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="garage-mono">Alamat</span>
                <textarea
                  rows={2}
                  value={form.address}
                  disabled={!editing}
                  maxLength={280}
                  placeholder="Alamat singkat untuk kartu"
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, address: event.target.value }))
                  }
                  className="w-full resize-none border border-[#34343c] bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#f5a742] disabled:opacity-60"
                />
              </label>

              <label className="grid gap-1.5">
                <span className="garage-mono">Tanggal lahir</span>
                <input
                  type="date"
                  value={form.birthday ?? ""}
                  disabled={!editing}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, birthday: event.target.value }))
                  }
                  className="w-full border border-[#34343c] bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#f5a742] disabled:opacity-60"
                />
              </label>

              <div className="grid gap-1.5">
                <span className="garage-mono">Foto profil</span>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid h-14 w-14 place-items-center overflow-hidden border border-white/15 bg-white/[0.06] text-xs text-[#9696a1]">
                    {form.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.photoUrl}
                        alt="Foto member"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Camera size={16} />
                    )}
                  </div>
                  <label
                    className={`inline-flex cursor-pointer items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-[#d0d0d6] transition hover:border-[#f5a742]/60 hover:text-white ${
                      editing ? "" : "pointer-events-none opacity-60"
                    }`}
                  >
                    <Camera size={14} />
                    <span>{form.photoUrl ? "Ganti foto" : "Upload foto"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!editing}
                      onChange={(event) =>
                        void handlePhotoChange(event.target.files?.[0] ?? null)
                      }
                    />
                  </label>
                  {form.photoUrl ? (
                    <button
                      type="button"
                      disabled={!editing}
                      onClick={() =>
                        setForm((prev) => ({ ...prev, photoUrl: null }))
                      }
                      className="inline-flex items-center gap-1 border border-white/10 bg-white/[0.02] px-2.5 py-2 text-[11px] font-medium text-[#9696a1] hover:border-[#d11a2a]/40 hover:text-[#ffc2c8] disabled:opacity-50"
                    >
                      <X size={12} />
                      <span>Hapus</span>
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] leading-snug text-[#9696a1]">
                  Foto disimpan inline (data URL). Maks ~200KB. Untuk kualitas terbaik
                  pakai foto persegi.
                </p>
              </div>

              <button
                type="button"
                onClick={handleProfileSave}
                disabled={!editing || profileBusy}
                className="btn btn-primary justify-center"
              >
                <Check size={14} />
                <span>{profileBusy ? "Menyimpan..." : "Simpan profil"}</span>
              </button>
            </div>

            <div className="mt-6 border-t border-white/10 pt-5">
              <div className="flex items-center gap-2">
                <Lock size={16} className="text-[#f5a742]" />
                <div>
                  <p className="garage-mono">Keamanan</p>
                  <h4 className="text-lg font-semibold text-white">Update password</h4>
                </div>
              </div>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1.5">
                  <span className="garage-mono">Password lama</span>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    autoComplete="current-password"
                    onChange={(event) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        currentPassword: event.target.value,
                      }))
                    }
                    className="w-full border border-[#34343c] bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#f5a742]"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">Password baru</span>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        newPassword: event.target.value,
                      }))
                    }
                    className="w-full border border-[#34343c] bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#f5a742]"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="garage-mono">Konfirmasi password baru</span>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={72}
                    onChange={(event) =>
                      setPasswordForm((prev) => ({
                        ...prev,
                        confirmPassword: event.target.value,
                      }))
                    }
                    className="w-full border border-[#34343c] bg-white/[0.055] px-3 py-2.5 text-sm text-white outline-none transition focus:border-[#f5a742]"
                  />
                </label>
                <button
                  type="button"
                  onClick={handlePasswordSave}
                  disabled={
                    passwordBusy ||
                    passwordForm.currentPassword.length < 6 ||
                    passwordForm.newPassword.length < 8 ||
                    passwordForm.confirmPassword.length < 8
                  }
                  className="btn justify-center"
                >
                  <Lock size={14} />
                  <span>{passwordBusy ? "Memproses..." : "Update password"}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-10">
          <section className="garage-panel min-w-0 p-5 sm:p-7">
            <p className="garage-mono">Member GARAGE</p>
            <h1 className="garage-display mt-4 text-[clamp(48px,8vw,94px)] leading-none">{member.name}</h1>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="garage-surface p-4">
                <p className="garage-mono">Level</p>
                <p className="garage-display mt-2 text-4xl">{member.level}</p>
              </div>
              <div className="garage-surface p-4">
                <p className="garage-mono">Point</p>
                <p className="garage-display mt-2 text-4xl">{number.format(member.totalPoints)}</p>
              </div>
              <div className="garage-surface p-4">
                <p className="garage-mono">Multiplier</p>
                <p className="garage-display mt-2 text-4xl">{member.multiplier}x</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="garage-surface p-4">
                <p className="garage-mono">Spend 12 Bulan</p>
                <p className="mt-2 text-xl font-semibold text-white">{rupiah.format(member.annualSpend ?? 0)}</p>
              </div>
              <div className="garage-surface p-4">
                <p className="garage-mono">Member Code</p>
                <p className="mt-2 font-mono text-xl font-semibold text-[#ffd79a]">{member.memberCode ?? member.referralCode ?? "-"}</p>
              </div>
              <div className="garage-surface p-4">
                <p className="garage-mono">Birthday</p>
                <p className="mt-2 text-xl font-semibold text-white">{member.birthday ?? "-"}</p>
              </div>
            </div>

            <div className="mt-7">
              <div className="flex items-center justify-between gap-4">
                <p className="garage-mono">{member.progress.nextLevel ? `Menuju ${member.progress.nextLevel}` : "Level tertinggi"}</p>
                <p className="garage-mono text-[#f5a742]">
                  {member.progress.next ? `${number.format(member.progress.remaining)} pts lagi` : "maksimum"}
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden bg-[#222229]">
                <div
                  className="h-full bg-gradient-to-r from-[#d11a2a] to-[#f5a742] shadow-[0_0_22px_rgba(209,26,42,0.45)]"
                  style={{ width: `${member.progress.percent}%` }}
                />
              </div>
            </div>
          </section>

          <section className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <MemberLevelCard level="Silver" points={`0-${number.format((GOLD_ANNUAL_SPEND / 1000) - 1)} pts`} multiplier="1x" active={member.level === "Silver"} />
            <MemberLevelCard level="Gold" points={`Rp${number.format(GOLD_ANNUAL_SPEND)}/tahun`} multiplier="1.2x" active={member.level === "Gold"} />
            <MemberLevelCard level="Platinum" points={`Rp${number.format(PLATINUM_ANNUAL_SPEND)}/tahun`} multiplier="1.5x" active={member.level === "Platinum"} />
            <MemberLevelCard level="Ultra" points="3 tahun langganan + owner approval" multiplier="5x" active={member.level === "Ultra"} />
            <ReferralPanel
              code={member.referralCode ?? member.memberCode ?? null}
              memberName={member.name}
            />
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
          <section className="garage-panel min-w-0 p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <TicketPercent className="text-[#f5a742]" size={22} />
              <div>
                <p className="garage-mono">Redeem Points</p>
                <h2 className="garage-display text-4xl">Voucher</h2>
              </div>
            </div>
            <div className="mt-6 grid gap-3">
              <label className="grid gap-2">
                <span className="garage-mono">Points dipakai</span>
                <input
                  type="number"
                  min={100}
                  step={100}
                  max={member.totalPoints}
                  value={redeemPoints}
                  onChange={(event) => setRedeemPoints(Number(event.target.value))}
                  className="w-full border border-[#34343c] bg-white/[0.055] px-4 py-3 text-white outline-none transition focus:border-[#f5a742]"
                />
              </label>
              <div className="garage-surface p-4">
                <p className="garage-mono">Potongan</p>
                <p className="garage-display mt-1 text-4xl">{rupiah.format(redeemDiscount)}</p>
                <p className="mt-2 text-xs text-[#9696a1]">
                  {POINTS_PER_REDEEM_UNIT} poin = {rupiah.format(DISCOUNT_PER_REDEEM_UNIT)}
                </p>
              </div>
              <button className="btn btn-primary justify-center" disabled={busy || redeemPoints > member.totalPoints} onClick={handleRedeem}>
                <span>{busy ? "Memproses" : "Redeem"}</span>
              </button>
              {message ? <p className="text-sm leading-6 text-[#ffd7da]">{message}</p> : null}
            </div>
          </section>

          <section className="garage-panel min-w-0 p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="garage-mono">Riwayat</p>
                <h2 className="garage-display text-4xl">Transaksi</h2>
              </div>
              <p className="garage-mono">{transactions.length} transaksi terakhir</p>
            </div>

            <div className="garage-scroll-x mt-5 overflow-x-auto">
              <table className="w-full min-w-[660px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[#34343c] text-left garage-mono">
                    <th className="py-3 pr-4">Tanggal</th>
                    <th className="py-3 pr-4">Source</th>
                    <th className="py-3 pr-4">Amount</th>
                    <th className="py-3 pr-4">Point</th>
                    <th className="py-3 pr-4">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr key={transaction.id} className="border-b border-white/8 text-[#d0d0d6]">
                      <td className="py-3 pr-4">{new Date(transaction.createdAt).toLocaleString("id-ID")}</td>
                      <td className="py-3 pr-4">{transaction.source}</td>
                      <td className="py-3 pr-4">{rupiah.format(transaction.amount)}</td>
                      <td className="py-3 pr-4">+{number.format(transaction.pointsEarned)}</td>
                      <td className="py-3 pr-4">
                        {transaction.levelBefore}
                        {" -> "}
                        {transaction.levelAfter}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-7 border-t border-[#34343c] pt-5">
              <p className="garage-mono">Redeem terakhir</p>
              <div className="mt-3 grid gap-2">
                {redemptions.length ? (
                  redemptions.map((redemption) => (
                    <div key={redemption.id} className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-[#d0d0d6]">
                      <span>{new Date(redemption.createdAt).toLocaleString("id-ID")}</span>
                      <span>{number.format(redemption.pointsUsed)} pts</span>
                      <span>{rupiah.format(redemption.discount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#9696a1]">Belum ada redeem.</p>
                )}
              </div>
            </div>
          </section>
        </div>

        <MemberAnalytics transactions={transactions} redemptions={redemptions} />

        <section className="garage-panel mt-6 min-w-0 p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="garage-mono">Wallet</p>
              <h2 className="garage-display text-4xl">Voucher Aktif</h2>
            </div>
            <p className="garage-mono">{walletVouchers.filter((voucher) => voucher.status === "active").length} siap pakai</p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {walletVouchers.length ? (
              walletVouchers.map((voucher) => (
                <div key={voucher.id} className="border border-white/10 bg-white/[0.035] p-4">
                  <p className="garage-mono">{voucher.status === "active" ? "Aktif" : "Tidak tersedia"}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{voucher.title}</p>
                  <p className="mt-2 font-mono text-xl font-bold text-[#ffd79a]">{voucher.code}</p>
                  <p className="mt-2 text-sm text-[#d0d0d6]">
                    {voucher.type === "percent" ? `${voucher.value}%` : rupiah.format(voucher.value)}
                    {voucher.maxDiscount ? ` maks ${rupiah.format(voucher.maxDiscount)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[#9696a1]">
                    {voucher.endsAt ? `Berlaku sampai ${new Date(voucher.endsAt).toLocaleDateString("id-ID")}` : "Tanpa expiry"}
                  </p>
                  <p className="mt-3 text-xs text-[#b8b8bf]">{voucher.note}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#9696a1]">Belum ada voucher aktif.</p>
            )}
          </div>
        </section>

        <section className="garage-panel mt-6 min-w-0 p-5 sm:p-7">
          <div>
            <p className="garage-mono">Misi</p>
            <h2 className="garage-display text-4xl">Stamp Mission</h2>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {walletMissions.map((mission) => (
              <div key={mission.key} className="border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-white">{mission.title}</p>
                    <p className="mt-1 text-sm text-[#d0d0d6]">{mission.reward}</p>
                  </div>
                  <p className="garage-mono text-[#ffd79a]">
                    {mission.progress}/{mission.target}
                  </p>
                </div>
                <div className="mt-4 h-2 overflow-hidden bg-[#222229]">
                  <div
                    className="h-full bg-gradient-to-r from-[#d11a2a] to-[#f5a742]"
                    style={{ width: `${Math.round((mission.progress / mission.target) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
