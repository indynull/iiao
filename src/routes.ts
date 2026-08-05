/** Permalink: /is/<base64url(subject)> — deterministic, no server store. */

export type Route =
  | { name: "home" }
  | { name: "report"; subject: string };

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSubject(subject: string): string {
  return b64urlEncode(subject.trim());
}

export function decodeSubject(token: string): string | null {
  try {
    const s = b64urlDecode(token);
    if (!s || s.length > 2048) return null;
    return s;
  } catch {
    return null;
  }
}

export function reportPath(subject: string): string {
  return `/is/${encodeSubject(subject)}`;
}

export function parseLocation(pathname: string, search: string): Route {
  const path = pathname.replace(/\/+$/, "") || "/";
  const m = path.match(/^\/is\/([^/]+)$/);
  if (m) {
    const subject = decodeSubject(m[1]!);
    if (subject) return { name: "report", subject };
  }
  const q = new URLSearchParams(search).get("q")?.trim();
  if (q) return { name: "report", subject: q };
  return { name: "home" };
}

export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState({}, "", path);
  else history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
