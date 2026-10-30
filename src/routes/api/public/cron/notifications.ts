import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Schedule every 10 minutes: sends notification emails, flags overdue ticket replies and runs the daily reminders once a day. */
export const Route = createFileRoute("/api/public/cron/notifications")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) {
          if (denied.status === 401) { const { logSecurityEvent } = await import("@/lib/security-log.server"); await logSecurityEvent({ kind: "cron_unauthorized", severity: "high", request, summary: "A scheduled-job endpoint was called without the right secret." }); }
          return denied;
        }
        const { getAdmin } = await import("@/lib/billing.server");
        const { checkReplyTimes, runDailyReminders, runOutbox } = await import("@/lib/jobs.server");
        const admin = await getAdmin();
        const origin = process.env["APP_URL"] ?? new URL(request.url).origin;
        const reminders = await runDailyReminders(admin);
        const replies = await checkReplyTimes(admin);
        const email = await runOutbox(admin, origin);
        return Response.json({ ok: true, reminders, replies, email });
      },
    },
  },
});
