import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { GET } from "@/app/garage-uploads/event-menu/[file]/route";

let root = "";
const previous = process.env.GARAGE_PROJECT_ROOT;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "garage-uploads-"));
  fs.mkdirSync(path.join(root, "public", "garage-uploads", "event-menu"), { recursive: true });
  fs.writeFileSync(path.join(root, "public", "garage-uploads", "event-menu", "paket-1.webp"), Buffer.from("RIFFtestWEBP"));
  process.env.GARAGE_PROJECT_ROOT = root;
});
afterAll(() => {
  process.env.GARAGE_PROJECT_ROOT = previous;
  fs.rmSync(root, { recursive: true, force: true });
});

const call = (file: string) => GET(new Request(`http://localhost/garage-uploads/event-menu/${file}`), { params: Promise.resolve({ file }) });

describe("foto paket event disajikan dari volume upload", () => {
  it("mengirim file yang diunggah saat runtime dengan content-type gambar", async () => {
    const response = await call("paket-1.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
  });
  it("menolak nama file berbahaya dan memberi gambar cadangan bila file tidak ada", async () => {
    expect((await call("..%2Fsecret.webp")).status).toBe(400);
    const missing = await call("tidak-ada.webp");
    expect(missing.headers.get("content-type")).toContain("image/svg+xml");
  });
});
