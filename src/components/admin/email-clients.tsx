import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { FormModal } from "@/components/admin/form-modal";
import { db } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";
import { placeholders } from "@/lib/templates";
import { sendClientMessage } from "@/lib/staff.functions";

type Template = { id: string; name: string; subject: string; body: string; purpose: "service" | "marketing" };

/** "Email clients" flow: pick a template (or none), edit, send. Returns an opener and the modal element. */
export function useEmailClients(onSent?: () => void) {
  const popup = usePopup();
  const send = useServerFn(sendClientMessage);
  const [target, setTarget] = useState<{ ids: string[]; step: "pick" | "write"; template?: Template } | null>(null);
  const templates = useQuery({ queryKey: ["admin", "templates"], queryFn: async () => ((await db.from("message_templates").select("*").order("name")).data ?? []) as Template[] });
  const open = (ids: string[]) => setTarget({ ids, step: (templates.data ?? []).length ? "pick" : "write" });
  const count = target?.ids.length ?? 0;
  const el = target && (target.step === "pick"
    ? <FormModal title={`Email ${count} client${count === 1 ? "" : "s"}`} submitLabel="Continue" description="Start from a template or write a new message."
        fields={[{ name: "template", label: "Template", type: "select", options: ["No template", ...(templates.data ?? []).map((t) => t.name)] }]}
        onClose={() => setTarget(null)}
        onSubmit={async (v) => { const t = templates.data?.find((x) => x.name === v.template); setTimeout(() => setTarget({ ids: target.ids, step: "write", ...(t ? { template: t } : {}) })); return null; }} />
    : <FormModal title={`Email ${count} client${count === 1 ? "" : "s"}`} submitLabel="Send"
        description={`Placeholders: ${placeholders.map((p) => `{{${p}}}`).join(", ")}. Clients also see it in their dashboard. Marketing emails only go to clients who opted in.`}
        fields={[
          { name: "purpose", label: "Type", type: "select", options: ["service", "marketing"], defaultValue: target.template?.purpose ?? "service" },
          { name: "subject", label: "Subject", required: true, max: 200, defaultValue: target.template?.subject ?? "" },
          { name: "body", label: "Message", type: "textarea", required: true, max: 2000, defaultValue: target.template?.body ?? "Hi {{first_name}},\n\n" },
        ]}
        onClose={() => setTarget(null)}
        onSubmit={async (v) => {
          try {
            const r = await send({ data: { userIds: target.ids, subject: v.subject, body: v.body, purpose: v.purpose as "service" | "marketing" } });
            onSent?.();
            popup({ type: "success", title: `Sent to ${r.sent} client${r.sent === 1 ? "" : "s"}`, description: r.skipped.length ? `Skipped: ${r.skipped.join("; ")}` : "Each email is logged as an activity on the account.", primaryLabel: "Done", secondaryLabel: null });
            return null;
          } catch (e) { return (e as Error).message; }
        }} />);
  return { open, el };
}
