/**
 * Lightweight public lookups for bare names / thin claims.
 * Wikipedia REST + DuckDuckGo Instant Answer (no API keys).
 */

export type WebNote = {
  blurb: string;
  source: string;
  url?: string;
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
  if (ddg && noteRelevant(q, ddg.blurb)) return ddg;

  return null;
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

    for (const hit of hits) {
      if (!hit.title || NOISE_TITLE.test(hit.title)) continue;
      if (!noteRelevant(q, `${hit.title} ${hit.snippet || ""}`)) continue;
      const note = await wikipediaSummary(hit.title.replace(/\s+/g, "_"));
      if (
        note &&
        !/may refer to:/i.test(note.blurb) &&
        noteRelevant(q, `${hit.title} ${note.blurb}`)
      ) {
        return note;
      }
    }

    // Exact-ish title attempt for well-known people (Ada_Lovelace)
    const exact = await wikipediaSummary(q.replace(/\s+/g, "_"));
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

async function wikipediaSummary(titleSlug: string): Promise<WebNote | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titleSlug)}`;
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      type?: string;
      title?: string;
      extract?: string;
      description?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (j.type === "disambiguation") return null;
    if (j.title && NOISE_TITLE.test(j.title)) return null;
    const extract = (j.extract || "").trim();
    if (extract.length < 40) return null;
    const blurb = [j.description, extract].filter(Boolean).join(" — ").slice(0, 900);
    return {
      blurb,
      source: "wikipedia",
      url: j.content_urls?.desktop?.page,
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
    };
  } catch {
    return null;
  }
}
