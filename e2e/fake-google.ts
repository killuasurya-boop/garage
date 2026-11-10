// "Google palsu" untuk E2E login member (server HTTP lokal di port 3199, dipakai lewat MEMBER_GOOGLE_TEST_ENDPOINT yang
// hanya berlaku di luar produksi). Menjalankan authorize → token (cek PKCE + client secret) → jwks seperti Google asli,
// dengan ID token RS256 bertanda tangan kunci uji. Tidak ada jaringan keluar.
import { createHash, createSign, generateKeyPairSync, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

export const FAKE_GOOGLE_PORT = 3199;
const CLIENT_ID = "e2e-client.apps.googleusercontent.com";
const CLIENT_SECRET = "e2e-secret";

export type FakeIdentity = { sub: string; email: string; name: string; emailVerified?: boolean };

export function startFakeGoogle() {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "e2e-key", alg: "RS256", use: "sig" };
  const codes = new Map<string, { nonce: string; challenge: string; redirectUri: string; identity: FakeIdentity }>();
  let nextIdentity: FakeIdentity = { sub: "e2e-sub", email: "e2e@example.com", name: "E2E Google" };
  const calls: string[] = [];

  function idToken(identity: FakeIdentity, nonce: string) {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "e2e-key", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub: identity.sub,
        email: identity.email,
        email_verified: identity.emailVerified ?? true,
        name: identity.name,
        nonce,
        iat: now,
        exp: now + 600,
      }),
    ).toString("base64url");
    const sig = createSign("RSA-SHA256").update(`${header}.${body}`).sign(privateKey).toString("base64url");
    return `${header}.${body}.${sig}`;
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${FAKE_GOOGLE_PORT}`);
    calls.push(url.pathname);
    if (url.pathname === "/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri") ?? "";
      const ok =
        url.searchParams.get("client_id") === CLIENT_ID &&
        url.searchParams.get("response_type") === "code" &&
        url.searchParams.get("code_challenge_method") === "S256" &&
        url.searchParams.get("scope") === "openid email profile";
      if (!ok || !redirectUri) {
        res.writeHead(400).end("bad authorize request");
        return;
      }
      const code = randomBytes(16).toString("hex");
      codes.set(code, {
        nonce: url.searchParams.get("nonce") ?? "",
        challenge: url.searchParams.get("code_challenge") ?? "",
        redirectUri,
        identity: nextIdentity,
      });
      const back = new URL(redirectUri);
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { Location: back.toString() }).end();
      return;
    }
    if (url.pathname === "/token" && req.method === "POST") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const form = new URLSearchParams(raw);
        const entry = codes.get(form.get("code") ?? "");
        const verifier = form.get("code_verifier") ?? "";
        const pkceOk = entry && createHash("sha256").update(verifier).digest("base64url") === entry.challenge;
        if (!entry || !pkceOk || form.get("client_secret") !== CLIENT_SECRET || form.get("redirect_uri") !== entry.redirectUri) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        codes.delete(form.get("code") ?? "");
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id_token: idToken(entry.identity, entry.nonce) }));
      });
      return;
    }
    if (url.pathname === "/jwks") {
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404).end();
  });

  return {
    listen: () => new Promise<void>((resolve) => server.listen(FAKE_GOOGLE_PORT, "127.0.0.1", () => resolve())),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    setNextIdentity: (identity: FakeIdentity) => {
      nextIdentity = identity;
    },
    calls,
  };
}
