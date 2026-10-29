import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { countries, type CountryCode } from "@/lib/signup";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CountryField({ value, onChange, phone = false }: {
  value: string; onChange: (country: CountryCode) => void; phone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = countries.find((country) => country.code === value);
  const filtered = countries.filter((c) => `${c.name} ${c.code} ${c.dial}`.toLowerCase().includes(search.toLowerCase()));
  return <Popover open={open} onOpenChange={(v) => { setOpen(v); setSearch(""); }}>
    <PopoverTrigger asChild>
      <Button variant="ghost" type="button" aria-label={phone ? "Mobile country code" : "Country"} className={phone ? "h-11 shrink-0 rounded-none border-r px-3" : "signup-input justify-between font-normal"}>
        <span>{phone ? selected?.code ?? "Code" : selected?.name ?? "Select country"}</span><ChevronDown className="size-4 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
      <div className="relative border-b p-3"><Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus aria-label="Search countries" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search country or code" className="h-10 w-full rounded-md bg-secondary pl-8 pr-3 text-base outline-none focus:ring-1 focus:ring-primary" /></div>
      <div role="listbox" aria-label="Countries A to Z" className="max-h-64 overflow-y-auto p-1">
        {filtered.map((c) => <Button key={c.code} variant="ghost" role="option" aria-selected={c.code === value} className="h-11 w-full justify-between rounded-sm px-3 font-normal" onClick={() => { onChange(c.code); setOpen(false); }}><span className="truncate">{c.name}</span><span className="ml-2 flex items-center gap-2 text-muted-foreground">{c.dial}{value === c.code && <Check className="size-4 text-primary" />}</span></Button>)}
        {!filtered.length && <p className="p-4 text-sm text-muted-foreground">No countries found.</p>}
      </div>
    </PopoverContent>
  </Popover>;
}