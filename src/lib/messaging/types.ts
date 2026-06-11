// Abstraksi pengiriman pesan keluar (WA/email) untuk marketing/CRM.
// Default implementasi = simulasi (log saja). Provider asli (Fonnte, WhatsApp
// Cloud API, Resend) tinggal mengimplementasikan MessageSender tanpa mengubah
// dispatcher atau alur broadcast.

export type MessageChannel = "whatsapp" | "instagram" | "in_store" | "multi" | "email";

export type OutboundMessage = {
  channel: MessageChannel;
  /** Nomor WA (format apa pun; sender yang normalisasi) atau alamat email. */
  to: string;
  recipientName: string;
  body: string;
};

export type SendResult = {
  status: "sent" | "simulated" | "failed";
  /** ID pesan dari provider (jika ada). */
  providerMessageId?: string;
  error?: string;
};

export type SenderProvider = "simulation" | "fonnte" | "cloud_api" | "email";

export interface MessageSender {
  readonly provider: SenderProvider;
  send(message: OutboundMessage): Promise<SendResult>;
}
