// Six nominal GPS intervals. This is freshness of telemetry, not a delivery SLA.
export const COURIER_LOCATION_FRESH_MS = 90_000;

export function isCourierLocationStale(at: string | number | null, nowMs: number) {
  const time = typeof at === "string" ? Date.parse(at) : at;
  return time == null || !Number.isFinite(time) || nowMs - time > COURIER_LOCATION_FRESH_MS;
}

/** A location is acknowledged only after the server accepts its timestamp. */
export async function syncCourierLocations(
  ids: string[],
  send: (id: string) => Promise<{ ok: boolean; at: string }>,
) {
  const results = await Promise.allSettled(ids.map((id) => Promise.resolve().then(() => send(id))));
  const times = results.flatMap((result) => {
    if (result.status !== "fulfilled" || !result.value.ok) return [];
    const time = Date.parse(result.value.at);
    return Number.isFinite(time) ? [time] : [];
  });
  return {
    failed: ids.length - times.length,
    acceptedAt: times.length ? Math.min(...times) : null,
  };
}
