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
  AIRTABLE_WEBHOOK_URL: "https://hooks.airtable.test/wh",
} as unknown as Env;

let rpcResult: unknown = { status: "checked_in", registration: { name: "Kid A" } };
const rpcCalls: unknown[] = [];
const airtableCalls: unknown[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [jwk] });
  if (url === "https://hooks.airtable.test/wh") {
    airtableCalls.push(JSON.parse(String(init?.body)));
    return new Response("ok");
  }
  if (url === "https://db.test/rest/v1/rpc/check_in_pass") {
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
  kind: "participant", registrationId: "366dc7b3-f0fd-445f-9bfe-ad520a134928", expiresAt: Math.floor(Date.now() / 1000) + 60,
});
const call = async (token: string, body: unknown) =>
  worker.fetch(new Request("https://scanner.test/api/checkin", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }), env);

test("staff session + valid pass checks in via one RPC", async () => {
  const res = await call(await session({ role: "staff" }), { pass });
  expect(res.status).toBe(200);
  expect(rpcCalls.at(-1)).toEqual({ p_registration_id: "366dc7b3-f0fd-445f-9bfe-ad520a134928", p_kind: "participant", p_checked_in_by: "user_1" });
});

test("rejects missing role, wrong role, wrong app, bad token", async () => {
  expect((await call(await session({}), { pass })).status).toBe(401);
  expect((await call(await session({ role: "member" }), { pass })).status).toBe(401);
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

test("mirrors only the first participant check-in to Airtable", async () => {
  const token = await session({ role: "staff" });
  const registration = { id: "r1", name: "Kid A", categoryName: "Piano", subCategoryName: "Junior" };
  airtableCalls.length = 0;
  rpcResult = { status: "checked_in", kind: "participant", registration };
  const first = (await (await call(token, { pass })).json()) as { airtableSynced?: boolean };
  expect(first.airtableSynced).toBe(true);
  expect(airtableCalls).toEqual([{ participant_name: "Kid A", category: "Piano", sub_category: "Junior" }]);
  rpcResult = { status: "already_checked_in", kind: "participant", registration };
  await call(token, { pass });
  rpcResult = { status: "checked_in", kind: "teacher", registration };
  await call(token, { pass });
  expect(airtableCalls).toHaveLength(1);
});
