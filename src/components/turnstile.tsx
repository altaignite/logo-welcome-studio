import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void; getResponse: (id: string) => string | undefined } }
}

let config: Promise<string | null> | null = null;
const siteKey = () => (config ??= fetch("/api/public/turnstile-config").then((r) => r.json()).then((d: { siteKey?: string | null }) => d.siteKey ?? null).catch(() => null));
let script: Promise<void> | null = null;
const loadScript = () => (script ??= new Promise<void>((ok, fail) => {
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = () => ok(); s.onerror = () => fail(new Error("turnstile"));
  document.head.appendChild(s);
}));

/** Cloudflare Turnstile. Renders nothing until a site key is configured. getToken() returns a fresh single-use token (or null when
 * Turnstile is off or unavailable); call it right before each protected request. */
export function useTurnstile() {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const waiters = useRef<((t: string | null) => void)[]>([]);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let gone = false;
    void (async () => {
      const key = await siteKey();
      if (!key || gone) return;
      try { await loadScript(); } catch { return; }
      if (gone || !box.current || !window.turnstile) return;
      setEnabled(true);
      id.current = window.turnstile.render(box.current, {
        sitekey: key, appearance: "interaction-only", "refresh-expired": "auto",
        callback: (t: string) => { waiters.current.splice(0).forEach((w) => w(t)); },
        "error-callback": () => { waiters.current.splice(0).forEach((w) => w(null)); },
      });
    })();
    return () => { gone = true; if (id.current && window.turnstile) window.turnstile.remove(id.current); };
  }, []);
  const getToken = async (): Promise<string | null> => {
    if (!enabled || !id.current || !window.turnstile) return null;
    const ready = window.turnstile.getResponse(id.current);
    if (ready) { const t = ready; window.turnstile.reset(id.current); return t; }
    return new Promise((ok) => {
      waiters.current.push((t) => { if (id.current) window.turnstile?.reset(id.current); ok(t); });
      setTimeout(() => ok(null), 15000);
    });
  };
  const widget = <div ref={box} className="flex justify-center [&:empty]:hidden" />;
  return { widget, getToken, enabled };
}
