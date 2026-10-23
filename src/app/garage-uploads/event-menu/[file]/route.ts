import { serveUploadedImage } from "@/lib/uploaded-image-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  return serveUploadedImage("event-menu", file);
}
