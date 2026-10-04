# Musica Lumina Check-in

Staff PWA that scans participant passes and checks them in. One Cloudflare
Worker serves the app and `POST /api/checkin`, so there is no CORS and no
separate backend.

## How a scan works

1. `musicalumina-tools/scripts/qr` mints a pass: `ML1:` + base32(kind, registration id, expiry, HMAC). It is 57 characters and renders as a version-4 QR (33×33 modules). The old JWT pass was about version 24.
2. The scanner reads it (`qr-scanner`, native BarcodeDetector where the device has it) and posts it with the staff member's Clerk session token.
3. The Worker verifies the Clerk token (RS256 against Clerk's JWKS, the allowed org, role `admin` or `staff`) and the pass HMAC, then makes one RPC call: `check_in_pass` (in `musicalumina-web/supabase/migrations`). That call records the check-in once per registration and kind, and returns the participant.

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

Fill in the `vars` in `wrangler.jsonc`, then:

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put QR_PASS_SECRET
bun run deploy
```

`QR_PASS_SECRET` must match `musicalumina-tools/.env`. Use a fresh value
(`openssl rand -base64 32`): earlier builds shipped the old JWT secret in the
client bundle.
