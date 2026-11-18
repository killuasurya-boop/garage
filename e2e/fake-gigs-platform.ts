// Platform GIGS palsu untuk E2E: melayani GET /event/api/events dengan SATU event online yang judulnya sama dengan
// master event Garage OS. Isi lineup bisa diganti per tes (setEvent). Port tetap 3198 (lihat e2e/start-server.mjs).
import { createServer, type Server } from "node:http";

export const FAKE_GIGS_PORT = 3198;

export type FakeGigsEvent = {
  slug: string;
  name: string;
  lineup: Array<{ name: string; type: string; logo?: string }>;
  /** Slot panggung dashboard panitia (`/event/<slug>/api/public/lineup`). */
  slots?: Array<{ name: string; category: string; startTime?: string; durationMin?: number; performer?: string; logo?: string }>;
  /** RAB untuk /event/<slug>/api/public/config (opsional). */
  budget?: Array<{ code: string; name: string; budget: number; purpose?: string; pic?: string }>;
};

export function startFakeGigsPlatform(initial: FakeGigsEvent) {
  let current = initial;
  const server: Server = createServer((req, res) => {
    if (req.method === "GET" && req.url === `/event/${current.slug}/api/public/config`) {
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ open: true, locked: false, sponsorMin: 300000, finance: { target: 0, budgetLines: current.budget ?? [], notes: [] } }));
      return;
    }
    if (req.method === "GET" && req.url === `/event/${current.slug}/api/sponsor/summary`) {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ verified_amount: 0, verified_expense: 0, balance: 0, transaction_count: 0, income_history: [], expense_history: [], budget_status: [] }));
      return;
    }
    if (req.method === "GET" && req.url === `/event/${current.slug}/public/app.js`) {
      // Potongan app.js platform asli (jangkar tambalan Garage OS).
      const js = "const LINEUPS = [{ name: 'SURAU', role: 'X' }];\nasync function loadPublicLineup() {\n  try {\n      LINEUPS.splice(0, 1, { name: 'NEXT', isCta: true });\n      renderLineups();\n    } catch {}\n}\n";
      res.writeHead(200, { "content-type": "application/javascript" }).end(js);
      return;
    }
    if (req.method === "GET" && req.url === `/event/${current.slug}/api/public/lineup`) {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ slots: current.slots ?? [] }));
      return;
    }
    if (req.method !== "GET" || !req.url?.startsWith("/event/api/events")) {
      res.writeHead(404).end();
      return;
    }
    const start = new Date(Date.now() + 3 * 24 * 3_600_000);
    const body = {
      events: [
        {
          slug: current.slug,
          name: current.name,
          venue: "Garage Coffee Tebing Tinggi",
          date: start.toISOString(),
          endsAt: new Date(start.getTime() + 5 * 3_600_000).toISOString(),
          status: "segera",
          online: true,
          url: `/event/${current.slug}`,
          promo: { headline: `${current.name} *E2E*`, programs: ["Band lokal"], lineup: current.lineup },
          links: { daftarSponsor: `/event/${current.slug}/daftar?tipe=sponsor`, daftarKreator: `/event/${current.slug}/daftar?tipe=kreator` },
        },
      ],
    };
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body));
  });
  return {
    setEvent: (next: FakeGigsEvent) => {
      current = next;
    },
    listen: () => new Promise<void>((resolve) => server.listen(FAKE_GIGS_PORT, "127.0.0.1", () => resolve())),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
