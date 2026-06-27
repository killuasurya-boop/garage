import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server-auth";
import { runGarageAiAgent } from "@/lib/garage-ai-providers";
import { resolveBrand } from "@/lib/garage-social-brands";

export async function POST(req: Request) {
  try {
    const session = await requirePermission("marketing:write");
    if (session.response) return session.response;
    const body = await req.json();
    const { type, segmentKey, objective, channel, campaignName, brandKey, contentPillar, topic } = body;

    let systemPrompt = "";
    if (type === "campaign-idea") {
      systemPrompt = `Anda adalah seorang expert Marketing Executive untuk F&B/Bengkel. 
Tugas: Hasilkan nama campaign yang catchy, kreatif, dan singkat berdasarkan parameter berikut.
Objective: ${objective}
Segment: ${segmentKey}
Berikan 1 ide nama campaign terbaik. Langsung jawab namanya, tanpa basa-basi, tanpa format markdown, tanpa tanda kutip.`;
    } else if (type === "broadcast-copy") {
      systemPrompt = `Anda adalah seorang Copywriter Marketing handal.
Tugas: Buat draft pesan broadcast (copywriting) yang persuasif, natural, dan sesuai untuk channel komunikasi yang dipilih. Gunakan emoji secukupnya jika sesuai.
Campaign Name: ${campaignName || "Promo Khusus"}
Objective: ${objective}
Segment: ${segmentKey}
Channel: ${channel}
Berikan 1 draf pesan terbaik. Langsung jawab teksnya, tanpa basa-basi, tanpa tanda kutip. Jangan mengembalikan format markdown.`;
    } else if (type === "social-media-content") {
      const brand = resolveBrand(brandKey);
      systemPrompt = `Anda adalah Social Media Specialist untuk brand "${brand.name}".
Role brand: ${brand.role}
Positioning: ${brand.positioning || "-"}
Pilar konten: ${contentPillar}
Topik utama: ${topic}

Tugas: Buat konten media sosial (title, caption panjang yang menarik, dan hashtags relevan) berdasarkan topik dan pilar konten.
Kembalikan respon DALAM FORMAT JSON SAJA seperti ini:
{
  "title": "Judul konten",
  "caption": "Isi caption lengkap dengan emoji...",
  "hashtags": ["#tag1", "#tag2"]
}
Jangan tambahkan teks markdown atau basa-basi apa pun selain JSON valid.`;
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const result = await runGarageAiAgent({
      context: { marketingContext: systemPrompt, instructions: systemPrompt },
      intent: "general_assist",
      profile: "fast",
      dataAccessLevel: "operational",
    });

    if (type === "social-media-content") {
      try {
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        const rawJson = jsonMatch ? jsonMatch[0] : result.response;
        const parsed = JSON.parse(rawJson);
        return NextResponse.json({ result: parsed });
      } catch {
        return NextResponse.json({ error: "AI failed to return valid JSON", raw: result.response }, { status: 500 });
      }
    }

    return NextResponse.json({ result: result.response });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate AI content" },
      { status: 500 },
    );
  }
}
