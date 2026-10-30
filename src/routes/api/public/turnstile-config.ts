import { createFileRoute } from "@tanstack/react-router";

/** The public Turnstile site key (safe to share), so the key can be added in Lovable's secrets without rebuilding. */
export const Route = createFileRoute("/api/public/turnstile-config")({
  server: {
    handlers: {
      GET: async () => {
        const { turnstileSiteKey } = await import("@/lib/turnstile.server");
        return new Response(JSON.stringify({ siteKey: turnstileSiteKey() }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
      },
    },
  },
});
