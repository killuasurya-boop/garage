import fs from "fs";

const path = "src/components/garage/garage-app.tsx";
const lines = fs.readFileSync(path, "utf8").split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith("type FinanceTab"));
const end = lines.findIndex((l) => l.startsWith("type CrmTab"));
if (start < 0 || end < 0) {
  console.error("markers not found", start, end);
  process.exit(1);
}
const next = [...lines.slice(0, start), ...lines.slice(end)];
fs.writeFileSync(path, next.join("\n"));
console.log("Removed lines", start + 1, "to", end);
