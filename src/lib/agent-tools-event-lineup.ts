// =============================================================================
// Event, lineup & panitia dari chat (Owner 18 Nov 2026): cukup NAMA event / talent / panitia / sponsor.
// Semua lewat service yang sama dengan /control/lineup dan /control/sponsors (Owner manusia saja —
// `assertOwnerHuman` di service menolak Manajer & agent key; audit per baris). Tidak ada uang bergerak:
// sponsor = kesepakatan saja (tanpa buku kas); pembayaran sponsor/biaya event tetap lewat Garage OS.
// Event default = event terdekat yang belum lewat (master `events`), atau sebut namanya.
// =============================================================================
import { z } from "zod";

import { AgentToolError, rupiah, type AgentTool } from "@/lib/agent-tool-core";
import type { GarageSession } from "@/lib/server-auth";

function assertOwner(session: GarageSession) {
  if (session.profile.role !== "Owner" || session.profile.agentKey) {
    throw new AgentToolError("FORBIDDEN", "Lineup, panitia & sponsor event hanya untuk Owner (login langsung / ChatGPT).", 403);
  }
}

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const eventArg = z.string().trim().min(2).max(120).optional().describe("Nama event / slug platform; kosong = event terdekat");

/** Master event dari nama/slug; kosong = event terdekat yang belum lewat (lalu yang terbaru). */
async function resolveEvent(nama: string | undefined) {
  const { listMasterEvents } = await import("@/lib/event-master");
  const all = await listMasterEvents();
  if (!all.length) throw new AgentToolError("EVENT_TIDAK_ADA", "Belum ada event di menu Event Garage OS.", 404);
  if (!nama) {
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    const upcoming = all.filter((e) => (e.date ?? "") >= today).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return upcoming[0] ?? all[0];
  }
  const q = norm(nama);
  const exact = all.filter((e) => norm(e.title) === q || (e.platformSlug && norm(e.platformSlug) === q));
  const partial = all.filter((e) => norm(e.title).includes(q));
  const pick = exact.length === 1 ? exact[0] : partial.length === 1 ? partial[0] : null;
  if (pick) return pick;
  if (!partial.length) throw new AgentToolError("EVENT_TIDAK_DITEMUKAN", `Event "${nama}" tidak ada. Event: ${all.slice(0, 10).map((e) => e.title).join(", ")}.`, 404);
  throw new AgentToolError("EVENT_AMBIGU", `"${nama}" cocok dengan ${partial.map((e) => `${e.title} (${e.date ?? "-"})`).join(", ")}. Sebut nama lengkap.`, 409);
}

type Performer = { id: string; name: string; kind: string; status: string; setStart: string | null; setMinutes: number | null; instagram: string | null; tagline: string | null; showOnWebsite: boolean };
type Crew = { id: string; name: string; role: string; status: string; userId: string | null };
type Task = { id: string; title: string; crewId: string | null; dueDate: string | null; status: string; priority: string };

async function board(session: GarageSession, eventId: string) {
  const { getLineupBoard } = await import("@/lib/event-lineup-service");
  return (await getLineupBoard(session, { eventId })) as unknown as {
    eventName: string;
    today: string;
    performers: Performer[];
    rundown: Array<{ name: string; start: string | null; end: string | null; overlap?: boolean }>;
    crew: Crew[];
    tasks: Task[];
    readiness: { items: Array<{ label: string; done: boolean; detail?: string }>; done: number; total: number };
  };
}

function findOne<T extends { name: string }>(rows: T[], nama: string, what: string): T | null {
  const q = norm(nama);
  const exact = rows.filter((r) => norm(r.name) === q);
  if (exact.length === 1) return exact[0];
  const partial = rows.filter((r) => norm(r.name).includes(q));
  if (exact.length > 1 || partial.length > 1) {
    throw new AgentToolError("NAMA_AMBIGU", `${what} "${nama}" cocok dengan ${(exact.length > 1 ? exact : partial).map((r) => r.name).join(", ")}. Sebut nama lengkap.`, 409);
  }
  return partial[0] ?? null;
}

const clock = z.string().trim().regex(/^([01]?\d|2[0-3])[.:][0-5]\d$/, "Jam format 20.00 / 20:00").optional();
const toClock = (v: unknown) => (typeof v === "string" ? v.replace(".", ":").padStart(5, "0") : undefined);

const talentInput = z.object({
  event: eventArg,
  nama: z.string().trim().min(2).max(80).describe("Nama talent; bila sudah ada di event = diubah, bila belum = ditambah"),
  namaBaru: z.string().trim().min(2).max(80).optional(),
  jenis: z.enum(["band", "standup", "akustik", "dj", "kreator"]).optional().describe("Wajib untuk talent baru"),
  tagline: z.string().trim().max(40).optional(),
  instagram: z.string().trim().max(60).optional(),
  jamMulai: clock,
  durasiMenit: z.number().int().min(1).max(600).optional(),
  status: z.enum(["calon", "konfirmasi", "batal"]).optional(),
  alasanBatal: z.string().trim().max(300).optional(),
  tampilDiWebsite: z.boolean().optional(),
});

const crewInput = z.object({
  event: eventArg,
  nama: z.string().trim().min(2).max(80),
  jabatan: z
    .enum(["ketua", "sekretaris", "bendahara", "lineup", "stage", "sound", "keamanan", "dokumentasi", "humas", "konsumsi", "tiket", "lo", "lainnya"])
    .optional()
    .describe("Wajib untuk panitia baru"),
  wa: z.string().trim().max(24).optional(),
  tugas: z.string().trim().max(1000).optional(),
  aktif: z.boolean().optional(),
});

const taskInput = z.object({
  event: eventArg,
  judul: z.string().trim().min(3).max(160).describe("Judul tugas; bila sudah ada di event = diubah"),
  pic: z.string().trim().max(80).optional().describe("Nama panitia penanggung jawab"),
  tenggat: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD"),
  prioritas: z.enum(["rendah", "normal", "tinggi"]).optional(),
  status: z.enum(["todo", "proses", "selesai", "batal"]).optional(),
  catatan: z.string().trim().max(1000).optional(),
});

export const eventLineupTools: AgentTool[] = [
  {
    name: "papan_event",
    title: "Papan event: lineup, rundown, panitia, tugas, sponsor",
    description:
      "Kondisi satu event (default event terdekat): talent + jam tampil + bentrok rundown, panitia & akun login, tugas (telat/selesai), sponsor (paket, nilai disepakati, tampil di website), dan checklist kesiapan. Baca saja. Owner.",
    write: false,
    domain: "event",
    risk: "R0",
    permission: "dashboard:read",
    input: z.object({ event: eventArg }),
    async run(session, args) {
      assertOwner(session);
      const event = await resolveEvent(args.event as string | undefined);
      const b = await board(session, event.id);
      const crewName = new Map(b.crew.map((c) => [c.id, c.name]));
      const { listSponsors } = await import("@/lib/event-sponsor-service");
      const sp = (await listSponsors(session, { eventName: event.title })) as unknown as { sponsors: Array<Record<string, unknown>> };
      return {
        event: event.title,
        tanggal: event.date,
        kesiapan: `${b.readiness.done}/${b.readiness.total}`,
        belumSiap: b.readiness.items.filter((i) => !i.done).map((i) => (i.detail ? `${i.label} — ${i.detail}` : i.label)),
        talent: b.performers.map((p) => ({
          nama: p.name,
          jenis: p.kind,
          status: p.status,
          jam: p.setStart ? `${p.setStart}${p.setMinutes ? ` (${p.setMinutes} mnt)` : ""}` : "belum ada jam",
          instagram: p.instagram,
          tagline: p.tagline,
          diWebsite: p.showOnWebsite,
        })),
        bentrokRundown: b.rundown.filter((r) => r.overlap).map((r) => r.name),
        panitia: b.crew.map((c) => ({ nama: c.name, jabatan: c.role, status: c.status, akunLogin: c.userId ? "tertaut" : "belum" })),
        tugas: b.tasks.map((t) => ({
          judul: t.title,
          pic: t.crewId ? (crewName.get(t.crewId) ?? "-") : "-",
          tenggat: t.dueDate,
          status: t.status,
          telat: Boolean(t.dueDate && t.dueDate < b.today && (t.status === "todo" || t.status === "proses")),
        })),
        sponsor: (sp.sponsors ?? [])
          .filter((s) => !s.eventId || s.eventId === event.id)
          .map((s) => ({
            nama: s.name,
            paket: s.packageName ?? null,
            status: s.status,
            nilaiDisepakati: typeof s.agreedAmount === "number" ? rupiah(s.agreedAmount) : undefined,
            diWebsite: s.showOnWebsite,
          })),
      };
    },
  },
  {
    name: "simpan_talent",
    title: "Tambah / ubah talent event",
    description:
      "Tambah talent baru (nama + jenis) atau ubah talent yang sudah ada di event (cocok dari nama): ganti nama, tagline, Instagram, jam mulai & durasi, status (konfirmasi/batal — batal wajib alasan), tampil di website. Isi yang berubah saja. Owner.",
    write: true,
    domain: "event",
    risk: "R1",
    permission: "dashboard:read",
    input: talentInput,
    async run(session, args) {
      assertOwner(session);
      const event = await resolveEvent(args.event as string | undefined);
      const b = await board(session, event.id);
      const existing = findOne(b.performers, String(args.nama), "Talent");
      const fields = {
        ...(args.namaBaru ? { name: String(args.namaBaru) } : {}),
        ...(args.jenis ? { kind: args.jenis as "band" } : {}),
        ...(args.tagline !== undefined ? { tagline: String(args.tagline) } : {}),
        ...(args.instagram !== undefined ? { instagram: String(args.instagram) } : {}),
        ...(args.jamMulai ? { setStart: toClock(args.jamMulai) } : {}),
        ...(args.durasiMenit ? { setMinutes: Number(args.durasiMenit) } : {}),
        ...(args.tampilDiWebsite !== undefined ? { showOnWebsite: Boolean(args.tampilDiWebsite) } : {}),
      };
      const lineup = await import("@/lib/event-lineup-service");
      if (existing) {
        if (args.status === "batal" && !String(args.alasanBatal ?? "").trim()) throw new AgentToolError("VALIDATION_ERROR", "Membatalkan talent wajib alasanBatal.");
        await lineup.updatePerformer(
          existing.id,
          { ...fields, ...(args.status ? { status: args.status as "konfirmasi", cancelReason: (args.alasanBatal as string | undefined) ?? null } : {}) },
          session,
        );
        return { event: event.title, talent: args.namaBaru ?? existing.name, aksi: "diubah" };
      }
      if (!args.jenis) throw new AgentToolError("VALIDATION_ERROR", `Talent "${String(args.nama)}" belum ada — isi jenis (band/standup/akustik/dj/kreator) untuk menambahkannya.`);
      if (args.status === "batal") throw new AgentToolError("VALIDATION_ERROR", "Talent baru tidak bisa langsung batal.");
      await lineup.createPerformer(
        { eventId: event.id, ...fields, name: String(args.namaBaru ?? args.nama), kind: args.jenis as "band", status: (args.status as "konfirmasi" | undefined) ?? "konfirmasi" },
        session,
      );
      return { event: event.title, talent: args.namaBaru ?? args.nama, aksi: "ditambahkan (konfirmasi)" };
    },
  },
  {
    name: "simpan_panitia",
    title: "Tambah / ubah panitia event",
    description:
      "Tambah panitia baru (nama + jabatan) atau ubah panitia yang ada (cocok dari nama): jabatan, WA, uraian tugas, aktif/nonaktif. Akun login panitia ditautkan di Garage OS (Lineup & Panitia → Panitia). Owner.",
    write: true,
    domain: "event",
    risk: "R1",
    permission: "dashboard:read",
    input: crewInput,
    async run(session, args) {
      assertOwner(session);
      const event = await resolveEvent(args.event as string | undefined);
      const b = await board(session, event.id);
      const existing = findOne(b.crew, String(args.nama), "Panitia");
      const lineup = await import("@/lib/event-lineup-service");
      const fields = {
        ...(args.jabatan ? { role: args.jabatan as "ketua" } : {}),
        ...(args.wa !== undefined ? { phone: String(args.wa) } : {}),
        ...(args.tugas !== undefined ? { duties: String(args.tugas) } : {}),
      };
      if (existing) {
        await lineup.updateCrew(existing.id, { ...fields, ...(args.aktif !== undefined ? { status: args.aktif ? "aktif" : "nonaktif" } : {}) }, session);
        return { event: event.title, panitia: existing.name, aksi: "diubah" };
      }
      if (!args.jabatan) throw new AgentToolError("VALIDATION_ERROR", `Panitia "${String(args.nama)}" belum ada — isi jabatan untuk menambahkannya.`);
      await lineup.createCrew({ eventId: event.id, name: String(args.nama), role: args.jabatan as "ketua", ...fields }, session);
      return { event: event.title, panitia: args.nama, aksi: "ditambahkan" };
    },
  },
  {
    name: "simpan_tugas_panitia",
    title: "Tambah / ubah tugas panitia",
    description:
      "Tambah tugas panitia (judul, PIC = nama panitia, tenggat, prioritas) atau ubah tugas yang ada (cocok dari judul): status todo/proses/selesai/batal, PIC, tenggat. Owner.",
    write: true,
    domain: "event",
    risk: "R1",
    permission: "dashboard:read",
    input: taskInput,
    async run(session, args) {
      assertOwner(session);
      const event = await resolveEvent(args.event as string | undefined);
      const b = await board(session, event.id);
      const crew = args.pic ? findOne(b.crew.filter((c) => c.status === "aktif"), String(args.pic), "Panitia") : null;
      if (args.pic && !crew) throw new AgentToolError("PANITIA_TIDAK_DITEMUKAN", `Panitia aktif "${String(args.pic)}" tidak ada di ${event.title}.`, 404);
      const existing = findOne(b.tasks.map((t) => ({ ...t, name: t.title })), String(args.judul), "Tugas");
      const lineup = await import("@/lib/event-lineup-service");
      const fields = {
        ...(crew ? { crewId: crew.id } : {}),
        ...(args.tenggat ? { dueDate: String(args.tenggat) } : {}),
        ...(args.prioritas ? { priority: args.prioritas as "normal" } : {}),
        ...(args.catatan !== undefined ? { notes: String(args.catatan) } : {}),
      };
      if (existing) {
        await lineup.updateTask(existing.id, { ...fields, ...(args.status ? { status: args.status as "todo" } : {}) }, session);
        return { event: event.title, tugas: existing.title, aksi: "diubah" };
      }
      await lineup.createTask({ eventId: event.id, title: String(args.judul), ...fields }, session);
      return { event: event.title, tugas: args.judul, pic: crew?.name ?? null, aksi: "ditambahkan" };
    },
  },
  {
    name: "tempel_daftar_event",
    title: "Tempel daftar talent / panitia / sponsor",
    description:
      "Masukkan banyak talent, panitia, atau sponsor sekaligus dari teks yang ditempel (Excel/Sheets/WhatsApp; satu baris satu data; kolom dipisah tab, ';', '|' atau ' - '). Kolom talent: Nama|Jenis|Tagline|Instagram|Jam|Durasi|WA; panitia: Nama|Jabatan|WA|Tugas; sponsor: Nama|Paket|Nilai disepakati|Instagram|Nama kontak|WA. Satu baris salah = tidak ada yang disimpan; nama yang sudah ada dilewati. Sponsor = kesepakatan saja (tanpa uang masuk). Preview + konfirmasi. Owner.",
    write: true,
    domain: "event",
    risk: "R2",
    permission: "dashboard:read",
    input: z.object({ event: eventArg, jenis: z.enum(["talent", "panitia", "sponsor"]), teks: z.string().min(2).max(20_000) }),
    async preview(session, args) {
      assertOwner(session);
      const event = await resolveEvent(args.event as string | undefined);
      const rows = await parseRows(String(args.jenis), String(args.teks));
      return {
        aksi: `TEMPEL ${rows.length} ${String(args.jenis).toUpperCase()} ke ${event.title}`,
        baris: rows.map((r) => r.value),
        catatan: "Nama yang sudah ada akan dilewati.",
      };
    },
    async run(session, args) {
      assertOwner(session);
      const event = await resolveEvent(args.event as string | undefined);
      const rows = await parseRows(String(args.jenis), String(args.teks));
      const values = rows.map((r) => ({ ...(r.value as Record<string, unknown>), line: r.line }));
      if (args.jenis === "sponsor") {
        const { bulkCreateSponsors } = await import("@/lib/event-sponsor-service");
        return bulkCreateSponsors({ eventId: event.id, eventName: event.title, showOnWebsite: false, rows: values as never }, session);
      }
      const { bulkPaste } = await import("@/lib/event-lineup-service");
      return bulkPaste(
        args.jenis === "talent" ? { kind: "performer", eventId: event.id, status: "konfirmasi", rows: values as never } : { kind: "crew", eventId: event.id, rows: values as never },
        session,
      );
    },
  },
  {
    name: "simpan_sponsor",
    title: "Tambah / ubah sponsor event",
    description:
      "Tambah sponsor (nama + nilai disepakati) atau ubah sponsor yang ada di event (cocok dari nama): paket, nilai disepakati, Instagram, tautan website (https), tampil di website. Hanya KESEPAKATAN — uang masuk dicatat di Garage OS (Sponsor Event). Preview + konfirmasi. Owner.",
    write: true,
    domain: "event",
    risk: "R2",
    permission: "dashboard:read",
    input: z.object({
      event: eventArg,
      nama: z.string().trim().min(2).max(120),
      paket: z.string().trim().max(60).optional(),
      nilaiDisepakati: z.number().int().min(0).max(10_000_000_000).optional(),
      instagram: z.string().trim().max(80).optional(),
      website: z.string().trim().regex(/^https:\/\/\S+$/, "Tautan harus https://").max(300).optional(),
      tampilDiWebsite: z.boolean().optional(),
    }),
    async preview(session, args) {
      assertOwner(session);
      const event = await resolveEvent(args.event as string | undefined);
      const existing = await findSponsor(session, event, String(args.nama));
      return {
        aksi: `${existing ? "UBAH" : "TAMBAH"} SPONSOR ${existing?.name ?? String(args.nama)} — ${event.title}`,
        paket: args.paket ?? existing?.packageName ?? null,
        nilaiDisepakati: args.nilaiDisepakati !== undefined ? rupiah(Number(args.nilaiDisepakati)) : "tetap",
        tampilDiWebsite: args.tampilDiWebsite ?? existing?.showOnWebsite ?? false,
        catatan: "Kesepakatan saja — tidak ada uang yang dicatat masuk.",
      };
    },
    async run(session, args) {
      assertOwner(session);
      const event = await resolveEvent(args.event as string | undefined);
      const existing = await findSponsor(session, event, String(args.nama));
      const fields = {
        ...(args.paket !== undefined ? { packageName: String(args.paket) } : {}),
        ...(args.nilaiDisepakati !== undefined ? { agreedAmount: Number(args.nilaiDisepakati) } : {}),
        ...(args.instagram !== undefined ? { instagram: String(args.instagram) } : {}),
        ...(args.website !== undefined ? { websiteUrl: String(args.website) } : {}),
        ...(args.tampilDiWebsite !== undefined ? { showOnWebsite: Boolean(args.tampilDiWebsite) } : {}),
      };
      const sponsor = await import("@/lib/event-sponsor-service");
      if (existing) {
        await sponsor.updateSponsor(existing.id, fields, session);
        return { event: event.title, sponsor: existing.name, aksi: "diubah" };
      }
      if (args.nilaiDisepakati === undefined) throw new AgentToolError("VALIDATION_ERROR", "Sponsor baru wajib nilaiDisepakati (boleh 0 untuk barang/in-kind).");
      await sponsor.createSponsor({ eventId: event.id, eventName: event.title, eventDate: event.date ?? null, name: String(args.nama), agreedAmount: Number(args.nilaiDisepakati), ...fields }, session);
      return { event: event.title, sponsor: args.nama, aksi: "ditambahkan" };
    },
  },
];

async function findSponsor(session: GarageSession, event: { id: string; title: string }, nama: string) {
  const { listSponsors } = await import("@/lib/event-sponsor-service");
  const sp = (await listSponsors(session, { eventName: event.title })) as unknown as {
    sponsors: Array<{ id: string; name: string; eventId: string | null; packageName: string | null; showOnWebsite: boolean; status: string }>;
  };
  return findOne(
    (sp.sponsors ?? []).filter((s) => (!s.eventId || s.eventId === event.id) && s.status !== "batal"),
    nama,
    "Sponsor",
  );
}

async function parseRows(jenis: string, teks: string) {
  const paste = await import("@/lib/paste-list");
  const parsed = paste.markDuplicateNames(
    (jenis === "talent" ? paste.parseTalentRows(teks) : jenis === "panitia" ? paste.parseCrewRows(teks) : paste.parseSponsorRows(teks)) as Array<
      ReturnType<typeof paste.parseCrewRows>[number] & { value: { name: string } | null }
    >,
  );
  if (!parsed.length) throw new AgentToolError("VALIDATION_ERROR", "Tidak ada baris yang terbaca.");
  if (parsed.length > paste.PASTE_MAX_ROWS) throw new AgentToolError("VALIDATION_ERROR", `Maksimal ${paste.PASTE_MAX_ROWS} baris sekali tempel.`);
  const bad = parsed.filter((r) => r.errors.length);
  if (bad.length) {
    throw new AgentToolError("BARIS_SALAH", `Perbaiki dulu: ${bad.slice(0, 10).map((r) => `baris ${r.line}: ${r.errors.join(", ")}`).join("; ")}. Tidak ada yang disimpan.`);
  }
  return parsed;
}
