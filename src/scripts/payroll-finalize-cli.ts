// CLI wrapper untuk cron finalisasi payroll harian.
//
// Usage:
//   tsx src/scripts/payroll-finalize-cli.ts               # finalisasi H-1
//   tsx src/scripts/payroll-finalize-cli.ts --date=today  # finalisasi hari ini
//   tsx src/scripts/payroll-finalize-cli.ts --date=2026-07-05
//
// Di VPS dipanggil oleh systemd timer jam 23:59.

import { jakartaDateKey } from "@/lib/attendance";
import { finalizePayrollDay, finalizeYesterdayIfNeeded } from "@/lib/garage-payroll-cron";

function parseArgs(argv: string[]): { date?: string } {
  const out: { date?: string } = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--date=")) out.date = arg.slice("--date=".length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const now = new Date();
  let target: string | undefined;
  if (args.date === "today") target = jakartaDateKey(now);
  else if (args.date && /^\d{4}-\d{2}-\d{2}$/.test(args.date)) target = args.date;

  const result = target
    ? await finalizePayrollDay(target, now)
    : await finalizeYesterdayIfNeeded(now);

  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exit(2);
}

main().catch((err) => {
  console.error("PAYROLL_FINALIZE_ERROR", err);
  process.exit(1);
});
