/**
 * LinkedIn public profiles: extract a person name when the page is readable,
 * or from /in/slug when LinkedIn returns a bot wall (status 999 / empty HTML).
 */
import type { ProbeResult } from "./types";

export function isLinkedInProfileUrl(input: string): boolean {
  try {
    const u = new URL(input.includes("://") ? input : `https://${input}`);
    return (
      /(^|\.)linkedin\.com$/i.test(u.hostname) &&
      /^\/in\/[^/]+/i.test(u.pathname)
    );
  } catch {
    return false;
  }
}

export function linkedInSlug(input: string): string | null {
  try {
    const u = new URL(input.includes("://") ? input : `https://${input}`);
    const m = u.pathname.match(/^\/in\/([^/?#]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** "Bill Gates - Chair, … | LinkedIn" → Bill Gates */
export function nameFromLinkedInTitle(title: string | undefined | null): string | null {
  if (!title) return null;
  let t = title.replace(/\s+/g, " ").trim();
  t = t.replace(/\s*[|\-–—]\s*LinkedIn\s*$/i, "").trim();
  // Role after dash: "Name - Title at Co"
  const dash = t.match(
    /^([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ.'’\-\s]{1,60}?)\s+[-–—]\s+/,
  );
  if (dash?.[1] && dash[1].trim().split(/\s+/).length <= 5) {
    return dash[1].trim();
  }
  if (t.length >= 3 && t.length <= 64 && !/^linkedin$/i.test(t)) {
    return t;
  }
  return null;
}

/** vanity-slug → "Vanity slug" title-ish words (last resort before web lookup) */
export function nameFromLinkedInSlug(slug: string): string {
  return slug
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^[a-z]\d/i.test(w)) return w; // leave odd tokens
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Best-effort person name for a LinkedIn profile URL.
 * Prefer page title; else slug. Returns null if not a profile URL.
 */
export function resolveLinkedInPerson(
  input: string,
  probe?: ProbeResult | null,
): { thing: string; source: string } | null {
  if (!isLinkedInProfileUrl(input) && !(probe?.finalUrl && isLinkedInProfileUrl(probe.finalUrl))) {
    return null;
  }
  const fromTitle = nameFromLinkedInTitle(probe?.title);
  if (fromTitle) return { thing: fromTitle, source: "linkedin-title" };

  // og:title sometimes lands in title after extract; also check description lead
  const fromDesc = nameFromLinkedInTitle(
    (probe?.description || "").split(/[|.]/)[0]?.trim() || null,
  );
  if (fromDesc && fromDesc.split(/\s+/).length <= 5) {
    return { thing: fromDesc, source: "linkedin-desc" };
  }

  const slug =
    linkedInSlug(input) ||
    (probe?.finalUrl ? linkedInSlug(probe.finalUrl) : null);
  if (slug) {
    return { thing: nameFromLinkedInSlug(slug), source: "linkedin-slug" };
  }
  return null;
}

/** Probe looks like LinkedIn bot wall / empty shell */
export function linkedInProbeBlocked(probe?: ProbeResult | null): boolean {
  if (!probe) return false;
  if (probe.status === 999 || probe.status === 401 || probe.status === 403) {
    return true;
  }
  if (probe.ok && !probe.title && !probe.textSample && !probe.description) {
    return true;
  }
  return false;
}
