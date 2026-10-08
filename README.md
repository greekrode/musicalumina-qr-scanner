# Musica Lumina Check-in

Staff PWA that scans participant passes and checks them in. One Cloudflare
Worker serves the app and `POST /api/checkin`, so there is no CORS and no
separate backend.

## How a scan works

1. `musicalumina-tools/scripts/qr` mints a pass: `ML2:` + base32(kind, id, expiry, extra, reference code, HMAC); the layout is documented in `worker/pass.ts`. Registration passes (participant, teacher, performer) carry the registration id; customer-teacher passes (kind 4, for teachers who are not registrants) carry a `customers.id` plus the event id. All fit a version-5 QR.
2. The scanner reads it (`qr-scanner`, native BarcodeDetector where the device has it) and posts it with the staff member's Clerk session token.
3. The Worker verifies the Clerk token (RS256 against Clerk's JWKS, `metadata.role` = `admin` or `reg_staff` from Clerk publicMetadata) and the pass HMAC, then makes one RPC call (both in `musicalumina-web/supabase/migrations`): `check_in_pass` for registration passes (records once per registration and kind) or `check_in_customer_pass` for customer-teacher passes (records once per customer and event; the customer must still be type `teacher` or `music school/institution`). Both return the same result shape.

## Develop

```bash
bun install
cp .env.example .env              # VITE_CLERK_PUBLISHABLE_KEY
cp .dev.vars.example .dev.vars    # SUPABASE_SERVICE_ROLE_KEY, QR_PASS_SECRET
bun run dev:worker                # API on :8787
bun run dev                       # app on :5173, proxies /api
bun test                          # pass codec + Worker auth tests
```

## Deploy

Clerk needs the session-token claim `{ "metadata": "{{user.public_metadata}}" }`
(Sessions → Customize session token) and staff users with public metadata
`{ "role": "admin" }` or `{ "role": "staff" }`.

Fill in the `vars` in `wrangler.jsonc`, then:

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put QR_PASS_SECRET
bun run deploy
```

`QR_PASS_SECRET` must match `musicalumina-tools/.env`. Use a fresh value
(`openssl rand -base64 32`): earlier builds shipped the old JWT secret in the
client bundle.
