# Musica Lumina – QR Scanner PWA

A lightweight Progressive Web App for fast event check-ins. Built for the **Musica Lumina** competition, it scans QR codes, decodes embedded JWT payloads, and verifies participant data against a Supabase database — all behind a Clerk-powered login.

## ✨ Tech Stack

• **React 18 + TypeScript** – UI & state management  
• **Vite** – lightning-fast dev/build tool  
• **Tailwind CSS** – utility-first styling (custom Musica Lumina palette)  
• **Clerk** – authentication & user management  
• **Supabase** – Postgres DB + REST API (participant verification)  
• **qr-scanner** – tiny WebAssembly QR reader  
• **PWA** – installable, offline-ready (service worker)

## 🚀 What does it do?

1. User signs in via Clerk.
2. App accesses the camera and scans QR codes.
3. If the QR contains a JWT, the signature is verified and the payload decoded.
4. Participant info in the token is cross-checked with Supabase to confirm authenticity (with smart local caching to avoid rate limits).
5. Results are displayed instantly, along with scan history and optional deep links.

That's it — a fast, themed QR scanning tool for smooth, reliable on-site registrations. 