import "dotenv/config";

import { runShiftCopilotJob } from "@/lib/garage-ai-shift-copilot";

async function main() {
  const result = await runShiftCopilotJob("CLI shift-copilot");
  console.log("GARAGE AI Shift Copilot selesai.");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
