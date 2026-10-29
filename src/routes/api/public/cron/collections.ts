import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/collections")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { getAdmin, runCollections } = await import("@/lib/billing.server");
        const touched = await runCollections(await getAdmin());
        return Response.json({ ok: true, touched });
      },
    },
  },
});
