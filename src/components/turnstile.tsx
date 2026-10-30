import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void; getResponse: (id: string) => string | undefined } }
}

/** The project's Turnstile widget (site keys are public). /api/public/turnstile-config can override it. */
export const TURNSTILE_SITE_KEY = "0x4AAAAAAFsskqAgEnHzOGC5";

const siteKey = async () => {
  try {
    const r = await fetch("/api/public/turnstile-config", { cache: "no-store" });
    const d = (await r.json()) as { siteKey?: string | null; enabled?: boolean };
    return d.enabled === false ? null : d.siteKey ?? TURNSTILE_SITE_KEY;
  } catch { return TURNSTILE_SITE_KEY; }
};
let script: Promise<void> | null = null;
const loadScript = () => (script ??= new Promise<void>((ok, fail) => {
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = () => ok(); s.onerror = () => { script = null; fail(new Error("turnstile")); };
  document.head.appendChild(s);
}));

/** Cloudflare Turnstile. getToken() waits for the widget (up to 20 s) and returns a fresh single-use token, or null when bot
 * protection is off or the widget couldn't load; call it right before each protected request. */
export function useTurnstile() {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiters = useRef<((t: string | null) => void)[]>([]);
  const ready = useRef<Promise<boolean> | null>(null);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let gone = false;
    ready.current = (async () => {
      const key = await siteKey();
      if (!key || gone) return false;
      try { await loadScript(); } catch { return false; }
      if (gone || !box.current || !window.turnstile) return false;
      setEnabled(true);
      id.current = window.turnstile.render(box.current, {
        sitekey: key, appearance: "interaction-only", "refresh-expired": "auto", "retry": "auto",
        callback: (t: string) => { token.current = t; waiters.current.splice(0).forEach((w) => w(t)); },
        "expired-callback": () => { token.current = null; },
        "error-callback": () => { token.current = null; waiters.current.splice(0).forEach((w) => w(null)); },
      });
      return true;
    })();
    return () => { gone = true; if (id.current && window.turnstile) window.turnstile.remove(id.current); };
  }, []);
  const getToken = async (): Promise<string | null> => {
    if (!(await ready.current) || !id.current || !window.turnstile) return null;
    const take = (t: string) => { token.current = null; window.turnstile?.reset(id.current!); return t; };
    if (token.current) return take(token.current);
    return new Promise((ok) => {
      const timer = setTimeout(() => ok(null), 20000);
      waiters.current.push((t) => { clearTimeout(timer); ok(t ? take(t) : null); });
    });
  };
  const widget = <div ref={box} className="flex justify-center [&:empty]:hidden" />;
  return { widget, getToken, enabled };
}
