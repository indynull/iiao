/**
 * Resolve "the thing" being judged — product/idea, not the blog packaging.
 */
import type { ProbeResult } from "./types";

const STOP = new Set(
  [
    "how",
    "we",
    "use",
    "using",
    "with",
    "the",
    "a",
    "an",
    "and",
    "or",
    "for",
    "to",
    "of",
    "in",
    "on",
    "our",
    "your",
    "introducing",
    "announcing",
    "about",
    "blog",
    "post",
    "news",
    "update",
    "guide",
    "why",
    "what",
    "when",
    "from",
    "into",
    "over",
    "under",
    "new",
    "is",
    "it",
    "this",
    "that",
  ].map((s) => s.toLowerCase()),
);

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (/^[A-Z0-9]{2,}$/.test(w)) return w;
      if (w.toLowerCase() === "os") return "OS";
      if (w.toLowerCase() === "ai") return "AI";
      if (w.toLowerCase() === "ios") return "iOS";
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

function slugToWords(slug: string): string {
  return slug
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[_+]+/g, "-")
    .split("-")
    .filter(Boolean)
    .join(" ");
}

/** Prefer “… Brand OS …” / “cloudflare-os” style product names. */
function findProductOs(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  // "Cloudflare OS", "Chrome OS", "Android OS"
  const m1 = t.match(
    /\b([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,3})\s+OS\b/,
  );
  if (m1?.[1] && !/^(How|Why|What|When|The|Our|Using|With)\b/i.test(m1[1])) {
    return `${m1[1].trim()} OS`;
  }
  // lowercase path style cloudflare os
  const m2 = t.match(
    /\b([a-z][a-z0-9]+(?:[\s-][a-z0-9]+){0,2})[\s-]os\b/i,
  );
  if (m2?.[1]) {
    const brand = titleCase(m2[1].replace(/-/g, " "));
    if (!STOP.has(brand.split(" ")[0]!.toLowerCase())) return `${brand} OS`;
  }
  return null;
}

function fromUrl(urlStr: string): { thing: string; why: string } | null {
  let u: URL;
  try {
    u = new URL(urlStr.includes("://") ? urlStr : `https://${urlStr}`);
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^www\./, "");
  const brandHost = host.split(".")[0] || host;
  const parts = u.pathname.split("/").filter(Boolean);
  const slug = parts[parts.length - 1] || "";
  const words = slugToWords(slug);
  const blob = `${host} ${parts.join(" ")} ${words}`;

  const productOs = findProductOs(blob.replace(/-/g, " "));
  if (productOs) {
    return { thing: productOs, why: "from URL path" };
  }

  // blog.cloudflare.com/.../cloudflare-os → Cloudflare OS
  const hostBrand = brandHost.replace(/-/g, " ");
  if (/\bos\b/i.test(words) && hostBrand && hostBrand !== "blog") {
    return {
      thing: titleCase(`${hostBrand} OS`),
      why: "host + OS in path",
    };
  }

  // Strip bloggy prefixes from slug for a product-ish name
  const cleaned = words
    .split(/\s+/)
    .filter((w) => !STOP.has(w.toLowerCase()))
    .join(" ");
  if (cleaned.length >= 3 && cleaned.length <= 48 && !/^https?:/i.test(cleaned)) {
    // Prefer host brand if path is a long article title
    if (parts.length >= 1 && /blog|news|docs|help|support|engineering/i.test(host)) {
      const osInSlug = /\bos\b/i.test(words);
      if (osInSlug) {
        return {
          thing: titleCase(
            `${hostBrand === "blog" ? cleaned : hostBrand + " " + cleaned}`
              .replace(/\bos\b/i, "OS")
              .replace(/\s+/g, " ")
              .trim(),
          ),
          why: "blog path",
        };
      }
    }
  }

  return null;
}

function fromProbe(probe: ProbeResult): string | null {
  const blob = [probe.title, probe.description, ...(probe.headings ?? [])]
    .filter(Boolean)
    .join(" · ");
  const productOs = findProductOs(blob);
  if (productOs) return productOs;

  // Title like "How we use AI with Cloudflare OS" → Cloudflare OS
  if (probe.title) {
    const withOs = probe.title.match(
      /\bwith\s+([A-Za-z0-9][A-Za-z0-9\s]{0,40}?\sOS)\b/i,
    );
    if (withOs?.[1]) return titleCase(withOs[1].replace(/\s+/g, " ").trim());
    const about = probe.title.match(
      /\b(?:about|introducing|meet|announcing)\s+([A-Za-z0-9][A-Za-z0-9\s]{0,40}?\sOS)\b/i,
    );
    if (about?.[1]) return titleCase(about[1].replace(/\s+/g, " ").trim());
  }
  return null;
}

/**
 * What should we judge?
 * Free-form claims: the claim.
 * URLs: product entity (e.g. Cloudflare OS), not the blog post title.
 */
export function resolveThing(
  inputRaw: string,
  probe?: ProbeResult | null,
): { thing: string; source: string; isUrl: boolean } {
  const input = inputRaw.trim();
  let isUrl = false;
  try {
    const u = new URL(input.includes("://") ? input : `https://${input}`);
    isUrl = u.hostname.includes(".");
  } catch {
    isUrl = false;
  }

  if (!isUrl) {
    return { thing: input || "the void", source: "claim", isUrl: false };
  }

  if (probe?.ok) {
    const fromP = fromProbe(probe);
    if (fromP) return { thing: fromP, source: "page", isUrl: true };
  }

  const fromU = fromUrl(probe?.finalUrl || input);
  if (fromU) return { thing: fromU.thing, source: fromU.why, isUrl: true };

  // Last resort: company from host, not full blog title
  try {
    const u = new URL(probe?.finalUrl || (input.includes("://") ? input : `https://${input}`));
    const brand = u.hostname.replace(/^www\./, "").split(".")[0] || u.hostname;
    if (brand && brand !== "blog" && brand !== "www") {
      return { thing: titleCase(brand.replace(/-/g, " ")), source: "host", isUrl: true };
    }
  } catch {
    /* ignore */
  }

  return {
    thing: probe?.title?.split(/[|\-–—]/)[0]?.trim() || input,
    source: "fallback",
    isUrl: true,
  };
}
