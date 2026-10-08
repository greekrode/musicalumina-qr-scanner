import { afterAll, expect, mock, test } from "bun:test";
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

let rpcResult: unknown = { status: "checked_in", registration: { name: "Kid A" } };
const rpcCalls: unknown[] = [];
const rpcNames: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [jwk] });
  const rpc = url.match(/^https:\/\/db\.test\/rest\/v1\/rpc\/(check_in_pass|check_in_customer_pass)$/)?.[1];
  if (rpc) {
    rpcNames.push(rpc);
    rpcCalls.push(JSON.parse(String(init?.body)));
    return Response.json(rpcResult);
  }
  throw new Error(`unexpected fetch ${url}`);
}) as unknown as typeof fetch;
afterAll(() => { globalThis.fetch = realFetch; });

const session = (metadata: object, azp = "https://scanner.test") =>
  new SignJWT({ metadata, azp }).setProtectedHeader({ alg: "RS256", kid: "k1" }).setSubject("user_1")
    .setIssuer("https://clerk.test").setExpirationTime("1m").sign(privateKey);
const pass = await encodePass("pass-secret", {
  kind: "participant", registrationId: "366dc7b3-f0fd-445f-9bfe-ad520a134928", expiresAt: Math.floor(Date.now() / 1000) + 60, refCode: "4928-3456",
});
const call = async (token: string, body: unknown) =>
  worker.fetch(new Request("https://scanner.test/api/checkin", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }), env);

test("staff session + valid pass checks in via one RPC", async () => {
  const res = await call(await session({ role: "reg_staff" }), { pass });
  expect(res.status).toBe(200);
  expect(rpcCalls.at(-1)).toEqual({ p_registration_id: "366dc7b3-f0fd-445f-9bfe-ad520a134928", p_kind: "participant", p_checked_in_by: "user_1", p_ref_code: "4928-3456" });
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
  rpcResult = { error: "not_eligible" };
  expect((await call(token, { pass })).status).toBe(404);
});

test("refuses a pass whose reference code no longer matches the database", async () => {
  rpcResult = { error: "mismatch" };
  const res = await call(await session({ role: "reg_staff" }), { pass });
  expect(res.status).toBe(422);
  expect(((await res.json()) as { error: string }).error).toMatch(/does not match/);
});

test("a performer pass checks in that performer", async () => {
  rpcResult = { status: "checked_in", kind: "performer", registration: { name: "Cherry" } };
  const performerPass = await encodePass("pass-secret", {
    kind: "performer", registrationId: "366dc7b3-f0fd-445f-9bfe-ad520a134928", expiresAt: Math.floor(Date.now() / 1000) + 60,
    refCode: "4928-3456", performer: 1,
  });
  expect((await call(await session({ role: "reg_staff" }), { pass: performerPass })).status).toBe(200);
  expect(rpcCalls.at(-1)).toMatchObject({ p_kind: "performer:1" });
});

test("a customer teacher pass checks in through the customers table for its signed event", async () => {
  rpcResult = { status: "checked_in", kind: "teacher", verified: true, registration: { name: "Elyssa" } };
  const customerPass = await encodePass("pass-secret", {
    kind: "customer", customerId: "753891ed-51ab-4c89-baca-99801f1ebcd3", eventId: "7d267705-c591-4b98-8151-d8c91ebf2e31",
    expiresAt: Math.floor(Date.now() / 1000) + 60, refCode: "",
  });
  const res = await call(await session({ role: "reg_staff" }), { pass: customerPass });
  expect(res.status).toBe(200);
  expect(rpcNames.at(-1)).toBe("check_in_customer_pass");
  expect(rpcCalls.at(-1)).toEqual({
    p_customer_id: "753891ed-51ab-4c89-baca-99801f1ebcd3", p_event_id: "7d267705-c591-4b98-8151-d8c91ebf2e31", p_checked_in_by: "user_1",
  });
  rpcResult = { error: "not_eligible" }; // customer deleted or no longer a teacher
  expect((await call(await session({ role: "reg_staff" }), { pass: customerPass })).status).toBe(404);
});
