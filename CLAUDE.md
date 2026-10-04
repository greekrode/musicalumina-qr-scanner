# CLAUDE.md

See README.md for architecture, commands and deploy. Key rules:

- bun only (`bun install`, `bun run dev`, `bun test`). Deploys run on Cloudflare Workers Builds from `main`.
- The Worker (`worker/index.ts`) is the trust boundary: it verifies the Clerk session and the pass HMAC. Never put secrets in `VITE_*` vars; they ship in the bundle.
- `worker/pass.ts` must stay identical to `musicalumina-tools/scripts/qr/pass.ts` (pinned by the test vector).
- UI follows the musicalumina-web design tokens (`src/styles/tokens.css` is copied from there).
