import { NextResponse } from "next/server";

import { fail, ok } from "@/lib/api-response";
import { RegistrationError } from "@/lib/event-registration-service";

/** Staf (Owner/Panitia): RegistrationError → { error: { code, message } }. Error lain dari modul lineup/sponsor juga dipetakan. */
export async function registrationRoute<T>(run: () => Promise<T>, status = 200) {
  try {
    return ok(await run(), status === 200 ? undefined : { status });
  } catch (error) {
    if (error instanceof RegistrationError) return fail(error.status, error.code, error.message);
    const known = error as { name?: string; code?: string; status?: number; message?: string };
    if ((known.name === "LineupError" || known.name === "SponsorError") && known.code) return fail(known.status ?? 400, known.code, known.message ?? "Gagal.");
    throw error;
  }
}

const DEFAULT_API = "http://garage-event-platform:4400/event/api/events";

/**
 * Form halaman event platform: { error: "pesan" } (dibaca daftar.js), bukan { error: { code } }.
 * `fallback` = teruskan ke platform (event belum tertaut ke Garage / pendaftaran lama di platform).
 */
export async function publicRegistrationRoute(run: () => Promise<unknown | null>, fallback: () => Promise<Response>) {
  try {
    const result = await run();
    if (result === null) return fallback();
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RegistrationError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error("[public/gigs/registration]", error instanceof Error ? error.message : "gagal");
    return NextResponse.json({ error: "Layanan pendaftaran sedang bermasalah. Coba lagi sebentar." }, { status: 500 });
  }
}

/** Teruskan POST JSON apa adanya ke platform GIGS (jaringan internal); balasan platform dikirim balik apa adanya. */
export async function forwardToPlatform(request: Request, slug: string, path: string, body: unknown) {
  const api = process.env.GARAGE_EVENT_API || DEFAULT_API;
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/.test(slug) || !/\/api\/events\/?$/.test(api)) return NextResponse.json({ error: "Event tidak ditemukan." }, { status: 404 });
  try {
    const res = await fetch(api.replace(/\/api\/events\/?$/, `/${slug}/api/public/${path}`), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Real-IP": request.headers.get("x-real-ip") ?? "" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return new Response(await res.text(), { status: res.status, headers: { "Content-Type": res.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Layanan pendaftaran belum tersedia." }, { status: 502 });
  }
}
