import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/collections")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) {
          if (denied.status === 401) { const { logSecurityEvent } = await import("@/lib/security-log.server"); await logSecurityEvent({ kind: "cron_unauthorized", severity: "high", request, summary: "A scheduled-job endpoint was called without the right secret." }); }
          return denied;
        }
        const { getAdmin, reconcileStripe, runCollections } = await import("@/lib/billing.server");
        const admin = await getAdmin();
        // Bring local plans and invoices in line with Stripe first, so collections act on live status.
        const stripe = await reconcileStripe(admin);
        const touched = await runCollections(admin);
        return Response.json({ ok: true, touched, stripe });
      },
    },
  },
});
