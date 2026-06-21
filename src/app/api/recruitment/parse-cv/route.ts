import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Ini adalah mock endpoint AI Parsing karena setup lengkap membutuhkan provider konfigurasi
// dan integrasi OCR/PDF parser yang tidak tersedia di environment ini.
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json({ ok: false, error: "File tidak ditemukan" }, { status: 400 });
    }

    // Simulasi delay AI parsing
    await new Promise(r => setTimeout(r, 1500));

    // Mock response dari AI
    const mockParsedData = {
      fullName: "Budi Santoso",
      email: "budi.santoso.mock@example.com",
      whatsapp: "081234567890",
      education: "S1 Sistem Informasi, Universitas Contoh",
      experienceDuration: "2 Tahun",
      lastExperience: "Barista Part-time di Kopi Kenangan",
      skills: ["Customer Service", "Latte Art", "Point of Sales (POS)"],
      confidenceScore: 0.88
    };

    return NextResponse.json({
      ok: true,
      data: mockParsedData,
      message: "Parsing berhasil menggunakan AI (Mock Mode)."
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: "Gagal memproses file." }, { status: 500 });
  }
}
