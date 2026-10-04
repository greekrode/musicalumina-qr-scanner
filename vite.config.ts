import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ["lucide-react"] },
  // `bun run dev:worker` serves /api on 8787; in production the Worker is same-origin.
  server: { proxy: { "/api": "http://localhost:8787" } },
});
