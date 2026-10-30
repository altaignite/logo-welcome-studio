import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Hit = { kind: string; id: string; title: string; subtitle: string | null; account_id: string };
const groups: Record<string, string> = { account: "Clients", invoices: "Invoices", support_tickets: "Support tickets", projects: "Projects", tasks: "Tasks", deliverables: "Deliverables" };

/** Global staff search (Ctrl or Cmd + K) across clients, invoices, tickets, projects, tasks and deliverables. Row level security applies. */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let live = true;
    setBusy(true);
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc("staff_search", { q: q.trim() });
      if (live) { setHits((data ?? []) as Hit[]); setBusy(false); }
    }, 200);
    return () => { live = false; window.clearTimeout(t); };
  }, [q]);
  const go = (h: Hit) => {
    setOpen(false); setQ("");
    if (h.kind === "account") navigate({ to: "/admin/accounts/$id", params: { id: h.id } });
    else navigate({ to: "/admin/records/$kind/$id", params: { kind: h.kind, id: h.id } });
  };
  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border bg-background px-3 text-sm text-muted-foreground hover:bg-secondary sm:w-64">
      <Search className="size-4 shrink-0" /><span className="hidden truncate sm:inline">Search clients, invoices…</span><kbd className="ml-auto hidden rounded border px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0">
      <DialogTitle className="sr-only">Search</DialogTitle>
      {/* Results come from the database already matched, so the palette must not filter them again. */}
      <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3">
      <CommandInput placeholder="Search by name, company, email, account number, invoice…" value={q} onValueChange={setQ} />
      <CommandList>
        <CommandEmpty>{q.trim().length < 2 ? "Type at least two characters." : busy ? "Searching…" : "No matches."}</CommandEmpty>
        {Object.entries(groups).map(([kind, label]) => {
          const list = hits.filter((h) => h.kind === kind);
          return list.length ? <CommandGroup key={kind} heading={label}>
            {list.map((h) => <CommandItem key={`${kind}-${h.id}`} value={`${kind}-${h.id}-${h.title}`} onSelect={() => go(h)}>
              <span className="min-w-0"><span className="block truncate font-medium">{h.title || "Untitled"}</span>{h.subtitle && <span className="block truncate text-xs text-muted-foreground">{h.subtitle.replaceAll("_", " ")}</span>}</span>
            </CommandItem>)}
          </CommandGroup> : null;
        })}
      </CommandList>
      </Command>
      </DialogContent>
    </Dialog>
  </>;
}
