# Musica Lumina Check-in

Staff PWA that scans participant passes, checks them in, and sells audience
tickets per festival session. One Cloudflare Worker serves the app and the
`/api/*` endpoints, so there is no CORS and no separate backend.

## How a scan works

1. `musicalumina-tools/scripts/qr` mints a pass: `ML2:` + base32(kind, id, expiry, extra, reference code, HMAC); the layout is documented in `worker/pass.ts`. Registration passes (participant, teacher, performer) carry the registration id; customer-teacher passes (kind 4, for teachers who are not registrants) carry a `customers.id` plus the event id. All fit a version-5 QR.
2. The scanner reads it (`qr-scanner`, native BarcodeDetector where the device has it) and posts it with the staff member's Clerk session token.
3. The Worker verifies the Clerk token (RS256 against Clerk's JWKS, `metadata.role` = `admin` or `reg_staff` from Clerk publicMetadata) and the pass HMAC, then makes two parallel RPC calls (all RPCs live in `musicalumina-web/supabase/migrations`): `check_in_pass` for registration passes (records once per registration and kind) or `check_in_customer_pass` for customer-teacher passes (records once per customer and event; the customer must still be type `teacher` or `music school/institution`), plus `scanner_pass_context`, which says where the holder plays on the published running order (`festival_schedule_*`) and which tickets they hold. A context failure never fails the check-in.

## Tickets and the Participants tab

- Each session seats `events.session_seat_limit` people (default 125; admin → Events → Edit, festival events). Every distinct person on the session's running order brings one guardian, so takes 2 seats; tickets sell the rest.
- `POST /api/tickets` `{ pass, sessionNumber, quantity }` sets (0 clears) the tickets the scanned pass holds via `set_session_tickets`, serialised per session so two desks cannot oversell. Participants and performers buy for the session they play in; teachers pick any session.
- `GET /api/event` (`scanner_event_overview`) returns the ongoing festival's running order grouped by session and category, with check-ins, tickets, and tickets left. The navbar strip and the Participants tab poll it every 30 s.

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
