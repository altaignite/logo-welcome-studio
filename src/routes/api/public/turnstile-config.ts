import { createFileRoute } from "@tanstack/react-router";

/** The public Turnstile site key (safe to share), so the key can be added in Lovable's secrets without rebuilding. */
export const Route = createFileRoute("/api/public/turnstile-config")({
  server: {
    handlers: {
      GET: async () => {
        const { turnstileKeys } = await import("@/lib/turnstile.server");
        const k = await turnstileKeys();
        // The site key is public by design; it's only offered once the secret is also set, so the widget never runs half-configured.
        return new Response(JSON.stringify({ siteKey: k.siteKey && k.secretKey ? k.siteKey : null }), { headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });
      },
    },
  },
});
