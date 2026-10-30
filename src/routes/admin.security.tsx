import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DataTable, StatusBadge } from "@/components/admin/data-table";
import { Section } from "@/components/admin/record-bits";
import { ErrorState, PageSkeleton } from "@/components/loading";
import { usePopup } from "@/components/popup";
import { formatDate } from "@/lib/admin";
import { countryName } from "@/lib/security";
import { guideFor, severityRank } from "@/lib/security-guide";
import { resolveSecurityEvent, securityOverview } from "@/lib/security.functions";

export const Route = createFileRoute("/admin/security")({
  head: () => ({ meta: [{ title: "Security log — FP admin" }] }),
  component: SecurityPage,
});

type Ev = { id: string; kind: string; severity: string; ip: string | null; country: string | null; user_id: string | null; path: string | null; detail: { summary?: string } & Record<string, unknown>; count: number; first_seen: string; last_seen: string; resolved_at: string | null; resolved_by_label: string | null };
const sevStatus: Record<string, string> = { critical: "failed", high: "overdue", medium: "pending", low: "draft" };

/** Owners see what the server blocked or flagged, possible data leaks, request volume and what to do about each event. */
function SecurityPage() {
  const qc = useQueryClient();
  const popup = usePopup();
  const load = useServerFn(securityOverview), resolve = useServerFn(resolveSecurityEvent);
  const q = useQuery({ queryKey: ["admin", "security"], queryFn: () => load(), refetchInterval: 60_000 });
  const [open, setOpen] = useState<Ev | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  if (q.isLoading) return <PageSkeleton />;
  if (q.error || !q.data) return <ErrorState error={q.error ?? new Error("Couldn't load the security log.")} retry={() => void q.refetch()} />;
  const d = q.data;
  const events = (d.events as Ev[]).filter((e) => showResolved || !e.resolved_at).sort((a, b) => (severityRank[b.severity] ?? 0) - (severityRank[a.severity] ?? 0) || b.last_seen.localeCompare(a.last_seen));
  const openEvents = (d.events as Ev[]).filter((e) => !e.resolved_at);
  const day = Date.now() - 864e5;
  const attacks24 = (d.events as Ev[]).filter((e) => new Date(e.last_seen).getTime() > day && !guideFor(e.kind).leak).reduce((n, e) => n + e.count, 0);
  const leaks = (d.events as Ev[]).filter((e) => guideFor(e.kind).leak);
  const requests24 = d.requestsPerHour.reduce((n, h) => n + h.count, 0);
  const peak = Math.max(1, ...d.requestsPerHour.map((h) => h.count));
  const where = (e: Ev) => [e.ip, e.country ? countryName(e.country) : null].filter(Boolean).join(", ") || "—";
  const mark = async (e: Ev) => {
    try { await resolve({ data: { id: e.id } }); setOpen(null); await qc.invalidateQueries({ queryKey: ["admin", "security"] }); }
    catch (err) { popup({ type: "error", title: "Couldn't update the event", description: (err as Error).message, primaryLabel: "Close", secondaryLabel: null }); }
  };
  const stat = (label: string, value: string | number, hint: string) => <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p><p className="mt-0.5 text-xs text-muted-foreground">{hint}</p></div>;
  const g = open ? guideFor(open.kind) : null;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold sm:text-3xl">Security log</h1>
        <p className="mt-1 text-sm text-muted-foreground">What the server blocked or flagged, possible data leaks, and what to do. Repeats are grouped per source and hour. Network floods stopped by Cloudflare before reaching the app appear in your hosting analytics, not here.</p></div>
      <div className={`rounded-xl border p-3 text-sm ${d.botProtection ? "" : "border-destructive/30 bg-destructive/5"}`}>{d.botProtection ? "Bot protection (Cloudflare Turnstile) is on for signup, login and password resets." : "Bot protection is off. Create a Turnstile widget in Cloudflare and add TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY to Lovable's secrets to turn it on."}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stat("Open events", openEvents.length, `${openEvents.filter((e) => severityRank[e.severity]! >= 3).length} high or critical`)}
        {stat("Blocked attempts, 24 h", attacks24, "Rate limits, probes, fakes and refusals")}
        {stat("Server actions, 24 h", requests24.toLocaleString(), `${d.signIns.total} sign-ins from ${d.signIns.distinctIps} IPs`)}
        {stat("Possible data exposure, 30 d", leaks.length, "Staff and privacy exports")}
      </div>

      <DataTable<Ev> title={showResolved ? "All events (30 days)" : "Open events"} rows={events} getId={(e) => e.id} onRowClick={setOpen} empty="Nothing to review. Blocked attempts appear here."
        toolbar={<button type="button" onClick={() => setShowResolved((v) => !v)} className="h-9 rounded-full border px-4 text-xs font-semibold hover:bg-secondary">{showResolved ? "Open only" : "Include resolved"}</button>}
        columns={[
          { key: "sev", label: "Severity", value: (e) => severityRank[e.severity] ?? 0, render: (e) => <StatusBadge status={sevStatus[e.severity] ?? "draft"} label={e.severity} /> },
          { key: "what", label: "Event", value: (e) => guideFor(e.kind).title, render: (e) => <span className="font-medium">{guideFor(e.kind).title}</span> },
          { key: "summary", label: "Details", value: (e) => e.detail?.summary ?? "", render: (e) => <span className="line-clamp-2 max-w-md text-muted-foreground">{e.detail?.summary ?? "—"}</span> },
          { key: "count", label: "Times", value: (e) => e.count },
          { key: "src", label: "Source", value: (e) => where(e) },
          { key: "last", label: "Last seen", value: (e) => e.last_seen, render: (e) => formatDate(e.last_seen) },
        ]} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Server actions per hour (24 h)">
          <div className="flex h-32 items-end gap-0.5 p-5" aria-label="Server actions per hour">{d.requestsPerHour.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : d.requestsPerHour.map((h) => <div key={h.hour} title={`${h.hour.replace("T", " ")}:00 UTC: ${h.count}`} className="min-w-1 flex-1 rounded-t bg-foreground/80" style={{ height: `${Math.max(4, (h.count / peak) * 100)}%` }} />)}</div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">A sudden spike from one account or address is worth checking against the heaviest users below.</p>
        </Section>
        <Section title="Heaviest users (24 h)">
          {d.heaviestUsers.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No activity yet.</p> : <ul className="divide-y text-sm">{d.heaviestUsers.map((u) => <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <Link to="/admin/accounts/$id" params={{ id: u.id }} className="min-w-0 truncate hover:underline">{u.email ?? u.account ?? u.id}</Link><span className="shrink-0 tabular-nums text-muted-foreground">{u.count.toLocaleString()} actions</span></li>)}</ul>}
        </Section>
        <Section title="New sign-in locations (24 h)">
          {d.signIns.newLocations.length === 0 ? <p className="p-5 text-sm text-muted-foreground">None.</p> : <ul className="divide-y text-sm">{d.signIns.newLocations.map((s: { id: string; user_id: string; ip: string | null; city: string | null; country: string | null; created_at: string }) => <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
            <Link to="/admin/accounts/$id" params={{ id: s.user_id }} className="min-w-0 truncate hover:underline">{[s.city, countryName(s.country)].filter(Boolean).join(", ") || s.ip || "Unknown"}</Link><span className="shrink-0 text-xs text-muted-foreground">{formatDate(s.created_at)}</span></li>)}</ul>}
        </Section>
        <Section title="Restricted accounts">
          {d.restricted.length === 0 ? <p className="p-5 text-sm text-muted-foreground">None.</p> : <ul className="divide-y text-sm">{d.restricted.map((p: { id: string; account_number: string; first_name: string | null; last_name: string | null; status: string; status_reason: string | null }) => <li key={p.id} className="px-5 py-2.5">
            <Link to="/admin/accounts/$id" params={{ id: p.id }} className="font-medium hover:underline">{`${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.account_number}</Link> <span className="text-xs text-muted-foreground">{p.status === "fraud_kyc" ? "Fraud - KYC" : "Suspended"}</span>
            {p.status_reason && <p className="line-clamp-2 text-xs text-muted-foreground">{p.status_reason}</p>}</li>)}</ul>}
        </Section>
      </div>

      {open && g && <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" role="dialog" aria-modal="true" aria-label={g.title} onClick={() => setOpen(null)}>
        <div className="app-modal max-w-xl text-left" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2"><StatusBadge status={sevStatus[open.severity] ?? "draft"} label={open.severity} /><h2 className="text-lg font-bold">{g.title}</h2></div>
          <p className="mt-2 text-sm">{open.detail?.summary}</p>
          <dl className="mt-4 divide-y border-y text-sm">
            {[["Times", String(open.count)], ["First seen", formatDate(open.first_seen)], ["Last seen", formatDate(open.last_seen)], ["Source", where(open)], ["Address", open.path ?? "—"], ...(open.resolved_at ? [["Resolved", `${formatDate(open.resolved_at)} by ${open.resolved_by_label ?? "staff"}`]] : [])].map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-all text-right">{v}</dd></div>)}
          </dl>
          <h3 className="mt-4 text-sm font-semibold">What it means</h3><p className="mt-1 text-sm text-muted-foreground">{g.meaning}</p>
          <h3 className="mt-4 text-sm font-semibold">What to do</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{g.actions.map((a) => <li key={a}>{a}</li>)}</ul>
          <div className="mt-5 space-y-2">
            {open.user_id && <Link to="/admin/accounts/$id" params={{ id: open.user_id }} className="signup-primary inline-flex items-center justify-center text-sm">Open the account</Link>}
            {!open.resolved_at && <button type="button" onClick={() => void mark(open)} className={open.user_id ? "app-modal-secondary" : "signup-primary text-sm"}>Mark as resolved</button>}
            <button type="button" onClick={() => setOpen(null)} className="app-modal-secondary">Close</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
