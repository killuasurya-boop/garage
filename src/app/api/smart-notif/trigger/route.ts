import { NextResponse } from "next/server";
import {
  processSmartNotifTrigger,
  SmartNotifPayloadSchema,
} from "@/lib/smart-notif-service";
import { requireGarageSession } from "@/lib/server-auth";
import { getDb } from "@/db";
import { notificationLogs } from "@/db/schema";

export async function POST(req: Request) {
  try {
    // 1. Auth check
    const session = await requireGarageSession();
    if (session.response) return session.response;

    // 2. Parse body
    const body = await req.json();
    const { triggerKey, payload, autoGenerateVoiceAsset } = body;

    if (!triggerKey || typeof triggerKey !== "string") {
      return NextResponse.json(
        { error: "triggerKey is required" },
        { status: 400 }
      );
    }

    const parsedPayload = SmartNotifPayloadSchema.parse(payload || {});

    // 3. Process the trigger
    const result = await processSmartNotifTrigger(triggerKey, parsedPayload, {
      autoGenerateVoiceAsset: autoGenerateVoiceAsset === true,
    });

    // 4. Save notification log
    try {
      await getDb().insert(notificationLogs).values({
        triggerKey,
        tableNo: parsedPayload.tableNo || null,
        orderNo: parsedPayload.orderNo || null,
        audioUrl: result.audioUrl || null,
        audioSource: result.audioSource || null,
        voiceGeneratedAt: result.audioSource === "generated" ? new Date() : null,
        ttsProvider: "gemini-3.1-flash-tts",
      });
    } catch (logError) {
      console.error("[POST /api/smart-notif/trigger] DB Log Error:", logError);
      // Non-blocking error, do not fail the request
    }

    // 5. Return result
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[POST /api/smart-notif/trigger] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
