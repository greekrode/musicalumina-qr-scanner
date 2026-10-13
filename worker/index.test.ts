import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import worker, { type Env } from "./index";
import { encodePass } from "./pass";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
const env = {
  ASSETS: { fetch: async () => new Response("asset") },
  CLERK_ISSUER: "https://clerk.test",
  CLERK_AUTHORIZED_PARTIES: "https://scanner.test",
  SUPABASE_URL: "https://db.test",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  QR_PASS_SECRET: "pass-secret",
} as unknown as Env;

// Per-RPC canned answers; a Response simulates a Supabase failure.
let rpcResults: Record<string, unknown> = {};
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [jwk] });
  const name = url.match(/^https:\/\/db\.test\/rest\/v1\/rpc\/(\w+)$/)?.[1];
  if (name && name in rpcResults) {
    rpcCalls.push({ name, args: JSON.parse(String(init?.body)) });
    const result = rpcResults[name];
    return result instanceof Response ? result : Response.json(result);
  }
  throw new Error(`unexpected fetch ${url}`);
}) as unknown as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });
beforeEach(() => {
  rpcResults = {
    check_in_pass: { status: "checked_in", registration: { name: "Kid A" } },
    check_in_customer_pass: { status: "checked_in", kind: "teacher", registration: { name: "Elyssa" } },
    scanner_pass_context: { fixedSession: 2, performances: [], sessions: [], tickets: [] },
  };
  rpcCalls.length = 0;
});
const lastCall = (name: string) => rpcCalls.filter((c) => c.name === name).at(-1)?.args;

const session = (metadata: object, azp = "https://scanner.test") =>
  new SignJWT({ metadata, azp }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setSubject("user_1")
    .setIssuer("https://clerk.test").setExpirationTime("1m").sign(privateKey);
const registrationId = "366dc7b3-f0fd-445f-9bfe-ad520a134928";
const expiresAt = Math.floor(Date.now() / 1000) + 60;
const pass = await encodePass("pass-secret", { kind: "participant", registrationId, expiresAt, refCode: "4928-3456" });
const performerPass = await encodePass("pass-secret", { kind: "performer", registrationId, expiresAt, refCode: "4928-3456", performer: 1 });
const customerPass = await encodePass("pass-secret", {
  kind: "customer", customerId: "753891ed-51ab-4c89-baca-99801f1ebcd3", eventId: "7d267705-c591-4b98-8151-d8c91ebf2e31", expiresAt, refCode: "",
});
const post = async (path: string, token: string, body: unknown) =>
  worker.fetch(new Request(`https://scanner.test${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }), env);
const call = (token: string, body: unknown) => post("/api/checkin", token, body);

test("staff session + valid pass checks in and returns where the holder plays", async () => {
  const res = await call(await session({ role: "reg_staff" }), { pass });
  expect(res.status).toBe(200);
  expect(lastCall("check_in_pass")).toEqual({ p_registration_id: registrationId, p_kind: "participant", p_checked_in_by: "user_1", p_ref_code: "4928-3456" });
  expect(lastCall("scanner_pass_context")).toEqual({ p_registration_id: registrationId, p_customer_id: null, p_event_id: null, p_holder: "participant" });
  expect(await res.json()).toMatchObject({ context: { fixedSession: 2 } });
});

test("a schedule lookup failure still checks the pass in", async () => {
  rpcResults.scanner_pass_context = new Response("boom", { status: 500 });
  const res = await call(await session({ role: "reg_staff" }), { pass });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ context: null });
});

test("rejects missing role, wrong role, wrong app, bad token", async () => {
  expect((await call(await session({}), { pass })).status).toBe(401);
  expect((await call(await session({ role: "member" }), { pass })).status).toBe(401);
  expect((await call(await session({ role: "staff" }), { pass })).status).toBe(401); // web-admin role
  expect((await call(await session({ role: "score_staff" }), { pass })).status).toBe(401);
  expect((await call(await session({ role: "admin" }, "https://evil.test"), { pass })).status).toBe(401);
  expect((await call("garbage", { pass })).status).toBe(401);
  expect((await call(await session({ role: "org:admin" }), { pass })).status).toBe(200); // legacy spelling
});

test("rejects forged passes and ineligible registrations", async () => {
  const token = await session({ role: "admin" });
  expect((await call(token, { pass: pass.slice(0, -2) + "AA" })).status).toBe(422);
  rpcResults.check_in_pass = { error: "not_eligible" };
  expect((await call(token, { pass })).status).toBe(404);
});

test("refuses a pass whose reference code no longer matches the database", async () => {
  rpcResults.check_in_pass = { error: "mismatch" };
  const res = await call(await session({ role: "reg_staff" }), { pass });
  expect(res.status).toBe(422);
  expect(await res.json<object>()).toEqual({ error: expect.stringMatching(/does not match/) });
});

test("a performer pass checks in that performer", async () => {
  rpcResults.check_in_pass = { status: "checked_in", kind: "performer", registration: { name: "Cherry" } };
  expect((await call(await session({ role: "reg_staff" }), { pass: performerPass })).status).toBe(200);
  expect(lastCall("check_in_pass")).toMatchObject({ p_kind: "performer:1" });
  expect(lastCall("scanner_pass_context")).toMatchObject({ p_holder: "performer:1" });
});

test("a customer teacher pass checks in through the customers table for its signed event", async () => {
  const res = await call(await session({ role: "reg_staff" }), { pass: customerPass });
  expect(res.status).toBe(200);
  expect(lastCall("check_in_pass")).toBeUndefined();
  expect(lastCall("check_in_customer_pass")).toEqual({
    p_customer_id: "753891ed-51ab-4c89-baca-99801f1ebcd3", p_event_id: "7d267705-c591-4b98-8151-d8c91ebf2e31", p_checked_in_by: "user_1",
  });
  rpcResults.check_in_customer_pass = { error: "not_eligible" }; // customer deleted or no longer a teacher
  expect((await call(await session({ role: "reg_staff" }), { pass: customerPass })).status).toBe(404);
});

test("tickets are set for the signed pass holder, not whatever the client claims", async () => {
  rpcResults.set_session_tickets = { sessionNumber: 4, quantity: 2, ticketsLeft: 77 };
  const res = await post("/api/tickets", await session({ role: "reg_staff" }), { pass: performerPass, sessionNumber: 4, quantity: 2, registrationId: "spoofed" });
  expect(res.status).toBe(200);
  expect(lastCall("set_session_tickets")).toEqual({
    p_registration_id: registrationId, p_customer_id: null, p_event_id: null, p_holder: "performer:1",
    p_session_number: 4, p_quantity: 2, p_updated_by: "user_1",
  });
  expect(await res.json<object>()).toEqual({ sessionNumber: 4, quantity: 2, ticketsLeft: 77 });
});

test("tickets: quantity must be a whole number in range; forged passes and other roles are refused", async () => {
  const token = await session({ role: "reg_staff" });
  rpcResults.set_session_tickets = { sessionNumber: 1, quantity: 0, ticketsLeft: 65 };
  for (const quantity of [-1, 1.5, "2", 1000, null]) {
    expect((await post("/api/tickets", token, { pass, quantity })).status).toBe(400);
  }
  expect((await post("/api/tickets", token, { pass, quantity: 1, sessionNumber: 0 })).status).toBe(400);
  expect((await post("/api/tickets", token, { pass: pass.slice(0, -2) + "AA", quantity: 1 })).status).toBe(422);
  expect((await post("/api/tickets", await session({ role: "jury" }), { pass, quantity: 1 })).status).toBe(401);
  expect(rpcCalls.filter((c) => c.name === "set_session_tickets")).toHaveLength(0);
  expect((await post("/api/tickets", token, { pass, quantity: 0 })).status).toBe(200); // 0 clears
});

test("tickets: a full session answers 409 with how many are still available", async () => {
  rpcResults.set_session_tickets = { error: "over_capacity", sessionNumber: 1, available: 3 };
  const res = await post("/api/tickets", await session({ role: "reg_staff" }), { pass: customerPass, sessionNumber: 1, quantity: 5 });
  expect(res.status).toBe(409);
  expect(await res.json<object>()).toEqual({ error: "Session 1 only has room for 3 tickets on this pass.", available: 3 });
  expect(lastCall("set_session_tickets")).toMatchObject({ p_customer_id: "753891ed-51ab-4c89-baca-99801f1ebcd3", p_holder: "customer" });
});

test("event overview is staff-only and GET-only", async () => {
  rpcResults.scanner_event_overview = { event: { id: "e1", title: "LSPF", seatLimit: 125 }, sessions: [] };
  const get = async (token: string, method = "GET") =>
    worker.fetch(new Request("https://scanner.test/api/event", { method, headers: { Authorization: `Bearer ${token}` } }), env);
  expect((await get(await session({ role: "jury" }))).status).toBe(401);
  expect((await get(await session({ role: "admin" }), "POST")).status).toBe(405);
  const res = await get(await session({ role: "admin" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ event: { seatLimit: 125 } });
});
