import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Auto-Fill AI: baca CV (PDF/gambar) langsung via Gemini multimodal, ekstrak
// field form jadi JSON. Tidak ada data karangan — field kosong kalau tak ada.
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 6 * 1024 * 1024;

const PROMPT = `Kamu pembaca CV. Ekstrak data dari CV/resume berikut menjadi JSON valid SAJA (tanpa markdown, tanpa penjelasan). Skema:
{"fullName":"","email":"","whatsapp":"nomor HP angka","domicile":"kota domisili","birthDate":"YYYY-MM-DD atau kosong","education":"pendidikan terakhir + jurusan","mainSkill":"skill utama paling relevan","skillLevel":"salah satu persis: Pemula | Menengah | Mahir | Berpengalaman","lastExperience":"pengalaman kerja terakhir, singkat 1 baris","motivation":""}
Aturan: kalau suatu field tidak ada di CV, isi string kosong "". JANGAN mengarang data. Output HANYA objek JSON.`;

export async function POST(request: Request) {
  const limited = rateLimit(request, "recruitment-parse-cv", { limit: 6, windowMs: 60_000 });
  if (limited) return limited;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Auto-Fill AI belum dikonfigurasi. Silakan isi form manual." },
      { status: 503 },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ ok: false, error: "File tidak ditemukan." }, { status: 400 });
    }
    if (!ALLOWED.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: "Auto-Fill AI hanya mendukung PDF, JPG, PNG, atau WebP." },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "File terlalu besar (maks 6 MB)." }, { status: 400 });
    }

    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_PARSE_MODEL || "gemini-2.0-flash",
    });

    const result = await model.generateContent([
      { inlineData: { data: base64, mimeType: file.type } },
      { text: PROMPT },
    ]);
    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { ok: false, error: "AI tidak dapat membaca CV ini. Silakan isi manual." },
        { status: 422 },
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return NextResponse.json(
        { ok: false, error: "Hasil AI tidak valid. Silakan isi manual." },
        { status: 422 },
      );
    }

    // Whitelist field yang boleh masuk form (hindari field tak terduga).
    const allowedKeys = [
      "fullName",
      "email",
      "whatsapp",
      "domicile",
      "birthDate",
      "education",
      "mainSkill",
      "skillLevel",
      "lastExperience",
      "motivation",
    ] as const;
    const data: Record<string, string> = {};
    for (const k of allowedKeys) {
      const v = parsed[k];
      if (typeof v === "string") data[k] = v.trim();
    }

    return NextResponse.json({
      ok: true,
      data,
      message: "Data CV dibaca AI. Periksa & lengkapi sebelum kirim.",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Gagal memproses CV." },
      { status: 500 },
    );
  }
}
