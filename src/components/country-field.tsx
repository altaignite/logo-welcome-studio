import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { countries, type CountryCode } from "@/lib/signup";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CountryFlag({ code }: { code: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !countries.some((country) => country.code === code)) return null;
  return <img src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`} alt="" width={24} height={18} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-4 w-6 shrink-0 object-contain" />;
}

export function CountryField({ value, onChange, phone = false }: {
  value: string; onChange: (country: CountryCode) => void; phone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = countries.find((country) => country.code === value);
  // The list is only built while the picker is open: two closed pickers would otherwise render ~500 rows on every keystroke.
  const filtered = open ? countries.filter((c) => (phone ? `${c.name} ${c.dial}` : c.name).toLowerCase().includes(search.toLowerCase())) : [];
  return <Popover open={open} onOpenChange={(v) => { setOpen(v); setSearch(""); }}>
    <PopoverTrigger asChild>
      <Button variant="ghost" type="button" aria-label={phone ? "Mobile country code" : "Country"} className={phone ? "h-full shrink-0 gap-1.5 rounded-none border-r px-3 font-normal hover:bg-secondary" : "signup-input justify-between font-normal hover:bg-background"}>
        <span className="flex min-w-0 items-center gap-2">{selected && <CountryFlag key={selected.code} code={selected.code} />}<span className="truncate">{phone ? selected?.dial ?? "Code" : selected?.name ?? "Select country"}</span></span><ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] p-0">
      <div className="relative border-b p-3"><Search className="absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input autoFocus aria-label="Search countries" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={phone ? "Search country or code" : "Search country"} className="h-10 w-full rounded-md bg-secondary pl-8 pr-3 text-base outline-none focus:ring-1 focus:ring-primary" /></div>
      <div role="listbox" aria-label="Countries A to Z" className="max-h-64 overflow-y-auto p-1">
        {filtered.map((c) => <Button key={c.code} variant="ghost" role="option" aria-selected={c.code === value} className="h-11 w-full justify-between rounded-sm px-3 font-normal" onClick={() => { onChange(c.code); setOpen(false); }}><span className="flex min-w-0 items-center gap-2"><CountryFlag code={c.code} /><span className="truncate">{c.name}</span></span><span className="ml-2 flex shrink-0 items-center gap-2 text-muted-foreground">{phone && c.dial}{value === c.code && <Check className="size-4 text-primary" />}</span></Button>)}
        {!filtered.length && <p className="p-4 text-sm text-muted-foreground">No countries found.</p>}
      </div>
    </PopoverContent>}
  </Popover>;
}