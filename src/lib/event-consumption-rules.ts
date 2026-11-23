// Rekap konsumsi event (Owner 22 Nov 2026, pindahan Dashboard Penyelenggara platform). Murni, tanpa DB.
// Panitia aktif + talent terkonfirmasi + porsi tambahan (MC, tamu) → jumlah porsi. Data diambil dari Lineup & Panitia
// (dan isian pendaftaran website yang tertaut: jumlah orang, waktu hadir, catatan makanan). Tanpa kontak / uang.

export const ATTENDANCE_LABEL: Record<string, string> = {
  persiapan: "Persiapan (H-1)",
  "hari-h-penuh": "Hari H penuh",
  "hari-h-sore": "Hari H sore–malam",
};

export type ConsumptionCrewInput = { name: string; role: string; members: number | null; attendance: string | null; diet: string | null };
export type ConsumptionTalentInput = { name: string; kind: string; members: number | null; diet: string | null; funded: boolean };

export type ConsumptionRow = {
  group: "Panitia" | "Talent berhonor" | "Talent non-honor";
  name: string;
  role: string;
  members: number;
  attendance: string;
  diet: string;
};

const people = (n: number | null) => (Number.isFinite(n) && (n ?? 0) > 0 ? Math.min(100, Math.round(n as number)) : 1);

export function buildConsumption(input: {
  crew: ConsumptionCrewInput[];
  talents: ConsumptionTalentInput[];
  extraPortions: number;
  crewWaiting: number;
}) {
  const crew: ConsumptionRow[] = input.crew.map((c) => ({
    group: "Panitia",
    name: c.name,
    role: c.role,
    members: people(c.members),
    attendance: (c.attendance && ATTENDANCE_LABEL[c.attendance]) || "-",
    diet: c.diet?.trim() || "-",
  }));
  const talents: ConsumptionRow[] = input.talents.map((t) => ({
    group: t.funded ? "Talent berhonor" : "Talent non-honor",
    name: t.name,
    role: t.kind,
    members: people(t.members),
    attendance: "Hari H",
    diet: t.diet?.trim() || "-",
  }));
  const extra = Math.max(0, Math.min(1000, Math.round(input.extraPortions || 0)));
  const sum = (rows: ConsumptionRow[]) => rows.reduce((s, r) => s + r.members, 0);
  return {
    rows: [...crew, ...talents],
    totals: {
      crew: sum(crew),
      crewWaiting: input.crewWaiting,
      fundedTalent: sum(talents.filter((t) => t.group === "Talent berhonor")),
      volunteerTalent: sum(talents.filter((t) => t.group === "Talent non-honor")),
      extra,
      portions: sum(crew) + sum(talents) + extra,
    },
  };
}

export type Consumption = ReturnType<typeof buildConsumption>;

/** CSV rekap (BOM UTF-8, sel diawali = + - @ diberi apostrof agar tidak dieksekusi spreadsheet). */
export function consumptionCsv(data: Consumption): string {
  const safe = (v: unknown) => {
    const t = String(v ?? "");
    return /^[=+\-@]/.test(t) ? `'${t}` : t;
  };
  const out: unknown[][] = [["Kelompok", "Nama", "Peran/Jenis", "Orang", "Kehadiran", "Catatan makanan"]];
  for (const r of data.rows) out.push([r.group, r.name, r.role, r.members, r.attendance, r.diet]);
  if (data.totals.extra) out.push(["Tambahan", "MC / tamu / lainnya", "", data.totals.extra, "", ""]);
  out.push([]);
  out.push(["TOTAL PORSI", "", "", data.totals.portions, "", ""]);
  return "﻿" + out.map((r) => r.map((c) => `"${safe(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}
