/**
 * Public web summaries for bare names / thin claims (no API keys).
 * Order: Wikipedia → DuckDuckGo Instant Answer → DuckDuckGo HTML search
 * → optional page read via r.jina.ai for a longer blurb.
 *
 * Note: Google Search requires an API key; we use DDG + open pages instead.
 */

export type WebNote = {
  blurb: string;
  source: string;
  url?: string;
  /** Canonical page title when available (e.g. wiki "Bill Gates") */
  title?: string;
};

const UA = "IIAO/0.5 (+https://iiao.algor.ist; satire OS board; research)";

const NOISE_TITLE =
  /\b(deaths? in|list of|disambiguation|filmography|discography|election|season \d)\b/i;

export async function lookupOnWeb(query: string): Promise<WebNote | null> {
  const q = query.trim();
  if (q.length < 2 || q.length > 120) return null;

  const wiki = await wikipediaNote(q);
  if (wiki) return wiki;

  const ddg = await duckDuckGoNote(q);
  if (ddg && (noteRelevant(q, ddg.blurb) || slugLike(q))) return ddg;

  const html = await duckDuckGoHtmlNote(q);
  if (html) return html;

  return null;
}

function slugLike(q: string): boolean {
  return !/\s/.test(q) && /^[a-z0-9._-]+$/i.test(q);
}

/** Enough query tokens appear in the text (avoids random death-list hits). */
export function noteRelevant(query: string, text: string): boolean {
  const qWords = query
    .toLowerCase()
    .split(/[^a-z0-9à-öø-ÿ]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length > 2 && !/^(the|and|for|with)$/i.test(w));
  if (!qWords.length) return false;
  const t = text.toLowerCase();
  const hits = qWords.filter((w) => t.includes(w)).length;
  if (qWords.length === 1) return hits === 1;
  if (qWords.length === 2) return hits >= 2;
  return hits >= Math.ceil(qWords.length * 0.6);
}

async function wikipediaNote(q: string): Promise<WebNote | null> {
  try {
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        list: "search",
        srsearch: q,
        srlimit: "5",
        format: "json",
        origin: "*",
      });
    const sRes = await fetch(searchUrl, {
      headers: { "user-agent": UA, accept: "application/json" },
      redirect: "follow",
    });
    if (!sRes.ok) return null;
    const sJson = (await sRes.json()) as {
      query?: { search?: { title: string; snippet?: string }[] };
    };
    const hits = sJson.query?.search ?? [];
    const slugQuery = slugLike(q);

    for (const hit of hits) {
      if (!hit.title || NOISE_TITLE.test(hit.title)) continue;
      if (!slugQuery && !noteRelevant(q, `${hit.title} ${hit.snippet || ""}`)) {
        continue;
      }
      const note = await wikipediaSummary(hit.title);
      if (!note || /may refer to:/i.test(note.blurb)) continue;
      if (!slugQuery && !noteRelevant(q, `${hit.title} ${note.blurb}`)) {
        continue;
      }
      if (
        slugQuery &&
        !/^[A-Z][\w.'’\-]+(?:\s+[A-Z][\w.'’\-]+){0,4}$/u.test(hit.title)
      ) {
        continue;
      }
      return note;
    }

    const exact = await wikipediaSummary(q);
    if (
      exact &&
      noteRelevant(q, exact.blurb) &&
      !NOISE_TITLE.test(exact.blurb.slice(0, 80))
    ) {
      return exact;
    }
    return null;
  } catch {
    return null;
  }
}

async function wikipediaSummary(title: string): Promise<WebNote | null> {
  const cleanTitle = title.replace(/_/g, " ");
  try {
    const url =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "query",
        prop: "extracts|info",
        exintro: "1",
        explaintext: "1",
        redirects: "1",
        titles: cleanTitle,
        inprop: "url",
        format: "json",
        origin: "*",
      });
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            extract?: string;
            missing?: boolean;
            fullurl?: string;
          }
        >;
      };
    };
    const page = Object.values(j.query?.pages || {})[0];
    if (!page || page.missing || !page.title) return null;
    if (NOISE_TITLE.test(page.title)) return null;
    const extract = (page.extract || "").trim();
    if (extract.length < 40) return null;
    if (/may refer to:/i.test(extract)) return null;
    return {
      blurb: extract.slice(0, 900),
      source: "wikipedia",
      url: page.fullurl,
      title: page.title,
    };
  } catch {
    return null;
  }
}

async function duckDuckGoNote(q: string): Promise<WebNote | null> {
  try {
    const url =
      "https://api.duckduckgo.com/?" +
      new URLSearchParams({
        q,
        format: "json",
        no_html: "1",
        skip_disambig: "1",
      });
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      AbstractText?: string;
      AbstractURL?: string;
      Heading?: string;
      RelatedTopics?: { Text?: string; FirstURL?: string }[];
    };
    let text = (j.AbstractText || "").trim();
    if (!text && j.RelatedTopics?.length) {
      text = (j.RelatedTopics.find((t) => t.Text)?.Text || "").trim();
    }
    if (text.length < 40) return null;
    return {
      blurb: text.slice(0, 900),
      source: "duckduckgo",
      url: j.AbstractURL || undefined,
      title: j.Heading || undefined,
    };
  } catch {
    return null;
  }
}

type HtmlHit = { title: string; url: string; snippet: string };

/** Full-text web search via DuckDuckGo Lite HTML (no API key; Google needs one). */
async function duckDuckGoHtmlNote(q: string): Promise<WebNote | null> {
  try {
    const res = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "user-agent": UA,
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ q }).toString(),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const hits = parseDdgLite(html).slice(0, 5);
    if (!hits.length) return null;

    // Prefer encyclopedia / bio style pages for people
    const preferred =
      hits.find((h) => /wikipedia\.org|britannica\.com|biography\.com/i.test(h.url)) ||
      hits[0]!;

    // Longer summary via public reader when we have a clean URL
    const deep = await jinaRead(preferred.url);
    if (deep && deep.length > 80) {
      const titleGuess =
        preferred.title.replace(/\s*[-|–—].*$/, "").trim() || preferred.title;
      if (slugLike(q) || noteRelevant(q, `${titleGuess} ${deep}`)) {
        return {
          blurb: deep.slice(0, 900),
          source: "web-search",
          url: preferred.url,
          title: titleGuess.slice(0, 80),
        };
      }
    }

    // Snippet collage
    const parts = hits
      .filter((h) => !NOISE_TITLE.test(h.title))
      .slice(0, 3)
      .map((h) => `${h.title}: ${h.snippet}`.trim())
      .filter((s) => s.length > 20);
    if (!parts.length) return null;
    const blurb = parts.join(" · ").slice(0, 900);
    if (!slugLike(q) && !noteRelevant(q, blurb)) return null;
    return {
      blurb,
      source: "web-search",
      url: preferred.url,
      title: preferred.title.replace(/\s*[-|–—].*$/, "").trim().slice(0, 80),
    };
  } catch {
    return null;
  }
}

function parseDdgLite(html: string): HtmlHit[] {
  const out: HtmlHit[] = [];
  // <a ... href="URL" class='result-link'>Title</a> ... <td class='result-snippet'>...</td>
  const re =
    /href=["'](https?:\/\/[^"']+)["'][^>]*class=['"]result-link['"][^>]*>([^<]+)<[\s\S]*?class=['"]result-snippet['"][^>]*>\s*([\s\S]*?)\s*<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 8) {
    const url = m[1]!;
    const title = decodeHtml(m[2] || "").trim();
    const snippet = decodeHtml((m[3] || "").replace(/<[^>]+>/g, " ")).replace(
      /\s+/g,
      " ",
    ).trim();
    if (!title || !url) continue;
    if (/duckduckgo\.com/i.test(url)) continue;
    out.push({ title, url, snippet });
  }
  // Alternate attribute order: class before href
  if (!out.length) {
    const re2 =
      /class=['"]result-link['"][^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([^<]+)<[\s\S]*?class=['"]result-snippet['"][^>]*>\s*([\s\S]*?)\s*<\/td>/gi;
    while ((m = re2.exec(html)) && out.length < 8) {
      const url = m[1]!;
      const title = decodeHtml(m[2] || "").trim();
      const snippet = decodeHtml((m[3] || "").replace(/<[^>]+>/g, " ")).replace(
        /\s+/g,
        " ",
      ).trim();
      if (!title || !url || /duckduckgo\.com/i.test(url)) continue;
      out.push({ title, url, snippet });
    }
  }
  return out;
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Free public reader — returns markdown/text of a URL (no key). */
async function jinaRead(pageUrl: string): Promise<string | null> {
  try {
    if (!/^https?:\/\//i.test(pageUrl)) return null;
    // Skip walled gardens we already know fail
    if (/linkedin\.com|facebook\.com|instagram\.com/i.test(pageUrl)) return null;
    const res = await fetch(`https://r.jina.ai/${pageUrl}`, {
      headers: {
        "user-agent": UA,
        accept: "text/plain",
        "x-return-format": "text",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    let text = (await res.text()).trim();
    text = text
      .replace(/^Title:.*$/m, "")
      .replace(/^URL Source:.*$/m, "")
      .replace(/^Published Time:.*$/m, "")
      .replace(/^Markdown Content:\s*/im, "")
      .replace(/\r/g, "\n");
    // Prefer prose lines; drop wiki chrome
    const junk =
      /^(jump to|main menu|search|donate|create account|log in|contents|hide|toggle|tools|article|talk|read|view source|view history|\[\s*edit|\(top\)|early life and education$|references$|see also$|external links$)/i;
    const lines = text
      .split(/\n+/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l.length > 45 && !junk.test(l) && !/^#{1,6}\s/.test(l));
    text = lines.join(" ").replace(/\s+/g, " ").trim();
    if (text.length < 80) return null;
    return text.slice(0, 1100);
  } catch {
    return null;
  }
}
