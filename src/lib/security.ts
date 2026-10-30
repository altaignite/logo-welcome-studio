/** Sign-in location rules shared by the sign-in recorder and its tests. */
export type SignInPlace = { ip: string | null; country: string | null; region: string | null; city: string | null };

/** Where a request came from, from Cloudflare's network headers (the app runs on Cloudflare Workers) or proxy headers. */
export function placeFromRequest(headers: Headers, cf?: { country?: string; region?: string; city?: string } | null): SignInPlace {
  const clean = (v: string | null | undefined, max = 80) => { const s = (v ?? "").trim(); return s && s !== "XX" && s !== "T1" ? s.slice(0, max) : null; };
  const ip = clean(headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0], 64);
  return { ip, country: clean(cf?.country ?? headers.get("cf-ipcountry"), 8), region: clean(cf?.region ?? headers.get("cf-region")), city: clean(cf?.city ?? headers.get("cf-ipcity")) };
}

/** Network prefix used when there's no geolocation: /16 for IPv4, /32 for IPv6. */
export function ipNetwork(ip: string | null) {
  if (!ip) return null;
  if (ip.includes(":")) return ip.split(":").slice(0, 2).join(":").toLowerCase();
  const p = ip.split(".");
  return p.length === 4 ? `${p[0]}.${p[1]}` : null;
}

/** Comparable location: country and city (or region) when known, otherwise the IP network. */
export function locationKey(p: SignInPlace) {
  if (p.country) return `${p.country.toUpperCase()}|${(p.city ?? p.region ?? "").toLowerCase()}`;
  const net = ipNetwork(p.ip);
  return net ? `net|${net}` : null;
}

/** A sign-in is from a new location when the user has signed in before and never from this location. The first sign-in isn't flagged. */
export function isNewLocation(place: SignInPlace, previous: SignInPlace[]) {
  const key = locationKey(place);
  if (!key || previous.length === 0) return false;
  return !previous.some((p) => locationKey(p) === key);
}

export const placeLabel = (p: Partial<SignInPlace>) => [p.city, p.region, p.country].filter(Boolean).join(", ") || p.ip || "Unknown location";

/** Basic browser and device description from a user agent, for the sessions list. */
export function deviceLabel(ua: string | null | undefined) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** User metadata staff may set: short flat values only, so it can't be used to smuggle large or nested data. */
export function metadataIssue(m: Record<string, unknown>) {
  const keys = Object.keys(m);
  if (keys.length > 30) return "Use at most 30 fields.";
  for (const k of keys) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(k)) return `"${k}" isn't a valid field name. Use lower case letters, numbers and underscores.`;
    const v = m[k];
    if (v !== null && !["string", "number", "boolean"].includes(typeof v)) return `"${k}" must be text, a number, true/false or empty.`;
    if (typeof v === "string" && v.length > 500) return `"${k}" is too long.`;
  }
  return JSON.stringify(m).length > 4000 ? "Metadata is too large." : null;
}
