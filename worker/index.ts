// Scanner Worker: serves the PWA (static assets) and the staff API.
// Same origin as the app, so there is no CORS and no preflight per scan.
//
//   POST /api/checkin  verify staff Clerk session (cached JWKS) + pass HMAC
//                      (local), then in parallel: the check-in RPC
//                      (check_in_pass for registration passes,
//                      check_in_customer_pass for customer teachers) and
//                      scanner_pass_context (where the holder plays, their tickets).
//   POST /api/tickets  set the tickets a scanned pass holds for one session
//                      (lowering or removing; once the event has a ticket
//                      price, the desk buys through a payment route instead).
//   POST /api/payments/manual  cash or bank transfer for more tickets: stores
//                      the transfer photo, then record_ticket_payment.
//   POST /api/payments start a QRIS payment for more tickets: holds the seats
//                      (start_ticket_payment) and creates a Mayar QR for
//                      ticket price × tickets + a 1–9 unique code.
//   POST /api/payments/status  the desk polls this every second: reads Mayar's
//                      latest payme credits and settle_ticket_payment adds the
//                      tickets once a matching credit lands (or cancels).
//   GET  /api/payments/unclaimed  Mayar credits that landed after their QR was
//                      cancelled or lapsed, with the QRs they could pay.
//   POST /api/payments/claim  staff add such a QR's tickets for one credit.
//   GET  /api/event    the ongoing festival's running order, check-ins and
//                      tickets left per session (Participants tab + navbar).
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { createQrCode, MayarError, recentPaymeCredits, type PaymeCredit } from "./mayar";
import { decodePass, type Pass } from "./pass";

export interface Env {
  ASSETS: Fetcher;
  CLERK_ISSUER: string; // e.g. https://clerk.musicalumina.com
  CLERK_AUTHORIZED_PARTIES: string; // comma-separated origins
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string; // secret
  QR_PASS_SECRET: string; // secret, must match musicalumina-tools/.env
  MAYAR_TOKEN: string; // secret, Mayar app bearer token for QRIS; rotate when it expires
}

// QR check-in roles: admin and reg_staff. Must match src/lib/staff.ts.
// Accepts the legacy "org:admin" spelling some accounts may still carry.
const STAFF_ROLES = new Set(["admin", "reg_staff"]);
const isStaffRole = (role: unknown) =>
  typeof role === "string" && STAFF_ROLES.has(role.replace(/^org:/, ""));
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

// Problems with the token itself. Anything else (Clerk key endpoint down or
// slow, network) is not the staff member's fault, so it must not say "sign in again".
const AUTH_FAILURES = [
  errors.JWTExpired, errors.JWTClaimValidationFailed, errors.JWTInvalid, errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed, errors.JWKSNoMatchingKey, errors.JWKSMultipleMatchingKeys, errors.JOSEAlgNotAllowed,
];
class VerifierUnavailable extends Error {}
class ServiceUnavailable extends Error {
  constructor(readonly status: 502 | 503) {
    super(`Supabase ${status}`);
  }
}

const MAX_TICKETS = 999; // must match set_session_tickets / start_ticket_payment
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  } catch (error) {
    if (AUTH_FAILURES.some((E) => error instanceof E)) return null;
    throw new VerifierUnavailable(String(error));
  }
}

/** The staff user id, or the error response to send instead. */
async function authorize(request: Request, env: Env): Promise<string | Response> {
  try {
    const userId = await staffUserId(request, env);
    return userId ?? json({ error: "Your session is not allowed to use the check-in desk. Sign in again." }, 401);
  } catch (error) {
    console.error("session verification unavailable", error);
    return json({ error: "Could not verify your session right now. Try again in a moment." }, 503);
  }
}

async function rpc(env: Env, name: string, args: object): Promise<Record<string, unknown> | null> {
  let response: Response;
  try {
    response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(7000),
    });
  } catch (error) {
    console.error(`${name} unreachable`, error);
    throw new ServiceUnavailable(503);
  }
  if (!response.ok) {
    console.error(`${name} failed`, response.status, await response.text());
    throw new ServiceUnavailable(502);
  }
  return (await response.json()) as Record<string, unknown> | null;
}

/** Who a pass belongs to, in the shape the ticket RPCs take. */
function holderArgs(pass: Pass) {
  return pass.kind === "customer"
    ? { p_registration_id: null, p_customer_id: pass.customerId, p_event_id: pass.eventId, p_holder: "customer" }
    : {
        p_registration_id: pass.registrationId,
        p_customer_id: null,
        p_event_id: null,
        // A group entry holds tickets per performer, like its check-ins.
        p_holder: pass.kind === "performer" ? `performer:${pass.performer}` : pass.kind,
      };
}

/** The signed pass from a JSON or multipart body (bank transfer photos), and the rest of the body. */
async function readPass(request: Request, env: Env): Promise<{ pass: Pass; body: Record<string, unknown> } | Response> {
  const body = (request.headers.get("Content-Type") ?? "").startsWith("multipart/form-data")
    ? await request.formData().then((form) => Object.fromEntries(form), () => null)
    : ((await request.json().catch(() => null)) as Record<string, unknown> | null);
  if (typeof body?.pass !== "string") return json({ error: "Missing pass" }, 400);
  try {
    return { pass: await decodePass(env.QR_PASS_SECRET, body.pass.trim()), body };
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid pass" }, 422);
  }
}

async function checkin(request: Request, env: Env): Promise<Response> {
  const userId = await authorize(request, env);
  if (userId instanceof Response) return userId;
  const read = await readPass(request, env);
  if (read instanceof Response) return read;
  const { pass } = read;

  // Registration passes: the RPC refuses the scan unless the signed reference
  // code matches the DB. Customer passes: the customer must still be a teacher.
  const [name, args] = pass.kind === "customer"
    ? ["check_in_customer_pass", { p_customer_id: pass.customerId, p_event_id: pass.eventId, p_checked_in_by: userId }]
    : ["check_in_pass", {
        p_registration_id: pass.registrationId,
        // A group entry checks in each performer separately.
        p_kind: pass.kind === "performer" ? `performer:${pass.performer}` : pass.kind,
        p_checked_in_by: userId,
        p_ref_code: pass.refCode,
      }];

  let result: Record<string, unknown> | null;
  let context: unknown;
  try {
    [result, context] = await Promise.all([
      rpc(env, name, args),
      // The schedule only decorates the result: a failure here must not fail the check-in.
      rpc(env, "scanner_pass_context", holderArgs(pass)).catch(() => null),
    ]);
  } catch (error) {
    if (!(error instanceof ServiceUnavailable)) throw error;
    return json({ error: "Check-in service unavailable. Try again." }, error.status);
  }
  if (result?.error === "mismatch") return json({ error: "QR data does not match the registration record." }, 422);
  if (!result || result.error) return json({ error: "This registration is not eligible for check-in." }, 404);

  return json({ ...result, context });
}

/** Ticket body fields shared by /api/tickets and /api/payments, or the 400 to send. */
function ticketRequest(body: Record<string, unknown>, min: number): { quantity: number; sessionNumber: number | null } | Response {
  const { quantity, sessionNumber = null } = body;
  if (!Number.isInteger(quantity) || (quantity as number) < min || (quantity as number) > MAX_TICKETS) {
    return json({ error: `Enter a number of tickets from ${min} to ${MAX_TICKETS}.` }, 400);
  }
  if (sessionNumber !== null && !(Number.isInteger(sessionNumber) && (sessionNumber as number) > 0)) {
    return json({ error: "Pick a session." }, 400);
  }
  return { quantity: quantity as number, sessionNumber: sessionNumber as number | null };
}

/** Why set_session_tickets / start_ticket_payment refused. */
function ticketRefusal(result: Record<string, unknown>, sessionNumber: number | null, min: number): Response {
  switch (result.error) {
    case "over_capacity": {
      const available = Number(result.available);
      return json({
        error: `Session ${result.sessionNumber} only has room for ${available} ${available === 1 ? "ticket" : "tickets"} on this pass.`,
        available,
      }, 409);
    }
    case "wrong_session":
      return json({ error: "The running order changed. Scan the pass again." }, 409);
    case "no_session":
      return json({ error: sessionNumber === null ? "Pick a session." : "That session is not on the running order." }, 422);
    case "invalid_quantity":
      return json({ error: `Enter a number of tickets from ${min} to ${MAX_TICKETS}.` }, 400);
    default:
      return json({ error: "This pass cannot buy tickets." }, 404);
  }
}

async function tickets(request: Request, env: Env): Promise<Response> {
  const userId = await authorize(request, env);
  if (userId instanceof Response) return userId;
  const read = await readPass(request, env);
  if (read instanceof Response) return read;
  const { pass, body } = read;
  const ask = ticketRequest(body, 0);
  if (ask instanceof Response) return ask;

  let result: Record<string, unknown> | null;
  try {
    result = await rpc(env, "set_session_tickets", {
      ...holderArgs(pass),
      p_session_number: ask.sessionNumber,
      p_quantity: ask.quantity,
      p_updated_by: userId,
    });
  } catch (error) {
    if (!(error instanceof ServiceUnavailable)) throw error;
    return json({ error: "Ticket service unavailable. Try again." }, error.status);
  }
  return result && result.error === undefined ? json(result) : ticketRefusal(result ?? {}, ask.sessionNumber, 0);
}

function mayarFailure(error: unknown): Response {
  if (!(error instanceof MayarError)) throw error;
  console.error("mayar", error.message);
  switch (error.kind) {
    case "expired":
      return json({ error: "QRIS is signed out of Mayar. Ask an admin to update MAYAR_TOKEN." }, 503);
    case "refused":
      return json({ error: `Mayar refused the QR: ${error.message}` }, 502);
    default:
      return json({ error: "Could not reach Mayar for QRIS. Try again." }, 502);
  }
}

async function startPayment(request: Request, env: Env): Promise<Response> {
  const userId = await authorize(request, env);
  if (userId instanceof Response) return userId;
  const read = await readPass(request, env);
  if (read instanceof Response) return read;
  const { pass, body } = read;
  const ask = ticketRequest(body, 1);
  if (ask instanceof Response) return ask;
  if (!env.MAYAR_TOKEN) return json({ error: "QRIS is not set up. Ask an admin to set MAYAR_TOKEN." }, 503);

  let started: Record<string, unknown> | null;
  try {
    started = await rpc(env, "start_ticket_payment", {
      ...holderArgs(pass),
      p_session_number: ask.sessionNumber,
      p_quantity: ask.quantity,
      p_created_by: userId,
    });
  } catch (error) {
    if (!(error instanceof ServiceUnavailable)) throw error;
    return json({ error: "Payment service unavailable. Try again." }, error.status);
  }
  if (!started || started.error !== undefined) {
    switch (started?.error) {
      case "amount_pending":
        // Every unique code (1–9) for this amount is on a QR at another desk.
        return json({
          error: `Too many desks are waiting for a QRIS payment of IDR ${Number(started.amount).toLocaleString("en-US")}. Wait for one to finish, or pay by cash.`,
        }, 409);
      case "no_price":
        return json({ error: "No ticket price is set for this event (admin → Events → Edit)." }, 422);
      default:
        return ticketRefusal(started ?? {}, ask.sessionNumber, 1);
    }
  }

  let qrCode: string;
  try {
    qrCode = await createQrCode(env.MAYAR_TOKEN, Number(started.amount));
  } catch (error) {
    // Release the held seats and amount; nobody can pay a QR they never saw.
    await rpc(env, "settle_ticket_payment", { p_payment_id: started.paymentId, p_items: [], p_cancel: true }).catch(() => null);
    return mayarFailure(error);
  }
  return json({ ...started, qrCode });
}

const PROOF_BUCKET = "ticket-transfer-proofs";
const MAX_PROOF_BYTES = 5 * 1024 * 1024; // must match the bucket's file_size_limit

function storageObject(env: Env, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/storage/v1/object/${PROOF_BUCKET}/${path}`, {
    ...init,
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, ...init.headers },
    signal: AbortSignal.timeout(15000),
  });
}

/** Cash or bank transfer, paid at the desk: multipart pass, sessionNumber, quantity, method, proof (JPEG, transfer only). */
async function manualPayment(request: Request, env: Env): Promise<Response> {
  const userId = await authorize(request, env);
  if (userId instanceof Response) return userId;
  const read = await readPass(request, env);
  if (read instanceof Response) return read;
  const { pass, body } = read;
  const ask = ticketRequest({
    quantity: Number(body.quantity),
    sessionNumber: body.sessionNumber ? Number(body.sessionNumber) : null,
  }, 1);
  if (ask instanceof Response) return ask;
  const { method, proof } = body;
  if (method !== "cash" && method !== "transfer") return json({ error: "Pick cash or bank transfer." }, 400);

  let proofPath: string | null = null;
  if (method === "transfer") {
    if (!(proof instanceof File) || proof.size === 0) return json({ error: "Take a photo of the bank transfer." }, 400);
    if (proof.type !== "image/jpeg" || proof.size > MAX_PROOF_BYTES) return json({ error: "The transfer photo must be a JPEG under 5 MB." }, 400);
    // Grouped by who paid, so the photo is easy to find later.
    const owner = pass.kind === "customer" ? `customer/${pass.customerId}` : `registration/${pass.registrationId}`;
    proofPath = `${owner}/${crypto.randomUUID()}.jpg`;
    let uploaded: Response;
    try {
      uploaded = await storageObject(env, proofPath, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: proof });
    } catch (error) {
      console.error("transfer proof upload unreachable", error);
      return json({ error: "Could not save the transfer photo. Try again." }, 503);
    }
    if (!uploaded.ok) {
      console.error("transfer proof upload failed", uploaded.status, await uploaded.text());
      return json({ error: "Could not save the transfer photo. Try again." }, 502);
    }
  }

  let result: Record<string, unknown> | null = null;
  try {
    result = await rpc(env, "record_ticket_payment", {
      ...holderArgs(pass),
      p_session_number: ask.sessionNumber,
      p_quantity: ask.quantity,
      p_method: method,
      p_proof_path: proofPath,
      p_created_by: userId,
    });
  } catch (error) {
    if (!(error instanceof ServiceUnavailable)) throw error;
    return json({ error: "Payment service unavailable. Try again." }, error.status);
  } finally {
    // A refused purchase keeps no photo.
    if (proofPath && (!result || result.error !== undefined)) {
      await storageObject(env, proofPath, { method: "DELETE" }).catch(() => null);
    }
  }
  if (result && result.error === undefined) return json(result);
  return result?.error === "no_price"
    ? json({ error: "No ticket price is set for this event (admin → Events → Edit)." }, 422)
    : ticketRefusal(result ?? {}, ask.sessionNumber, 1);
}

/** Mayar's latest payme credits handed to a payment RPC as p_items, or the response to send instead. */
async function rpcWithCredits(env: Env, name: string, args: object): Promise<{ result: unknown } | Response> {
  if (!env.MAYAR_TOKEN) return json({ error: "QRIS is not set up. Ask an admin to set MAYAR_TOKEN." }, 503);
  let credits: PaymeCredit[];
  try {
    credits = await recentPaymeCredits(env.MAYAR_TOKEN);
  } catch (error) {
    return mayarFailure(error);
  }
  try {
    return { result: await rpc(env, name, { ...args, p_items: credits }) };
  } catch (error) {
    if (!(error instanceof ServiceUnavailable)) throw error;
    return json({ error: "Payment service unavailable. Try again." }, error.status);
  }
}

async function paymentStatus(request: Request, env: Env): Promise<Response> {
  const userId = await authorize(request, env);
  if (userId instanceof Response) return userId;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.paymentId !== "string" || !UUID.test(body.paymentId)) return json({ error: "Missing payment" }, 400);

  const settled = await rpcWithCredits(env, "settle_ticket_payment", { p_payment_id: body.paymentId, p_cancel: body.cancel === true });
  if (settled instanceof Response) return settled;
  const result = settled.result as Record<string, unknown> | null;
  return result && result.error === undefined ? json(result) : json({ error: "Payment not found." }, 404);
}

async function unclaimedPayments(request: Request, env: Env): Promise<Response> {
  const userId = await authorize(request, env);
  if (userId instanceof Response) return userId;
  const listed = await rpcWithCredits(env, "unclaimed_ticket_payments", {});
  return listed instanceof Response ? listed : json({ credits: listed.result ?? [] });
}

const CLAIM_REFUSALS: Record<string, [status: number, error: string]> = {
  not_found: [404, "Payment not found."],
  already_paid: [409, "Those tickets were already added."],
  still_pending: [409, "That QR is still on a desk's screen; it will add the tickets itself."],
  no_credit: [409, "That Mayar payment does not match this QR any more. Refresh the list."],
  credit_claimed: [409, "That Mayar payment was already used for other tickets. Refresh the list."],
};

async function claimPayment(request: Request, env: Env): Promise<Response> {
  const userId = await authorize(request, env);
  if (userId instanceof Response) return userId;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (typeof body?.paymentId !== "string" || !UUID.test(body.paymentId) || typeof body.creditId !== "string" || !body.creditId) {
    return json({ error: "Missing payment" }, 400);
  }

  // The credit is re-read from Mayar, never taken from the client.
  const claimed = await rpcWithCredits(env, "claim_ticket_payment", {
    p_payment_id: body.paymentId,
    p_item_id: body.creditId,
    p_claimed_by: userId,
  });
  if (claimed instanceof Response) return claimed;
  const result = claimed.result as Record<string, unknown> | null;
  if (result && result.error === undefined) return json(result);
  const [status, error] = CLAIM_REFUSALS[String(result?.error)] ?? CLAIM_REFUSALS.not_found;
  return json({ error }, status);
}

async function overview(request: Request, env: Env): Promise<Response> {
  const userId = await authorize(request, env);
  if (userId instanceof Response) return userId;
  try {
    return json(await rpc(env, "scanner_event_overview", {}));
  } catch (error) {
    if (!(error instanceof ServiceUnavailable)) throw error;
    return json({ error: "Schedule unavailable. Try again." }, error.status);
  }
}

const ROUTES: Record<string, [method: string, handler: (request: Request, env: Env) => Promise<Response>]> = {
  "/api/checkin": ["POST", checkin],
  "/api/tickets": ["POST", tickets],
  "/api/payments": ["POST", startPayment],
  "/api/payments/status": ["POST", paymentStatus],
  "/api/payments/unclaimed": ["GET", unclaimedPayments],
  "/api/payments/claim": ["POST", claimPayment],
  "/api/payments/manual": ["POST", manualPayment],
  "/api/event": ["GET", overview],
};

export default {
  async fetch(request, env) {
    const route = ROUTES[new URL(request.url).pathname];
    if (route) {
      return request.method === route[0] ? route[1](request, env) : json({ error: "Method not allowed" }, 405);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
