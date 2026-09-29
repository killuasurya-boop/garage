import { z } from "zod";

import { fail, ok, readJson } from "@/lib/api-response";
import { getSocialPosts, normalizeSocialPost, saveSocialPosts } from "@/lib/garage-service";
import { requirePermission } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Publik: landing menampilkan feed sosmed. Owner isi link dari modul Website.
export async function GET() {
  return ok(await getSocialPosts());
}

const socialPostsSchema = z.object({
  items: z
    .array(
      z.object({
        platform: z.enum(["instagram", "tiktok", "youtube", "facebook"]),
        url: z.string().trim().url("Link tidak valid.").max(400),
        title: z.string().trim().max(80).default(""),
      }),
    )
    .max(6, "Maksimal 6 postingan."),
});

export async function PUT(request: Request) {
  const session = await requirePermission("website:manage");
  if (session.response) return session.response;

  const body = await readJson(request, socialPostsSchema);
  if (body.error) return body.error;

  const invalid = body.data.items.find((item) => !normalizeSocialPost(item));
  if (invalid) {
    return fail(
      400,
      "SOCIAL_POST_INVALID",
      `Link ${invalid.url} harus https dan berasal dari ${invalid.platform}.`,
    );
  }

  return ok(await saveSocialPosts(body.data.items, session.data.user.id));
}
