import type {
  MessageSender,
  OutboundMessage,
  SendResult,
  SenderProvider,
} from "@/lib/messaging/types";

// ============================================================================
// Registry pengirim pesan. Provider dipilih lewat env MARKETING_SENDER_PROVIDER.
// Default = "simulation": tidak mengirim apa pun, hanya log + tandai berhasil.
//
// Untuk mengaktifkan provider asli nanti: implementasikan MessageSender,
// daftarkan di switch getSender(), dan set env. Alur dispatcher tidak berubah.
// ============================================================================

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ── SIMULASI (default) ──
const simulationSender: MessageSender = {
  provider: "simulation",
  async send(message: OutboundMessage): Promise<SendResult> {
    // Tidak ada pengiriman nyata. Catat ke log server untuk jejak audit ringan.
    console.info(
      `[messaging:simulation] -> ${message.channel} ${message.to} (${message.recipientName}): ${message.body.slice(0, 80)}`,
    );
    return {
      status: "simulated",
      providerMessageId: genId("sim"),
    };
  },
};

// ── STUB provider asli (belum dikonfigurasi) ──
// Mengembalikan failed yang informatif sehingga jelas perlu wiring + secret.
function notConfiguredSender(provider: SenderProvider): MessageSender {
  return {
    provider,
    async send(): Promise<SendResult> {
      return {
        status: "failed",
        error: `Provider "${provider}" belum dikonfigurasi. Set MARKETING_SENDER_PROVIDER + kredensial provider.`,
      };
    },
  };
}

export function resolveProvider(): SenderProvider {
  const raw = (process.env.MARKETING_SENDER_PROVIDER ?? "simulation").toLowerCase();
  if (raw === "fonnte" || raw === "cloud_api" || raw === "email") return raw;
  return "simulation";
}

export function getSender(provider: SenderProvider = resolveProvider()): MessageSender {
  switch (provider) {
    case "simulation":
      return simulationSender;
    // TODO: ganti stub dengan implementasi asli saat provider dipilih.
    case "fonnte":
    case "cloud_api":
    case "email":
      return notConfiguredSender(provider);
    default:
      return simulationSender;
  }
}
