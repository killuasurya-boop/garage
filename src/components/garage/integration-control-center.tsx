"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  ExternalLink,
  Link2,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  Unplug,
  ChevronDown,
  ListChecks,
  MapPin,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { garageApi } from "@/lib/api-client";
import { buildActivationChecklist } from "@/lib/garage-integration-activation";

type Integration = {
  provider: string;
  label: string;
  status: string;
  configured: boolean;
  resources: Array<{
    id: string;
    resourceType: string;
    resourceId: string;
    accountName: string | null;
    scopes: string[];
    tokenExpiresAt: string | null;
    lastHealthCheckAt: string | null;
    lastError: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  readiness: {
    ready: boolean;
    canPublish: boolean;
    checks: Array<{
      key: string;
      label: string;
      ok: boolean;
      severity: "info" | "warning" | "error";
    }>;
  };
};

const OAUTH_PROVIDERS = new Set([
  "facebook",
  "instagram",
  "threads",
  "tiktok",
  "youtube",
  "google_business",
]);

const PUBLISHING_PROVIDERS = new Set([
  "facebook",
  "instagram",
  "threads",
  "tiktok",
  "youtube",
  "google_business",
]);

const ACTIVATION_STORAGE_KEY = "garage.integration.activation.checks.v1";

function testButtonLabel(provider: string) {
  if (provider === "google_business") return "Validate GBP";
  if (provider === "google_maps") return "Test Maps";
  if (provider === "whatsapp") return "Test WhatsApp";
  if (provider === "youtube") return "Check Channel";
  return "Test";
}

function readinessTone(check: Integration["readiness"]["checks"][number]) {
  if (check.ok) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (check.severity === "error") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-200";
}

export function IntegrationControlCenter() {
  const [items, setItems] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(ACTIVATION_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await garageApi.get<Integration[]>("/api/integrations", { cache: "no-store" }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Integrasi gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  function updateManualCheck(id: string, done: boolean) {
    setManualChecks((current) => {
      const next = { ...current, [id]: done };
      try {
        window.localStorage.setItem(ACTIVATION_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Local checklist persistence is helpful, not required for platform safety.
      }
      return next;
    });
  }

  function resetManualChecks() {
    setManualChecks({});
    try {
      window.localStorage.removeItem(ACTIVATION_STORAGE_KEY);
    } catch {
      // Ignore unavailable localStorage.
    }
  }

  async function test(provider: string) {
    setWorking(provider);
    try {
      await garageApi.post(`/api/integrations/${provider}/test`, {});
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Health check gagal.");
    } finally {
      setWorking(null);
    }
  }

  async function disconnect(provider: string) {
    if (!window.confirm(`Putuskan seluruh resource ${provider}? Token terenkripsi akan dihapus.`)) {
      return;
    }
    setWorking(provider);
    try {
      await garageApi.post(`/api/integrations/${provider}/disconnect`, {});
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Disconnect gagal.");
    } finally {
      setWorking(null);
    }
  }

  async function selectMetaPage(pageId: string) {
    setWorking(`facebook:${pageId}`);
    try {
      await garageApi.post("/api/integrations/meta/select", { pageId });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pemilihan Meta Page gagal.");
    } finally {
      setWorking(null);
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-[#a1a1aa]">
        <LoaderCircle className="mr-2 size-4 animate-spin" /> Memuat koneksi...
      </div>
    );
  }

  const publishingItems = items.filter((item) => PUBLISHING_PROVIDERS.has(item.provider));
  const publishingReady =
    publishingItems.length > 0 && publishingItems.every((item) => item.readiness?.ready);
  const publishingBlockers = publishingItems.flatMap((item) =>
    (item.readiness?.checks ?? [])
      .filter((check) => !check.ok && check.severity === "error")
      .map((check) => `${item.label}: ${check.label}`),
  );
  const activation = buildActivationChecklist({
    integrations: items,
    manualCompleted: manualChecks,
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-white">Integration Control Center</h2>
        <p className="mt-1 text-sm text-[#a1a1aa]">
          Koneksi resmi G A R A G E. Token tidak pernah dikirim ke browser.
        </p>
      </div>

      {error ? (
        <Alert className="border-red-500/40 bg-red-500/10">
          <CircleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div
        className={
          publishingReady
            ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4"
            : "rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">
              {publishingReady ? "Publishing siap aktivasi bertahap" : "Publishing live masih terkunci"}
            </p>
            <p className="mt-1 text-xs text-[#d6d6dc]">
              Scheduler tetap aman sampai feature flag live aktif dan semua provider tujuan hijau.
            </p>
          </div>
          <Badge
            className={
              publishingReady
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }
          >
            {publishingReady ? "ready" : `${publishingBlockers.length} blocker`}
          </Badge>
        </div>
        {publishingBlockers.length ? (
          <div className="mt-3 grid gap-1 text-[11px] text-amber-100 sm:grid-cols-2">
            {publishingBlockers.slice(0, 6).map((blocker) => (
              <p key={blocker} className="rounded border border-amber-500/20 bg-black/20 px-2 py-1">
                {blocker}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-[#34343c] bg-[#111116] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="size-4 text-[#f5a742]" />
              <h3 className="text-sm font-semibold text-white">Activation Runbook</h3>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-[#a1a1aa]">
              Checklist Owner sebelum live scheduler. Checklist manual tersimpan di browser ini,
              sedangkan status auto dibaca dari koneksi dan readiness server.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                activation.readyForStagedLive
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-200"
              }
            >
              {activation.completed}/{activation.total} selesai
            </Badge>
            <Button size="sm" variant="outline" onClick={resetManualChecks}>
              Reset manual
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {activation.items.map((item) => (
            <label
              key={item.id}
              className={
                item.done
                  ? "flex min-h-20 gap-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3"
                  : item.blocking
                    ? "flex min-h-20 gap-3 rounded-md border border-amber-500/25 bg-amber-500/10 p-3"
                    : "flex min-h-20 gap-3 rounded-md border border-white/10 bg-white/[0.025] p-3"
              }
            >
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 rounded border-[#34343c] bg-black accent-[#f5a742]"
                checked={item.done}
                disabled={item.type === "auto"}
                onChange={(event) => updateManualCheck(item.id, event.target.checked)}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                  {item.label}
                  <Badge
                    className={
                      item.type === "auto"
                        ? "border-[#3b82f6]/40 bg-[#3b82f6]/10 text-[#93c5fd]"
                        : "border-[#f5a742]/40 bg-[#f5a742]/10 text-[#ffd08a]"
                    }
                  >
                    {item.type === "auto" ? "auto" : "manual"}
                  </Badge>
                  {item.blocking ? (
                    <Badge className="border-red-500/35 bg-red-500/10 text-red-300">
                      gate
                    </Badge>
                  ) : null}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[#a1a1aa]">
                  {item.description}
                </span>
              </span>
            </label>
          ))}
        </div>

        {activation.blockers.length ? (
          <div className="mt-4 rounded-md border border-amber-500/25 bg-black/20 p-3">
            <p className="text-xs font-semibold text-amber-100">Blocker aktivasi live:</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {activation.blockers.slice(0, 8).map((item) => (
                <p key={item.id} className="text-[11px] text-amber-100/90">
                  {item.label}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {items.map((item) => {
          const connected = ["connected", "expiring"].includes(item.status);
          return (
            <article
              key={item.provider}
              className="rounded-lg border border-[#34343c] bg-[#111116] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {connected ? (
                      <CircleCheck className="size-4 shrink-0 text-emerald-400" />
                    ) : (
                      <PlugZap className="size-4 shrink-0 text-amber-400" />
                    )}
                    <h3 className="truncate font-semibold text-white">{item.label}</h3>
                  </div>
                  <p className="mt-1 text-xs text-[#8f8f99]">{item.provider}</p>
                </div>
                <Badge
                  className={
                    item.readiness?.ready
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : connected
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : item.status === "error"
                        ? "border-red-500/40 bg-red-500/10 text-red-300"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  }
                >
                  {item.readiness?.ready ? "ready" : item.status}
                </Badge>
              </div>

              <div className="mt-3 rounded-md border border-white/10 bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#e4e4e7]">
                    <ListChecks className="size-3.5 text-[#f5a742]" />
                    Readiness
                  </div>
                  <Badge
                    className={
                      item.readiness?.ready
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : item.readiness?.canPublish
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                          : "border-red-500/40 bg-red-500/10 text-red-300"
                    }
                  >
                    {item.readiness?.ready
                      ? "siap live"
                      : item.readiness?.canPublish
                        ? "butuh health check"
                        : "belum siap"}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-1 sm:grid-cols-2">
                  {(item.readiness?.checks ?? []).map((check) => (
                    <div
                      key={check.key}
                      className={`rounded border px-2 py-1 text-[11px] ${readinessTone(check)}`}
                    >
                      {check.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {item.resources.length ? (
                  item.resources.map((resource) => (
                    <div
                      key={resource.id}
                      className="rounded-md border border-white/10 bg-white/[0.025] px-3 py-2 text-xs"
                    >
                      <p className="font-medium text-[#e4e4e7]">
                        {resource.accountName || resource.resourceId}
                      </p>
                      <p className="mt-1 truncate text-[#8f8f99]">{resource.resourceType}</p>
                      {item.provider === "facebook" &&
                      resource.resourceType === "page" &&
                      resource.metadata?.selected !== true ? (
                        <Button
                          size="sm"
                          className="mt-2"
                          disabled={working === `facebook:${resource.resourceId}`}
                          onClick={() => void selectMetaPage(resource.resourceId)}
                        >
                          Pilih Page ini
                        </Button>
                      ) : null}
                      {resource.lastError ? (
                        <p className="mt-1 text-red-300">{resource.lastError}</p>
                      ) : null}
                      {expanded === item.provider ? (
                        <div className="mt-2 space-y-1 border-t border-white/10 pt-2 text-[#a1a1aa]">
                          <p>ID: {resource.resourceId}</p>
                          <p>Scopes: {resource.scopes.join(", ") || "-"}</p>
                          <p>
                            Health:{" "}
                            {resource.lastHealthCheckAt
                              ? new Date(resource.lastHealthCheckAt).toLocaleString("id-ID")
                              : "belum diuji"}
                          </p>
                          {typeof resource.metadata?.formattedAddress === "string" ? (
                            <p>{resource.metadata.formattedAddress}</p>
                          ) : null}
                          {typeof resource.metadata?.googleMapsUri === "string" ? (
                            <>
                              {typeof resource.metadata.latitude === "number" &&
                              typeof resource.metadata.longitude === "number" ? (
                                <iframe
                                  title="Preview lokasi GARAGE"
                                  className="mt-2 h-36 w-full rounded-md border border-white/10"
                                  loading="lazy"
                                  src={`https://www.google.com/maps?q=${resource.metadata.latitude},${resource.metadata.longitude}&output=embed`}
                                />
                              ) : null}
                              <a
                                href={resource.metadata.googleMapsUri}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center text-amber-300 hover:text-amber-200"
                              >
                                <MapPin className="mr-1 size-3.5" /> Buka directions
                              </a>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-[#8f8f99]">
                    {item.configured
                      ? "Client config tersedia, akun belum dipilih."
                      : "Environment server belum lengkap."}
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {OAUTH_PROVIDERS.has(item.provider) ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      window.location.href = `/api/integrations/${item.provider}/start?returnTo=/?module=settings&scope=integrations`;
                    }}
                  >
                    {connected ? <RefreshCw className="mr-2 size-3.5" /> : <Link2 className="mr-2 size-3.5" />}
                    {connected ? "Reconnect" : "Hubungkan"}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={working === item.provider}
                  onClick={() => void test(item.provider)}
                >
                  {working === item.provider ? (
                    <LoaderCircle className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 size-3.5" />
                  )}
                  {testButtonLabel(item.provider)}
                </Button>
                {item.resources.length ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setExpanded((current) =>
                        current === item.provider ? null : item.provider,
                      )
                    }
                  >
                    <ChevronDown className="mr-2 size-3.5" />
                    Detail
                  </Button>
                ) : null}
                {item.resources.length ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={working === item.provider}
                    onClick={() => void disconnect(item.provider)}
                  >
                    <Unplug className="mr-2 size-3.5" /> Disconnect
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
