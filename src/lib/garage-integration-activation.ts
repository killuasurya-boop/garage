export type ActivationIntegrationInput = {
  provider: string;
  label: string;
  configured: boolean;
  status: string;
  readiness?: {
    ready: boolean;
    canPublish: boolean;
  };
  resources: Array<{
    resourceType: string;
    resourceId: string;
    accountName: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
};

export type ActivationChecklistItem = {
  id: string;
  label: string;
  description: string;
  type: "auto" | "manual";
  done: boolean;
  blocking: boolean;
};

const REQUIRED_PUBLISHING_PROVIDERS = [
  "facebook",
  "instagram",
  "tiktok",
  "youtube",
] as const;

export const MANUAL_ACTIVATION_CHECKS = [
  {
    id: "developer-callbacks",
    label: "Callback developer app sudah diarahkan ke app.garagecoffee.id",
    description: "Meta, TikTok, Google, dan Threads memakai callback GARAGE OS, bukan worker lama.",
  },
  {
    id: "legacy-token-rotated",
    label: "Token legacy sudah dirotasi atau dicabut",
    description: "Token worker lama tidak lagi dipakai setelah koneksi baru lolos test.",
  },
  {
    id: "youtube-private",
    label: "YouTube pertama tetap private",
    description: "Uji upload Shorts pertama memakai privacy private sebelum publik.",
  },
  {
    id: "tiktok-self-only",
    label: "TikTok masih SELF_ONLY sampai app review selesai",
    description: "Mode TikTok tidak dibuka publik sebelum review dan akun tujuan benar.",
  },
  {
    id: "whatsapp-internal-test",
    label: "WhatsApp template sudah dites ke nomor internal",
    description: "Template dan delivery webhook dicek sebelum broadcast pelanggan.",
  },
  {
    id: "feature-flag-locked",
    label: "Feature flag live tetap false sebelum go/no-go",
    description: "SOCIAL_PUBLISHING_LIVE_ENABLED dan WHATSAPP_MESSAGING_LIVE_ENABLED belum dinaikkan.",
  },
] as const;

export function buildActivationChecklist(input: {
  integrations: ActivationIntegrationInput[];
  manualCompleted: Record<string, boolean>;
}) {
  const byProvider = new Map(input.integrations.map((item) => [item.provider, item]));
  const metaPage = byProvider
    .get("facebook")
    ?.resources.some(
      (resource) => resource.resourceType === "page" && resource.metadata?.selected === true,
    );
  const connectedProviders = REQUIRED_PUBLISHING_PROVIDERS.every((provider) => {
    const item = byProvider.get(provider);
    return Boolean(item?.configured && item.resources.length > 0);
  });
  const publishingReady = REQUIRED_PUBLISHING_PROVIDERS.every(
    (provider) => byProvider.get(provider)?.readiness?.ready === true,
  );
  const mapsReady = byProvider.get("google_maps")?.readiness?.ready === true;
  const whatsappReady = byProvider.get("whatsapp")?.readiness?.ready === true;

  const autoItems: ActivationChecklistItem[] = [
    {
      id: "required-providers-connected",
      label: "Platform utama sudah terkoneksi",
      description: "Facebook Page, Instagram Business, TikTok, dan YouTube punya resource tujuan.",
      type: "auto",
      done: connectedProviders,
      blocking: true,
    },
    {
      id: "meta-page-selected",
      label: "Facebook Page GARAGE sudah dipilih",
      description: "Meta tidak boleh mengandalkan token umum tanpa Page dan IG tujuan yang jelas.",
      type: "auto",
      done: Boolean(metaPage),
      blocking: true,
    },
    {
      id: "publishing-readiness-ready",
      label: "Publishing readiness platform utama hijau",
      description: "Readiness env, resource, permission, expiry, health, dan error sudah lolos.",
      type: "auto",
      done: publishingReady,
      blocking: true,
    },
    {
      id: "maps-ready",
      label: "Google Maps place tervalidasi",
      description: "Place ID, alamat, koordinat, dan preview directions sudah tersedia.",
      type: "auto",
      done: mapsReady,
      blocking: false,
    },
    {
      id: "whatsapp-ready",
      label: "WhatsApp Cloud siap untuk test internal",
      description: "Phone Number ID dan health check WhatsApp sudah valid.",
      type: "auto",
      done: whatsappReady,
      blocking: false,
    },
  ];

  const manualItems: ActivationChecklistItem[] = MANUAL_ACTIVATION_CHECKS.map((item) => ({
    ...item,
    type: "manual",
    done: Boolean(input.manualCompleted[item.id]),
    blocking: true,
  }));
  const items = [...autoItems, ...manualItems];
  const blockingItems = items.filter((item) => item.blocking);
  const completed = items.filter((item) => item.done).length;

  return {
    items,
    completed,
    total: items.length,
    readyForStagedLive: blockingItems.every((item) => item.done),
    blockers: blockingItems.filter((item) => !item.done),
  };
}
