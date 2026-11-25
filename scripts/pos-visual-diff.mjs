#!/usr/bin/env node
// Bandingkan dua folder screenshot harness tema POS (e2e/pos-theme-visual.spec.ts).
// Pakai: node scripts/pos-visual-diff.mjs <folder-sebelum> <folder-sesudah> [--out=<folder-diff>]
// Cetak rasio piksel beda per gambar; tulis gambar diff (merah = beda) bila ada selisih. Exit 1 bila ada yang melebihi
// ambang (default 0,001 = 0,1% piksel, untuk anti-alias font).
import fs from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";

const [before, after] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const outArg = process.argv.find((arg) => arg.startsWith("--out="));
const thresholdArg = process.argv.find((arg) => arg.startsWith("--max="));
const maxRatio = thresholdArg ? Number(thresholdArg.slice(6)) : 0.001;
const outDir = outArg ? outArg.slice(6) : path.join(after ?? ".", "_diff");
if (!before || !after) {
  console.error("Pakai: node scripts/pos-visual-diff.mjs <sebelum> <sesudah> [--out=dir] [--max=0.001]");
  process.exit(2);
}

/** Selisih per kanal > 8 dianggap beda (abaikan dithering kecil). */
function diffImages(a, b) {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const out = new PNG({ width, height });
  let changed = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const ia = (y * a.width + x) * 4;
      const ib = (y * b.width + x) * 4;
      const io = (y * width + x) * 4;
      const delta = Math.max(
        Math.abs(a.data[ia] - b.data[ib]),
        Math.abs(a.data[ia + 1] - b.data[ib + 1]),
        Math.abs(a.data[ia + 2] - b.data[ib + 2]),
      );
      if (delta > 8) {
        changed += 1;
        out.data[io] = 255;
        out.data[io + 1] = 0;
        out.data[io + 2] = 0;
        out.data[io + 3] = 255;
      } else {
        const grey = Math.round((a.data[ia] + a.data[ia + 1] + a.data[ia + 2]) / 3);
        out.data[io] = out.data[io + 1] = out.data[io + 2] = grey;
        out.data[io + 3] = 70;
      }
    }
  }
  const sizeMismatch = a.width !== b.width || a.height !== b.height;
  return { ratio: changed / (width * height), changed, out, sizeMismatch };
}

let failed = 0;
const files = fs.readdirSync(before).filter((name) => name.endsWith(".png")).sort();
for (const name of files) {
  const afterPath = path.join(after, name);
  if (!fs.existsSync(afterPath)) {
    console.log(`HILANG  ${name}`);
    failed += 1;
    continue;
  }
  const result = diffImages(PNG.sync.read(fs.readFileSync(path.join(before, name))), PNG.sync.read(fs.readFileSync(afterPath)));
  const bad = result.ratio > maxRatio || result.sizeMismatch;
  if (result.changed) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, name), PNG.sync.write(result.out));
  }
  console.log(`${bad ? "BEDA   " : "OK     "} ${name}  ${(result.ratio * 100).toFixed(3)}% (${result.changed} px)${result.sizeMismatch ? " ukuran beda" : ""}`);
  if (bad) failed += 1;
}
console.log(`${files.length} gambar, ${failed} melebihi ambang ${(maxRatio * 100).toFixed(2)}%`);
process.exit(failed ? 1 : 0);
