import { useMemo, useState, type ReactNode } from "react";
import { ChevronsUpDown, Download, Search } from "lucide-react";

export type Column<T> = { key: string; label: string; value: (row: T) => string | number; render?: (row: T) => ReactNode };

export function DataTable<T>({ rows, columns, onRowClick, empty = "Nothing here yet.", toolbar, searchable = true, title }: {
  rows: T[]; columns: Column<T>[]; onRowClick?: (row: T) => void; empty?: string; toolbar?: ReactNode; searchable?: boolean; title?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    let r = rows;
    if (q.trim()) {
      const t = q.toLowerCase();
      r = r.filter((row) => columns.some((c) => String(c.value(row)).toLowerCase().includes(t)));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) r = [...r].sort((a, b) => (col.value(a) > col.value(b) ? 1 : col.value(a) < col.value(b) ? -1 : 0) * sort.dir);
    }
    return r;
  }, [rows, columns, q, sort]);
  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
    const csv = [columns.map((c) => esc(c.label)).join(","), ...shown.map((r) => columns.map((c) => esc(c.value(r))).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `${(title ?? "export").toLowerCase().replaceAll(/\s+/g, "-")}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        {searchable && <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search table" className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </label>}
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          <button type="button" onClick={exportCsv} className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-secondary"><Download className="size-4" />Export</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-secondary/40">
              {columns.map((c) => (
                <th key={c.key} className="border-r px-4 py-3 text-left font-semibold last:border-r-0">
                  <button type="button" className="inline-flex items-center gap-1" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                    {c.label}<ChevronsUpDown className="size-3.5 text-muted-foreground" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">{empty}</td></tr>
            ) : shown.map((row, i) => (
              <tr key={i} onClick={onRowClick ? () => onRowClick(row) : undefined} className={`border-b last:border-b-0 ${onRowClick ? "cursor-pointer hover:bg-secondary/50" : ""}`}>
                {columns.map((c) => <td key={c.key} className="whitespace-nowrap border-r px-4 py-3 last:border-r-0">{c.render ? c.render(row) : c.value(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <StatusBadgeInner status={status} label={label ?? status.replaceAll("_", " ")} />;
}
import { statusTone } from "@/lib/admin";
function StatusBadgeInner({ status, label }: { status: string; label: string }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${statusTone(status)}`}>{label}</span>;
}
