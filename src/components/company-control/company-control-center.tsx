"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import {
  Archive,
  ArrowRight,
  AlertTriangle,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileWarning,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MessageCircle,
  Network,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Timer,
  Upload,
  UserCircle,
  Users,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import type { CompanyControlDto, CompanyDocumentDto, TrainingCourseDto } from "@/lib/company-control";
import type { AiPosAgentResponse } from "@/lib/garage-api-types";

type ApiSuccess<T> = { data: T };
type ApiFailure = { error?: { code?: string; message?: string } };
type CeoAiTool = "none" | "inventory_agent" | "finance_guard_agent" | "approval_agent" | "sop_knowledge_agent" | "report_builder";
type ControlModuleId =
  | "overview"
  | "finance"
  | "operations"
  | "inventory"
  | "approvals"
  | "documents"
  | "training"
  | "directors"
  | "audit"
  | "ai";
type BriefCard = { label: string; value: string; detail: string; icon: typeof Target };
type RiskSignal = { title: string; status: string; detail: string; tone: string };
type DirectorScoreboardItem = CompanyControlDto["orgRoles"][number] & {
  focus: string;
  status: string;
  nextMove: string;
};
type LiveSummary = {
  revenue: string;
  activeOrders: string;
  pendingApprovals: number;
  lowStock: number;
  cashStatus: string;
  cashDiscrepancy: string;
  latestAudit: string;
  pendingTraining: number;
  documentsWithoutFile: number;
};

const quickLinks = [
  { label: "Dashboard", href: "/os?module=dashboard" },
  { label: "POS", href: "/os?module=pos" },
  { label: "Inventory", href: "/os?module=inventory" },
  { label: "Finance", href: "/os?module=finance" },
  { label: "Approvals", href: "/os?module=approvals" },
  { label: "GARAGE AI", href: "/os?module=ai-agent" },
];

const navItems = [
  ["brief", "00 Brief"],
  ["ceo-ai", "AI Assistant"],
  ["command", "01 Command"],
  ["organization", "02 Organization"],
  ["documents", "03 Documents"],
  ["training", "04 Training"],
  ["playbook", "05 Playbook"],
  ["garage-os", "06 GARAGE OS"],
];

const ceoAiQuickActions: Array<{ label: string; prompt: string; tool: CeoAiTool }> = [
  {
    label: "Ringkas hari ini",
    tool: "report_builder",
    prompt:
      "Buat executive memo CEO untuk kondisi GARAGE hari ini. Ringkas omzet, order aktif, cash session, stok low, approval pending, audit terbaru, dan 5 tindakan prioritas.",
  },
  {
    label: "Risiko terbesar",
    tool: "finance_guard_agent",
    prompt:
      "Analisis risiko terbesar dari data CEO Control saat ini. Jelaskan cash risk, approval risk, inventory risk, audit risk, dan rekomendasi tindakan yang tidak mengeksekusi otomatis.",
  },
  {
    label: "Approval decision draft",
    tool: "approval_agent",
    prompt:
      "Buat draft keputusan untuk approval pending. Kelompokkan berdasarkan risiko, siapa owner, apa data yang perlu dicek, dan rekomendasi approve/reject/review.",
  },
  {
    label: "SOP perlu update",
    tool: "sop_knowledge_agent",
    prompt:
      "Dari dokumen, training, audit, dan risiko operasional, rekomendasikan SOP mana yang perlu direview CEO minggu ini.",
  },
];

const controlModules: Array<{
  id: ControlModuleId;
  label: string;
  description: string;
}> = [
  { id: "overview", label: "Overview", description: "CEO live brief" },
  { id: "finance", label: "Finance", description: "Cash and payment" },
  { id: "operations", label: "Operations", description: "Order and signals" },
  { id: "inventory", label: "Inventory", description: "Stock risk" },
  { id: "approvals", label: "Approvals", description: "Decision gate" },
  { id: "documents", label: "Documents", description: "Company vault" },
  { id: "training", label: "Training", description: "Role standards" },
  { id: "directors", label: "Directors", description: "Executive owners" },
  { id: "audit", label: "Audit", description: "Immutable log" },
  { id: "ai", label: "AI Assistant", description: "Executive memo" },
];

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function initialsForProfile(name: string, fallback: string) {
  const source = name.trim() || fallback.trim();
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "G";
}

async function parseResponse<T>(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as ApiSuccess<T> & ApiFailure;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Request gagal diproses.");
  }
  return payload.data;
}

function SectionHead({
  id,
  number,
  title,
  lead,
}: {
  id: string;
  number: string;
  title: string;
  lead: string;
}) {
  return (
    <div id={id} className="grid gap-4 pt-20 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10">
      <div className="font-mono text-xs uppercase tracking-[0.22em] text-[#8a8378]">{number}</div>
      <div>
        <h2 className="font-heading text-5xl uppercase leading-none text-[#f4ede0] md:text-7xl">
          {title}
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-[#d6cdbc] md:text-base">{lead}</p>
      </div>
    </div>
  );
}

function IndustrialCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[10px] border border-[#2a2520] bg-[#16130f]/92 p-5 shadow-[0_18px_50px_-28px_rgba(0,0,0,0.9)] ${className}`}
    >
      {children}
    </div>
  );
}

function CardTag({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#f5a524]">
      {children}
    </div>
  );
}

function CeoAiAssistant({
  liveSummary,
}: {
  liveSummary: LiveSummary;
}) {
  const [prompt, setPrompt] = useState("");
  const [selectedTool, setSelectedTool] = useState<CeoAiTool>("report_builder");
  const [result, setResult] = useState<AiPosAgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function askCeoAi(message: string, tool: CeoAiTool = selectedTool) {
    const cleanMessage = message.trim();
    if (!cleanMessage) {
      setError("Tulis pertanyaan CEO terlebih dahulu.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const contextPrompt = [
          "Kamu adalah CEO AI Assistant untuk GARAGE CEO Control Center.",
          "Jawab sebagai executive memo singkat, praktis, dan berbasis data.",
          "Jangan mengeksekusi aksi kritis. Buat draft keputusan dan rekomendasi yang perlu disetujui manusia.",
          `Snapshot: omzet ${liveSummary.revenue}; order aktif ${liveSummary.activeOrders}; approval pending ${liveSummary.pendingApprovals}; stok low ${liveSummary.lowStock}; cash session ${liveSummary.cashStatus}; selisih kas ${liveSummary.cashDiscrepancy}; training pending ${liveSummary.pendingTraining}; dokumen tanpa file ${liveSummary.documentsWithoutFile}; audit terbaru ${liveSummary.latestAudit}.`,
          `Permintaan CEO: ${cleanMessage}`,
        ].join("\n");

        const response = await parseResponse<AiPosAgentResponse>(
          await fetch("/api/ai/pos-agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "owner_free_chat",
              message: contextPrompt,
              orderType: "dine-in",
              cart: [],
              ownerChatContext: {
                planMode: true,
                profile: tool === "finance_guard_agent" ? "finance" : "manager",
                tool,
              },
            }),
          }),
        );

        setResult(response);
        setPrompt("");
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "GARAGE AI gagal merespons.");
      }
    });
  }

  return (
    <IndustrialCard className="border-[#f5a524]/35 bg-[#1d1710]/95">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-7 text-[#f5a524]" />
            <CardTag>CEO AI Assistant</CardTag>
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-[#f4ede0]">Executive memo generator</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#d6cdbc]">
            Tanya kondisi bisnis, risiko, approval, stok, SOP, atau minta draft keputusan.
            AI hanya memberi memo dan action draft, bukan menjalankan aksi kritis.
          </p>
        </div>
        <span className="rounded-full border border-[#f5a524]/30 bg-[#f5a524]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#ffd08a]">
          Owner only
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {ceoAiQuickActions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={isPending}
            onClick={() => void askCeoAi(action.prompt, action.tool)}
            className="rounded-lg border border-[#2a2520] bg-[#110f0d] p-4 text-left transition hover:border-[#f5a524] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MessageCircle className="size-5 text-[#f5a524]" />
            <div className="mt-3 text-sm font-semibold text-[#f4ede0]">{action.label}</div>
          </button>
        ))}
      </div>

      <form
        className="mt-5 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          void askCeoAi(prompt);
        }}
      >
        <select
          value={selectedTool}
          onChange={(event) => setSelectedTool(event.target.value as CeoAiTool)}
          className="h-12 rounded-md border border-[#3a342c] bg-[#0f0d0b] px-3 text-sm text-[#f4ede0] outline-none focus:border-[#f5a524]"
        >
          <option value="report_builder">CEO Report</option>
          <option value="finance_guard_agent">Finance Risk</option>
          <option value="approval_agent">Approval</option>
          <option value="inventory_agent">Inventory</option>
          <option value="sop_knowledge_agent">SOP</option>
          <option value="none">General</option>
        </select>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Contoh: buat agenda meeting direksi dari risiko hari ini..."
          className="min-h-12 rounded-md border border-[#3a342c] bg-[#0f0d0b] px-3 py-3 text-sm text-[#f4ede0] outline-none focus:border-[#f5a524]"
        />
        <button
          type="submit"
          disabled={isPending || !prompt.trim()}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#f5a524] px-5 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#0a0908] transition hover:bg-[#ffd08a] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="size-4" />
          {isPending ? "Thinking" : "Ask"}
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-lg border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffe1e5]">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-5 rounded-lg border border-[#2a2520] bg-[#0f0d0b] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTag>Executive memo</CardTag>
              <h4 className="mt-1 text-xl font-semibold text-[#f4ede0]">
                {result.intent} - risk {result.riskLevel ?? result.urgency}
              </h4>
            </div>
            <span className="rounded-full bg-white/[0.06] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#d6cdbc]">
              {result.providerUsed ?? "system"} / {result.modelUsed ?? "deterministic"}
            </span>
          </div>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-[#d6cdbc]">{result.response}</p>
          {result.suggestedActions?.length > 0 && (
            <div className="mt-5 grid gap-2">
              {result.suggestedActions.slice(0, 5).map((action) => (
                <div key={action} className="flex gap-2 text-sm text-[#f4ede0]">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#f5a524]" />
                  {action}
                </div>
              ))}
            </div>
          )}
          {result.nextStep && (
            <div className="mt-5 rounded-md border border-[#f5a524]/25 bg-[#f5a524]/8 p-3 text-sm text-[#ffd08a]">
              Next step: {result.nextStep}
            </div>
          )}
        </div>
      )}
    </IndustrialCard>
  );
}

function DesktopCommandCenter({
  data,
  ceoDailyBrief,
  actionQueue,
  riskSignals,
  directorScoreboard,
  liveSummary,
}: {
  data: CompanyControlDto;
  ceoDailyBrief: BriefCard[];
  actionQueue: string[];
  riskSignals: RiskSignal[];
  directorScoreboard: DirectorScoreboardItem[];
  liveSummary: LiveSummary;
}) {
  const router = useRouter();
  const [activeModule, setActiveModule] = useState<ControlModuleId>("overview");
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [isApproving, startApprovalTransition] = useTransition();

  async function decideApproval(id: string, status: "approved" | "rejected") {
    setApprovalStatus(null);
    setApprovalError(null);

    startApprovalTransition(async () => {
      try {
        await parseResponse(
          await fetch(`/api/approvals/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }),
        );
        setApprovalStatus(`Approval ${status === "approved" ? "disetujui" : "ditolak"} dan tercatat audit.`);
        router.refresh();
      } catch (error) {
        setApprovalError(error instanceof Error ? error.message : "Approval gagal diproses.");
      }
    });
  }

  const moduleTitle =
    controlModules.find((module) => module.id === activeModule)?.label ?? "Overview";
  const moduleDescription =
    controlModules.find((module) => module.id === activeModule)?.description ?? "CEO live brief";

  function renderModule() {
    if (activeModule === "overview") {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4 md:grid-cols-3">
            {ceoDailyBrief.map((item) => {
              const Icon = item.icon;
              return (
                <IndustrialCard key={item.label}>
                  <Icon className="size-6 text-[#f5a524]" />
                  <CardTag>{item.label}</CardTag>
                  <h3 className="mt-3 text-xl font-semibold text-[#f4ede0]">{item.value}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#d6cdbc]">{item.detail}</p>
                </IndustrialCard>
              );
            })}
            {data.live.dashboard.operationalSignals.slice(0, 3).map((signal) => (
              <IndustrialCard key={signal.label}>
                <CardTag>{signal.label}</CardTag>
                <h3 className="mt-3 text-2xl font-semibold text-[#f4ede0]">{signal.value}</h3>
                <p className="mt-2 text-sm text-[#d6cdbc]">{signal.status}</p>
              </IndustrialCard>
            ))}
          </div>
          <IndustrialCard className="border-[#f5a524]/35 bg-[#1d1710]/95">
            <CardTag>CEO action queue</CardTag>
            <div className="mt-5 grid gap-3">
              {actionQueue.map((item) => (
                <div key={item} className="flex gap-3 rounded-lg border border-[#2a2520] bg-[#110f0d] p-3 text-sm text-[#d6cdbc]">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#f5a524]" />
                  {item}
                </div>
              ))}
            </div>
          </IndustrialCard>
        </div>
      );
    }

    if (activeModule === "finance") {
      return (
        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <IndustrialCard className="border-[#f5a524]/35">
            <CardTag>Cash session</CardTag>
            <h3 className="mt-3 text-3xl font-semibold text-[#f4ede0]">{data.live.finance.cashSession.code}</h3>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="flex justify-between gap-3"><span className="text-[#8a8378]">Status</span><span className="font-semibold text-[#f5a524]">{data.live.finance.cashSession.status}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[#8a8378]">Opening</span><span>{formatIdr(data.live.finance.cashSession.openingCash)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[#8a8378]">Expected</span><span>{formatIdr(data.live.finance.cashSession.expectedCash)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[#8a8378]">Discrepancy</span><span>{liveSummary.cashDiscrepancy}</span></div>
            </div>
            <Link href="/os?module=finance" className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#f5a524] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#0a0908]">
              Open Finance <ArrowRight className="size-4" />
            </Link>
          </IndustrialCard>
          <IndustrialCard>
            <CardTag>Payment mix</CardTag>
            <h3 className="mt-2 text-2xl font-semibold text-[#f4ede0]">{formatIdr(data.live.finance.totalCaptured)}</h3>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {data.live.finance.paymentBreakdown.map((payment) => (
                <div key={payment.method} className="rounded-lg border border-[#2a2520] bg-[#110f0d] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-[#f4ede0]">{payment.method}</span>
                    <span className="font-mono text-xs text-[#f5a524]">{payment.share}%</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[#f5a524]" style={{ width: `${Math.min(payment.share, 100)}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-[#d6cdbc]">{formatIdr(payment.amount)}</p>
                </div>
              ))}
            </div>
          </IndustrialCard>
        </div>
      );
    }

    if (activeModule === "operations") {
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.live.dashboard.headlineMetrics.map((metric) => (
            <IndustrialCard key={metric.id}>
              <CardTag>{metric.label}</CardTag>
              <div className="mt-3 text-3xl font-semibold text-[#f5a524]">{metric.value}</div>
              <p className="mt-2 text-sm text-[#d6cdbc]">{metric.delta}</p>
            </IndustrialCard>
          ))}
          <IndustrialCard className="md:col-span-2 xl:col-span-4">
            <CardTag>Sales trend</CardTag>
            <div className="mt-5 grid h-44 grid-cols-12 items-end gap-2">
              {data.live.dashboard.salesTrend.map((item) => {
                const maxSales = Math.max(...data.live.dashboard.salesTrend.map((row) => row.sales), 1);
                return (
                  <div key={item.hour} className="flex h-full flex-col justify-end gap-2">
                    <div className="min-h-2 rounded-sm bg-[#f5a524]" style={{ height: `${(item.sales / maxSales) * 100}%` }} />
                    <p className="text-center text-[10px] text-[#8a8378]">{item.hour}</p>
                  </div>
                );
              })}
            </div>
          </IndustrialCard>
        </div>
      );
    }

    if (activeModule === "inventory") {
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {data.live.inventoryWarnings.length ? data.live.inventoryWarnings.map((item) => (
            <IndustrialCard key={item.sku}>
              <CardTag>{item.category}</CardTag>
              <h3 className="mt-2 text-lg font-semibold text-[#f4ede0]">{item.name}</h3>
              <p className="mt-2 text-sm text-[#d6cdbc]">{item.onHand} {item.unit} tersisa, minimum {item.min}</p>
              <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-[#f5a524]">{item.status} / {item.movement}</p>
            </IndustrialCard>
          )) : (
            <IndustrialCard className="md:col-span-2 xl:col-span-4">
              <CardTag>Inventory</CardTag>
              <h3 className="mt-2 text-xl font-semibold text-[#f4ede0]">Tidak ada low stock</h3>
            </IndustrialCard>
          )}
        </div>
      );
    }

    if (activeModule === "approvals") {
      return (
        <IndustrialCard>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTag>Approval center</CardTag>
              <h3 className="mt-2 text-2xl font-semibold text-[#f4ede0]">{data.live.approvals.length} pending decision</h3>
            </div>
            <Link href="/os?module=approvals" className="rounded-md border border-[#3a342c] px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-[#f4ede0]">Open OS</Link>
          </div>
          {approvalStatus && <div className="mt-4 rounded-lg border border-emerald-400/35 bg-emerald-400/10 p-3 text-sm text-emerald-100">{approvalStatus}</div>}
          {approvalError && <div className="mt-4 rounded-lg border border-red-400/35 bg-red-400/10 p-3 text-sm text-red-100">{approvalError}</div>}
          <div className="mt-5 grid gap-3">
            {data.live.approvals.length ? data.live.approvals.map((approval) => (
              <div key={approval.id} className="grid gap-3 rounded-lg border border-[#2a2520] bg-[#110f0d] p-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#f5a524]/12 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#ffd08a]">{approval.risk}</span>
                    <span className="rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#d6cdbc]">{approval.age}</span>
                  </div>
                  <h4 className="mt-3 text-lg font-semibold text-[#f4ede0]">{approval.type}</h4>
                  <p className="mt-1 text-sm text-[#8a8378]">{approval.requester} / {approval.amount}</p>
                  <p className="mt-2 text-sm leading-6 text-[#d6cdbc]">{approval.reason}</p>
                </div>
                <div className="flex items-center gap-2 xl:justify-end">
                  <button type="button" disabled={isApproving} onClick={() => void decideApproval(approval.id, "approved")} className="rounded-md bg-[#22c55e] px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#06210f] disabled:opacity-60">Approve</button>
                  <button type="button" disabled={isApproving} onClick={() => void decideApproval(approval.id, "rejected")} className="rounded-md border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#ffe1e5] disabled:opacity-60">Reject</button>
                </div>
              </div>
            )) : <p className="text-sm text-[#d6cdbc]">Tidak ada approval pending.</p>}
          </div>
        </IndustrialCard>
      );
    }

    if (activeModule === "documents") {
      return <DocumentVault documents={data.documents} canManage={data.me.canManage} />;
    }

    if (activeModule === "training") {
      return <TrainingCenter courses={data.training} />;
    }

    if (activeModule === "directors") {
      return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {directorScoreboard.map((director) => (
            <IndustrialCard key={director.id}>
              <Users className="size-6 text-[#f5a524]" />
              <h3 className="mt-3 text-lg font-semibold text-[#f4ede0]">{director.roleTitle}</h3>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-[#f5a524]">{director.personName ?? "Belum ditetapkan"}</p>
              <p className="mt-4 text-sm text-[#d6cdbc]">{director.focus}</p>
              <div className="mt-4 rounded-md border border-[#2a2520] bg-[#0f0d0b] p-3 text-sm text-[#f4ede0]">{director.nextMove}</div>
            </IndustrialCard>
          ))}
        </div>
      );
    }

    if (activeModule === "audit") {
      return (
        <IndustrialCard>
          <CardTag>Audit trail</CardTag>
          <div className="mt-5 grid gap-3">
            {data.live.auditLogs.map((log) => (
              <div key={`${log.time}-${log.actor}-${log.action}`} className="grid gap-3 rounded-lg border border-[#2a2520] bg-[#110f0d] p-4 xl:grid-cols-[160px_minmax(0,1fr)_140px]">
                <div className="font-mono text-xs uppercase tracking-[0.12em] text-[#8a8378]">{log.time}</div>
                <div>
                  <h4 className="font-semibold text-[#f4ede0]">{log.action}</h4>
                  <p className="mt-1 text-sm text-[#d6cdbc]">{log.actor} / {log.device} / {log.object}</p>
                </div>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-center font-mono text-[10px] uppercase tracking-[0.12em] text-[#d6cdbc]">{log.status}</span>
              </div>
            ))}
          </div>
        </IndustrialCard>
      );
    }

    return <CeoAiAssistant liveSummary={liveSummary} />;
  }

  return (
    <section id="desktop-control" className="mx-auto max-w-[1680px] px-4 pb-10 md:px-8">
      <div className="hidden min-h-[760px] grid-cols-[280px_minmax(0,1fr)_320px] gap-4 xl:grid">
        <aside className="sticky top-[76px] h-[calc(100vh-96px)] overflow-hidden rounded-[10px] border border-[#2a2520] bg-[#110f0d]">
          <div className="border-b border-[#2a2520] p-4">
            <div className="flex items-center gap-3">
              <Image src="/garage-brand/logo-icon.png" alt="GARAGE" width={34} height={34} className="size-9 object-contain" />
              <div>
                <div className="font-heading text-xl uppercase text-[#f4ede0]">CEO Control</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8378]">Desktop command</div>
              </div>
            </div>
          </div>
          <nav className="grid gap-1 p-3">
            {controlModules.map((module) => (
              <button
                key={module.id}
                type="button"
                onClick={() => setActiveModule(module.id)}
                className={`rounded-md border px-3 py-3 text-left transition ${
                  activeModule === module.id
                    ? "border-[#f5a524]/45 bg-[#f5a524]/12 text-[#f4ede0]"
                    : "border-transparent text-[#8a8378] hover:border-[#2a2520] hover:bg-white/[0.04] hover:text-[#f4ede0]"
                }`}
              >
                <div className="font-mono text-[11px] uppercase tracking-[0.13em]">{module.label}</div>
                <div className="mt-1 text-xs">{module.description}</div>
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          <div className="sticky top-[76px] z-20 mb-4 rounded-[10px] border border-[#2a2520] bg-[#0a0908]/92 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#f5a524]">GARAGE OS / CEO command center</div>
                <h2 className="mt-1 text-3xl font-semibold text-[#f4ede0]">{moduleTitle}</h2>
                <p className="mt-1 text-sm text-[#8a8378]">{moduleDescription}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/os?module=dashboard" className="rounded-md border border-[#3a342c] px-3 py-2 font-mono text-xs uppercase tracking-[0.12em] text-[#f4ede0]">OS</Link>
                <Link href="#top" className="rounded-md bg-[#f5a524] px-3 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#0a0908]">Top</Link>
              </div>
            </div>
          </div>
          {renderModule()}
        </div>

        <aside className="sticky top-[76px] h-[calc(100vh-96px)] overflow-y-auto rounded-[10px] border border-[#2a2520] bg-[#110f0d] p-4">
          <CardTag>Live status</CardTag>
          <div className="mt-4 grid gap-3">
            {[
              ["Revenue", liveSummary.revenue],
              ["Orders", liveSummary.activeOrders],
              ["Approvals", String(liveSummary.pendingApprovals)],
              ["Low stock", String(liveSummary.lowStock)],
              ["Cash", liveSummary.cashStatus],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[#2a2520] bg-[#0f0d0b] p-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8378]">{label}</div>
                <div className="mt-1 text-lg font-semibold text-[#f4ede0]">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <CardTag>Risk signals</CardTag>
            <div className="mt-3 grid gap-2">
              {riskSignals.slice(0, 5).map((signal) => (
                <button key={signal.title} type="button" onClick={() => setActiveModule(signal.title.includes("Approval") ? "approvals" : signal.title.includes("Inventory") ? "inventory" : "overview")} className="rounded-lg border border-[#2a2520] bg-[#0f0d0b] p-3 text-left">
                  <div className="text-sm font-semibold text-[#f4ede0]">{signal.title}</div>
                  <div className="mt-1 text-xs text-[#8a8378]">{signal.status}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="rounded-[10px] border border-[#2a2520] bg-[#110f0d] p-5 xl:hidden">
        <CardTag>Desktop required</CardTag>
        <h2 className="mt-2 text-2xl font-semibold text-[#f4ede0]">CEO Control Center dibuat untuk desktop.</h2>
        <p className="mt-2 text-sm leading-6 text-[#d6cdbc]">
          Buka di layar laptop/desktop agar sidebar, command bar, table, approval, dan AI panel tampil lengkap.
        </p>
      </div>
    </section>
  );
}

function DocumentVault({
  documents,
  canManage,
}: {
  documents: CompanyDocumentDto[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredDocuments = useMemo(() => {
    const clean = query.trim().toLowerCase();
    if (!clean) return documents;
    return documents.filter((document) =>
      [document.title, document.category, document.ownerRole, document.summary]
        .join(" ")
        .toLowerCase()
        .includes(clean),
    );
  }, [documents, query]);

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setError(null);

    if (!canManage) {
      setError("Role ini hanya bisa membaca arsip.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Pilih file dokumen terlebih dahulu.");
      return;
    }

    startTransition(async () => {
      try {
        const allowedRoles = String(formData.get("allowedRoles") ?? "")
          .split(",")
          .map((role) => role.trim())
          .filter(Boolean);

        const document = await parseResponse<CompanyDocumentDto>(
          await fetch("/api/company/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: formData.get("title"),
              category: formData.get("category"),
              summary: formData.get("summary"),
              ownerRole: formData.get("ownerRole"),
              confidentiality: formData.get("confidentiality"),
              allowedRoles,
            }),
          }),
        );

        const uploadForm = new FormData();
        uploadForm.set("file", file);
        uploadForm.set("notes", String(formData.get("notes") ?? ""));
        await parseResponse(
          await fetch(`/api/company/documents/${document.id}/versions`, {
            method: "POST",
            body: uploadForm,
          }),
        );

        form.reset();
        setStatus("Dokumen tersimpan dan masuk audit log.");
        router.refresh();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload gagal.");
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <IndustrialCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTag>Document vault</CardTag>
            <h3 className="mt-2 text-2xl font-semibold text-[#f4ede0]">Arsip perusahaan</h3>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari dokumen, SOP, owner..."
            className="h-10 min-w-[240px] rounded-md border border-[#3a342c] bg-[#0f0d0b] px-3 text-sm text-[#f4ede0] outline-none focus:border-[#f5a524]"
          />
        </div>

        <div className="mt-5 grid gap-3">
          {filteredDocuments.map((document) => (
            <div
              key={document.id}
              className="grid gap-3 rounded-lg border border-[#2a2520] bg-[#110f0d] p-4 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#f5a524]/12 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#f5a524]">
                    {document.category}
                  </span>
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d6cdbc]">
                    {document.confidentiality}
                  </span>
                  <span className="rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#d6cdbc]">
                    v{document.currentVersion}
                  </span>
                </div>
                <h4 className="mt-3 text-lg font-semibold text-[#f4ede0]">{document.title}</h4>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#d6cdbc]">{document.summary}</p>
                <p className="mt-3 font-mono text-xs uppercase tracking-[0.12em] text-[#8a8378]">
                  Owner: {document.ownerRole} - Access:{" "}
                  {document.allowedRoles.length ? document.allowedRoles.join(", ") : "Internal"}
                </p>
              </div>
              <div className="flex items-center md:justify-end">
                {document.latestVersion ? (
                  <Link
                    href={document.latestVersion.downloadUrl}
                    className="inline-flex items-center gap-2 rounded-full border border-[#3a342c] bg-[#1c1814] px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-[#f4ede0] transition hover:border-[#f5a524]"
                  >
                    <Download className="size-4" />
                    {formatBytes(document.latestVersion.sizeBytes)}
                  </Link>
                ) : (
                  <span className="font-mono text-xs uppercase tracking-[0.12em] text-[#8a8378]">
                    Belum ada file
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </IndustrialCard>

      <IndustrialCard>
        <CardTag>Upload</CardTag>
        <h3 className="mt-2 text-2xl font-semibold text-[#f4ede0]">Tambah arsip</h3>
        <p className="mt-2 text-sm leading-6 text-[#d6cdbc]">
          PDF, DOCX, MD, TXT, dan HTML disimpan di storage privat. Download tetap wajib login.
        </p>

        {!canManage && (
          <div className="mt-4 rounded-lg border border-[#f5a524]/35 bg-[#f5a524]/10 p-3 text-sm text-[#f4ede0]">
            Role kamu read-only untuk arsip perusahaan.
          </div>
        )}

        {status && (
          <div className="mt-4 rounded-lg border border-emerald-400/35 bg-emerald-400/10 p-3 text-sm text-emerald-100">
            {status}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-red-400/35 bg-red-400/10 p-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <form className="mt-5 space-y-3" onSubmit={uploadDocument}>
          {[
            ["title", "Judul dokumen", "Contoh: SOP Closing Outlet"],
            ["category", "Kategori", "SOP"],
            ["ownerRole", "Owner dokumen", "COO / CRO"],
            ["confidentiality", "Klasifikasi", "internal"],
            ["allowedRoles", "Role akses, pisahkan koma", "Owner / CEO, Admin, Manager Operasional"],
          ].map(([name, label, placeholder]) => (
            <label key={name} className="block text-sm text-[#d6cdbc]">
              {label}
              <input
                name={name}
                required={name !== "allowedRoles"}
                disabled={!canManage || isPending}
                placeholder={placeholder}
                className="mt-1 h-10 w-full rounded-md border border-[#3a342c] bg-[#0f0d0b] px-3 text-sm text-[#f4ede0] outline-none focus:border-[#f5a524] disabled:opacity-55"
              />
            </label>
          ))}
          <label className="block text-sm text-[#d6cdbc]">
            Ringkasan
            <textarea
              name="summary"
              disabled={!canManage || isPending}
              rows={3}
              className="mt-1 w-full rounded-md border border-[#3a342c] bg-[#0f0d0b] px-3 py-2 text-sm text-[#f4ede0] outline-none focus:border-[#f5a524] disabled:opacity-55"
            />
          </label>
          <label className="block text-sm text-[#d6cdbc]">
            Catatan versi
            <input
              name="notes"
              disabled={!canManage || isPending}
              placeholder="Initial upload"
              className="mt-1 h-10 w-full rounded-md border border-[#3a342c] bg-[#0f0d0b] px-3 text-sm text-[#f4ede0] outline-none focus:border-[#f5a524] disabled:opacity-55"
            />
          </label>
          <label className="block text-sm text-[#d6cdbc]">
            File
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.md,.txt,.html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain,text/html"
              disabled={!canManage || isPending}
              className="mt-1 w-full rounded-md border border-[#3a342c] bg-[#0f0d0b] px-3 py-2 text-sm text-[#f4ede0] outline-none file:mr-3 file:rounded-md file:border-0 file:bg-[#f5a524] file:px-3 file:py-1.5 file:font-mono file:text-xs file:uppercase file:text-[#0a0908] disabled:opacity-55"
            />
          </label>
          <button
            type="submit"
            disabled={!canManage || isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#f5a524] px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#0a0908] transition hover:bg-[#f9c66b] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Upload className="size-4" />
            {isPending ? "Menyimpan..." : "Upload dokumen"}
          </button>
        </form>
      </IndustrialCard>
    </div>
  );
}

function TrainingCenter({ courses }: { courses: TrainingCourseDto[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function completeCourse(course: TrainingCourseDto) {
    setPendingId(course.id);
    setError(null);
    try {
      await parseResponse(
        await fetch(`/api/company/training/${course.id}/complete`, { method: "POST" }),
      );
      router.refresh();
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : "Training gagal disimpan.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {error && (
        <div className="md:col-span-2 rounded-lg border border-red-400/35 bg-red-400/10 p-3 text-sm text-red-100">
          {error}
        </div>
      )}
      {courses.map((course) => {
        const completed = course.progressStatus === "completed";
        return (
          <IndustrialCard key={course.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTag>{course.category}</CardTag>
                <h3 className="mt-2 text-xl font-semibold text-[#f4ede0]">{course.title}</h3>
              </div>
              <span
                className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
                  completed ? "bg-emerald-400/12 text-emerald-200" : "bg-[#f5a524]/12 text-[#f5a524]"
                }`}
              >
                {completed ? "Completed" : "Required"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#d6cdbc]">{course.summary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {course.targetRoles.map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-[#2a2520] bg-[#110f0d] px-2.5 py-1 text-xs text-[#d6cdbc]"
                >
                  {role}
                </span>
              ))}
            </div>
            <div className="mt-5 space-y-3">
              {course.lessons.map((lesson) => (
                <div key={lesson.id} className="rounded-lg border border-[#2a2520] bg-[#110f0d] p-4">
                  <h4 className="font-semibold text-[#f4ede0]">{lesson.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-[#d6cdbc]">{lesson.summary}</p>
                  <ul className="mt-3 space-y-2">
                    {lesson.checklist.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-[#d6cdbc]">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#f5a524]" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void completeCourse(course)}
              disabled={completed || pendingId === course.id}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#3a342c] bg-[#1c1814] px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#f4ede0] transition hover:border-[#f5a524] disabled:cursor-not-allowed disabled:opacity-55"
            >
              <BookOpenCheck className="size-4" />
              {completed ? "Training selesai" : pendingId === course.id ? "Menyimpan..." : "Tandai selesai"}
            </button>
          </IndustrialCard>
        );
      })}
    </div>
  );
}

export function CompanyControlCenter({ initialData }: { initialData: CompanyControlDto }) {
  const router = useRouter();
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const executiveRoles = initialData.orgRoles.filter((role) => role.division === "Executive");
  const outletRoles = initialData.orgRoles.filter((role) => role.division !== "Executive");
  const profileInitials = initialsForProfile(initialData.me.name, initialData.me.email);
  const completedTraining = initialData.training.filter(
    (course) => course.progressStatus === "completed",
  ).length;
  const pendingTraining = Math.max(initialData.training.length - completedTraining, 0);
  const documentsWithFiles = initialData.documents.filter(
    (document) => document.latestVersion,
  ).length;
  const confidentialDocuments = initialData.documents.filter(
    (document) => document.confidentiality === "confidential",
  ).length;
  const revenueMetric = initialData.live.dashboard.headlineMetrics.find(
    (metric) => metric.id === "revenue",
  );
  const orderMetric = initialData.live.dashboard.headlineMetrics.find(
    (metric) => metric.id === "orders",
  );
  const approvalMetric = initialData.live.dashboard.headlineMetrics.find(
    (metric) => metric.id === "approvals",
  );
  const cashSession = initialData.live.finance.cashSession;
  const cashDiscrepancy = Math.abs(cashSession.discrepancy ?? 0);
  const lowStockCount = initialData.live.inventoryWarnings.length;
  const pendingApprovalCount = initialData.live.approvals.length;
  const latestAudit = initialData.live.auditLogs[0];
  const liveSummary = {
    revenue: revenueMetric?.value ?? formatIdr(initialData.live.finance.totalCaptured),
    activeOrders: orderMetric?.value ?? "0",
    pendingApprovals: pendingApprovalCount,
    lowStock: lowStockCount,
    cashStatus: cashSession.status,
    cashDiscrepancy: formatIdr(cashDiscrepancy),
    latestAudit: latestAudit
      ? `${latestAudit.action} oleh ${latestAudit.actor}`
      : "Belum ada audit log",
    pendingTraining,
    documentsWithoutFile: Math.max(initialData.documents.length - documentsWithFiles, 0),
  };
  const ceoDailyBrief = [
    {
      label: "Omzet captured",
      value: revenueMetric?.value ?? formatIdr(initialData.live.finance.totalCaptured),
      detail: `${orderMetric?.value ?? "0"} order aktif, update ${formatDateTime(initialData.live.generatedAt)}.`,
      icon: Target,
    },
    {
      label: "Approval pending",
      value: approvalMetric?.value ?? String(pendingApprovalCount),
      detail: pendingApprovalCount
        ? `${pendingApprovalCount} keputusan menunggu review CEO.`
        : "Tidak ada approval pending saat ini.",
      icon: ClipboardCheck,
    },
    {
      label: "Risiko utama",
      value: lowStockCount ? `${lowStockCount} stok low` : "Stok aman",
      detail: `${confidentialDocuments} dokumen rahasia, selisih kas ${formatIdr(cashDiscrepancy)}.`,
      icon: AlertTriangle,
    },
  ];
  const actionQueue = [
    pendingApprovalCount
      ? `Putuskan ${pendingApprovalCount} approval pending sebelum closing.`
      : "Tidak ada approval pending, cek audit terakhir.",
    lowStockCount
      ? `Follow up ${lowStockCount} stok low ke gudang.`
      : "Inventory low-stock aman untuk saat ini.",
    cashDiscrepancy
      ? `Review selisih kas ${formatIdr(cashDiscrepancy)} dengan CFO.`
      : "Cash discrepancy belum menunjukkan selisih.",
    latestAudit
      ? `Audit terbaru: ${latestAudit.action} oleh ${latestAudit.actor}.`
      : "Belum ada audit log terbaru.",
  ];
  const riskSignals = [
    {
      title: "Akses pusat kontrol",
      status: "Locked to Owner / CEO",
      detail: "Role lain diarahkan kembali ke GARAGE OS.",
      tone: "ok",
    },
    {
      title: "Cash session",
      status: cashSession.status,
      detail:
        cashSession.status === "open"
          ? `${cashSession.code} terbuka, expected cash ${formatIdr(cashSession.expectedCash)}.`
          : `${cashSession.code} belum open atau perlu review finance.`,
      tone: cashSession.status === "open" ? "ok" : "warn",
    },
    {
      title: "Approval pending",
      status: `${pendingApprovalCount} item`,
      detail: pendingApprovalCount
        ? `${initialData.live.approvals[0]?.type ?? "Approval"} menunggu keputusan.`
        : "Tidak ada approval yang menunggu.",
      tone: pendingApprovalCount ? "warn" : "ok",
    },
    {
      title: "Inventory low stock",
      status: `${lowStockCount} item`,
      detail: lowStockCount
        ? `${initialData.live.inventoryWarnings[0]?.name ?? "Item"} perlu dicek gudang.`
        : "Tidak ada stok low dari inventory.",
      tone: lowStockCount ? "warn" : "ok",
    },
    {
      title: "Dokumen tanpa file aktif",
      status: `${Math.max(initialData.documents.length - documentsWithFiles, 0)} item`,
      detail: "Lengkapi file versi terbaru supaya vault tidak hanya metadata.",
      tone: initialData.documents.length === documentsWithFiles ? "ok" : "warn",
    },
    {
      title: "Training belum selesai",
      status: `${pendingTraining} course`,
      detail: "CEO bisa pakai ini sebagai daftar follow up untuk standar staf.",
      tone: pendingTraining === 0 ? "ok" : "warn",
    },
    {
      title: "Approval matrix",
      status: "Active reference",
      detail: "Belum menjadi approval transaksi real-time. Cocok jadi phase berikutnya.",
      tone: "info",
    },
  ];
  const directorScoreboard = executiveRoles.map((role) => {
    const title = role.roleTitle.toLowerCase();
    const focus = title.includes("coo")
      ? "Operasional + revenue"
      : title.includes("cfo")
        ? "Cash, expense, approval"
        : title.includes("cmo")
          ? "Brand, campaign, CRM"
          : "Strategy, tech, control";

    return {
      ...role,
      focus,
      status: role.personName ? "Assigned" : "Needs owner",
      nextMove: role.kpi[0] ?? "Tetapkan KPI mingguan",
    };
  });

  async function handleSignOut() {
    if (signOutPending) return;

    setSignOutPending(true);
    setSignOutError(null);

    try {
      try {
        await authClient.signOut();
      } catch {
        // The API call below is the fallback used across GARAGE OS.
      }

      const response = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: "{}",
      });

      if (!response.ok) {
        throw new Error("Sign out failed.");
      }

      router.replace("/login?next=%2Fos%3Fmodule%3Ddashboard");
    } catch {
      setSignOutError("Logout gagal, coba lagi.");
      setSignOutPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0908] text-[#f4ede0]">
      <nav className="sticky top-0 z-40 border-b border-[#2a2520] bg-[#0a0908]/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-5 md:px-8">
          <Link href="#top" className="flex shrink-0 items-center gap-3">
            <span className="relative grid size-10 place-items-center overflow-hidden rounded-md border border-[#f5a524]/35 bg-[#f5a524]/10">
              <Image
                src="/garage-brand/logo-icon.png"
                alt="GARAGE"
                width={32}
                height={32}
                className="size-8 object-contain"
                priority
              />
            </span>
            <span className="hidden font-heading text-2xl uppercase tracking-[0.05em] sm:inline">
              Company Control
            </span>
          </Link>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {navItems.map(([href, label]) => (
              <Link
                key={href}
                href={`#${href}`}
                className="whitespace-nowrap rounded-md px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#8a8378] transition hover:bg-[#16130f] hover:text-[#f4ede0]"
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <Link
              href="/os"
              className="rounded-full border border-[#3a342c] bg-[#16130f] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#f4ede0]"
            >
              OS linked
            </Link>
            <div className="flex items-center gap-2 rounded-full border border-[#3a342c] bg-[#16130f] py-1 pl-1 pr-3">
              <span className="grid size-8 place-items-center rounded-full border border-[#f5a524]/35 bg-[#f5a524]/12 font-mono text-xs font-semibold text-[#ffd08a]">
                {profileInitials}
              </span>
              <div className="max-w-[150px] leading-tight">
                <div className="truncate text-xs font-semibold text-[#f4ede0]">{initialData.me.name}</div>
                <div className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[#8a8378]">
                  {initialData.me.role}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={signOutPending}
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-2 rounded-full border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#ffe1e5] transition hover:bg-[#d11a2a]/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="size-4" />
              {signOutPending ? "Logging out" : "Logout"}
            </button>
          </div>
        </div>
      </nav>

      <section id="top" className="relative mx-auto max-w-7xl overflow-hidden px-4 py-20 md:px-8 md:py-28">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(244,237,224,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(244,237,224,0.04)_1px,transparent_1px)] bg-[size:42px_42px] opacity-70" />
        <div className="pointer-events-none absolute right-4 top-12 hidden opacity-[0.08] md:block">
          <Image
            src="/garage-brand/logo-website.png"
            alt=""
            width={460}
            height={260}
            className="h-auto w-[360px] object-contain lg:w-[460px]"
            priority
          />
        </div>
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#f5a524]/28 bg-[#f5a524]/10 px-3 py-2">
              <Image
                src="/garage-brand/logo-icon.png"
                alt="GARAGE"
                width={24}
                height={24}
                className="size-6 object-contain"
              />
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-[#f5a524]">
                CEO only - internal archive - management command
              </span>
            </div>
          </div>
          <h1 className="mt-5 max-w-5xl font-heading text-6xl uppercase leading-[0.9] text-[#f4ede0] md:text-8xl">
            GARAGE CEO Control
            <span className="text-[#f5a524]"> / </span>
            Owner Dashboard
          </h1>
          <p className="mt-6 max-w-3xl text-base leading-7 text-[#d6cdbc] md:text-lg">
            Dashboard profesional khusus Owner / CEO untuk full control arsip perusahaan,
            SOP, training, approval, audit, dan keputusan strategis GARAGE.
          </p>

          {signOutError && (
            <div className="mt-5 rounded-lg border border-[#d11a2a]/45 bg-[#d11a2a]/12 p-3 text-sm text-[#ffe1e5]">
              {signOutError}
            </div>
          )}

          <div className="mt-8 grid overflow-hidden rounded-[10px] border border-[#2a2520] bg-[#110f0d]/92 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
            <div className="border-b border-[#2a2520] p-4 lg:border-b-0 lg:border-r">
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center rounded-full border border-[#f5a524]/35 bg-[#f5a524]/12 font-mono text-sm font-semibold text-[#ffd08a]">
                  {profileInitials}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8378]">
                    <UserCircle className="size-4" />
                    Login active
                  </div>
                  <strong className="mt-1 block truncate text-[#f4ede0]">{initialData.me.name}</strong>
                  <div className="truncate text-xs text-[#8a8378]">{initialData.me.email}</div>
                </div>
              </div>
            </div>
            <div className="border-b border-[#2a2520] p-4 lg:border-b-0 lg:border-r">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8378]">Role</div>
              <strong className="mt-1 block text-[#f5a524]">{initialData.me.role}</strong>
            </div>
            <div className="border-b border-[#2a2520] p-4 lg:border-b-0 lg:border-r">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8378]">Mode</div>
              <strong className="mt-1 block text-[#f4ede0]">
                {initialData.me.canManage ? "CEO full control" : "Restricted"}
              </strong>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#8a8378]">Storage</div>
                <strong className="mt-1 block text-[#f4ede0]">Private vault</strong>
              </div>
              <button
                type="button"
                disabled={signOutPending}
                onClick={() => void handleSignOut()}
                className="inline-flex items-center gap-2 rounded-full border border-[#d11a2a]/45 bg-[#d11a2a]/12 px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-[#ffe1e5] transition hover:bg-[#d11a2a]/20 disabled:cursor-not-allowed disabled:opacity-60 lg:hidden"
              >
                <LogOut className="size-4" />
                {signOutPending ? "Logging out" : "Logout"}
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="#documents"
              className="inline-flex items-center gap-2 rounded-full bg-[#f5a524] px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#0a0908]"
            >
              Buka arsip
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="#training"
              className="inline-flex items-center gap-2 rounded-full border border-[#3a342c] bg-[#16130f] px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#f4ede0]"
            >
              Training role
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 md:grid-cols-4 md:px-8">
        {initialData.metrics.map((metric) => (
          <IndustrialCard key={metric.label}>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#8a8378]">{metric.label}</div>
            <div className="mt-3 font-heading text-5xl leading-none text-[#f5a524]">{metric.value}</div>
            <div className="mt-2 text-sm text-[#d6cdbc]">{metric.detail}</div>
          </IndustrialCard>
        ))}
      </section>

      <DesktopCommandCenter
        data={initialData}
        ceoDailyBrief={ceoDailyBrief}
        actionQueue={actionQueue}
        riskSignals={riskSignals}
        directorScoreboard={directorScoreboard}
        liveSummary={liveSummary}
      />

      <section className="mx-auto max-w-7xl px-4 pb-24 md:px-8">
        <SectionHead
          id="brief"
          number="SECTION 00"
          title="CEO Daily Brief"
          lead="Ringkasan pertama yang harus dilihat Owner: fokus hari ini, keputusan tertunda, risiko akses, dan tindakan cepat sebelum masuk ke detail."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-4 md:grid-cols-3">
            {ceoDailyBrief.map((item) => {
              const Icon = item.icon;
              return (
                <IndustrialCard key={item.label}>
                  <Icon className="size-7 text-[#f5a524]" />
                  <CardTag>{item.label}</CardTag>
                  <h3 className="mt-3 text-xl font-semibold text-[#f4ede0]">{item.value}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#d6cdbc]">{item.detail}</p>
                </IndustrialCard>
              );
            })}
          </div>
          <IndustrialCard className="border-[#f5a524]/35 bg-[#1d1710]/95">
            <div className="flex items-center gap-3">
              <Timer className="size-7 text-[#f5a524]" />
              <div>
                <CardTag>CEO action queue</CardTag>
                <h3 className="mt-1 text-2xl font-semibold text-[#f4ede0]">Tindakan prioritas</h3>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              {[
                pendingApprovalCount
                  ? `Putuskan ${pendingApprovalCount} approval pending sebelum closing.`
                  : "Tidak ada approval pending, cek audit terakhir.",
                lowStockCount
                  ? `Follow up ${lowStockCount} stok low ke gudang.`
                  : "Inventory low-stock aman untuk saat ini.",
                cashDiscrepancy
                  ? `Review selisih kas ${formatIdr(cashDiscrepancy)} dengan CFO.`
                  : "Cash discrepancy belum menunjukkan selisih.",
                latestAudit
                  ? `Audit terbaru: ${latestAudit.action} oleh ${latestAudit.actor}.`
                  : "Belum ada audit log terbaru.",
              ].map((item) => (
                <div key={item} className="flex gap-3 rounded-lg border border-[#2a2520] bg-[#110f0d] p-3 text-sm text-[#d6cdbc]">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#f5a524]" />
                  {item}
                </div>
              ))}
            </div>
          </IndustrialCard>
        </div>

        <div id="ceo-ai" className="pt-8">
          <CeoAiAssistant liveSummary={liveSummary} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <IndustrialCard>
            <CardTag>Live payment mix</CardTag>
            <h3 className="mt-2 text-2xl font-semibold text-[#f4ede0]">
              {formatIdr(initialData.live.finance.totalCaptured)}
            </h3>
            <div className="mt-5 grid gap-3">
              {initialData.live.finance.paymentBreakdown.length ? (
                initialData.live.finance.paymentBreakdown.map((payment) => (
                  <div key={payment.method} className="rounded-lg border border-[#2a2520] bg-[#110f0d] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[#f4ede0]">{payment.method}</span>
                      <span className="font-mono text-xs text-[#f5a524]">{payment.share}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[#f5a524]"
                        style={{ width: `${Math.min(payment.share, 100)}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-[#8a8378]">{formatIdr(payment.amount)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#d6cdbc]">Belum ada payment captured.</p>
              )}
            </div>
          </IndustrialCard>

          <IndustrialCard>
            <CardTag>Approval queue</CardTag>
            <div className="mt-5 grid gap-3">
              {initialData.live.approvals.length ? (
                initialData.live.approvals.slice(0, 4).map((approval) => (
                  <div key={approval.id} className="rounded-lg border border-[#2a2520] bg-[#110f0d] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-[#f4ede0]">{approval.type}</h4>
                        <p className="mt-1 text-xs text-[#8a8378]">{approval.requester} - {approval.age}</p>
                      </div>
                      <span className="rounded-full bg-[#f5a524]/12 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#ffd08a]">
                        {approval.risk}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[#d6cdbc]">{approval.reason}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#d6cdbc]">Tidak ada approval pending.</p>
              )}
            </div>
          </IndustrialCard>

          <IndustrialCard>
            <CardTag>Latest audit</CardTag>
            <div className="mt-5 grid gap-3">
              {initialData.live.auditLogs.length ? (
                initialData.live.auditLogs.slice(0, 4).map((log) => (
                  <div key={`${log.time}-${log.actor}-${log.action}`} className="rounded-lg border border-[#2a2520] bg-[#110f0d] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-sm font-semibold text-[#f4ede0]">{log.action}</h4>
                      <span className="rounded-full bg-white/[0.06] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#d6cdbc]">
                        {log.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#8a8378]">{log.actor} - {log.device}</p>
                    <p className="mt-2 text-sm text-[#d6cdbc]">{log.object}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#d6cdbc]">Belum ada audit log.</p>
              )}
            </div>
          </IndustrialCard>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <IndustrialCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTag>Director scoreboard</CardTag>
                <h3 className="mt-2 text-2xl font-semibold text-[#f4ede0]">Kontrol direksi</h3>
              </div>
              <span className="rounded-full border border-[#f5a524]/30 bg-[#f5a524]/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#ffd08a]">
                Weekly review
              </span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {directorScoreboard.map((director) => (
                <div key={director.id} className="rounded-lg border border-[#2a2520] bg-[#110f0d] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold text-[#f4ede0]">{director.roleTitle}</h4>
                      <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-[#f5a524]">
                        {director.personName ?? "Belum ditetapkan"}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#22c55e]/12 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#bbf7d0]">
                      {director.status}
                    </span>
                  </div>
                  <p className="mt-4 text-sm text-[#d6cdbc]">{director.focus}</p>
                  <div className="mt-4 rounded-md border border-[#2a2520] bg-[#0f0d0b] p-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8a8378]">
                      Next move
                    </div>
                    <p className="mt-1 text-sm text-[#f4ede0]">{director.nextMove}</p>
                  </div>
                </div>
              ))}
            </div>
          </IndustrialCard>

          <IndustrialCard>
            <div className="flex items-center gap-3">
              <FileWarning className="size-7 text-[#f5a524]" />
              <div>
                <CardTag>Risk & approval monitor</CardTag>
                <h3 className="mt-1 text-2xl font-semibold text-[#f4ede0]">Sinyal kontrol</h3>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              {riskSignals.map((signal) => (
                <div key={signal.title} className="rounded-lg border border-[#2a2520] bg-[#110f0d] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-semibold text-[#f4ede0]">{signal.title}</h4>
                    <span
                      className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                        signal.tone === "ok"
                          ? "bg-[#22c55e]/12 text-[#bbf7d0]"
                          : signal.tone === "warn"
                            ? "bg-[#f5a524]/12 text-[#ffd08a]"
                            : "bg-white/[0.06] text-[#d6cdbc]"
                      }`}
                    >
                      {signal.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[#d6cdbc]">{signal.detail}</p>
                </div>
              ))}
            </div>
          </IndustrialCard>
        </div>

        <SectionHead
          id="command"
          number="SECTION 01"
          title="Executive Command"
          lead="Direksi GARAGE dipetakan sebagai owner keputusan. Portal ini menjaga agar strategi, operasi, finance, dan marketing tidak bercampur tanpa akuntabilitas."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {executiveRoles.map((role) => (
            <IndustrialCard key={role.id}>
              <Users className="size-7 text-[#f5a524]" />
              <h3 className="mt-4 text-xl font-semibold text-[#f4ede0]">{role.roleTitle}</h3>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-[#f5a524]">
                {role.personName}
              </p>
              <p className="mt-4 text-sm leading-6 text-[#d6cdbc]">{role.responsibility}</p>
              <ul className="mt-4 space-y-2">
                {role.kpi.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-[#d6cdbc]">
                    <BadgeCheck className="mt-0.5 size-4 shrink-0 text-[#f5a524]" />
                    {item}
                  </li>
                ))}
              </ul>
            </IndustrialCard>
          ))}
        </div>

        <SectionHead
          id="organization"
          number="SECTION 02"
          title="Organization"
          lead="Struktur perusahaan dari direksi sampai outlet dibuat eksplisit agar training, SOP, dan daily report mengikuti jalur komando yang sama."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <IndustrialCard>
            <Network className="size-8 text-[#f5a524]" />
            <h3 className="mt-4 text-2xl font-semibold text-[#f4ede0]">Chain of command</h3>
            <pre className="mt-5 overflow-x-auto whitespace-pre-wrap rounded-lg border border-[#2a2520] bg-[#0f0d0b] p-4 font-mono text-xs leading-6 text-[#d6cdbc]">
{`CEO / CTO / CIO - Surya
├── COO / CRO - Acong
├── CFO - Chandra Agustian
├── CMO - Chandra Ariansyah
└── Manajer Operasional / Admin Gudang
    ├── Kasir
    ├── Barista
    ├── Koki
    ├── Asisten Koki
    ├── Waiter 1
    ├── Waiter 2
    └── Satpam / Kebersihan`}
            </pre>
          </IndustrialCard>
          <div className="grid gap-3 md:grid-cols-2">
            {outletRoles.map((role) => (
              <IndustrialCard key={role.id}>
                <CardTag>{role.division}</CardTag>
                <h3 className="mt-2 text-lg font-semibold text-[#f4ede0]">{role.roleTitle}</h3>
                <p className="mt-1 text-xs text-[#8a8378]">Reports to: {role.reportsTo ?? "CEO"}</p>
                <p className="mt-3 text-sm leading-6 text-[#d6cdbc]">{role.responsibility}</p>
              </IndustrialCard>
            ))}
          </div>
        </div>

        <SectionHead
          id="documents"
          number="SECTION 03"
          title="Document Vault"
          lead="Arsip perusahaan disimpan sebagai file privat, berversi, diberi kategori, owner, klasifikasi, dan role access. Setiap upload tercatat di audit log."
        />
        <div className="mt-10">
          <DocumentVault documents={initialData.documents} canManage={initialData.me.canManage} />
        </div>

        <SectionHead
          id="training"
          number="SECTION 04"
          title="Training Center"
          lead="Training tetap tersedia sebagai referensi Owner / CEO untuk mengawasi standar staf, SOP wajib, dan checklist pembelajaran internal."
        />
        <div className="mt-10">
          <TrainingCenter courses={initialData.training} />
        </div>

        <SectionHead
          id="playbook"
          number="SECTION 05"
          title="Management Playbook"
          lead="Ringkasan eksekusi dari dokumen bisnis: roadmap 90 hari, approval flow, channel koordinasi, dan daily report yang wajib dikirim."
        />
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <IndustrialCard>
            <CardTag>90 day roadmap</CardTag>
            <div className="mt-5 space-y-3">
              {initialData.management.roadmap.map((item) => (
                <div key={item.phase} className="rounded-lg border border-[#2a2520] bg-[#110f0d] p-4">
                  <div className="font-mono text-xs uppercase tracking-[0.14em] text-[#f5a524]">
                    {item.phase}
                  </div>
                  <h3 className="mt-2 text-lg font-semibold text-[#f4ede0]">{item.focus}</h3>
                  <p className="mt-1 text-sm text-[#d6cdbc]">{item.output}</p>
                </div>
              ))}
            </div>
          </IndustrialCard>
          <IndustrialCard>
            <CardTag>Approval flow</CardTag>
            <div className="mt-5 space-y-3">
              {initialData.management.approvalFlow.map((item) => (
                <div key={item.area} className="flex gap-3 rounded-lg border border-[#2a2520] bg-[#110f0d] p-4">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#f5a524]" />
                  <div>
                    <h3 className="font-semibold text-[#f4ede0]">{item.area}</h3>
                    <p className="mt-1 text-sm text-[#d6cdbc]">{item.owner}</p>
                  </div>
                </div>
              ))}
            </div>
          </IndustrialCard>
          <IndustrialCard>
            <CardTag>Microsoft Teams structure</CardTag>
            <div className="mt-5 flex flex-wrap gap-2">
              {initialData.management.teamsChannels.map((channel) => (
                <span key={channel} className="rounded-full border border-[#2a2520] bg-[#110f0d] px-3 py-2 text-sm">
                  {channel}
                </span>
              ))}
            </div>
          </IndustrialCard>
          <IndustrialCard>
            <CardTag>Daily report standard</CardTag>
            <div className="mt-5 grid gap-2">
              {initialData.management.dailyReport.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-[#d6cdbc]">
                  <ClipboardCheck className="size-4 text-[#f5a524]" />
                  {item}
                </div>
              ))}
            </div>
          </IndustrialCard>
        </div>

        <SectionHead
          id="garage-os"
          number="SECTION 06"
          title="GARAGE OS Link"
          lead="Company Control bukan pengganti GARAGE OS. Portal ini menjadi knowledge layer yang mengarahkan staf kembali ke dashboard operasional."
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {quickLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <IndustrialCard className="group transition hover:border-[#f5a524]">
                <LayoutDashboard className="size-7 text-[#f5a524]" />
                <h3 className="mt-4 text-xl font-semibold text-[#f4ede0]">{link.label}</h3>
                <p className="mt-2 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-[#8a8378] group-hover:text-[#f5a524]">
                  Buka modul
                  <ArrowRight className="size-4" />
                </p>
              </IndustrialCard>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-[#2a2520] px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-sm text-[#8a8378]">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4" />
            Internal only. All document changes are audit logged.
          </div>
          <div className="flex items-center gap-2">
            <Archive className="size-4" />
            GARAGE CEO Control v1
          </div>
        </div>
      </footer>
    </main>
  );
}
