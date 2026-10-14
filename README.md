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

## QRIS (Mayar)

- `events.ticket_price` (IDR; admin → Events → Edit, festival events) prices one ticket. Empty turns QRIS off.
- In the ticket dialog, **Pay with QRIS** asks `POST /api/payments` for (tickets − tickets already held) × price, plus a unique code of 1–9 rupiah. The Worker holds those seats for 5 minutes (`start_ticket_payment`) and creates a Mayar "Pay Me" QR for that amount, e.g. IDR 150,004.
- The dialog calls `POST /api/payments/status` every second. The Worker reads Mayar's latest payme credits, and `settle_ticket_payment` claims the first unclaimed `paid`/`settled` credit of exactly that amount made while the QR was live, then adds the tickets. **Cancel payment** checks one last time before dropping the QR.
- Mayar's history does not say which QR a credit paid, so the amount is the only link. The unique code is picked at random from the codes no waiting QR of the same base amount is using, so up to nine desks can wait on the same number of tickets at once. A tenth is refused until one is paid, cancelled or expired.
- The code also keeps round Pay Me credits from elsewhere on the account from matching a desk QR. A non-round credit of exactly the same amount made while that QR waits would still be claimed, so avoid using Pay Me elsewhere during the festival.
- A payment that lands after its QR was cancelled or expired adds no tickets by itself. The navbar shows "N unclaimed" (`GET /api/payments/unclaimed`, polled every 30 s). The dialog lists each Mayar credit with the closed QRs of exactly that amount. **Add N tickets** (`POST /api/payments/claim`) re-reads the credit from Mayar and gives the tickets to that QR's holder. Each credit can be claimed once.
- `MAYAR_TOKEN` is the Mayar app's bearer token, not an API key. The access token expires about 24 h after sign-in, and the desk then shows "QRIS is signed out of Mayar". To rotate it, run `wrangler secret put MAYAR_TOKEN`. Secrets apply to the next request, so no redeploy is needed.

## Develop

```bash
bun install
cp .env.example .env              # VITE_CLERK_PUBLISHABLE_KEY
cp .dev.vars.example .dev.vars    # SUPABASE_SERVICE_ROLE_KEY, QR_PASS_SECRET, MAYAR_TOKEN
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
wrangler secret put MAYAR_TOKEN   # again whenever Mayar signs it out
bun run deploy
```

`QR_PASS_SECRET` must match `musicalumina-tools/.env`. Use a fresh value
(`openssl rand -base64 32`): earlier builds shipped the old JWT secret in the
client bundle.
