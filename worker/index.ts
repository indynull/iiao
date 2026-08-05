import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolveThing } from "../src/analyze/thing";
import { analyze } from "../src/analyze/engine";
import { buildJudgmentTree } from "../src/analyze/tree-build";
import type { Analysis, ProbeResult } from "../src/analyze/types";

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
  let probe: ProbeResult | null = null;
  if (isUrl) {
    probe = await probeUrl(subject);
  }

  const resolved = resolveThing(subject, probe);
  const contextBits = [
    `User input: ${subject}`,
    `Resolved product/thing to judge: ${resolved.thing}`,
    `Resolution: ${resolved.source}`,
    probe?.ok
      ? `Page title: ${probe.title ?? "—"}\nMeta: ${probe.description ?? "—"}\nSnippet: ${(probe.textSample ?? "").slice(0, 900)}`
      : isUrl
        ? `Probe: failed (${probe?.error ?? "n/a"})`
        : "No URL — free-form product/idea description.",
  ].join("\n");

  let analysis: Analysis | undefined;
  let engine: "workers-ai" | "rules" = "rules";
  let aiError: string | undefined;

  try {
    if (!c.env.AI) {
      aiError = "AI binding missing";
    } else {
      const judged = await runJudge(c.env.AI, resolved.thing, contextBits);
      if (judged.ok) {
        analysis = analysisFromAi(subject, resolved.thing, judged.value, probe);
        engine = "workers-ai";
      } else {
        aiError = judged.error;
      }
    }
  } catch (e) {
    aiError = e instanceof Error ? e.message : "ai threw";
  }

  if (!analysis) {
    analysis = analyze(resolved.thing, probe);
    analysis = {
      ...analysis,
      subject,
      stamp: resolved.thing !== subject ? resolved.thing : analysis.stamp,
    };
  }

  if (resolved.thing && resolved.thing !== subject) {
    analysis = {
      ...analysis,
      subject,
      stamp: resolved.thing,
    };
  }

  const modelUsed = engine === "workers-ai" ? MODEL : null;

  // Small KV write — await so we don't rely on waitUntil edge cases
  await recordTelemetry(c.env, {
    ts: new Date().toISOString(),
    thing: resolved.thing.slice(0, 200),
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
    thing: resolved.thing,
    thingSource: resolved.source,
    aiError: aiError || undefined,
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

Judge only THING (product/idea). Ignore blog packaging. Unique lines every time (fridge ≠ toaster ≠ shoe).

Schema:
{"answer":"YES"|"NO"|"KINDA","confidence":0-100,"line":"lead sentence","lines":["2-4 short lines"],"notes":[{"label":"Kernel","note":"..."},{"label":"Boot","note":"..."}]}`;

  const user = `THING: ${thing}

Background (identify product only; do not quote):
${context.slice(0, 1200)}

Return JSON judgment of THING.`;

  let raw: unknown;
  try {
    raw = await ai.run(MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 900,
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
      note: n.note,
      axis: n.label,
      inputs: [] as string[],
    };
  });
  const roast = [j.line, ...j.lines];
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
    subtitle: j.line,
    stamp: thing,
    criteria,
    tree: buildJudgmentTree({
      name: thing,
      answer: j.answer,
      confidence: j.confidence,
      line: j.line,
      notes,
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
    redFlags: j.lines.slice(0, 2),
    findings: roast,
    roast,
    methodology: [],
    probe,
  };
}

function confHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
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

export default app;
