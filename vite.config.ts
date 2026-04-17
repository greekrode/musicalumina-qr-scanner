import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load all env vars, including non-VITE_ prefixed ones used server-side.
  const env = loadEnv(mode, process.cwd(), "");
  const webhookUrl = env.AIRTABLE_WEBHOOK_URL;

  let proxy: Record<string, unknown> | undefined;
  if (webhookUrl) {
    try {
      const parsed = new URL(webhookUrl);
      proxy = {
        "/api/airtable-webhook": {
          target: `${parsed.protocol}//${parsed.host}`,
          changeOrigin: true,
          secure: true,
          rewrite: () => parsed.pathname + parsed.search,
        },
      };
    } catch {
      console.warn(
        "[vite] AIRTABLE_WEBHOOK_URL is set but not a valid URL — proxy disabled"
      );
    }
  } else {
    console.warn(
      "[vite] AIRTABLE_WEBHOOK_URL not set — /api/airtable-webhook proxy disabled"
    );
  }

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
    server: proxy ? { proxy } : {},
  };
});
