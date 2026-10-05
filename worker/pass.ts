// Compact signed pass format shared with the scanner Worker
// (musicalumina-tools/scripts/qr/pass.ts — keep both in sync; the test
// vector in pass.test.ts pins the wire format).
//
//   "ML2:" + base32( kind(1) | registrationId(16) | exp u32 BE(4) | refCode ASCII(0-20) | hmac-sha256[0..12] )
//
// ~73 characters, all in the QR alphanumeric set: a version-5 QR at ECC Q
// (37x37 modules). The old JWT pass needed ~version 20. The server checks the
// signature, then that the registration id and reference code both match the
// database before checking anyone in.

export const PASS_PREFIX = "ML2:";
export type PassKind = "participant" | "teacher";

const KIND_BYTE: Record<PassKind, number> = { participant: 1, teacher: 2 };
const BYTE_KIND: Record<number, PassKind> = { 1: "participant", 2: "teacher" };
const FIXED_LEN = 21; // kind + id + exp
const MAX_REF_LEN = 20;
const MAC_LEN = 12; // 96-bit tag; every check is online and rate-bound by staff scanning.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const REF_PATTERN = /^[A-Za-z0-9-]*$/;

function base32Encode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error("Invalid pass encoding");
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      out.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  // Canonical form only: leftover bits must be zero, so one pass has one spelling.
  if (bits >= 5 || (buffer & ((1 << bits) - 1)) !== 0) throw new Error("Invalid pass encoding");
  return Uint8Array.from(out);
}

function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`Invalid registration id: ${uuid}`);
  return Uint8Array.from(hex.match(/../g)!, (pair) => parseInt(pair, 16));
}

function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function mac(secret: string, body: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, body)).slice(0, MAC_LEN);
}

export async function encodePass(
  secret: string,
  pass: { kind: PassKind; registrationId: string; expiresAt: number; refCode: string },
): Promise<string> {
  if (pass.refCode.length > MAX_REF_LEN || !REF_PATTERN.test(pass.refCode)) {
    throw new Error(`Invalid reference code: ${pass.refCode}`);
  }
  const ref = new TextEncoder().encode(pass.refCode);
  const body = new Uint8Array(FIXED_LEN + ref.length);
  body[0] = KIND_BYTE[pass.kind];
  body.set(uuidToBytes(pass.registrationId), 1);
  new DataView(body.buffer).setUint32(17, pass.expiresAt);
  body.set(ref, FIXED_LEN);
  const tag = await mac(secret, body);
  const token = new Uint8Array(body.length + MAC_LEN);
  token.set(body);
  token.set(tag, body.length);
  return PASS_PREFIX + base32Encode(token);
}

export async function decodePass(secret: string, text: string, now = Date.now() / 1000) {
  if (!text.startsWith(PASS_PREFIX)) throw new Error("Not a Musica Lumina pass");
  const token = base32Decode(text.slice(PASS_PREFIX.length));
  if (token.length < FIXED_LEN + MAC_LEN || token.length > FIXED_LEN + MAX_REF_LEN + MAC_LEN) {
    throw new Error("Invalid pass length");
  }
  const bodyLen = token.length - MAC_LEN;
  const body = token.slice(0, bodyLen);
  const expected = await mac(secret, body);
  let diff = 0;
  for (let i = 0; i < MAC_LEN; i++) diff |= expected[i] ^ token[bodyLen + i];
  if (diff !== 0) throw new Error("Pass signature is invalid");
  const kind = BYTE_KIND[body[0]];
  if (!kind) throw new Error("Unknown pass kind");
  const expiresAt = new DataView(body.buffer).getUint32(17);
  if (now >= expiresAt) throw new Error("Pass has expired");
  const refCode = new TextDecoder().decode(body.slice(FIXED_LEN));
  if (!REF_PATTERN.test(refCode)) throw new Error("Invalid reference code");
  return { kind, registrationId: bytesToUuid(body.slice(1, 17)), expiresAt, refCode };
}
