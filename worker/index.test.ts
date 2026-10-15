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
  MAYAR_TOKEN: "mayar-token",
} as unknown as Env;

// Per-RPC canned answers; a Response simulates a Supabase failure.
let rpcResults: Record<string, unknown> = {};
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
// Mayar GraphQL: answer per request body; a Response is returned as-is.
let mayarResult: (body: { query: string; variables: Record<string, unknown> }) => unknown = () => {
  throw new Error("unexpected Mayar call");
};
const mayarCalls: { query: string; variables: Record<string, unknown>; auth: string | null }[] = [];
// Supabase Storage (transfer photos): every call, answered 200.
const storageCalls: { method: string; path: string; type: string | null; bytes: number }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.endsWith("/.well-known/jwks.json")) return Response.json({ keys: [jwk] });
  const name = url.match(/^https:\/\/db\.test\/rest\/v1\/rpc\/(\w+)$/)?.[1];
  if (url.startsWith("https://db.test/storage/v1/object/ticket-transfer-proofs/")) {
    storageCalls.push({
      method: String(init?.method),
      path: url.slice("https://db.test/storage/v1/object/ticket-transfer-proofs/".length),
      type: new Headers(init?.headers).get("Content-Type"),
      bytes: init?.body instanceof Blob ? init.body.size : 0,
    });
    return Response.json({ Key: "ok" });
  }
  if (url === "https://api.mayar.id/graphql") {
    const body = JSON.parse(String(init?.body));
    mayarCalls.push({ ...body, auth: new Headers(init?.headers).get("Authorization") });
    const result = mayarResult(body);
    return result instanceof Response ? result : Response.json(result);
  }
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
  mayarCalls.length = 0;
  storageCalls.length = 0;
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

test("QRIS: the amount comes from the database, the QR from Mayar, the holder from the signed pass", async () => {
  rpcResults.start_ticket_payment = { paymentId: "p1", sessionNumber: 2, quantity: 3, amount: 225007, uniqueCode: 7, expiresAt: "2026-10-17T03:05:00Z" };
  mayarResult = () => ({ data: { createQrCodePayme: { qrCode: "00020101021226650013CO.XENDIT", errorMessage: null } } });
  const res = await post("/api/payments", await session({ role: "reg_staff" }), { pass: performerPass, quantity: 3, amount: 1 });
  expect(res.status).toBe(200);
  expect(await res.json<object>()).toEqual({
    paymentId: "p1", sessionNumber: 2, quantity: 3, amount: 225007, uniqueCode: 7, expiresAt: "2026-10-17T03:05:00Z", qrCode: "00020101021226650013CO.XENDIT",
  });
  expect(lastCall("start_ticket_payment")).toEqual({
    p_registration_id: registrationId, p_customer_id: null, p_event_id: null, p_holder: "performer:1",
    p_session_number: null, p_quantity: 3, p_created_by: "user_1",
  });
  expect(mayarCalls).toHaveLength(1);
  expect(mayarCalls[0].variables).toEqual({ amount: 225007 });
  expect(mayarCalls[0].auth).toBe("Bearer mayar-token");
});

test("QRIS: needs at least one ticket; refusals from the database are explained", async () => {
  const token = await session({ role: "reg_staff" });
  rpcResults.start_ticket_payment = { error: "amount_pending", amount: 100000 };
  expect((await post("/api/payments", token, { pass, quantity: 0 })).status).toBe(400);
  const busy = await post("/api/payments", token, { pass, quantity: 2 });
  expect(busy.status).toBe(409);
  expect((await busy.json<{ error: string }>()).error).toContain("IDR 100,000");
  rpcResults.start_ticket_payment = { error: "no_price" };
  expect((await post("/api/payments", token, { pass, quantity: 2 })).status).toBe(422);
  rpcResults.start_ticket_payment = { error: "over_capacity", sessionNumber: 1, available: 1 };
  expect(await (await post("/api/payments", token, { pass, quantity: 2 })).json<object>()).toMatchObject({ available: 1 });
  expect(mayarCalls).toHaveLength(0);
});

test("QRIS: when Mayar cannot make the QR, the held seats are released", async () => {
  const token = await session({ role: "reg_staff" });
  rpcResults.start_ticket_payment = { paymentId: "p1", sessionNumber: 1, quantity: 1, amount: 50000, expiresAt: "x" };
  rpcResults.settle_ticket_payment = { status: "cancelled", amount: 50000 };
  mayarResult = () => new Response('{"msg":"Forbidden, token is expired"}', { status: 401 });
  const expired = await post("/api/payments", token, { pass, quantity: 1 });
  expect(expired.status).toBe(503);
  expect((await expired.json<{ error: string }>()).error).toContain("MAYAR_TOKEN");
  expect(lastCall("settle_ticket_payment")).toEqual({ p_payment_id: "p1", p_items: [], p_cancel: true });

  rpcCalls.length = 0;
  mayarResult = () => ({ data: { createQrCodePayme: { qrCode: null, errorMessage: "Minimum amount" } } });
  const refused = await post("/api/payments", token, { pass, quantity: 1 });
  expect(refused.status).toBe(502);
  expect(await refused.json<object>()).toEqual({ error: "Mayar refused the QR: Minimum amount" });
  expect(lastCall("settle_ticket_payment")).toMatchObject({ p_cancel: true });
});

test("QRIS status: hands Mayar's well-formed payme credits to settle_ticket_payment", async () => {
  const token = await session({ role: "reg_staff" });
  const paymentId = "0b5e0f31-8a43-4c8e-9a39-0d3c6f1a2b44";
  rpcResults.settle_ticket_payment = { status: "paid", amount: 50000, sessionNumber: 1, quantity: 3, ticketsLeft: 60 };
  mayarResult = () => ({
    data: {
      getAllBalanceHistoryPage: {
        items: [
          { id: "c1", createdAt: 1791949358431, credit: 50000, status: "paid" },
          { id: "broken", createdAt: null, credit: 50000, status: "paid" },
        ],
      },
    },
  });
  const res = await post("/api/payments/status", token, { paymentId, cancel: true });
  expect(res.status).toBe(200);
  expect(await res.json<object>()).toEqual({ status: "paid", amount: 50000, sessionNumber: 1, quantity: 3, ticketsLeft: 60 });
  expect(lastCall("settle_ticket_payment")).toEqual({
    p_payment_id: paymentId,
    p_items: [{ id: "c1", createdAt: 1791949358431, credit: 50000, status: "paid" }],
    p_cancel: true,
  });
  expect(mayarCalls[0].variables).toMatchObject({
    input: { search: { balanceHistoryType: [{ operator: "eq", value: "payme" }], credit: [{ operator: "gt", value: "0" }] } },
  });

  expect((await post("/api/payments/status", token, { paymentId: "p1" })).status).toBe(400);
  expect((await post("/api/payments/status", await session({ role: "jury" }), { paymentId })).status).toBe(401);
  rpcResults.settle_ticket_payment = { error: "not_found" };
  expect((await post("/api/payments/status", token, { paymentId })).status).toBe(404);
});

test("unclaimed QRIS: listed from Mayar's credits; a claim re-reads the credit from Mayar, not the client", async () => {
  const token = await session({ role: "reg_staff" });
  const paymentId = "0b5e0f31-8a43-4c8e-9a39-0d3c6f1a2b44";
  const credit = { id: "c9", createdAt: 1791949358431, credit: 150007, status: "paid" };
  mayarResult = () => ({ data: { getAllBalanceHistoryPage: { items: [credit] } } });
  rpcResults.unclaimed_ticket_payments = [{ id: "c9", amount: 150007, paidAt: "t", payments: [{ paymentId, status: "cancelled" }] }];
  const listed = await worker.fetch(new Request("https://scanner.test/api/payments/unclaimed", { headers: { Authorization: `Bearer ${token}` } }), env);
  expect(await listed.json<object>()).toEqual({ credits: rpcResults.unclaimed_ticket_payments });
  expect(lastCall("unclaimed_ticket_payments")).toEqual({ p_items: [credit] });

  rpcResults.claim_ticket_payment = { status: "paid", amount: 150007, sessionNumber: 1, quantity: 2, ticketsLeft: 61, holderName: "Kid A" };
  const claimed = await post("/api/payments/claim", token, { paymentId, creditId: "c9", amount: 1 });
  expect(claimed.status).toBe(200);
  expect(lastCall("claim_ticket_payment")).toEqual({ p_payment_id: paymentId, p_item_id: "c9", p_claimed_by: "user_1", p_items: [credit] });

  rpcResults.claim_ticket_payment = { error: "credit_claimed" };
  const refused = await post("/api/payments/claim", token, { paymentId, creditId: "c9" });
  expect(refused.status).toBe(409);
  expect((await refused.json<{ error: string }>()).error).toContain("already used");
  expect((await post("/api/payments/claim", token, { paymentId })).status).toBe(400);
  expect((await post("/api/payments/claim", await session({ role: "jury" }), { paymentId, creditId: "c9" })).status).toBe(401);
});

const manual = async (token: string, fields: Record<string, string | Blob>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return worker.fetch(new Request("https://scanner.test/api/payments/manual", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
  }), env);
};
const photo = new File([new Uint8Array(2048)], "transfer.jpg", { type: "image/jpeg" });

test("cash: recorded for the signed pass holder, no photo", async () => {
  rpcResults.record_ticket_payment = { status: "paid", method: "cash", amount: 150000, sessionNumber: 2, quantity: 3, ticketsLeft: 40, holderName: "Kid A" };
  const res = await manual(await session({ role: "reg_staff" }), { pass: performerPass, quantity: "2", method: "cash", proof: photo });
  expect(res.status).toBe(200);
  expect(lastCall("record_ticket_payment")).toEqual({
    p_registration_id: registrationId, p_customer_id: null, p_event_id: null, p_holder: "performer:1",
    p_session_number: null, p_quantity: 2, p_method: "cash", p_proof_path: null, p_created_by: "user_1",
  });
  expect(storageCalls).toHaveLength(0);
});

test("bank transfer: the photo is stored first and its path recorded; a refused purchase deletes it", async () => {
  const token = await session({ role: "reg_staff" });
  rpcResults.record_ticket_payment = { status: "paid", method: "transfer", amount: 75000, sessionNumber: 3, quantity: 1, ticketsLeft: 9, holderName: "Elyssa" };
  const res = await manual(token, { pass: customerPass, quantity: "1", sessionNumber: "3", method: "transfer", proof: photo });
  expect(res.status).toBe(200);
  expect(storageCalls).toHaveLength(1);
  expect(storageCalls[0]).toMatchObject({ method: "POST", type: "image/jpeg", bytes: 2048 });
  expect(storageCalls[0].path).toMatch(/^customer\/753891ed-51ab-4c89-baca-99801f1ebcd3\/[0-9a-f-]{36}\.jpg$/);
  expect(lastCall("record_ticket_payment")).toMatchObject({ p_session_number: 3, p_method: "transfer", p_proof_path: storageCalls[0].path });

  storageCalls.length = 0;
  rpcResults.record_ticket_payment = { error: "over_capacity", sessionNumber: 3, available: 0 };
  const full = await manual(token, { pass, quantity: "1", method: "transfer", proof: photo });
  expect(full.status).toBe(409);
  expect(storageCalls.map((c) => c.method)).toEqual(["POST", "DELETE"]);
  expect(storageCalls[1].path).toBe(storageCalls[0].path);
  expect(storageCalls[0].path).toStartWith(`registration/${registrationId}/`);
});

test("walk-ins: staff sell without a pass for the event; holder is walkin, never a client-picked registration", async () => {
  const token = await session({ role: "reg_staff" });
  const eventId = "0b6a1d6e-3c52-4f3e-9d0a-6a1f2b3c4d5e";
  rpcResults.start_ticket_payment = { paymentId: "p1", sessionNumber: 2, quantity: 2, amount: 150004, uniqueCode: 4, expiresAt: "x" };
  mayarResult = () => ({ data: { createQrCodePayme: { qrCode: "QR", errorMessage: null } } });
  const qris = await post("/api/payments", token, { walkinEventId: eventId, sessionNumber: 2, quantity: 2, registrationId });
  expect(qris.status).toBe(200);
  expect(lastCall("start_ticket_payment")).toEqual({
    p_registration_id: null, p_customer_id: null, p_event_id: eventId, p_holder: "walkin",
    p_session_number: 2, p_quantity: 2, p_created_by: "user_1",
  });

  rpcResults.record_ticket_payment = { status: "paid", method: "transfer", amount: 75000, sessionNumber: 1, quantity: 1, ticketsLeft: 9, holderName: "Walk-in guest" };
  const transfer = await manual(token, { walkinEventId: eventId, quantity: "1", sessionNumber: "1", method: "transfer", proof: photo });
  expect(transfer.status).toBe(200);
  expect(lastCall("record_ticket_payment")).toMatchObject({ p_holder: "walkin", p_event_id: eventId, p_registration_id: null, p_customer_id: null });
  expect(storageCalls.at(-1)?.path).toStartWith(`walkin/${eventId}/`);

  expect((await post("/api/payments", token, { walkinEventId: "nope", sessionNumber: 1, quantity: 1 })).status).toBe(400);
  expect((await post("/api/payments", await session({ role: "jury" }), { walkinEventId: eventId, sessionNumber: 1, quantity: 1 })).status).toBe(401);
  // Setting tickets directly still needs a signed pass.
  expect((await post("/api/tickets", token, { walkinEventId: eventId, sessionNumber: 1, quantity: 1 })).status).toBe(400);
});

test("bank transfer needs a JPEG photo; the method must be cash or transfer", async () => {
  const token = await session({ role: "reg_staff" });
  rpcResults.record_ticket_payment = { status: "paid" };
  expect((await manual(token, { pass, quantity: "1", method: "transfer" })).status).toBe(400);
  expect((await manual(token, { pass, quantity: "1", method: "transfer", proof: new File(["x"], "a.png", { type: "image/png" }) })).status).toBe(400);
  expect((await manual(token, { pass, quantity: "1", method: "card" })).status).toBe(400);
  expect((await manual(token, { pass, quantity: "0", method: "cash" })).status).toBe(400);
  expect((await manual(await session({ role: "jury" }), { pass, quantity: "1", method: "cash" })).status).toBe(401);
  expect(rpcCalls.filter((c) => c.name === "record_ticket_payment")).toHaveLength(0);
  expect(storageCalls).toHaveLength(0);
});
