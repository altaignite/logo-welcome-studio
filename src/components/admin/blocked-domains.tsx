import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { X } from "lucide-react";
import { Section, db } from "@/components/admin/record-bits";
import { usePopup } from "@/components/popup";

/** Email domains refused at signup and on email change (checked by the database). */
export function BlockedDomains({ canEdit, adminEmail }: { canEdit: boolean; adminEmail: string }) {
  const qc = useQueryClient();
  const popup = usePopup();
  const [domain, setDomain] = useState("");
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({ queryKey: ["admin", "blocked-domains"], queryFn: async () => ((await db.from("blocked_email_domains").select("domain, reason, created_by_label").order("domain")).data ?? []) as { domain: string; reason: string; created_by_label: string }[] });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "blocked-domains"] });
  const add = async () => {
    const d = domain.trim().toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return popup({ type: "error", title: "Enter a domain", description: "For example example.com, without the @ or a name.", primaryLabel: "Close", secondaryLabel: null });
    const r = await db.from("blocked_email_domains").insert({ domain: d, reason: "Blocked by staff", created_by_label: adminEmail });
    if (r.error) popup({ type: "error", title: "Couldn't add it", description: r.error.message, primaryLabel: "Close", secondaryLabel: null });
    setDomain(""); await refresh();
  };
  const remove = (d: string) => popup({ type: "info", title: `Allow ${d} again?`, primaryLabel: "Allow", secondaryLabel: "Cancel",
    onPrimary: async () => { const r = await db.from("blocked_email_domains").delete().eq("domain", d); if (r.error) popup({ type: "error", title: "Couldn't remove it", description: r.error.message, primaryLabel: "Close", secondaryLabel: null }); await refresh(); } });
  const shown = data.filter((d) => d.domain.includes(q.trim().toLowerCase()));
  return (
    <Section title={`Blocked email domains (${data.length})`}>
      <div className="space-y-3 p-5 text-sm">
        <p className="text-muted-foreground">Disposable and temporary email providers can't be used to sign up or change an email address. Subdomains are blocked too.</p>
        <div className="flex flex-wrap gap-2">
          {canEdit && <><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" className="h-9 rounded-lg border bg-background px-2.5" /><button type="button" onClick={add} className="h-9 rounded-full bg-foreground px-4 font-semibold text-background">Block domain</button></>}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search blocked domains" className="ml-auto h-9 rounded-lg border bg-background px-2.5" />
        </div>
        <ul className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">{shown.map((d) => <li key={d.domain} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs">{d.domain}
          {canEdit && <button type="button" aria-label={`Allow ${d.domain}`} onClick={() => remove(d.domain)}><X className="size-3" /></button>}</li>)}</ul>
      </div>
    </Section>
  );
}
