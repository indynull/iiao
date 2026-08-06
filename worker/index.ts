import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolveThing } from "../src/analyze/thing";
import { analyze } from "../src/analyze/engine";
import {
  classify,
  isHandcraftedPerson,
  isPersonalSite,
  looksLikePersonName,
  preferRulesComedy,
} from "../src/analyze/comedy";
import { buildJudgmentTree } from "../src/analyze/tree-build";
import { buildRoadmap } from "../src/analyze/roadmap";
import { boardVoice, revoiceText } from "../src/analyze/voice";
import { lookupOnWeb, noteRelevant, type WebNote } from "../src/analyze/web-lookup";
import {
  isLinkedInProfileUrl,
  linkedInProbeBlocked,
  linkedInSlug,
  resolveLinkedInPerson,
} from "../src/analyze/linkedin";
import { decodeSubject, reportPath } from "../src/routes";
import type { Analysis, ProbeResult, ProbeSignals } from "../src/analyze/types";

export type Env = {
  ASSETS: Fetcher;
  AI: Ai;
  TELEMETRY?: KVNamespace;
  TELEMETRY_TOKEN?: string;
};

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const RECENT_KEY = "recent";
const STATS_KEY = "stats";
const RECENT_MAX = 200;

type TelemetryEvent = {
  ts: string;
  thing: string;
  inputKind: "url" | "claim";
  answer: string;
  confidence: number;
  engine: string;
  /** Model id when engine is workers-ai; null/omitted for rules */
  model: string | null;
  thingSource: string;
  /** hostname only when input was a URL — no full path (less PII) */
  host?: string;
};

type TelemetryStats = {
  total: number;
  byAnswer: Record<string, number>;
  byEngine: Record<string, number>;
  byModel: Record<string, number>;
  byKind: Record<string, number>;
  updatedAt: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use(
  "/api/*",
  cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }),
);

/** Permalink shell with OG/Twitter tags for crawlers + tab titles. */
app.get("/is/:token", async (c) => {
  const subject = decodeSubject(c.req.param("token") || "");
  const assetUrl = new URL("/", c.req.url);
  const assetRes = await c.env.ASSETS.fetch(assetUrl);
  let html = await assetRes.text();

  if (!subject) {
    return c.html(html, assetRes.status as 200);
  }

  // Rules-only for speed/determinism (same packs as UI for known subjects)
  const a = analyze(subject, null);
  const thing = boardVoice(a.stamp || subject);
  const verdictPretty =
    a.verdict === "YES" ? "Yes" : a.verdict === "NO" ? "No" : "Kinda";
  const title = `${verdictPretty} · ${a.confidence}% — ${thing}`;
  const description = (a.subtitle || `Is ${thing} an OS?`).slice(0, 200);
  const pageUrl = new URL(reportPath(subject), c.req.url).toString();
  const ogImage = new URL(
    `/og?v=${encodeURIComponent(verdictPretty)}&c=${a.confidence}&t=${encodeURIComponent(thing)}`,
    c.req.url,
  ).toString();

  html = injectSocialMeta(html, {
    title,
    description,
    url: pageUrl,
    image: ogImage,
  });
  return c.html(html, 200, {
    "Cache-Control": "public, max-age=120, must-revalidate",
    "CDN-Cache-Control": "public, max-age=120",
  });
});

/** Simple share card image (SVG) for OG previews. */
app.get("/og", (c) => {
  const raw = String(c.req.query("v") || "Kinda").trim();
  const upper = raw.toUpperCase();
  const verdict =
    upper === "YES" || upper === "Y"
      ? "Yes"
      : upper === "NO" || upper === "N"
        ? "No"
        : raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() || "Kinda";
  const conf = Math.min(100, Math.max(0, Number(c.req.query("c") || 50)));
  const thing = String(c.req.query("t") || "something").slice(0, 48);
  const color =
    verdict === "Yes" ? "#79740e" : verdict === "No" ? "#9d0006" : "#b57614";
  // cursive via italic Georgia (SVG can't load web fonts reliably for crawlers)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fbf1c7"/>
  <rect x="48" y="48" width="1104" height="534" rx="28" fill="#f9f5d7" stroke="#bdae93" stroke-width="4"/>
  <text x="96" y="160" font-family="Georgia, serif" font-size="42" fill="#7c6f64">is it an OS?</text>
  <text x="96" y="300" font-family="Georgia, 'Times New Roman', serif" font-size="120" font-style="italic" fill="${color}" font-weight="400">${escapeXml(verdict)}</text>
  <text x="96" y="380" font-family="ui-monospace, monospace" font-size="40" fill="#3c3836">${conf}%</text>
  <text x="96" y="470" font-family="Georgia, serif" font-size="52" fill="#3c3836">${escapeXml(thing)}</text>
  <text x="96" y="540" font-family="ui-monospace, monospace" font-size="28" fill="#a89984">iiao.algor.ist</text>
</svg>`;
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
});

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function injectSocialMeta(
  html: string,
  meta: { title: string; description: string; url: string; image: string },
): string {
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<meta[^>]+name="description"[^>]*>/gi, "")
    .replace(/<meta[^>]+property="og:[^"]*"[^>]*>/gi, "")
    .replace(/<meta[^>]+name="twitter:[^"]*"[^>]*>/gi, "");
  const block = `
    <title>${esc(meta.title)}</title>
    <meta name="description" content="${esc(meta.description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(meta.title)}" />
    <meta property="og:description" content="${esc(meta.description)}" />
    <meta property="og:url" content="${esc(meta.url)}" />
    <meta property="og:image" content="${esc(meta.image)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(meta.title)}" />
    <meta name="twitter:description" content="${esc(meta.description)}" />
    <meta name="twitter:image" content="${esc(meta.image)}" />
  `;
  return out.replace(/<head[^>]*>/i, (h) => `${h}\n${block}`);
}

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "iiao",
    engine: "workers-ai",
    model: MODEL,
    telemetry: Boolean(c.env.TELEMETRY),
  }),
);

/** Owner-only: recent judgments + counters. Header: Authorization: Bearer <TELEMETRY_TOKEN> */
app.get("/api/telemetry", async (c) => {
  if (!checkTelemetryAuth(c)) {
    return c.json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!c.env.TELEMETRY) {
    return c.json({ ok: false, error: "telemetry kv not bound" }, 503);
  }
  const [recentRaw, statsRaw] = await Promise.all([
    c.env.TELEMETRY.get(RECENT_KEY),
    c.env.TELEMETRY.get(STATS_KEY),
  ]);
  const recent = (safeJson(recentRaw) as TelemetryEvent[]) || [];
  const stats = (safeJson(statsRaw) as TelemetryStats) || emptyStats();
  const topThings = topCounts(
    recent.map((e) => e.thing),
    25,
  );
  return c.json({
    ok: true,
    stats,
    topThings,
    recent: recent.slice(0, 100),
  });
});

app.get("/api/probe", async (c) => {
  const raw = c.req.query("url")?.trim();
  if (!raw) return c.json({ ok: false, error: "missing url" }, 400);
  const probe = await probeUrl(raw);
  return c.json(probe);
});

/**
 * Main judgment path: resolve product entity → Workers AI (free) → structured result.
 * Falls back to local rules if AI is unavailable.
 */
app.post("/api/judge", async (c) => {
  let body: { subject?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "invalid json" }, 400);
  }
  const subject = body.subject?.trim();
  if (!subject || subject.length > 2048) {
    return c.json({ ok: false, error: "missing subject" }, 400);
  }

  const isUrl = looksLikeUrl(subject);
  // Links: fetch the page. Names / LinkedIn walls: public web lookup.
  let probe: ProbeResult | null = null;
  if (isUrl) {
    probe = await probeUrl(subject);
  }

  let resolved = resolveThing(subject, probe);
  const liProfile = isLinkedInProfileUrl(subject);
  const li = resolveLinkedInPerson(subject, probe);
  const liBlocked = liProfile && linkedInProbeBlocked(probe);
  // Never judge the host "Linkedin" for /in/… profiles
  if (li && (resolved.source === "host" || liBlocked || liProfile)) {
    resolved = { thing: li.thing, source: li.source, isUrl: true };
  }

  const pageBlob = `${probe?.title ?? ""} ${probe?.description ?? ""} ${probe?.textSample ?? ""}`;

  let webNote: WebNote | null = null;
  const personName =
    looksLikePersonName(resolved.thing) ||
    (!isUrl && looksLikePersonName(subject)) ||
    liProfile;

  // Bare names, LinkedIn walls, or thin pages: public web lookup
  const thinPage = isUrl && !(probe?.title || (probe?.textSample && probe.textSample.length > 80));
  const needWeb =
    !isHandcraftedPerson(resolved.thing) &&
    (liProfile || personName || thinPage) &&
    (thinPage || liBlocked || !isUrl || personName);

  if (needWeb) {
    const slug = liProfile ? linkedInSlug(subject) : null;
    const queries = [
      ...(slug ? [slug] : []),
      resolved.thing,
      ...(slug ? [`${resolved.thing} linkedin`] : []),
    ];
    for (const q of [...new Set(queries.filter(Boolean))]) {
      webNote = await lookupOnWeb(q);
      if (webNote?.blurb && webNote.blurb.length > 40) break;
      webNote = null;
    }
    // Prefer canonical wiki title (Bill Gates) over vanity slug mash
    if (webNote?.title && (liProfile || personName)) {
      const t = webNote.title.trim();
      if (t.length >= 3 && t.length <= 80 && !/list of/i.test(t)) {
        resolved = {
          thing: t,
          source: `${resolved.source}+${webNote.source}`,
          isUrl: !!isUrl,
        };
      }
    }
  }

  const contextBits = [
    `User input: ${subject}`,
    `Resolved thing to judge: ${resolved.thing}`,
    `Resolution source: ${resolved.source}`,
    isUrl
      ? probe?.ok && !liBlocked
        ? [
            `Fetched page OK (${probe.host ?? "site"})`,
            `Page title: ${probe.title ?? "—"}`,
            `Meta: ${probe.description ?? "—"}`,
            `Headings: ${(probe.headings ?? []).slice(0, 8).join(" · ") || "—"}`,
            `Snippet: ${(probe.textSample ?? "").slice(0, 1200)}`,
          ].join("\n")
        : liBlocked
          ? `LinkedIn blocked the page fetch (common for cloud scrapers). Judging the profile person "${resolved.thing}" using public web notes if any.`
          : `Fetch failed: ${probe?.error ?? "unknown"} — judge only from the URL string.`
      : "No URL — free-form product/idea/person description.",
    webNote
      ? `Public web note (${webNote.source}${webNote.url ? `; ${webNote.url}` : ""}):\n${webNote.blurb}`
      : personName
        ? "No reliable public web blurb found for this name."
        : "",
  ]
    .filter(Boolean)
    .join("\n");

  let analysis: Analysis | undefined;
  let engine: "workers-ai" | "rules" = "rules";
  let aiError: string | undefined;

  // Objects / celebrity packs stay rules. Grounded people/URLs go to the model.
  const personal = isPersonalSite({
    blob: pageBlob,
    displayName: resolved.thing,
    subject,
    host: probe?.host,
  });
  const hasGrounding =
    (isUrl && !!probe?.ok && !liBlocked && !!(probe.title || probe.textSample)) ||
    !!webNote ||
    (personal && !!probe?.ok && !!probe.title);
  // Never treat linkedin.com host as a rules "object pack"
  const skipAi =
    (!liProfile && preferRulesComedy(resolved.thing)) ||
    (!liProfile && preferRulesComedy(subject)) ||
    isHandcraftedPerson(resolved.thing) ||
    (personName && !hasGrounding && !isUrl && !liProfile);

  try {
    if (skipAi) {
      aiError = "rules pack";
    } else if (!c.env.AI) {
      aiError = "AI binding missing";
    } else if (isUrl && !probe?.ok && !webNote && !li) {
      aiError = `probe failed: ${probe?.error ?? "fetch"}`;
    } else {
      const judged = await runJudge(c.env.AI, resolved.thing, contextBits);
      if (judged.ok && !isBadComedy(judged.value)) {
        analysis = analysisFromAi(subject, resolved.thing, judged.value, probe);
        engine = "workers-ai";
      } else if (judged.ok) {
        aiError = "flat joke rejected";
      } else {
        aiError = judged.error;
      }
    }
  } catch (e) {
    aiError = e instanceof Error ? e.message : "ai threw";
  }

  // Always re-analyze from the *original* subject + probe so URL→page resolve isn't lost
  if (!analysis) {
    analysis = analyze(subject, probe);
  }

  // Board addresses the user: "my cat" → "your cat" everywhere in the roast
  const voiceSrc = analysis.stamp || resolved.thing || subject;
  const voiced = boardVoice(voiceSrc);
  analysis = {
    ...analysis,
    subject,
    stamp: voiced,
    subtitle: revoiceText(analysis.subtitle, voiceSrc),
    roast: (analysis.roast ?? []).map((l) => revoiceText(l, voiceSrc)),
    findings: (analysis.findings ?? []).map((l) => revoiceText(l, voiceSrc)),
    redFlags: (analysis.redFlags ?? []).map((l) => revoiceText(l, voiceSrc)),
    roadmap: analysis.roadmap
      ? {
          ...analysis.roadmap,
          headline: revoiceText(analysis.roadmap.headline, voiceSrc),
          steps: analysis.roadmap.steps.map((s) => revoiceText(s, voiceSrc)),
        }
      : analysis.roadmap,
    probe,
  };

  const modelUsed = engine === "workers-ai" ? MODEL : null;
  const thingOut = voiced || resolved.thing;

  await recordTelemetry(c.env, {
    ts: new Date().toISOString(),
    thing: thingOut.slice(0, 200),
    inputKind: isUrl ? "url" : "claim",
    answer: String(analysis.verdict || "").slice(0, 16),
    confidence: Number(analysis.confidence) || 0,
    engine,
    model: modelUsed,
    thingSource: resolved.source.slice(0, 40),
    host: isUrl ? hostOnly(subject) : undefined,
  });

  return c.json({
    ok: true,
    engine,
    model: modelUsed,
    thing: thingOut,
    thingSource: resolved.source,
    aiError: aiError || undefined,
    probe: probe
      ? {
          ok: probe.ok,
          host: probe.host,
          title: probe.title,
          status: probe.status,
          error: probe.error,
        }
      : undefined,
    web: webNote
      ? {
          source: webNote.source,
          url: webNote.url,
          title: webNote.title,
          blurb: webNote.blurb.slice(0, 280),
        }
      : undefined,
    analysis,
  });
});

function checkTelemetryAuth(c: {
  req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined };
  env: Env;
}): boolean {
  const expected = c.env.TELEMETRY_TOKEN;
  if (!expected) return false;
  const auth = c.req.header("authorization") || "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const q = c.req.query("token")?.trim() || "";
  return bearer === expected || q === expected;
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function emptyStats(): TelemetryStats {
  return {
    total: 0,
    byAnswer: {},
    byEngine: {},
    byModel: {},
    byKind: {},
    updatedAt: new Date().toISOString(),
  };
}

function topCounts(items: string[], n: number): { thing: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = it.trim() || "(empty)";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()]
    .map(([thing, count]) => ({ thing, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

function hostOnly(input: string): string | undefined {
  try {
    const u = new URL(input.includes("://") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "").slice(0, 120);
  } catch {
    return undefined;
  }
}

async function recordTelemetry(env: Env, event: TelemetryEvent): Promise<void> {
  if (!env.TELEMETRY) return;
  try {
    const [recentRaw, statsRaw] = await Promise.all([
      env.TELEMETRY.get(RECENT_KEY),
      env.TELEMETRY.get(STATS_KEY),
    ]);
    const recent = ((safeJson(recentRaw) as TelemetryEvent[]) || []).slice();
    recent.unshift(event);
    while (recent.length > RECENT_MAX) recent.pop();

    const prev = (safeJson(statsRaw) as TelemetryStats) || emptyStats();
    const next: TelemetryStats = {
      total: (prev.total || 0) + 1,
      byAnswer: { ...(prev.byAnswer || {}) },
      byEngine: { ...(prev.byEngine || {}) },
      byModel: { ...(prev.byModel || {}) },
      byKind: { ...(prev.byKind || {}) },
      updatedAt: event.ts,
    };
    next.byAnswer[event.answer] = (next.byAnswer[event.answer] || 0) + 1;
    next.byEngine[event.engine] = (next.byEngine[event.engine] || 0) + 1;
    const modelKey = event.model || "rules";
    next.byModel[modelKey] = (next.byModel[modelKey] || 0) + 1;
    next.byKind[event.inputKind] = (next.byKind[event.inputKind] || 0) + 1;

    await Promise.all([
      env.TELEMETRY.put(RECENT_KEY, JSON.stringify(recent)),
      env.TELEMETRY.put(STATS_KEY, JSON.stringify(next)),
    ]);
  } catch {
    /* never break the site for telemetry */
  }
}

type AiJudge = {
  answer: "YES" | "NO" | "KINDA";
  confidence: number;
  line: string;
  lines: string[];
  notes?: { label: string; note: string }[];
  /** Funny over-reaching steps to become a full OS (always when conf < 100) */
  roadmap?: string[];
};

async function runJudge(
  ai: Ai,
  thing: string,
  context: string,
): Promise<{ ok: true; value: AiJudge } | { ok: false; error: string }> {
  const system = `You are a satirical OS certification board. Output JSON only.

Voice: systems engineer with a red pen. Dry, specific, witty. Never say metaphor, far-fetched, joke, satire, tongue-in-cheek, "the bit", or "in a sense". Never quote marketing copy.

Comedy tiers (follow strictly):

A) MACHINE-ISH EVERYDAY OBJECTS that "run" something (toaster, fridge, shoe, calendar, car, cat, …):
   → answer YES, confidence 85–97
   → commit to wild OS analogies unique to THAT object (boot, kernel, scheduler, userspace, syscalls)
   → never define it like a dictionary

A2) PEOPLE / PUBLIC FIGURES:
   → answer YES, confidence 82–94
   → joke-first leads: action, failure mode, or priority — not a definition
   → BANNED TEMPLATE: "X is an operating system for the United States/country, with Y serving as his kernel and Z as syscall"
   → BANNED: "teleprompter as kernel" unless the person is actually teleprompter-coded
   → Specific roast of THAT person's process model (loud scheduler, loyalty table, all-caps panic, etc.)

B) ACCESSORIES / FILTERS (sunglasses, umbrella, case, hat, screen protector, …):
   → answer NO or KINDA, confidence 15–40
   → witty near-miss: not an OS, but a subsystem role
   → e.g. sunglasses = "not an OS but a solid filter for bad traffic / WAF for photons"
   → do NOT force full kernel fanfic

C) SOFTWARE PRODUCTS claiming "OS" / "platform" / edge-admin suites (Cloudflare OS, SaaS "OS for X"):
   → answer NO, confidence 8–30
   → NITPICK ruthlessly: missing kernel, fake isolation, boot=signup, syscalls=HTTP, process table absent
   → mock the branding harder because they asked for the title

D) REAL OPERATING SYSTEMS (Linux, Windows, macOS, Android, iOS, BSD, …):
   → answer YES (they are OSes), confidence 85–95
   → still RIDICULE flaws: bloat, forced updates, OEM skins, hostile UX, driver hell
   → grant the title, dock style points

E) Ordinary apps/SaaS not pretending:
   → usually NO; they run on an OS, they are not one
   → still witty, not a dictionary definition

BANNED OPENERS (instant fail): "X is a Y, not an operating system", "no matter how…", "don't let that fool you", "only if you consider"

If Background includes a fetched page or public web note, ground jokes in those facts (role, work, biography). Still YES for people with wild OS analogies — never "X is a person, not an OS." Do not invent employers or fame that the background does not support; if the web note is empty, keep it abstract.

Judge only THING. Unique lines every time (fridge ≠ toaster ≠ Biden ≠ shoe).

ALWAYS include "roadmap": 4–5 ONE-LINERS of MOCKING remediation (conf never 100).
This is not coaching. It is a red-pen roast dressed as "how to reach 100%."
Roadmap voice:
- Mock THING. Insult the gaps. Prescribe humiliation, not features
- Dry, mean, specific. Systems vocabulary as weapons (kernel, ring 0, guest, cosplay, middleware)
- Ban: implement, integrate, enable, leverage, enhance, seamless, upgrade, install, add support
- BAD: "Implement programmable lenses for dynamic filtering"
- GOOD: "You're a WAF for photons with a fashion budget. Stop filing for kernel privileges."
- BAD: "Add a proper boot sequence"
- GOOD: "Boot = user found you in a case. Init systems have higher standards."
- For YES: mock the remaining hubris / bloat / UX sins while admitting the title
- For NO/KINDA: deny the title with prejudice; list why they stay guests
- Never say metaphor, joke, satire, "in real life", "in a sense"

Schema:
{"answer":"YES"|"NO"|"KINDA","confidence":0-100,"line":"lead sentence","lines":["2-4 short lines"],"notes":[{"label":"Kernel","note":"..."},{"label":"Boot","note":"..."}],"roadmap":["mocking remediation","mocking remediation","mocking remediation","mocking remediation"]}`;

  const user = `THING: ${thing}

Background (identify product only; do not quote):
${context.slice(0, 1200)}

Return JSON judgment of THING, including a mocking remediation roadmap (roast, don't coach).`;

  let raw: unknown;
  try {
    raw = await ai.run(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1100,
      temperature: 0.75,
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "ai.run failed",
    };
  }

  // Direct object already shaped like our schema
  if (raw && typeof raw === "object" && "answer" in (raw as object)) {
    const parsed = coerceJudge(raw);
    if (parsed) return { ok: true, value: parsed };
  }

  const text = extractModelText(raw);
  const parsed = parseAiJson(text);
  if (!parsed) {
    return {
      ok: false,
      error: `parse failed: ${text.slice(0, 200)}`,
    };
  }
  return { ok: true, value: parsed };
}

function extractModelText(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (!raw || typeof raw !== "object") return String(raw ?? "");
  const o = raw as Record<string, unknown>;
  if (typeof o.response === "string") return o.response;
  if (typeof o.response === "object" && o.response) {
    const r = o.response as Record<string, unknown>;
    if (typeof r.response === "string") return r.response;
    return JSON.stringify(o.response);
  }
  if (typeof o.result === "string") return o.result;
  if (typeof o.text === "string") return o.text;
  if (typeof o.output === "string") return o.output;
  // Tool-style / OpenAI-ish
  const choices = o.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const msg = (choices[0] as { message?: { content?: string } }).message;
    if (msg?.content) return msg.content;
  }
  return JSON.stringify(raw);
}

function coerceJudge(raw: unknown): AiJudge | null {
  if (!raw || typeof raw !== "object") return null;
  try {
    return parseAiJson(JSON.stringify(raw));
  } catch {
    return null;
  }
}

function parseAiJson(text: string): AiJudge | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let slice = cleaned.slice(start);
  // Truncated model output: close open braces/brackets roughly
  if (!slice.includes("}")) {
    slice = slice + '"}]}';
  }
  const end = slice.lastIndexOf("}");
  if (end < 0) return null;
  let jsonText = slice.slice(0, end + 1);
  try {
    return coerceJudgeObject(JSON.parse(jsonText));
  } catch {
    // Try fixing trailing commas / unclosed strings
    jsonText = jsonText
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\s\S]*$/, (m) => {
        const opens = (m.match(/"/g) || []).length;
        return opens % 2 === 1 ? m + '"' : m;
      });
    try {
      return coerceJudgeObject(JSON.parse(jsonText));
    } catch {
      return null;
    }
  }
}

function coerceJudgeObject(obj: Partial<AiJudge>): AiJudge | null {
  const answer = String(obj.answer || "").toUpperCase();
  if (answer !== "YES" && answer !== "NO" && answer !== "KINDA") return null;
  const line = String(obj.line || "").trim();
  if (!line) return null;
  const lines = Array.isArray(obj.lines)
    ? obj.lines.map((x) => String(x).trim()).filter(Boolean).slice(0, 5)
    : [];
  const confidence = Math.min(
    97,
    Math.max(5, Math.round(Number(obj.confidence) || 50)),
  );
  const roadmap = Array.isArray(obj.roadmap)
    ? obj.roadmap.map((x) => String(x).trim()).filter((s) => s.length > 6).slice(0, 5)
    : undefined;
  return {
    answer: answer as AiJudge["answer"],
    confidence,
    line,
    lines,
    notes: Array.isArray(obj.notes)
      ? obj.notes
          .map((n) => ({
            label: String((n as { label?: string }).label || "").trim(),
            note: String((n as { note?: string }).note || "").trim(),
          }))
          .filter((n) => n.label && n.note)
          .slice(0, 6)
      : undefined,
    roadmap: roadmap?.length ? roadmap : undefined,
  };
}

function analysisFromAi(
  originalInput: string,
  thing: string,
  j: AiJudge,
  probe: ProbeResult | null,
): Analysis {
  const stockNotes = [
    { label: "Kernel", note: "Does a privileged core own the resources?" },
    { label: "Boot", note: "Power-on to ready — not signup to dashboard." },
    { label: "Scheduler", note: "Who decides what runs next?" },
    { label: "Isolation", note: "One crash, others still standing?" },
    { label: "Syscalls", note: "Is there a real API under the marketing?" },
  ];
  const notes = [...(j.notes?.length ? j.notes : [])];
  for (const s of stockNotes) {
    if (notes.length >= 5) break;
    if (!notes.some((n) => n.label.toLowerCase() === s.label.toLowerCase())) {
      notes.push(s);
    }
  }
  const score =
    j.answer === "YES" ? 0.88 : j.answer === "NO" ? 0.22 : 0.52;
  const voiced = boardVoice(thing);
  const revoice = (s: string) => revoiceText(s, thing);
  const criteria = notes.map((n, i) => {
    // Vary axes so radar isn't a perfect blob
    const wobble = ((i * 17 + confHash(thing + n.label)) % 11) / 100;
    const dir = j.answer === "NO" ? -1 : 1;
    const base = score + dir * wobble - 0.03;
    return {
      id: `n${i}`,
      label: n.label,
      weight: 1,
      score: Math.min(0.97, Math.max(0.08, base)),
      note: revoice(n.note),
      axis: n.label,
      inputs: [] as string[],
    };
  });
  const line = revoice(j.line);
  const lines = j.lines.map(revoice);
  const roast = [line, ...lines];
  const signals = probe?.signals;
  const signalStats = signals
    ? (
        [
          ["os", "OS wording", signals.os],
          ["kernel", "Kernel", signals.kernel],
          ["saas", "SaaS", signals.saas],
          ["platform", "Platform", signals.platform],
          ["cloud", "Cloud", signals.cloud],
          ["pricing", "Pricing", signals.pricing],
        ] as [string, string, number][]
      )
        .filter(([, , n]) => n > 0)
        .map(([key, label, count]) => ({ key, label, count }))
    : [];
  return {
    subject: originalInput,
    kind: looksLikeUrl(originalInput) ? "url" : "claim",
    host: probe?.host ?? null,
    seed: "ai",
    caseId: "IIAO-AI",
    confidence: j.confidence,
    verdict: j.answer,
    subtitle: line,
    stamp: voiced,
    criteria,
    tree: buildJudgmentTree({
      name: voiced,
      answer: j.answer,
      confidence: j.confidence,
      line,
      notes: notes.map((n) => ({ ...n, note: revoice(n.note) })),
    }),
    radar: criteria.map((c) => ({
      axis: c.axis,
      value: Math.round(c.score * 100),
    })),
    signalStats,
    confidenceSteps: [
      { label: "workers-ai", delta: j.confidence, total: j.confidence },
    ],
    timeline: [],
    redFlags: lines.slice(0, 2),
    findings: roast,
    roast,
    roadmap: buildRoadmap({
      thing: voiced,
      answer: j.answer,
      confidence: j.confidence,
      mode: classify({
        subject: thing,
        displayName: thing,
        blob: `${thing} ${probe?.title ?? ""} ${probe?.description ?? ""}`.toLowerCase(),
        kind: looksLikeUrl(originalInput) ? "url" : "claim",
        host: probe?.host ?? null,
        signals: probe?.signals ?? emptySignals(),
        probeOk: !!probe?.ok,
      }),
      steps: j.roadmap?.map(revoice),
    }),
    methodology: [],
    probe,
  };
}

function emptySignals(): ProbeSignals {
  return {
    os: 0,
    kernel: 0,
    hardware: 0,
    schedule: 0,
    platform: 0,
    saas: 0,
    browser: 0,
    cloud: 0,
    pricing: 0,
    openSource: 0,
    security: 0,
    ai: 0,
  };
}

function confHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Model explained reality or used the dead mad-lib template. */
function isBadComedy(j: AiJudge): boolean {
  const t = [j.line, ...(j.lines || [])].join(" ").toLowerCase();
  return (
    /\bnot an operating system\b/.test(t) ||
    /\bis a (politician|person|human|celebrity|note-taking|app|application|website|company), not\b/.test(
      t,
    ) ||
    /\bno matter how (many|much)\b/.test(t) ||
    /\bdon'?t let that fool you\b/.test(t) ||
    /\bonly if you consider\b/.test(t) ||
    /\bjust a (politician|person|human|app)\b/.test(t) ||
    // Mad-lib templates only (allow funny "is an OS" commitments)
    /\bis an operating system for (the )?(united states|country|nation)\b/.test(t) ||
    /\bserving as (his|her|their|its) kernel\b/.test(t) ||
    /\bwith a \w[\w\s]{0,40} as (his|her|their|its) kernel\b/.test(t) ||
    /\bsuspiciously calm kernel\b/.test(t) ||
    /\bhairballs as\b/.test(t)
  );
}

function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

async function probeUrl(raw: string): Promise<ProbeResult> {
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "invalid url" };
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: "only http(s)" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "IIAO/0.4 (+https://iiao.algor.ist; product probe)",
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
    });
    const buf = await res.arrayBuffer();
    const max = 350_000;
    const slice = buf.byteLength > max ? buf.slice(0, max) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const extracted = extract(html, res.url || url.toString());
    return {
      ok: true,
      status: res.status,
      finalUrl: res.url,
      bytes: buf.byteLength,
      host: safeHost(res.url || url.toString()),
      ...extracted,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "probe failed";
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function safeHost(u: string): string | undefined {
  try {
    return new URL(u).hostname;
  } catch {
    return undefined;
  }
}

function pickMeta(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.trim();
}

function clean(s: string | undefined, max = 280): string | undefined {
  if (!s) return undefined;
  const t = s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return undefined;
  return t.slice(0, max);
}

function stripNoise(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function headings(html: string): string[] {
  const out: string[] = [];
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < 12) {
    const t = clean(m[2], 120);
    if (t && t.length > 2) out.push(t);
  }
  return out;
}

function visibleText(html: string): string {
  return stripNoise(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

function count(re: RegExp, text: string): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return (text.match(new RegExp(re.source, flags)) || []).length;
}

function extract(html: string, finalUrl: string) {
  const title = clean(pickMeta(html, /<title[^>]*>([\s\S]*?)<\/title>/i), 200);
  const description = clean(
    pickMeta(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ) ||
      pickMeta(
        html,
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
      ) ||
      pickMeta(
        html,
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      ),
    400,
  );
  const ogTitle = clean(
    pickMeta(
      html,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ),
    200,
  );
  const hs = headings(html);
  const text = visibleText(html);
  const blob = [title, ogTitle, description, hs.join(" "), text, finalUrl]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return {
    title: title || ogTitle,
    description,
    headings: hs,
    textSample: text.slice(0, 2500),
    phrases: [title, description, ...hs.slice(0, 4)].filter(Boolean) as string[],
    signals: {
      os: count(/\boperating systems?\b|\bos\b|cloudflare os/g, blob),
      kernel: count(/\bkernel\b|\bring[-\s]?0\b|\bsyscall/g, blob),
      hardware: count(
        /\bhardware\b|\bcpu\b|\bgpu\b|\bbare[-\s]?metal\b|\bfirmware\b/g,
        blob,
      ),
      schedule: count(
        /\bschedul(e|er|ing)\b|\bprocess(es)?\b|\bthread(s)?\b/g,
        blob,
      ),
      platform: count(/\bplatform\b|\becosystem\b|\binfrastructure\b/g, blob),
      saas: count(
        /\bsaas\b|\bdashboard\b|\bpricing\b|\benterprise\b|\bfree trial\b/g,
        blob,
      ),
      browser: count(
        /\bbrowser\b|\bchrome\b|\belectron\b|\bjavascript\b/g,
        blob,
      ),
      cloud: count(
        /\bcloud\b|\bedge\b|\bserverless\b|\bcdn\b|\bworkers?\b/g,
        blob,
      ),
      pricing: count(/\bpricing\b|\b\$\d|\bper month\b|\bbilling\b/g, blob),
      openSource: count(
        /\bopen[-\s]?source\b|\bgithub\b|\bposix\b|\bunix\b|\blinux\b/g,
        blob,
      ),
      security: count(
        /\bsecur(e|ity)\b|\bisolat(e|ion)\b|\bsandbox\b/g,
        blob,
      ),
      ai: count(/\bai\b|\bllm\b|\bmachine learning\b|\bagent(s)?\b/g, blob),
    },
  };
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    // Always handle API, permalinks (OG inject), and share cards in the worker
    if (
      path.startsWith("/api/") ||
      path.startsWith("/is/") ||
      path === "/og"
    ) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  },
};
