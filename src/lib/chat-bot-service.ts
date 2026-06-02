import { and, desc, eq, gte, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  chatChannelMembers,
  chatChannels,
  chatMessages,
  outlets,
  staffProfiles,
  user,
} from "@/db/schema";
import { chatBus } from "@/lib/chat-events";
import type { Role } from "@/lib/garage-data";
import {
  getDailyAnomalies,
  getKitchenData,
  getSmartReorderSuggestions,
  getSuspiciousActivity,
} from "@/lib/garage-service";

import { sendChatMessage } from "@/lib/chat-service";

export const BOT_USER_ID = "garage-bot-system";
export const BOT_NAME = "GarageBot";
const BOT_EMAIL = "garage-bot@internal.garage";

const ROLE_KEY_PREFIX = "role:";

function bodyHash(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

export async function ensureBotUser(): Promise<string> {
  const db = getDb();
  const [existing] = await db.select().from(user).where(eq(user.id, BOT_USER_ID)).limit(1);
  if (existing) return BOT_USER_ID;

  await db
    .insert(user)
    .values({
      id: BOT_USER_ID,
      name: BOT_NAME,
      email: BOT_EMAIL,
      emailVerified: true,
    })
    .onConflictDoNothing();

  // staff_profiles butuh outlet. Pakai outlet pertama yang aktif.
  const [outlet] = await db
    .select()
    .from(outlets)
    .where(eq(outlets.status, "active"))
    .orderBy(outlets.createdAt)
    .limit(1);
  if (outlet) {
    await db
      .insert(staffProfiles)
      .values({
        userId: BOT_USER_ID,
        outletId: outlet.id,
        role: "Admin",
        shiftLabel: "Auto",
        deviceLabel: "Bot",
      })
      .onConflictDoNothing();
  }
  return BOT_USER_ID;
}

async function ensureRoleChannel(role: Role): Promise<string | null> {
  const db = getDb();
  const roleKey = `${ROLE_KEY_PREFIX}${role}`;
  const [existing] = await db
    .select()
    .from(chatChannels)
    .where(and(eq(chatChannels.type, "role"), eq(chatChannels.roleKey, roleKey)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(chatChannels)
    .values({ type: "role", name: `# ${role}`, roleKey })
    .returning();
  return created?.id ?? null;
}

async function ensureBotMembership(channelId: string) {
  const db = getDb();
  await db
    .insert(chatChannelMembers)
    .values({ channelId, userId: BOT_USER_ID })
    .onConflictDoNothing();
}

async function lastBotMessageRecentlyMatches(channelId: string, hash: string, windowMin: number) {
  const db = getDb();
  const since = new Date(Date.now() - windowMin * 60 * 1000);
  const [row] = await db
    .select({ body: chatMessages.body })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.channelId, channelId),
        eq(chatMessages.senderUserId, BOT_USER_ID),
        isNull(chatMessages.deletedAt),
        gte(chatMessages.createdAt, since),
      ),
    )
    .orderBy(desc(chatMessages.createdAt))
    .limit(1);
  if (!row) return false;
  // Setiap pesan bot punya footer `[hash:xxxxx]` untuk dedup
  return row.body.includes(`[hash:${hash}]`);
}

async function postBotMessage(channelId: string, body: string, dedupWindowMin = 30) {
  const hash = bodyHash(body);
  const finalBody = `${body}\n\n[hash:${hash}]`;
  if (await lastBotMessageRecentlyMatches(channelId, hash, dedupWindowMin)) {
    return { posted: false, reason: "duplicate" as const };
  }

  await ensureBotMembership(channelId);
  const db = getDb();
  const [inserted] = await db
    .insert(chatMessages)
    .values({
      channelId,
      senderUserId: BOT_USER_ID,
      body: finalBody,
    })
    .returning();
  await db
    .update(chatChannels)
    .set({ lastMessageAt: inserted.createdAt, updatedAt: new Date() })
    .where(eq(chatChannels.id, channelId));

  const memberRows = await db
    .select({ userId: chatChannelMembers.userId })
    .from(chatChannelMembers)
    .where(eq(chatChannelMembers.channelId, channelId));

  chatBus.publish({
    kind: "message",
    channelId,
    memberUserIds: memberRows.map((m) => m.userId),
    message: {
      id: inserted.id,
      channelId: inserted.channelId,
      senderUserId: inserted.senderUserId,
      senderName: BOT_NAME,
      body: inserted.body,
      attachmentUrl: inserted.attachmentUrl,
      attachmentType: inserted.attachmentType,
      attachmentSize: inserted.attachmentSize,
      replyToId: inserted.replyToId,
      createdAt: inserted.createdAt.toISOString(),
    },
  });
  return { posted: true as const };
}

export type SweepReport = {
  startedAt: string;
  finishedAt: string;
  posted: Array<{ channel: string; topic: string }>;
  skipped: Array<{ channel: string; topic: string; reason: string }>;
  errors: Array<{ topic: string; message: string }>;
};

const TARGETS: Array<{
  role: Role;
  topics: Array<"reorder" | "anomaly" | "suspicious" | "kitchen">;
}> = [
  { role: "Owner / CEO", topics: ["reorder", "anomaly", "suspicious", "kitchen"] },
  { role: "Admin", topics: ["reorder", "anomaly", "suspicious", "kitchen"] },
  { role: "Gudang", topics: ["reorder"] },
  { role: "Finance / CFO", topics: ["anomaly", "suspicious"] },
  { role: "Manager Operasional", topics: ["anomaly", "suspicious", "kitchen"] },
  { role: "Koki", topics: ["kitchen"] },
  { role: "Kitchen / Barista", topics: ["kitchen"] },
];

function rupiah(n: number) {
  return `Rp${n.toLocaleString("id-ID")}`;
}

async function buildReorderMessage(): Promise<string | null> {
  const data = await getSmartReorderSuggestions({ windowDays: 14 });
  const critical = data.suggestions.filter((s) => s.riskLevel === "critical").slice(0, 5);
  const watch = data.suggestions.filter((s) => s.riskLevel === "watch").slice(0, 5);
  if (critical.length === 0 && watch.length === 0) return null;

  const lines: string[] = ["🛒 *Smart reorder alert*"];
  if (critical.length) {
    lines.push("", "🔴 Critical:");
    for (const s of critical) {
      const eta = s.daysUntilEmpty === null ? "—" : `${s.daysUntilEmpty}h`;
      lines.push(
        `• ${s.name} (${s.sku}) · on-hand ${s.onHand} ${s.unit} · habis ~${eta} · saran ${s.suggestedReorderQty} ${s.unit}`,
      );
    }
  }
  if (watch.length) {
    lines.push("", "🟠 Watch:");
    for (const s of watch) {
      lines.push(`• ${s.name} — sisa ${s.daysUntilEmpty ?? "—"}h`);
    }
  }
  lines.push("", `Total: ${data.criticalCount} critical, ${data.watchCount} watch.`);
  return lines.join("\n");
}

async function buildAnomalyMessage(): Promise<string | null> {
  const data = await getDailyAnomalies();
  const flagged = data.anomalies.filter((a) => a.severity !== "info");
  if (flagged.length === 0) return null;

  const lines: string[] = ["📊 *Anomali harian*"];
  for (const a of flagged) {
    const icon = a.severity === "critical" ? "🔴" : "🟠";
    const label = a.metric === "revenue" ? "Revenue" : "Expense";
    const sign = a.deviationPct > 0 ? "+" : "";
    lines.push(
      `${icon} ${label}: ${rupiah(a.todayValue)} (${sign}${a.deviationPct}% vs avg 7d ${rupiah(a.avg7dValue)})`,
    );
    lines.push(`   ${a.message}`);
  }
  return lines.join("\n");
}

async function buildSuspiciousMessage(): Promise<string | null> {
  const data = await getSuspiciousActivity({ windowHours: 24 });
  if (data.flags.length === 0) return null;

  const labelByKind = {
    excess_void: "Void berlebihan",
    excess_manual_discount: "Diskon manual sering",
    unmatched_stock_out: "Stok turun non-resep",
  } as const;

  const lines: string[] = ["🛡️ *Suspicious activity (24 jam)*"];
  for (const f of data.flags.slice(0, 8)) {
    const icon = f.severity === "critical" ? "🔴" : "🟠";
    lines.push(`${icon} ${labelByKind[f.kind]} · ${f.actor ?? "—"} · ${f.count}x`);
  }
  return lines.join("\n");
}

async function buildKitchenSlaMessage(): Promise<string | null> {
  const data = await getKitchenData();
  const activeTickets = data.filter((t) => ["queue", "cooking"].includes(t.status));
  const lateTickets = activeTickets.filter((t) => t.elapsed > t.targetMinutes);
  if (lateTickets.length === 0) return null;

  const lines: string[] = ["⏳ *Kitchen SLA Alert*"];
  lines.push("", `🔴 ${lateTickets.length} pesanan terlambat!`);
  for (const t of lateTickets.slice(0, 5)) {
    const over = t.elapsed - t.targetMinutes;
    lines.push(
      `• ${t.id} (${t.station}) — meja ${t.table} · telat ${over}mnt (target ${t.targetMinutes}mnt)`,
    );
  }
  if (lateTickets.length > 5) {
    lines.push(`  ... dan ${lateTickets.length - 5} tiket lainnya.`);
  }
  lines.push("", "Mohon segera koordinasikan dan percepat penyajian.");
  return lines.join("\n");
}

export async function runSmartAlertSweep(): Promise<SweepReport> {
  const startedAt = new Date().toISOString();
  const report: SweepReport = {
    startedAt,
    finishedAt: startedAt,
    posted: [],
    skipped: [],
    errors: [],
  };

  await ensureBotUser();

  // Build per-topic bodies sekali, lalu kirim ke channel-channel target
  const bodies: Partial<
    Record<"reorder" | "anomaly" | "suspicious" | "kitchen", string | null>
  > = {};
  try {
    bodies.reorder = await buildReorderMessage();
  } catch (err) {
    report.errors.push({
      topic: "reorder",
      message: err instanceof Error ? err.message : "Gagal compose reorder.",
    });
  }
  try {
    bodies.anomaly = await buildAnomalyMessage();
  } catch (err) {
    report.errors.push({
      topic: "anomaly",
      message: err instanceof Error ? err.message : "Gagal compose anomaly.",
    });
  }
  try {
    bodies.suspicious = await buildSuspiciousMessage();
  } catch (err) {
    report.errors.push({
      topic: "suspicious",
      message: err instanceof Error ? err.message : "Gagal compose suspicious.",
    });
  }
  try {
    bodies.kitchen = await buildKitchenSlaMessage();
  } catch (err) {
    report.errors.push({
      topic: "kitchen",
      message: err instanceof Error ? err.message : "Gagal compose kitchen.",
    });
  }

  for (const target of TARGETS) {
    const channelId = await ensureRoleChannel(target.role);
    if (!channelId) continue;
    for (const topic of target.topics) {
      const body = bodies[topic];
      if (!body) {
        report.skipped.push({
          channel: `# ${target.role}`,
          topic,
          reason: "no_data",
        });
        continue;
      }
      const res = await postBotMessage(channelId, body, 30);
      if (res.posted) {
        report.posted.push({ channel: `# ${target.role}`, topic });
      } else {
        report.skipped.push({
          channel: `# ${target.role}`,
          topic,
          reason: res.reason,
        });
      }
    }
  }

  report.finishedAt = new Date().toISOString();
  return report;
}

export async function askBot(channelId: string, question: string): Promise<void> {
  await ensureBotUser();
  const q = question.toLowerCase();
  
  // Tambahkan sedikit delay untuk mensimulasikan AI sedang mengetik
  await new Promise((r) => setTimeout(r, 800));

  let answer =
    "Maaf, saya tidak mengerti maksud Anda. Ketik `!tanya [kata kunci]` untuk mencari panduan dari SOP. Contoh: `!tanya refund` atau `!tanya stok`.";

  if (q.includes("refund") || q.includes("batal") || q.includes("void")) {
    answer =
      "**SOP Batal/Void**:\nHanya Kasir dengan otorisasi Manajer yang dapat melakukan Void.\n1. Masuk ke modul Order > Riwayat.\n2. Pilih struk yang ingin dibatalkan.\n3. Tekan 'Void' dan pastikan alasan diisi dengan jelas.\n\nJika ini masalah selisih kas, pastikan Anda juga menulis catatan saat *Tutup Kasir*.";
  } else if (q.includes("split bill") || q.includes("pisah tagihan")) {
    answer =
      "**SOP Split Bill**:\n1. Di layar POS, pilih opsi 'Split Bill' saat Checkout.\n2. Pilih item yang ingin dibayar pada struk pertama.\n3. Proses pembayaran pertama, dan sisa item otomatis akan masuk ke struk (bill) kedua.\n\nPastikan Anda menanyakan kepada pelanggan apakah pembagian berdasar *Item* atau *Persentase*.";
  } else if (q.includes("absen") || q.includes("clock in")) {
    answer =
      "**SOP Absensi**:\nGunakan PIN 6-digit Anda pada layar 'Absensi' di halaman awal POS sebelum mulai bekerja. Jangan lupa *Clock Out* di akhir shift. Jika lupa, sistem otomatis menandai Anda selesai pada akhir jam operasional dengan status 'Lupa Clock Out'.";
  } else if (q.includes("stok") || q.includes("habis")) {
    answer =
      "**SOP Stok Menipis**:\nJika indikator stok berwarna merah/amber di POS:\n1. Segera lapor ke Manajer Gudang.\n2. Jika ada barang tumpah atau rusak, gunakan fitur 'Penyesuaian Stok' (Stock Opname).\nBot internal (saya) juga otomatis mengirim peringatan ke chat grup jika stok di bawah batas aman.";
  } else if (q.includes("meja") || q.includes("pindah")) {
    answer =
      "**SOP Memindahkan Meja**:\n1. Buka modul Peta Meja.\n2. Ketuk meja pelanggan yang aktif dan pilih 'Pindah Meja'.\n3. Ketuk meja hijau (kosong) sebagai tujuan.\nSemua tagihan pesanan akan dipindahkan secara otomatis.";
  }

  await sendChatMessage(channelId, BOT_USER_ID, { body: answer });
}
