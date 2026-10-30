import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { safeLink, timeAgo } from "@/lib/notifications";

type Note = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

/** Inbox bell for the client and admin headers. Notifications are created by the database; this only reads and marks them read. */
export function NotificationBell({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const key = ["notifications", userId];
  const { data = [] } = useQuery({
    queryKey: key, refetchInterval: 60_000,
    queryFn: async () => ((await supabase.from("notifications").select("id, title, body, link, read_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(40)).data ?? []) as Note[],
  });
  const unread = data.filter((n) => !n.read_at).length;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const markRead = async (ids?: string[]) => { await supabase.rpc("mark_notifications_read", ids ? { _ids: ids } : {}); await qc.invalidateQueries({ queryKey: key }); };
  const pick = async (n: Note) => {
    setOpen(false);
    if (!n.read_at) await markRead([n.id]);
    const link = safeLink(n.link);
    if (link) navigate({ to: link });
  };
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} aria-expanded={open} className="relative rounded-lg p-2 hover:bg-secondary">
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 max-h-[70dvh] overflow-hidden rounded-2xl border bg-card shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-96">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && <button type="button" onClick={() => markRead()} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><CheckCheck className="size-3.5" />Mark all read</button>}
          </div>
          <ul className="max-h-[calc(70dvh-3rem)] divide-y overflow-y-auto">
            {data.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => pick(n)} className={`block w-full px-4 py-3 text-left hover:bg-secondary/60 ${n.read_at ? "" : "bg-primary/5"}`}>
                  <span className="flex items-start gap-2">
                    {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block whitespace-pre-wrap text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {data.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">You're all caught up.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
