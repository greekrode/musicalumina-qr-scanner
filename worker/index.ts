// Scanner Worker: serves the PWA (static assets) and POST /api/checkin.
// Same origin as the app, so there is no CORS and no preflight per scan.
//
// One scan = verify staff Clerk session (cached JWKS) + verify pass HMAC
// (local) + one Supabase RPC that checks in and returns the participant.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { decodePass } from "./pass";

export interface Env {
  ASSETS: Fetcher;
  CLERK_ISSUER: string; // e.g. https://clerk.musicalumina.com
  CLERK_AUTHORIZED_PARTIES: string; // comma-separated origins
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string; // secret
  QR_PASS_SECRET: string; // secret, must match musicalumina-tools/.env
}

// QR check-in roles: admin and reg_staff. Must match src/components/AuthLayout.tsx.
// Accepts the legacy "org:admin" spelling some accounts may still carry.
const STAFF_ROLES = new Set(["admin", "reg_staff"]);
const isStaffRole = (role: unknown) =>
  typeof role === "string" && STAFF_ROLES.has(role.replace(/^org:/, ""));
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function staffUserId(request: Request, env: Env): Promise<string | null> {
  const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  jwks ??= createRemoteJWKSet(new URL(`${env.CLERK_ISSUER}/.well-known/jwks.json`));
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: env.CLERK_ISSUER, algorithms: ["RS256"] });
    const parties = env.CLERK_AUTHORIZED_PARTIES.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parties.includes(String(payload.azp))) return null; // empty config fails closed
    // Role lives in Clerk publicMetadata (backend-writable only), exposed by the
    // session-token template `{ "metadata": "{{user.public_metadata}}" }`.
    if (!isStaffRole((payload.metadata as { role?: unknown } | undefined)?.role)) return null;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

async function checkin(request: Request, env: Env): Promise<Response> {
  const userId = await staffUserId(request, env);
  if (!userId) return json({ error: "Your session is not allowed to check in passes. Sign in again." }, 401);

  const body = (await request.json().catch(() => null)) as { pass?: unknown } | null;
  if (typeof body?.pass !== "string") return json({ error: "Missing pass" }, 400);

  let pass;
  try {
    pass = await decodePass(env.QR_PASS_SECRET, body.pass.trim());
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid pass" }, 422);
  }

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/check_in_pass`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_registration_id: pass.registrationId, p_kind: pass.kind, p_checked_in_by: userId }),
  });
  if (!response.ok) {
    console.error("check_in_pass failed", response.status, await response.text());
    return json({ error: "Check-in service unavailable. Try again." }, 502);
  }
  const result = (await response.json()) as { error?: string };
  if (result.error) return json({ error: "This registration is not eligible for check-in." }, 404);

  return json(result);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/checkin") {
      return request.method === "POST" ? checkin(request, env) : json({ error: "Method not allowed" }, 405);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
