// Hasilkan src/lib/api-route-catalog.generated.ts dari src/app/api/**/route.ts
// (method yang diekspor + baris komentar pertama). Dipakai tool MCP
// `katalog_endpoint` supaya ChatGPT tahu endpoint apa yang bisa diubah.
// Jalankan: npx tsx scripts/generate-api-catalog.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { renderApiCatalog, scanApiRoutes } from "../src/lib/api-route-scan";

const root = process.cwd();
const routes = scanApiRoutes(join(root, "src/app/api"));
writeFileSync(join(root, "src/lib/api-route-catalog.generated.ts"), renderApiCatalog(routes));
console.log(`${routes.length} route ditulis ke src/lib/api-route-catalog.generated.ts`);
