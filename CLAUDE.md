# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build (vite build)
npm run preview   # Preview production build locally
npm run lint      # ESLint
```

No test framework is configured.

## Environment Variables

Required in `.env` (see `.env.example`):
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase project credentials
- `VITE_JWT_PUBLIC_KEY` — HS256 secret for JWT signature verification
- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk authentication
- `VITE_DATABASE_URL` — PostgreSQL connection string

All env vars use the `VITE_` prefix (Vite exposes them via `import.meta.env`).

## Architecture

React 18 + TypeScript + Vite PWA for scanning QR codes at Musica Lumina competition events.

### Auth Flow

`main.tsx` wraps the app in `ClerkProvider`. `AuthLayout` gates access: only users with `org:admin` role OR "staff" in their email/username can proceed. Unauthorized users are auto-signed-out after 3 seconds.

### QR Scan → Verify Pipeline

1. **QRScanner** — uses the `qr-scanner` library (WebAssembly) with the device camera. Supports pinch-to-zoom and continuous autofocus.
2. **jwtDecoder** — detects JWT tokens, decodes header/payload, verifies HS256 signature against `VITE_JWT_PUBLIC_KEY` using Web Crypto API.
3. **participantVerifier** — takes decoded JWT payload data and verifies against Supabase:
   - First tries matching as a **participant** (`registrations.participant_name` + category/subcategory via joined `event_subcategories` / `event_categories`)
   - Falls back to **teacher** lookup (`registrations.registrant_name` where `registration_status = 'teacher'`)
   - Results are cached in localStorage for 30 minutes (max 100 entries)
   - 150ms throttle between API calls
4. **JWTDecoder component** — displays verification status (signature + database match), participant info with per-field match indicators, and collapsible technical details.

### Supabase Schema (referenced tables)

- `registrations` — columns: `participant_name`, `song_title`, `subcategory_id`, `registrant_name`, `registration_status`, `event_id`, `status`
- `event_subcategories` — joined via `subcategory_id`, has `name` and FK to `event_categories`
- `event_categories` — has `name`

### Tailwind Theme

Custom brand colors defined in `tailwind.config.js`:
- `musica-cream` (#FFFBEF), `musica-burgundy` (#491822), `musica-gold` (#E2A225)

### PWA

Service worker (`public/sw.js`) and manifest (`public/manifest.json`) provide offline capability and installability.
