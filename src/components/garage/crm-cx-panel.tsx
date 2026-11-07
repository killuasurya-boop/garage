"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, MessageCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { garageApi } from "@/lib/api-client";
import { CX_CAMPAIGN_LABEL, type CxCampaignKind } from "@/lib/cx-whatsapp";
import { currency } from "@/lib/garage-data";

// CX Engine V4 — panel Owner/CRM: funnel invoice → member + kampanye WhatsApp
// manual (wa.me). Klik WA = "dibuka", bukan "terkirim". Tanpa klaim ROI.

type Funnel = {
  days: number;
  invoicesViewed: number;
  memberOfferViewed: number;
  registerClicked: number;
  membersRegisteredFromInvoice: number;
  memberLoginsFromInvoice: number;
  registrationConversionPct: number;
  memberCardOpened: number;
  vouchersViewed: number;
  whatsappOrderClicks: number;
  whatsappPaymentHelpClicks: number;
  invoicesShared: number;
  pdfSaved: number;
  activeMembers: number;
  repeatPurchaseRatePct: number;
  voucherRedeemed: number;
  voucherDiscount: number;
  pointsDiscount: number;
  rewardCost: number;
  registeredThenPurchased: number;
  notes: string[];
};

type Candidate = {
  customerId: string;
  name: string;
  tier: string;
  reason: string | null;
  consent: boolean;
  blockReason: string | null;
  message: string;
  waUrl: string | null;
};

const KINDS = Object.keys(CX_CAMPAIGN_LABEL) as CxCampaignKind[];

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[#34343c] bg-[#16161b] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a1a1aa]">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums text-white">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-[#b8b8bf]">{sub}</p> : null}
    </div>
  );
}

export function CrmCxPanel() {
  const [days, setDays] = useState(30);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [kind, setKind] = useState<CxCampaignKind>("welcome");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFunnel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFunnel(await garageApi.get<Funnel>(`/api/crm/cx-funnel?days=${days}`, { cache: "no-store" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat funnel.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  const loadCandidates = useCallback(async () => {
    setCandidates(null);
    try {
      setCandidates(await garageApi.get<Candidate[]>(`/api/crm/cx-campaigns?kind=${kind}`, { cache: "no-store" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat kandidat kampanye.");
      setCandidates([]);
    }
  }, [kind]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadFunnel(), 0);
    return () => window.clearTimeout(id);
  }, [loadFunnel]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadCandidates(), 0);
    return () => window.clearTimeout(id);
  }, [loadCandidates]);

  async function openWa(candidate: Candidate) {
    if (!candidate.waUrl) return;
    // Buka dulu (gesture pengguna, tidak diblokir popup blocker); izin sudah dicek server
    // saat daftar kandidat dibuat (waUrl null bila diblokir), lalu dicek ulang saat dicatat.
    window.open(candidate.waUrl, "_blank", "noopener,noreferrer");
    try {
      await garageApi.post("/api/crm/cx-campaigns", { kind, customerId: candidate.customerId, message: candidate.message });
      void loadCandidates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kampanye diblokir.");
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#f5a742]">Invoice Digital V4</p>
            <h2 className="mt-1 text-lg font-black text-white">Funnel Invoice → Member</h2>
            <p className="mt-1 text-xs text-[#b8b8bf]">Dari event halaman invoice pelanggan (tanpa data pribadi).</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-10 rounded-md border border-[#4a4a54] bg-[#16161b] px-2 text-sm text-white"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              aria-label="Periode"
            >
              <option value={7}>7 hari</option>
              <option value={30}>30 hari</option>
              <option value={90}>90 hari</option>
            </select>
            <Button type="button" variant="outline" className="h-10 border-[#4a4a54]" disabled={loading} onClick={() => void loadFunnel()}>
              <RefreshCw className={`mr-2 size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
        {error ? <p className="mt-3 rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-2 text-sm text-[#ffc2c8]">{error}</p> : null}
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Invoice dibuka" value={String(funnel?.invoicesViewed ?? "-")} sub={`${funnel?.memberOfferViewed ?? 0} melihat penawaran member`} />
          <Metric
            label="Member baru dari invoice"
            value={String(funnel?.membersRegisteredFromInvoice ?? "-")}
            sub={`Konversi ${funnel?.registrationConversionPct ?? 0}% · ${funnel?.registerClicked ?? 0} klik daftar`}
          />
          <Metric label="Member aktif" value={String(funnel?.activeMembers ?? "-")} sub={`${funnel?.memberLoginsFromInvoice ?? 0} login dari invoice`} />
          <Metric label="Repeat purchase" value={funnel ? `${funnel.repeatPurchaseRatePct}%` : "-"} sub="Customer ≥2 transaksi lunas / pembeli" />
          <Metric label="Voucher dipakai" value={String(funnel?.voucherRedeemed ?? "-")} sub={currency.format(funnel?.voucherDiscount ?? 0)} />
          <Metric label="Biaya reward" value={currency.format(funnel?.rewardCost ?? 0)} sub={`Poin ${currency.format(funnel?.pointsDiscount ?? 0)}`} />
          <Metric
            label="Klik WA dari invoice"
            value={String((funnel?.whatsappOrderClicks ?? 0) + (funnel?.whatsappPaymentHelpClicks ?? 0))}
            sub={`${funnel?.whatsappPaymentHelpClicks ?? 0} bantuan bukti bayar · dibuka, bukan terkirim`}
          />
          <Metric label="Daftar lalu belanja lagi" value={String(funnel?.registeredThenPurchased ?? "-")} sub="Member dari invoice dgn transaksi lunas sesudahnya" />
        </div>
        {funnel?.notes.length ? (
          <ul className="mt-3 space-y-0.5 text-xs text-[#a1a1aa]">
            {funnel.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white">Kampanye WhatsApp (manual)</h2>
            <p className="mt-1 text-xs text-[#b8b8bf]">
              Gratis lewat wa.me — staf menekan Kirim sendiri. Promosi hanya untuk member yang memberi izin, maks. 1×/7 hari.
            </p>
          </div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Jenis kampanye">
            {KINDS.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={entry === kind}
                onClick={() => setKind(entry)}
                className={`rounded-md px-3 py-2 text-xs font-semibold ${entry === kind ? "bg-[#f5a742] text-black" : "border border-[#34343c] text-[#d6d6dc] hover:bg-white/[0.04]"}`}
              >
                {CX_CAMPAIGN_LABEL[entry]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {candidates === null ? (
            <p className="py-6 text-center text-sm text-[#a1a1aa]">Memuat kandidat…</p>
          ) : candidates.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#a1a1aa]">Belum ada member yang cocok untuk kampanye ini.</p>
          ) : (
            candidates.map((candidate) => (
              <div key={candidate.customerId} className="flex flex-wrap items-center gap-3 rounded-md border border-[#34343c] bg-[#16161b] p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {candidate.name} <span className="text-xs font-normal text-[#b8b8bf]">· {candidate.tier}</span>
                  </p>
                  <p className="text-xs text-[#b8b8bf]">{candidate.reason ?? "-"}</p>
                  {candidate.blockReason ? <p className="text-xs text-[#ffc2c8]">{candidate.blockReason}</p> : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={!candidate.waUrl}
                  className="bg-[#22c55e] text-black hover:bg-[#2bd46a]"
                  onClick={() => void openWa(candidate)}
                  title={candidate.message}
                >
                  <MessageCircle className="mr-1.5 size-4" />
                  Buka WA
                  <ExternalLink className="ml-1.5 size-3.5" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
